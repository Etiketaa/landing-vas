const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');

// Combina la fuente de verdad (employee_services) con las descripciones
// personalizadas del perfil JSONB. Lo que importa es: el landing muestra
// los servicios que realmente puede atender, no solo los que tienen foto.
function mergeServices(employeeServices, profileServices) {
  const profileMap = new Map((profileServices || []).map(s => [s.service_id, s.description || '']));
  return (employeeServices || []).map(es => ({
    service_id: es.service_id,
    name: es.services?.name,
    base_price: es.services?.base_price,
    duration_minutes: es.services?.duration_minutes,
    category: es.services?.category,
    description: profileMap.get(es.service_id) || ''
  }));
}

// GET /api/professionals
// Devuelve los perfiles públicos de todas las profesionales activas.
// Los servicios vienen de employee_services (fuente de verdad), y se enriquecen
// con la descripción personalizada del perfil si existe.
router.get('/', async (req, res) => {
  try {
    const [profilesResult, servicesResult] = await Promise.all([
      supabase
        .from('employee_profiles')
        .select('employee_id, photo_url, bio, gallery, services, updated_at, employees!inner(id, name, role, active)')
        .eq('employees.active', true)
        .order('updated_at', { ascending: false }),
      supabase
        .from('employee_services')
        .select('employee_id, service_id, commission_percent, services(name, base_price, duration_minutes, category, active)')
        .eq('services.active', true)
    ]);

    if (profilesResult.error) throw profilesResult.error;
    if (servicesResult.error) throw servicesResult.error;

    const servicesByEmployee = {};
    (servicesResult.data || []).forEach(es => {
      if (!servicesByEmployee[es.employee_id]) servicesByEmployee[es.employee_id] = [];
      servicesByEmployee[es.employee_id].push(es);
    });

    const formatted = (profilesResult.data || []).map(p => ({
      id: p.employees.id,
      name: p.employees.name,
      role: p.employees.role,
      photo_url: p.photo_url,
      bio: p.bio,
      gallery: p.gallery || [],
      services: mergeServices(servicesByEmployee[p.employee_id] || [], p.services),
      updated_at: p.updated_at
    }));

    // También incluir profesionales que tienen servicios pero todavía no cargaron
    // su perfil (foto/bio/galería), para que no queden invisibles del landing.
    const withProfileIds = new Set((profilesResult.data || []).map(p => p.employees.id));
    const sinPerfil = [];
    for (const employeeId of Object.keys(servicesByEmployee)) {
      if (withProfileIds.has(employeeId)) continue;
      const { data: emp } = await supabase.from('employees').select('name, role').eq('id', employeeId).eq('active', true).maybeSingle();
      if (emp) {
        sinPerfil.push({
          id: employeeId,
          name: emp.name,
          role: emp.role,
          photo_url: null,
          bio: '',
          gallery: [],
          services: mergeServices(servicesByEmployee[employeeId], []),
          updated_at: null
        });
      }
    }

    res.json(formatted.concat(sinPerfil));
  } catch (err) {
    console.error('Error al obtener perfiles públicos:', err.message);
    res.status(500).json({ error: 'Error al obtener perfiles' });
  }
});

// GET /api/professionals/:id
// Devuelve el perfil público de una profesional específica.
router.get('/:id', async (req, res) => {
  try {
    const [profileResult, servicesResult] = await Promise.all([
      supabase
        .from('employee_profiles')
        .select('employee_id, photo_url, bio, gallery, services, updated_at, employees!inner(id, name, role, active)')
        .eq('employee_id', req.params.id)
        .eq('employees.active', true)
        .maybeSingle(),
      supabase
        .from('employee_services')
        .select('service_id, services(name, base_price, duration_minutes, category, active)')
        .eq('employee_id', req.params.id)
    ]);

    if (profileResult.error) throw profileResult.error;
    if (servicesResult.error) throw servicesResult.error;

    const profile = profileResult.data;

    if (!profile && (!servicesResult.data || servicesResult.data.length === 0)) {
      return res.status(404).json({ error: 'Profesional no encontrada' });
    }

    res.json({
      id: profile?.employees?.id || req.params.id,
      name: profile?.employees?.name || 'Profesional',
      role: profile?.employees?.role || '',
      photo_url: profile?.photo_url || null,
      bio: profile?.bio || '',
      gallery: profile?.gallery || [],
      services: mergeServices(servicesResult.data || [], profile?.services),
      updated_at: profile?.updated_at || null
    });
  } catch (err) {
    console.error('Error al obtener perfil público:', err.message);
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
});

module.exports = router;