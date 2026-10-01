const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { calculatePrice } = require('../lib/pricing');
const { findAvailableEmployee } = require('../lib/schedule');
const { expireUnpaidBookings } = require('../lib/expire-unpaid');

const OWNER_WHATSAPP = '5492914140982';

// URL pública del sitio. En Vercel llega por x-forwarded-proto/host, así que se
// arma desde la request y no hay que hardcodear el dominio (que además todavía
// no está comprado).
function getBaseUrl(req) {
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/$/, '');

  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!host) return '';

  return `${proto}://${host}`;
}

router.post('/', async (req, res) => {
  try {
    const { name, contact, service_id, date, time, notes, employee_id: employee_id_requested } = req.body;

    if (!name || !contact || !service_id || !date || !time) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }

    if (name.length > 200 || contact.length > 200 || (notes && notes.length > 1000)) {
      return res.status(400).json({ error: 'Campos demasiado largos' });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}/.test(time)) {
      return res.status(400).json({ error: 'Formato de fecha u horario inválido' });
    }

    const priceInfo = await calculatePrice(service_id, date, time);

    const { data: service } = await supabase
      .from('services')
      .select('*')
      .eq('id', service_id)
      .single();

    const depositPercent = service?.deposit_percent || 0;
    const depositAmount = Math.round(priceInfo.final_price * depositPercent / 100);

    // A quién se le asigna el turno.
    //
    // Si la clienta eligió profesional, se respeta, pero sólo si realmente
    // ofrece ese servicio: mandar un employee_id cualquiera por el body no
    // alcanza para colar a alguien que no lo hace.
    //
    // Sin preferencia se elige, entre todas las que hacen el servicio, la
    // primera que esté libre a esa hora. Antes se tomaba la primera de la
    // lista y, si justo estaba ocupada, se rechazaba la reserva aunque otra
    // tuviera lugar; con varias profesionales por servicio eso era un bug.
    const { data: elegidas } = await supabase
      .from('employee_services')
      .select('employee_id')
      .eq('service_id', service_id);

    const habilitadas = await supabase
      .from('employees')
      .select('id')
      .eq('active', true);

    const idsActivos = new Set((habilitadas.data || []).map(e => e.id));
    const candidatas = (elegidas || [])
      .map(e => e.employee_id)
      .filter(id => idsActivos.has(id));

    let candidatos;
    if (employee_id_requested) {
      if (!candidatas.includes(employee_id_requested)) {
        return res.status(400).json({
          error: 'La profesional elegida no ofrece ese servicio'
        });
      }
      candidatos = [employee_id_requested];
    } else {
      candidatos = candidatas;
    }

    // Valida el horario de atención y, a la vez, resuelve a qué profesional
    // asignarle el turno: se queda con la primera candidata libre durante toda
    // la duración del servicio. Sin candidatas valida contra todo el centro.
    const timeCheck = await findAvailableEmployee(
      date,
      time,
      priceInfo.duration_minutes,
      candidatos
    );
    if (!timeCheck.ok) {
      return res.status(timeCheck.status).json({ error: timeCheck.error });
    }

    const employee_id = timeCheck.employeeId;

    let professionalBank = null;
    if (employee_id) {
      const { data: proData } = await supabase
        .from('employees')
        .select('name, cbu, alias, phone')
        .eq('id', employee_id)
        .maybeSingle();
      professionalBank = proData;
    }

    const initialStatus = depositAmount > 0 ? 'pending_payment' : 'confirmed';

    const depositDeadline = depositAmount > 0
      ? new Date(Date.now() + 10 * 60 * 1000).toISOString()
      : null;

    const { data: booking, error: insertError } = await supabase
      .from('bookings')
      .insert({
        client_name: name,
        client_contact: contact,
        service_id,
        employee_id,
        booking_date: date,
        booking_time: time,
        final_price: priceInfo.final_price,
        deposit_amount: depositAmount,
        status: initialStatus,
        notes,
        deposit_deadline: depositDeadline
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Libera horarios con seña vencida antes de evaluar el solapamiento, para no
    // rechazar un turno porque alguien más dejó un turno muerto ahí.
    await expireUnpaidBookings();

    // La seña es obligatoria, así que la clienta necesita un link real para
    // pagarla. Antes se le decía "subí el comprobante en el link que te
    // enviamos" y ese link no existía en ninguna parte: la página /pago nunca
    // estuvo enlazada, con lo cual el turno quedaba impagable.
    const baseUrl = getBaseUrl(req);
    const paymentUrl = depositAmount > 0 && baseUrl
      ? `${baseUrl}/pago/?booking=${encodeURIComponent(booking.id)}&contact=${encodeURIComponent(contact)}`
      : null;

    const { data: existingClient } = await supabase
      .from('clients')
      .select('id')
      .eq('phone', contact)
      .limit(1)
      .maybeSingle();

    if (!existingClient) {
      await supabase.from('clients').insert({
        name: name,
        phone: contact,
        notes: 'Auto-registrado desde reserva'
      });
    }

    const proName = professionalBank?.name || 'el profesional';
    const proCbu = professionalBank?.cbu || '[CONFIGURAR]';
    const proAlias = professionalBank?.alias || '[CONFIGURAR]';

    const ownerMessage = depositAmount > 0
      ? `NUEVO TURNO - PENDIENTE DE PAGO 💅

Cliente: ${name}
Contacto: ${contact}
Servicio: ${priceInfo.service_name}
Profesional: ${proName}
Fecha: ${date}
Hora: ${time}
Precio total: $${priceInfo.final_price.toLocaleString('es-AR')}
SEÑA: $${depositAmount.toLocaleString('es-AR')}

El cliente tiene 10 minutos para subir comprobante de transferencia.
CBU: ${proCbu}
Alias: ${proAlias}${paymentUrl ? `\n\nLink de pago para la clienta:\n${paymentUrl}` : ''}`
      : `NUEVO TURNO RESERVADO 💅

Cliente: ${name}
Contacto: ${contact}
Servicio: ${priceInfo.service_name}
Profesional: ${proName}
Fecha: ${date}
Hora: ${time}
Precio: $${priceInfo.final_price.toLocaleString('es-AR')}`;

    const clientMessage = depositAmount > 0
      ? `Hola VAS Centro de Estética ✨

Para confirmar tu turno con ${proName} necesito que realices una seña de $${depositAmount.toLocaleString('es-AR')}.

📋 Datos para transferencia:
CBU: ${proCbu}
Alias: ${proAlias}
Monto: $${depositAmount.toLocaleString('es-AR')}

Una vez que realices la transferencia, subí el comprobante acá:
${paymentUrl || 'escribinos y te enviamos el link'}

Tenés 10 minutos. Pasado ese tiempo el turno se libera.

Servicio: ${priceInfo.service_name}
Fecha: ${date}
Hora: ${time}`
      : `Hola VAS Centro de Estética ✨

Quiero confirmar mi turno:

Servicio: ${priceInfo.service_name}
Profesional: ${proName}
Fecha: ${date}
Hora: ${time}
Precio: $${priceInfo.final_price.toLocaleString('es-AR')}
${notes ? `Notas: ${notes}` : ''}

Mi nombre es ${name}`;

    const ownerWhatsApp = `https://wa.me/${OWNER_WHATSAPP}?text=${encodeURIComponent(ownerMessage)}`;
    const clientWhatsApp = `https://wa.me/${OWNER_WHATSAPP}?text=${encodeURIComponent(clientMessage)}`;

    let proWhatsApp = null;
    if (professionalBank?.phone) {
      const proPhone = professionalBank.phone.replace(/\D/g, '');
      const proMessage = `Nuevo turno asignado a vos 💅

Cliente: ${name}
Contacto: ${contact}
Servicio: ${priceInfo.service_name}
Fecha: ${date}
Hora: ${time}
Precio: $${priceInfo.final_price.toLocaleString('es-AR')}
${depositAmount > 0 ? `Seña: $${depositAmount.toLocaleString('es-AR')}` : ''}`;
      proWhatsApp = `https://wa.me/${proPhone}?text=${encodeURIComponent(proMessage)}`;
    }

    res.status(201).json({
      message: 'Turno reservado exitosamente',
      booking: {
        id: booking.id,
        service: priceInfo.service_name,
        professional: professionalBank?.name || null,
        date,
        time,
        final_price: priceInfo.final_price,
        deposit_amount: depositAmount,
        deposit_deadline: depositDeadline,
        status: initialStatus,
        // La clienta tiene que pagar para que el turno quede confirmado.
        deposit_required: depositAmount > 0,
        price_breakdown: {
          base: priceInfo.base_price,
          applied_rules: priceInfo.applied_rules
        }
      },
      payment_url: paymentUrl,
      whatsapp: {
        owner: ownerWhatsApp,
        client: clientWhatsApp,
        professional: proWhatsApp
      }
    });
  } catch (err) {
    console.error('Error creating booking:', err.message || err);
    res.status(500).json({ error: 'Error al reservar turno' });
  }
});

module.exports = router;
