require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
// CORS: en producción solo se aceptan orígenes explícitos. Sin eso, cualquier
// sitio podría pegarle a la API con credenciales de un navegador ajeno.
const corsOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : (process.env.NODE_ENV === 'production' ? false : true);
app.use(cors({ origin: corsOrigins }));
// El comprobante de seña es la única carga binaria del sistema y llega como
// data URL (base64, que engorda el archivo ~33%). Con el límite global de 1 MB
// una foto de celular normal rebotaba con 413 y la clienta no podía pagar, así
// que la seña obligatoria era impagable. Se registra antes del parser global y
// sólo para esta ruta; el resto de la API sigue con 1 MB.
// La subida de comprobante es la única carga binaria del sistema: si no se
// limita, cualquiera puede hacer DoS subiendo fotos de 4-6 MB por request.
app.use('/api/payment', express.json({ limit: '6mb' }));
const paymentUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Demasiados intentos de subir comprobante' }
});
app.use('/api/payment', paymentUploadLimiter);

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const generalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: { error: 'Demasiadas peticiones' } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Demasiados intentos de login' } });
const bookingLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { error: 'Demasiadas reservas' } });

app.use('/api/', generalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/employee/auth/login', authLimiter);
app.use('/api/book', bookingLimiter);

const servicesRouter = require('./api/services');
const availableSlotsRouter = require('./api/available-slots');
const bookRouter = require('./api/book');
const giftcardPublicRouter = require('./api/giftcard');
const marketingRouter = require('./api/marketing');
const sendRemindersRouter = require('./api/cron/send-reminders');
const expireBookingsRouter = require('./api/cron/expire-bookings');
const authRouter = require('./api/auth');
const adminServicesRouter = require('./api/admin/services');
const adminScheduleRouter = require('./api/admin/schedule');
const adminCashRouter = require('./api/admin/cash');
const adminClientsRouter = require('./api/admin/clients');
const adminGiftCardsRouter = require('./api/admin/giftcards');
const adminFeaturesRouter = require('./api/admin/features');
const employeeAuthRouter = require('./api/employee/auth');
const employeeBookingsRouter = require('./api/employee/bookings');
const employeeProfileRouter = require('./api/employee/profile');
const professionalsRouter = require('./api/professionals');
const paymentRouter = require('./api/payment');
const { requireFeature } = require('./lib/features');

// Reservas, servicios y agenda: la base del sistema, sin flag. Si esto se
// apaga no queda producto, y no es algo que se pueda cobrar por separado.
app.use('/api/services', servicesRouter);
app.use('/api/available-slots', availableSlotsRouter);
app.use('/api/book', bookRouter);
app.use('/api/marketing', marketingRouter);
app.use('/api/cron/send-reminders', sendRemindersRouter);
app.use('/api/cron/expire-bookings', expireBookingsRouter);
app.use('/api/auth', authRouter);
app.use('/api/admin', adminServicesRouter);
app.use('/api/admin', adminScheduleRouter);
app.use('/api/admin', adminClientsRouter);
app.use('/api/admin/features', adminFeaturesRouter);

// A partir de acá cada bloque se enciende con su etapa de release. La ruta
// devuelve 403 con el motivo si todavía no corresponde, así un link viejo
// explica qué pasa en vez de dar un 404 seco.
app.use('/api/giftcard', requireFeature('gift_cards'), giftcardPublicRouter);
app.use('/api/admin/giftcards', requireFeature('gift_cards'), adminGiftCardsRouter);
app.use('/api/admin/cash', requireFeature('cash'), adminCashRouter);
// El dashboard del panel pide /api/admin/dashboard. Sin esta línea esa URL
// cae en el catch-all de abajo y devuelve el HTML del sitio con status 200,
// así que el panel cree que le respondió bien y deja los contadores en 0.
// Va aparte del requireFeature('cash') a propósito: el resumen del día se
// necesita aunque la etapa de caja todavía esté apagada.
app.use('/api/admin', adminCashRouter);
// El orden importa: employeeBookingsRouter exige token en todas sus rutas, así
// que si se montara antes que /auth, el login caería en ese middleware y
// respondería "Token requerido" en vez de autenticar.
app.use('/api/employee/auth', requireFeature('employee_panel'), employeeAuthRouter);
// El router de perfil va ANTES que el de bookings: el de bookings tiene GET /profile
// y se monta en /api/employee, así que interceptaría /api/employee/profile si va después.
app.use('/api/employee/profile', requireFeature('employee_panel'), employeeProfileRouter);
app.use('/api/employee', requireFeature('employee_panel'), employeeBookingsRouter);
app.use('/api/professionals', professionalsRouter);
app.use('/api/payment', paymentRouter);

app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
