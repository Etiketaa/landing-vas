const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');

// GET /api/professionals
// Devuelve los perfiles públicos de todas las profesionales activas.
// El landing page usa esto para mostrar la sección de profesionales.
router.get('/', async (req, res) => {
  try {
    const { data: profiles, error } = await supabase
      .from('employee_profiles')
      .select(`
        employee_id,
        photo_url,
        bio,
        gallery,
        services,
        updated_at,
        employees!inner(id, name, role, active)
      `)
      .eq('employees.active', true)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    // Formatear para consumo público
    const formatted = (profiles || []).map(p => ({
      id: p.employees.id,
      name: p.employees.name,
      role: p.employees.role,
      photo_url: p.photo_url,
      bio: p.bio,
      gallery: p.gallery || [],
      services: p.services || [],
      updated_at: p.updated_at
    }));

    res.json(formatted);
  } catch (err) {
    console.error('Error al obtener perfiles públicos:', err.message);
    res.status(500).json({ error: 'Error al obtener perfiles' });
  }
});

// GET /api/professionals/:id
// Devuelve el perfil público de una profesional específica.
router.get('/:id', async (req, res) => {
  try {
    const { data: profile, error } = await supabase
      .from('employee_profiles')
      .select(`
        employee_id,
        photo_url,
        bio,
        gallery,
        services,
        updated_at,
        employees!inner(id, name, role, active)
      `)
      .eq('employee_id', req.params.id)
      .eq('employees.active', true)
      .maybeSingle();

    if (error) throw error;

    if (!profile) {
      return res.status(404).json({ error: 'Perfil no encontrado' });
    }

    res.json({
      id: profile.employees.id,
      name: profile.employees.name,
      role: profile.employees.role,
      photo_url: profile.photo_url,
      bio: profile.bio,
      gallery: profile.gallery || [],
      services: profile.services || [],
      updated_at: profile.updated_at
    });
  } catch (err) {
    console.error('Error al obtener perfil público:', err.message);
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
});

module.exports = router;
