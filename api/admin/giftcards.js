const express = require('express');
const router = express.Router();
const supabase = require('../../lib/supabase');
const { requireAdmin } = require('../../lib/auth');
const crypto = require('crypto');

router.use(requireAdmin);

function generateCode() {
  const bytes = crypto.randomBytes(8);
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'VAS-';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += chars.charAt(bytes[i] % chars.length);
  }
  return code;
}

router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('gift_cards')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener gift cards' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { amount, buyer_name, buyer_contact, recipient_name, recipient_contact } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Monto requerido' });
    }

    const code = generateCode();

    const { data, error } = await supabase
      .from('gift_cards')
      .insert({
        code,
        amount: parseFloat(amount),
        balance: parseFloat(amount),
        buyer_name: buyer_name || null,
        buyer_contact: buyer_contact || null,
        recipient_name: recipient_name || null,
        recipient_contact: recipient_contact || null,
        status: 'active'
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al crear gift card' });
  }
});

router.post('/redeem', async (req, res) => {
  try {
    const { code, amount } = req.body;

    if (!code || !amount) {
      return res.status(400).json({ error: 'Código y monto requeridos' });
    }

    const { data: card, error: findError } = await supabase
      .from('gift_cards')
      .select('*')
      .eq('code', code.toUpperCase())
      .eq('status', 'active')
      .single();

    if (findError || !card) {
      return res.status(404).json({ error: 'Gift card no encontrada o inactiva' });
    }

    if (card.balance < amount) {
      return res.status(400).json({ error: 'Saldo insuficiente. Disponible: $' + card.balance });
    }

    const newBalance = card.balance - amount;

    const updateData = { balance: newBalance };
    if (newBalance <= 0) {
      updateData.status = 'used';
      updateData.used_at = new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from('gift_cards')
      .update(updateData)
      .eq('id', card.id);

    if (updateError) throw updateError;

    res.json({
      message: 'Gift card canjeada',
      remaining: newBalance,
      discount: amount
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al canjear gift card' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('gift_cards')
      .select('*')
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

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('gift_cards')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ message: 'Gift card eliminada' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar gift card' });
  }
});

module.exports = router;
