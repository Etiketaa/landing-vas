const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireAdmin, resolveUser, isAdmin } = require('../lib/auth');
const { createEvent, deleteEvent } = require('../lib/google-calendar');

const PROOF_BUCKET = 'payment-proofs';
const SIGNED_URL_TTL = 60 * 60; // 1 hora: alcanza para revisar el comprobante

// El comprobante se guarda en Supabase Storage, no como base64 dentro de la fila.
// Antes venía en el cuerpo del POST contra un límite de 1 MB, así que cualquier
// foto de celular (2-5 MB) rebotaba con 413 y la clienta no podía pagar la seña.
// Guardarlo fuera de la fila además evita que listar reservas descargue megabytes
// de imagen por request.
function parseDataUrl(dataUrl) {
  const match = /^data:([\w/+.-]+);base64,(.+)$/s.exec(dataUrl || '');
  if (!match) return null;

  const [, mime, base64] = match;
  const ext = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'application/pdf': 'pdf'
  }[mime.toLowerCase()];

  if (!ext) return null;

  return { mime: mime.toLowerCase(), ext, buffer: Buffer.from(base64, 'base64') };
}

async function removeProof(path) {
  if (!path) return;
  try {
    await supabase.storage.from(PROOF_BUCKET).remove([path]);
  } catch (err) {
    console.error('No se pudo borrar el comprobante', path, err.message);
  }
}

// ==================== MERCADOPAGO (ESQUELETO) ====================
// Para activar: poner MP_ACCESS_TOKEN en .env y configurar webhook en
// https://www.mercadopago.com.ar/developers/panel/notifications
// apuntando a: https://tu-dominio.com/api/payment/mercadopago/webhook
//
// Flujo:
// 1. Cliente elige "MercadoPago" en /pago/ -> POST /api/payment/mercadopago/preference
//    con { bookingId, contact } -> devuelve { init_point, preference_id }.
// 2. Cliente paga en MP -> MP dispara webhook -> POST /api/payment/mercadopago/webhook
//    con { type: 'payment', data: { id: '...' } }.
// 3. Backend busca payment en MP por id, chequea external_reference = bookingId,
//    monto = deposit_amount, status = 'approved' -> confirma la reserva.
//
// HOY: devuelve 503 con mensaje claro. No rompe nada existente.

// Función helper: crear preferencia de pago (mock hasta que pongas credenciales)
async function createMercadoPagoPreference(booking) {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    return {
      ok: false,
      mock: true,
      error: 'MercadoPago no configurado: falta MP_ACCESS_TOKEN en variables de entorno.',
      init_point: null,
      preference_id: null
    };
  }

  // TODO: cuando tengas el token, descomenta e implementa con SDK oficial:
  // const mercadopago = require('mercadopago');
  // mercadopago.configure({ access_token: accessToken });
  // const preference = { ... };
  // const response = await mercadopago.preferences.create(preference);
  // return { ok: true, init_point: response.body.init_point, preference_id: response.body.id };

  return {
    ok: false,
    mock: true,
    error: 'MercadoPago esqueleto: conectá MP_ACCESS_TOKEN para activar.',
    init_point: null,
    preference_id: null
  };
}

// Función helper: verificar payment en MP (mock)
async function verifyMercadoPagoPayment(paymentId) {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    return { ok: false, error: 'MP_ACCESS_TOKEN no configurada', status: null, external_reference: null };
  }

  // TODO: mercadopago.payment.findById(paymentId)
  // return { ok: true, status: payment.status, external_reference: payment.external_reference, amount: payment.transaction_amount };

  return { ok: false, error: 'MercadoPago esqueleto: conectá MP_ACCESS_TOKEN para activar.', status: null, external_reference: null };
}

// POST /api/payment/mercadopago/preference
// Body: { bookingId, contact }
// Devuelve: { init_point, preference_id } para redirigir al cliente
router.post('/mercadopago/preference', async (req, res) => {
  try {
    const { bookingId, contact } = req.body;

    if (!bookingId || !contact) {
      return res.status(400).json({ error: 'bookingId y contact requeridos' });
    }

    const { data: booking } = await supabase
      .from('bookings')
      .select('id, deposit_amount, deposit_deadline, status, client_contact, professional:employees(name,cbu,alias,titular,bank_name), services(name)')
      .eq('id', bookingId)
      .single();

    if (!booking) return res.status(404).json({ error: 'Reserva no encontrada' });
    if (booking.client_contact !== String(contact).trim()) return res.status(403).json({ error: 'No autorizado' });
    if (booking.status !== 'pending_payment') return res.status(400).json({ error: 'Esta reserva no está esperando pago' });

    const pref = await createMercadoPagoPreference(booking);

    if (!pref.ok) {
      return res.status(503).json({
        error: pref.error,
        hint: 'Configurá MP_ACCESS_TOKEN y el webhook en el panel de MercadoPago.'
      });
    }

    res.json({ init_point: pref.init_point, preference_id: pref.preference_id });
  } catch (err) {
    console.error('Error creando preferencia MP:', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/payment/mercadopago/webhook
// Webhook de MercadoPago (notificación de payment)
// Verifica el payment, matchea external_reference con bookingId, y confirma
router.post('/mercadopago/webhook', async (req, res) => {
  try {
    // MP envía { type: 'payment', data: { id: '12345' } } o { action: 'payment.updated', ... }
    const notification = req.body;
    const paymentId = notification?.data?.id || notification?.id;

    if (!paymentId) {
      console.log('Webhook MP sin paymentId:', JSON.stringify(notification));
      return res.sendStatus(200); // ACK para que MP no reintente
    }

    const verification = await verifyMercadoPagoPayment(paymentId);

    if (!verification.ok || verification.status !== 'approved') {
      console.log('Payment MP no aprobado:', verification);
      return res.sendStatus(200);
    }

    const bookingId = verification.external_reference;
    if (!bookingId) {
      console.log('Payment MP sin external_reference:', verification);
      return res.sendStatus(200);
    }

    // Confirmar reserva atómicamente (traemos datos para el calendario)
    const { data: booking, error } = await supabase
      .from('bookings')
      .update({
        status: 'confirmed',
        payment_method: 'mercadopago',
        payment_reference: paymentId,
        paid: true
      })
      .eq('id', bookingId)
      .eq('status', 'pending_payment') // solo si sigue pendiente
      .select('id, employee_id, booking_date, booking_time, client_name, services(name,duration_minutes)')
      .single();

    if (error || !booking) {
      console.log('No se pudo confirmar reserva por MP:', bookingId, error?.message);
    } else {
      console.log('Reserva confirmada por MercadoPago:', bookingId);

      // Crear evento en Google Calendar de la profesional (si tiene conectado).
      if (booking.employee_id) {
        const start = new Date(`${booking.booking_date}T${booking.booking_time}`);
        const duration = booking.services?.duration_minutes || 30;
        const end = new Date(start.getTime() + duration * 60000);

        const calResult = await createEvent({
          employeeId: booking.employee_id,
          summary: `${booking.services?.name || 'Turno'} — ${booking.client_name}`,
          description: `Cliente: ${booking.client_name}\nServicio: ${booking.services?.name || '—'}\nDuración: ${duration} min\nPagado por MercadoPago`,
          start,
          end,
          location: 'VAS Centro de Estética'
        });

        if (!calResult.ok) {
          console.warn('No se pudo crear evento en Google Calendar (MP):', calResult.error);
        } else {
          console.log('Evento creado en Google Calendar (MP):', calResult.eventId);
        }
      }
    }

    res.sendStatus(200); // ACK obligatorio
  } catch (err) {
    console.error('Error en webhook MP:', err.message);
    res.sendStatus(200); // siempre 200 para que MP no reintente en bucle
  }
});

// ==================== LECTURA ====================
// Solo el admin o la propia clienta de la reserva. Antes esto era público: con
// el UUID de la reserva se leían nombre, teléfono y los datos bancarios (CBU y
// alias) del profesional.
router.get('/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;
    // El parámetro de la URL se llama `contact` (ver public/pago/index.html).
    // Se acepta el nombre largo también por si alguien lo usa a mano.
    const contact = req.query.contact || req.query.client_contact;

    const user = await resolveUser(req);

    const { data: booking, error } = await supabase
      .from('bookings')
      .select('id, client_name, client_contact, service_id, employee_id, booking_date, booking_time, final_price, deposit_amount, status, deposit_deadline, payment_proof, payment_uploaded_at, services(name)')
      .eq('id', bookingId)
      .single();

    if (error || !booking) {
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    const isOwner = Boolean(contact) && booking.client_contact === String(contact).trim();
    if (!isAdmin(user) && !isOwner) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    if (booking.employee_id) {
      const { data: proData } = await supabase
        .from('employees')
        .select('name, cbu, alias, titular, bank_name')
        .eq('id', booking.employee_id)
        .single();
      booking.professional = proData;
    }

    // El admin recibe una URL firmada porque el bucket es privado. La clienta
    // recibe la misma URL: necesita ver la CBU para transferir la seña.
    if (booking.payment_proof) {
      const { data: signed } = await supabase.storage
        .from(PROOF_BUCKET)
        .createSignedUrl(booking.payment_proof, SIGNED_URL_TTL);

      if (signed?.signedUrl) {
        // En la respuesta queda en `payment_proof` para no romper al panel, que
        // lo usa directo como src de un <img>. El admin ya llega con token.
        booking.payment_proof = signed.signedUrl;
      } else {
        booking.payment_proof = null;
      }
    }

    res.json(booking);
  } catch (err) {
    console.error('Error al obtener reserva:', err.message);
    res.status(500).json({ error: 'Error al obtener reserva' });
  }
});

// ==================== SUBIDA DEL COMPROBANTE ====================
// La seña es obligatoria: esta es la única vía por la que un turno pasa de
// "reservado" a "confirmado". Requiere que el contacto coincida con el de la
// reserva; antes el chequeo era `if (client_contact && ...)` y el frontend no lo
// mandaba, así que en la práctica no había verificación alguna.
router.post('/:bookingId/upload', async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { payment_image, client_contact } = req.body;

    if (!payment_image) {
      return res.status(400).json({ error: 'Comprobante requerido' });
    }

    if (!client_contact) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const file = parseDataUrl(payment_image);
    if (!file) {
      return res.status(400).json({ error: 'Formato de comprobante no válido. Usá una imagen JPG, PNG o PDF.' });
    }

    if (file.buffer.length > 4 * 1024 * 1024) {
      return res.status(413).json({ error: 'El comprobante es demasiado grande. Máximo 4 MB.' });
    }

    const { data: booking } = await supabase
      .from('bookings')
      .select('id, deposit_deadline, status, client_contact, payment_proof')
      .eq('id', bookingId)
      .single();

    if (!booking) {
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    if (booking.client_contact !== String(client_contact).trim()) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    if (booking.status === 'confirmed') {
      return res.status(400).json({ error: 'Esta reserva ya fue confirmada' });
    }

    if (booking.status !== 'pending_payment') {
      return res.status(400).json({ error: 'Esta reserva ya tiene un comprobante cargado o fue cancelada' });
    }

    if (booking.deposit_deadline && new Date(booking.deposit_deadline) < new Date()) {
      await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', bookingId);
      return res.status(400).json({ error: 'Tiempo de pago expirado. La reserva fue cancelada.' });
    }

    const path = `bookings/${bookingId}-${Date.now()}.${file.ext}`;

    const { error: uploadError } = await supabase.storage
      .from(PROOF_BUCKET)
      .upload(path, file.buffer, { contentType: file.mime, upsert: true });

    if (uploadError) {
      console.error('Error al guardar comprobante:', uploadError.message);
      return res.status(500).json({ error: 'No pudimos guardar el comprobante. Intentá de nuevo.' });
    }

    // Si el cliente reintenta, el archivo anterior queda huérfano en el bucket.
    const previous = booking.payment_proof;
    if (previous) await removeProof(previous);

    const { data: updated, error: updateError } = await supabase
      .from('bookings')
      .update({
        payment_proof: path,
        payment_uploaded_at: new Date().toISOString(),
        status: 'pending_confirmation'
      })
      .eq('id', bookingId)
      .select('id, status, payment_uploaded_at')
      .single();

    if (updateError) {
      await removeProof(path);
      throw updateError;
    }

    res.json({
      message: 'Comprobante recibido. Vamos a verificarlo y te confirmamos el turno.',
      booking: updated
    });
  } catch (err) {
    console.error('Error al subir comprobante:', err.message);
    res.status(500).json({ error: 'Error al subir comprobante' });
  }
});

// ==================== CONFIRMAR ====================
// La seña es obligatoria, así que confirmar una reserva sin comprobante cargado
// tiene que ser imposible: este endpoint antes hacía UPDATE sin mirar el estado.
router.post('/:bookingId/confirm', requireAdmin, async (req, res) => {
  try {
    const { bookingId } = req.params;

    const { data: booking } = await supabase
      .from('bookings')
      .select('id, status, payment_proof, deposit_amount, employee_id, booking_date, booking_time, client_name, services(name,duration_minutes)')
      .eq('id', bookingId)
      .single();

    if (!booking) {
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    if (booking.status === 'confirmed') {
      return res.status(400).json({ error: 'La reserva ya estaba confirmada' });
    }

    if (booking.deposit_amount > 0 && !booking.payment_proof) {
      return res.status(400).json({
        error: 'No se puede confirmar: la seña es obligatoria y no hay comprobante cargado'
      });
    }

    const { error } = await supabase
      .from('bookings')
      .update({ status: 'confirmed' })
      .eq('id', bookingId);

    if (error) throw error;

    // Crear evento en Google Calendar de la profesional (si tiene conectado).
    // No rompe la confirmación si falla: loguea y sigue.
    if (booking.employee_id) {
      const start = new Date(`${booking.booking_date}T${booking.booking_time}`);
      const duration = booking.services?.duration_minutes || 30;
      const end = new Date(start.getTime() + duration * 60000);

      const calResult = await createEvent({
        employeeId: booking.employee_id,
        summary: `${booking.services?.name || 'Turno'} — ${booking.client_name}`,
        description: `Cliente: ${booking.client_name}\nServicio: ${booking.services?.name || '—'}\nDuración: ${duration} min`,
        start,
        end,
        location: 'VAS Centro de Estética'
      });

      if (!calResult.ok) {
        console.warn('No se pudo crear evento en Google Calendar:', calResult.error);
      } else {
        console.log('Evento creado en Google Calendar:', calResult.eventId);
      }
    }

    res.json({ message: 'Reserva confirmada' });
  } catch (err) {
    console.error('Error al confirmar reserva:', err.message);
    res.status(500).json({ error: 'Error al confirmar reserva' });
  }
});

// ==================== RECHAZAR ====================
// Además de cancelar, borra el comprobante de Storage: el archivo ya no se usa
// y la reserva puede quedar registrada sin el dato de la clienta.
router.post('/:bookingId/reject', requireAdmin, async (req, res) => {
  try {
    const { bookingId } = req.params;

    const { data: booking } = await supabase
      .from('bookings')
      .select('id, status, payment_proof, employee_id, services(name,duration_minutes), client_name')
      .eq('id', bookingId)
      .single();

    if (!booking) {
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ error: 'La reserva ya estaba cancelada' });
    }

    const { error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled', payment_proof: null, payment_uploaded_at: null })
      .eq('id', bookingId);

    if (error) throw error;

    await removeProof(booking.payment_proof);

    // Borrar evento en Google Calendar de la profesional (si existe).
    if (booking.employee_id) {
      // Necesitaríamos guardar el eventId en la reserva para borrarlo exacto.
      // Por ahora no lo tenemos, así que logueamos y la profesional lo borra a mano.
      // TODO: guardar google_event_id en bookings al crear el evento.
      console.log('Reserva cancelada — la profesional debe borrar el evento manualmente:', bookingId);
    }

    res.json({ message: 'Reserva cancelada' });
  } catch (err) {
    console.error('Error al cancelar reserva:', err.message);
    res.status(500).json({ error: 'Error al cancelar reserva' });
  }
});

module.exports = router;