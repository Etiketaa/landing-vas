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

    const { data: existingBooking, error: checkError } = await supabase
      .from('bookings')
      .select('id')
      .eq('booking_date', date)
      .eq('booking_time', time)
      .in('status', ['pending', 'confirmed'])
      .single();

    if (existingBooking) {
      return res.status(409).json({ error: 'Este horario ya está reservado' });
    }

    const { data: booking, error: insertError } = await supabase
      .from('bookings')
      .insert({
        client_name: name,
        client_contact: contact,
        service_id,
        booking_date: date,
        booking_time: time,
        final_price: priceInfo.final_price,
        notes,
        status: 'confirmed'
      })
      .select()
      .single();

    if (insertError) throw insertError;

    const ownerMessage = `NUEVO TURNO RESERVADO 💅

Cliente: ${name}
Contacto: ${contact}
Servicio: ${priceInfo.service_name}
Fecha: ${date}
Hora: ${time}
Precio: $${priceInfo.final_price.toLocaleString('es-AR')}
${notes ? `Notas: ${notes}` : ''}

Para confirmar o cancelar, ingresá al panel de administración.`;

    const clientMessage = `Hola VAS Centro de Estética ✨

Quiero confirmar mi turno:

Servicio: ${priceInfo.service_name}
Fecha: ${date}
Hora: ${time}
Precio: $${priceInfo.final_price.toLocaleString('es-AR')}
${notes ? `Notas: ${notes}` : ''}

Mi nombre es ${name}`;

    const ownerWhatsApp = `https://wa.me/${OWNER_WHATSAPP}?text=${encodeURIComponent(ownerMessage)}`;
    const clientWhatsApp = `https://wa.me/${OWNER_WHATSAPP}?text=${encodeURIComponent(clientMessage)}`;

    res.status(201).json({
      message: 'Turno reservado exitosamente',
      booking: {
        id: booking.id,
        service: priceInfo.service_name,
        date,
        time,
        final_price: priceInfo.final_price,
        price_breakdown: {
          base: priceInfo.base_price,
          applied_rules: priceInfo.applied_rules
        }
      },
      whatsapp: {
        owner: ownerWhatsApp,
        client: clientWhatsApp
      }
    });
  } catch (err) {
    console.error('Error creating booking:', err);
    res.status(500).json({ error: 'Error al reservar turno' });
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
