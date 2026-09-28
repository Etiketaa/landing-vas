const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { calculatePrice } = require('../lib/pricing');
const { validateBookingTime } = require('../lib/schedule');

const OWNER_WHATSAPP = '5492914140982';

router.post('/', async (req, res) => {
  try {
    const { name, contact, service_id, date, time, notes } = req.body;

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

    // Valida contra el horario de atención real y solapamientos por duración.
    // Antes solo comparaba `booking_time` exacto, así que un turno de 90 min
    // no bloqueaba el slot siguiente y se podían superponer reservas.
    const timeCheck = await validateBookingTime(date, time, priceInfo.duration_minutes);
    if (!timeCheck.ok) {
      return res.status(timeCheck.status).json({ error: timeCheck.error });
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
    res.status(500).json({ error: 'Error al reservar turno' });
  }
});

module.exports = router;
