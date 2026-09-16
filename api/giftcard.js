const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('gift_cards')
      .select('id, code, amount, balance, buyer_name, recipient_name, status')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Gift card no encontrada' });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener gift card' });
  }
});

module.exports = router;
