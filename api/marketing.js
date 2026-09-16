const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');

router.post('/', async (req, res) => {
  try {
    const { name, phone } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ error: 'Nombre y telefono son requeridos' });
    }

    if (name.length > 200 || phone.length > 20) {
      return res.status(400).json({ error: 'Campos demasiado largos' });
    }

    const { error } = await supabase
      .from('marketing_leads')
      .insert({
        name,
        phone,
        source: 'popup'
      });

    if (error) {
      console.error('Error inserting marketing lead:', error);
      return res.status(500).json({ error: 'Error al guardar datos' });
    }

    res.status(201).json({ message: 'Lead guardado exitosamente' });
  } catch (err) {
    console.error('Error in marketing:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
