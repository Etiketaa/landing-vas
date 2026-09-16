const { Resend } = require('resend');

const apiKey = process.env.RESEND_API_KEY;

if (!apiKey) {
  console.warn('⚠️  Resend credentials not configured. Set RESEND_API_KEY in .env');
}

const resend = new Resend(apiKey || 're_placeholder');

module.exports = resend;
