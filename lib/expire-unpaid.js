const supabase = require('./supabase');

const PROOF_BUCKET = 'payment-proofs';

// Barre las reservas cuya seña venció sin comprobante y libera el horario.
//
// Se llama de forma oportunista desde available-slots y book en vez de depender
// solo del cron: los crons de Vercel en planes gratuitos corren una vez por día,
// y un vencimiento de 10 minutos necesita limpiarse en minutos. Alguien
// mirando la agenda o intentando reservar siempre dispara el barrido.
//
// Por eso el cron de /api/cron/expire-bookings va una vez por día y no cada
// 5 minutos: la frecuencia fina la dan estas llamadas, y un cron cada 5
// minutos es rechazado por el plan Hobby, que además impedía desplegar.
//
// Es idempotente y barato: el filtro `status = pending_payment` con deadline
// vencida devuelve cero filas casi siempre.
async function expireUnpaidBookings() {
  try {
    const now = new Date().toISOString();

    const { data: expired, error } = await supabase
      .from('bookings')
      .select('id, payment_proof')
      .eq('status', 'pending_payment')
      .not('deposit_deadline', 'is', null)
      .lt('deposit_deadline', now);

    if (error) {
      console.error('expireUnpaidBookings: no se pudo consultar:', error.message);
      return { expired: 0, ids: [] };
    }

    if (!expired || expired.length === 0) {
      return { expired: 0, ids: [] };
    }

    const ids = expired.map((b) => b.id);

    const { error: updateError } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .in('id', ids);

    if (updateError) {
      console.error('expireUnpaidBookings: no se pudo cancelar:', updateError.message);
      return { expired: 0, ids: [] };
    }

    const paths = expired.map((b) => b.payment_proof).filter(Boolean);
    if (paths.length > 0) {
      await supabase.storage.from(PROOF_BUCKET).remove(paths);
    }

    console.log(`[expireUnpaidBookings] ${ids.length} reserva(s) vencida(s) liberada(s)`);

    return { expired: ids.length, ids };
  } catch (err) {
    // Nunca debe romper la consulta de agenda: el barrido es una limpieza.
    console.error('expireUnpaidBookings: fallo inesperado:', err.message);
    return { expired: 0, ids: [] };
  }
}

module.exports = { expireUnpaidBookings };
