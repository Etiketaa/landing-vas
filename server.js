require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : true }));
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
const authRouter = require('./api/auth');
const adminServicesRouter = require('./api/admin/services');
const adminScheduleRouter = require('./api/admin/schedule');
const adminCashRouter = require('./api/admin/cash');
const adminClientsRouter = require('./api/admin/clients');
const adminGiftCardsRouter = require('./api/admin/giftcards');
const employeeAuthRouter = require('./api/employee/auth');
const employeeBookingsRouter = require('./api/employee/bookings');
const paymentRouter = require('./api/payment');

app.use('/api/services', servicesRouter);
app.use('/api/available-slots', availableSlotsRouter);
app.use('/api/book', bookRouter);
app.use('/api/giftcard', giftcardPublicRouter);
app.use('/api/marketing', marketingRouter);
app.use('/api/cron/send-reminders', sendRemindersRouter);
app.use('/api/auth', authRouter);
app.use('/api/admin', adminServicesRouter);
app.use('/api/admin', adminScheduleRouter);
app.use('/api/admin', adminCashRouter);
app.use('/api/admin', adminClientsRouter);
app.use('/api/admin/giftcards', adminGiftCardsRouter);
app.use('/api/employee/auth', employeeAuthRouter);
app.use('/api/employee', employeeBookingsRouter);
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
