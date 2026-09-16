const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { calculatePrice } = require('../lib/pricing');

const OWNER_WHATSAPP = '5492914140982';

router.post('/', async (req, res) => {
  try {
    const { name, contact, service_id, date, time, notes } = req.body;

    if (!name || !contact || !service_id || !date || !time) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }

    const priceInfo = await calculatePrice(service_id, date, time);

    const { data: service } = await supabase
      .from('services')
      .select('*')
      .eq('id', service_id)
      .single();

    const depositPercent = service?.deposit_percent || 0;
    const depositAmount = Math.round(priceInfo.final_price * depositPercent / 100);

    const { data: assignedPro } = await supabase
      .from('employee_services')
      .select('employee_id')
      .eq('service_id', service_id)
      .limit(1)
      .maybeSingle();

    const employee_id = assignedPro?.employee_id || null;

    let professionalBank = null;
    if (employee_id) {
      const { data: proData } = await supabase
        .from('employees')
        .select('name, cbu, alias, phone')
        .eq('id', employee_id)
        .maybeSingle();
      professionalBank = proData;
    }

    const { data: existingBooking, error: checkError } = await supabase
      .from('bookings')
      .select('id')
      .eq('booking_date', date)
      .eq('booking_time', time)
      .in('status', ['pending', 'confirmed', 'pending_payment'])
      .limit(1)
      .maybeSingle();

    if (existingBooking) {
      return res.status(409).json({ error: 'Este horario ya está reservado' });
    }

    const initialStatus = depositAmount > 0 ? 'pending_payment' : 'confirmed';

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
        deposit_deadline: depositAmount > 0 ? new Date(Date.now() + 10 * 60 * 1000).toISOString() : null
      })
      .select()
      .single();

    if (insertError) throw insertError;

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
Alias: ${proAlias}`
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

Una vez que realices la transferencia, subí el comprobante en el link que te enviamos.

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
        date,
        time,
        final_price: priceInfo.final_price,
        deposit_amount: depositAmount,
        status: initialStatus,
        price_breakdown: {
          base: priceInfo.base_price,
          applied_rules: priceInfo.applied_rules
        }
      },
      whatsapp: {
        owner: ownerWhatsApp,
        client: clientWhatsApp,
        professional: proWhatsApp
      }
    });
  } catch (err) {
    console.error('Error creating booking:', err.message || err);
    res.status(500).json({ error: 'Error al reservar turno: ' + (err.message || 'Unknown error') });
  }
});

async function sendConfirmationEmail(booking, priceInfo, clientName, clientContact) {
  try {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #d4a373;">Tu turno está confirmado ✨</h1>
        <p>Hola <strong>${clientName}</strong>,</p>
        <p>Tu turno en VAS Centro de Estética ha sido reservado exitosamente.</p>
        <div style="background: #fdf6ec; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin: 0 0 10px 0;">Detalles del turno:</h3>
          <p style="margin: 5px 0;"><strong>Servicio:</strong> ${priceInfo.service_name}</p>
          <p style="margin: 5px 0;"><strong>Fecha:</strong> ${booking.booking_date}</p>
          <p style="margin: 5px 0;"><strong>Hora:</strong> ${booking.booking_time}</p>
          <p style="margin: 5px 0;"><strong>Duración:</strong> ${priceInfo.duration_minutes} minutos</p>
          <p style="margin: 5px 0;"><strong>Precio:</strong> $${priceInfo.final_price.toLocaleString('es-AR')}</p>
          ${priceInfo.applied_rules.length > 0 ? `
            <p style="margin: 10px 0 5px 0; font-size: 12px; color: #666;">
              <em>Descuentos aplicados: ${priceInfo.applied_rules.map(r => r.name).join(', ')}</em>
            </p>
          ` : ''}
        </div>
        ${booking.notes ? `<p><strong>Notas:</strong> ${booking.notes}</p>` : ''}
        <p style="color: #666; font-size: 14px;">
          Si necesitás cancelar o reprogramar, comunicate al WhatsApp.
        </p>
        <p style="margin-top: 20px;">¡Te esperamos! 💛</p>
      </div>
    `;

    await resend.emails.send({
      from: 'VAS Centro de Estética <onboarding@resend.dev>',
      to: [clientContact],
      subject: 'Tu turno en VAS Centro de Estética está confirmado ✨',
      html
    });
  } catch (err) {
    console.error('Error sending confirmation email:', err);
  }
}

async function sendOwnerNotification(booking, priceInfo, clientName, clientContact) {
  try {
    const ownerEmail = process.env.OWNER_EMAIL;
    if (!ownerEmail) return;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #2d6a4f;">Nuevo turno reservado</h1>
        <div style="background: #f0f7f4; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin: 0 0 10px 0;">Datos del cliente:</h3>
          <p style="margin: 5px 0;"><strong>Nombre:</strong> ${clientName}</p>
          <p style="margin: 5px 0;"><strong>Contacto:</strong> ${clientContact}</p>
        </div>
        <div style="background: #fdf6ec; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin: 0 0 10px 0;">Detalles del turno:</h3>
          <p style="margin: 5px 0;"><strong>Servicio:</strong> ${priceInfo.service_name}</p>
          <p style="margin: 5px 0;"><strong>Fecha:</strong> ${booking.booking_date}</p>
          <p style="margin: 5px 0;"><strong>Hora:</strong> ${booking.booking_time}</p>
          <p style="margin: 5px 0;"><strong>Precio final:</strong> $${priceInfo.final_price.toLocaleString('es-AR')}</p>
        </div>
        ${booking.notes ? `<p><strong>Notas del cliente:</strong> ${booking.notes}</p>` : ''}
      </div>
    `;

    await resend.emails.send({
      from: 'VAS Reservas <onboarding@resend.dev>',
      to: [ownerEmail],
      subject: `Nuevo turno - ${clientName} - ${priceInfo.service_name}`,
      html
    });
  } catch (err) {
    console.error('Error sending owner notification:', err);
  }
}

async function scheduleReminder(booking, priceInfo, clientName, clientContact) {
  try {
    const bookingDateTime = new Date(`${booking.booking_date}T${booking.booking_time}`);
    const reminderTime = new Date(bookingDateTime.getTime() - 24 * 60 * 60 * 1000);

    if (reminderTime <= new Date()) return;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #d4a373;">Recordatorio de turno 📅</h1>
        <p>Hola <strong>${clientName}</strong>,</p>
        <p>Te recordamos que tenés turno mañana en VAS Centro de Estética.</p>
        <div style="background: #fdf6ec; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin: 0 0 10px 0;">Detalles:</h3>
          <p style="margin: 5px 0;"><strong>Servicio:</strong> ${priceInfo.service_name}</p>
          <p style="margin: 5px 0;"><strong>Fecha:</strong> ${booking.booking_date}</p>
          <p style="margin: 5px 0;"><strong>Hora:</strong> ${booking.booking_time}</p>
        </div>
        <p style="color: #666; font-size: 14px;">
          Si necesitás cancelar o reprogramar, comunicate al menos 2 horas antes.
        </p>
        <p style="margin-top: 20px;">¡Te esperamos! 💛</p>
      </div>
    `;

    await resend.emails.send({
      from: 'VAS Centro de Estética <onboarding@resend.dev>',
      to: [clientContact],
      subject: 'Mañana tenés turno en VAS Centro de Estética',
      html,
      scheduledAt: reminderTime.toISOString()
    });
  } catch (err) {
    console.error('Error scheduling reminder:', err);
  }
}

module.exports = router;
