/**
 * Verificador de comprobantes de seña.
 *
 * Esqueleto listo para enchufar Gemini (Google AI Studio) cuando quieras:
 * - Free tier: 1500 req/día, 1M tokens/min.
 * - Acepta imagen + PDF, devuelve JSON estructurado.
 *
 * HOY: mock que siempre dice "ok" para no frenar el flujo.
 * CUANDO QUIERAS:
 *   1. Crear cuenta en https://aistudio.google.com
 *   2. API key en variable GEMINI_API_KEY
 *   3. Cambiar `return mockVerify(...)` por `return geminiVerify(...)`
 *   4. El prompt ya está abajo (PROMPT_VERIFICACION).
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

// Prompt para Gemini 1.5 Flash. Extrae lo importante y valida contra la reserva.
const PROMPT_VERIFICACION = `Sos un verificador de comprobantes de transferencia bancaria en Argentina.
Te pasan una imagen/PDF y los datos esperados de la reserva.
Devolvé SOLO un JSON con esta forma exacta (sin markdown, sin texto extra):

{
  "monto_detectado": 1234.56,           // número, monto que se ve en el comprobante
  "fecha_detectada": "2026-01-15",       // YYYY-MM-DD, fecha de la transferencia
  "ordenante_detectado": "Juan Pérez",   // nombre que figura como ordenante
  "destino_cbu_detectado": "0000000000000000000000", // CBU destino si se ve
  "destino_alias_detectado": "MI.ALIAS", // alias destino si se ve
  "banco_detectado": "Banco Nación",     // banco si se ve
  "es_recibo_valido": true,              // true/false: parece un comprobante real (no captura de pantalla de app sin datos, no foto borrosa)
  "coincide_monto": true,                // monto_detectado == monto_esperado (con tolerancia $1)
  "coincide_fecha": true,                // fecha_detectada es hoy o ayer (ventana 48h)
  "coincide_destino": true,              // CBU/alias coincide con lo esperado
  "observaciones": "Texto libre si hay algo raro"
}

Datos de la reserva para comparar:
- Monto esperado: {{MONTO_ESPERADO}}
- Fecha esperada: hoy o ayer
- CBU esperado: {{CBU_ESPERADO}}
- Alias esperado: {{ALIAS_ESPERADO}}
- Titular esperado: {{TITULAR_ESPERADO}}
`;

// Mock actual: siempre ok. Reemplazar cuando tengas GEMINI_API_KEY.
async function mockVerify(fileBuffer, bookingData) {
  return {
    ok: true,
    mock: true,
    monto_detectado: bookingData.deposit_amount,
    fecha_detectada: new Date().toISOString().split('T')[0],
    ordenante_detectado: bookingData.client_name || 'Cliente',
    destino_cbu_detectado: bookingData.professional?.cbu || '',
    destino_alias_detectado: bookingData.professional?.alias || '',
    banco_detectado: bookingData.professional?.bank_name || '',
    es_recibo_valido: true,
    coincide_monto: true,
    coincide_fecha: true,
    coincide_destino: true,
    observaciones: 'Mock: verificación simulada. Conectar Gemini para real.'
  };
}

// Verificación real con Gemini (descomentar cuando tengas key).
async function geminiVerify(fileBuffer, bookingData) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  // Preparar la imagen/PDF para Gemini
  const mimeType = fileBuffer.length > 4 && fileBuffer.slice(0, 4).toString('hex') === '25504446'
    ? 'application/pdf'
    : 'image/jpeg'; // asume jpeg; en producción detectar mime real

  const prompt = PROMPT_VERIFICACION
    .replace('{{MONTO_ESPERADO}}', bookingData.deposit_amount)
    .replace('{{CBU_ESPERADO}}', bookingData.professional?.cbu || '')
    .replace('{{ALIAS_ESPERADO}}', bookingData.professional?.alias || '')
    .replace('{{TITULAR_ESPERADO}}', bookingData.professional?.titular || '');

  const result = await model.generateContent([
    prompt,
    { inlineData: { mimeType, data: fileBuffer.toString('base64') } }
  ]);

  const text = result.response.text();
  // Limpiar posible markdown
  const jsonText = text.replace(/```json|```/g, '').trim();
  return JSON.parse(jsonText);
}

/**
 * Punto de entrada único. Hoy usa mock; cambiar a geminiVerify cuando quieras.
 * @param {Buffer} fileBuffer - archivo subido (jpg/png/pdf)
 * @param {Object} bookingData - {deposit_amount, client_name, professional: {cbu, alias, titular, bank_name}}
 * @returns {Object} resultado de verificación
 */
async function verifyProof(fileBuffer, bookingData) {
  // CAMBIAR ESTA LÍNEA cuando tengas GEMINI_API_KEY:
  // return geminiVerify(fileBuffer, bookingData);
  return mockVerify(fileBuffer, bookingData);
}

module.exports = { verifyProof, PROMPT_VERIFICACION };