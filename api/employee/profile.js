const express = require('express');
const router = express.Router();
const supabase = require('../../lib/supabase');
const { requireEmployee } = require('../../lib/auth');

const PROFILE_BUCKET = 'employee-profiles';

// ==================== PERFIL DEL PROFESIONAL LOGUEADO ====================

// GET /api/employee/profile
// Devuelve el perfil completo del profesional (bio, foto, galería, servicios).
router.get('/', requireEmployee, async (req, res) => {
  try {
    const { data: profile, error } = await supabase
      .from('employee_profiles')
      .select('*')
      .eq('employee_id', req.employee.id)
      .maybeSingle();

    if (error) throw error;

    // Si no existe perfil, devolver estructura vacía
    res.json({
      employee_id: req.employee.id,
      photo_url: profile?.photo_url || null,
      bio: profile?.bio || '',
      gallery: profile?.gallery || [],
      services: profile?.services || [],
      updated_at: profile?.updated_at || null
    });
  } catch (err) {
    console.error('Error al obtener perfil:', err.message);
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
});

// PUT /api/employee/profile
// Actualiza bio y galería. Los servicios se manejan aparte con /api/employee/services
// para no sobreescribirlos accidentalmente.
router.put('/', requireEmployee, async (req, res) => {
  try {
    const { bio, gallery } = req.body;

    // Validar estructura de galería
    if (gallery !== undefined) {
      if (!Array.isArray(gallery)) {
        return res.status(400).json({ error: 'Galería debe ser un array' });
      }
      for (const item of gallery) {
        if (!item.url || typeof item.url !== 'string') {
          return res.status(400).json({ error: 'Cada foto de galería necesita una URL' });
        }
      }
    }

    const updateData = {
      updated_at: new Date().toISOString()
    };
    if (bio !== undefined) updateData.bio = String(bio).slice(0, 2000);
    if (gallery !== undefined) updateData.gallery = gallery;

    const { data: profile, error } = await supabase
      .from('employee_profiles')
      .upsert({ employee_id: req.employee.id, ...updateData }, { onConflict: 'employee_id' })
      .select()
      .single();

    if (error) throw error;

    res.json({
      message: 'Perfil actualizado',
      profile: {
        employee_id: profile.employee_id,
        photo_url: profile.photo_url,
        bio: profile.bio,
        gallery: profile.gallery,
        updated_at: profile.updated_at
      }
    });
  } catch (err) {
    console.error('Error al actualizar perfil:', err.message);
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
});

// POST /api/employee/profile/photo
// Sube una foto de perfil. Acepta base64 (data URL) o multipart.
router.post('/photo', requireEmployee, async (req, res) => {
  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Imagen requerida' });
    }

    // Parsear data URL
    const match = /^data:([\w/+.-]+);base64,(.+)$/s.exec(image);
    if (!match) {
      return res.status(400).json({ error: 'Formato de imagen inválido. Usá data URL base64.' });
    }

    const [, mime, base64] = match;
    const ext = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp'
    }[mime.toLowerCase()];

    if (!ext) {
      return res.status(400).json({ error: 'Formato no soportado. Usá JPG, PNG o WebP.' });
    }

    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(413).json({ error: 'La imagen es demasiado grande. Máximo 5 MB.' });
    }

    const path = `${req.employee.id}/profile.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(PROFILE_BUCKET)
      .upload(path, buffer, { contentType: mime, upsert: true });

    if (uploadError) {
      console.error('Error subiendo foto de perfil:', uploadError.message);
      return res.status(500).json({ error: 'No se pudo subir la foto' });
    }

    // Obtener URL pública
    const { data: urlData } = await supabase.storage
      .from(PROFILE_BUCKET)
      .getPublicUrl(path);

    const photoUrl = urlData.publicUrl;

    // Actualizar el perfil con la nueva foto
    const { error: updateError } = await supabase
      .from('employee_profiles')
      .upsert({
        employee_id: req.employee.id,
        photo_url: photoUrl,
        updated_at: new Date().toISOString()
      }, { onConflict: 'employee_id' });

    if (updateError) throw updateError;

    res.json({ message: 'Foto actualizada', photo_url: photoUrl });
  } catch (err) {
    console.error('Error al subir foto de perfil:', err.message);
    res.status(500).json({ error: 'Error al subir foto' });
  }
});

// POST /api/employee/profile/gallery
// Sube una foto a la galería de trabajos.
router.post('/gallery', requireEmployee, async (req, res) => {
  try {
    const { image, caption } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Imagen requerida' });
    }

    const match = /^data:([\w/+.-]+);base64,(.+)$/s.exec(image);
    if (!match) {
      return res.status(400).json({ error: 'Formato de imagen inválido' });
    }

    const [, mime, base64] = match;
    const ext = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp'
    }[mime.toLowerCase()];

    if (!ext) {
      return res.status(400).json({ error: 'Formato no soportado' });
    }

    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(413).json({ error: 'Máximo 5 MB por foto' });
    }

    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const path = `${req.employee.id}/gallery/${filename}`;

    const { error: uploadError } = await supabase.storage
      .from(PROFILE_BUCKET)
      .upload(path, buffer, { contentType: mime, upsert: false });

    if (uploadError) {
      console.error('Error subiendo foto a galería:', uploadError.message);
      return res.status(500).json({ error: 'No se pudo subir la foto' });
    }

    const { data: urlData } = await supabase.storage
      .from(PROFILE_BUCKET)
      .getPublicUrl(path);

    const photoUrl = urlData.publicUrl;

    // Agregar a la galería existente
    const { data: profile } = await supabase
      .from('employee_profiles')
      .select('gallery')
      .eq('employee_id', req.employee.id)
      .maybeSingle();

    const gallery = profile?.gallery || [];
    gallery.push({ url: photoUrl, caption: caption || '', added_at: new Date().toISOString() });

    const { error: updateError } = await supabase
      .from('employee_profiles')
      .upsert({
        employee_id: req.employee.id,
        gallery,
        updated_at: new Date().toISOString()
      }, { onConflict: 'employee_id' });

    if (updateError) throw updateError;

    res.json({ message: 'Foto agregada a galería', url: photoUrl, gallery_count: gallery.length });
  } catch (err) {
    console.error('Error al agregar foto a galería:', err.message);
    res.status(500).json({ error: 'Error al agregar foto' });
  }
});

// ==================== SERVICIOS DEL PROFESIONAL ====================
// El profesional anexa/quita servicios desde su micrositio, y el admin también
// puede hacerlo desde el panel. Las dos fuentes quedan sincronizadas:
//   - employee_services = la fuente de verdad para la asignación de turnos
//   - employee_profiles.services = descripciones personalizadas para el landing

// GET /api/employee/services
// Devuelve los servicios que la profesional ofrece (desde employee_services).
router.get('/services', requireEmployee, async (req, res) => {
  try {
    const { data: services, error } = await supabase
      .from('employee_services')
      .select('service_id, commission_percent, services(name, base_price, duration_minutes, category, active)')
      .eq('employee_id', req.employee.id);

    if (error) throw error;

    res.json((services || []).map(s => ({
      service_id: s.service_id,
      name: s.services?.name,
      base_price: s.services?.base_price,
      duration_minutes: s.services?.duration_minutes,
      category: s.services?.category,
      active: s.services?.active,
      commission_percent: s.commission_percent
    })));
  } catch (err) {
    console.error('Error al obtener servicios de profesional:', err.message);
    res.status(500).json({ error: 'Error al obtener servicios' });
  }
});

// POST /api/employee/services
// Anexa un servicio a la profesional y sincroniza el perfil JSONB.
// Body: { service_id, description? }
router.post('/services', requireEmployee, async (req, res) => {
  try {
    const { service_id, description } = req.body;

    if (!service_id) {
      return res.status(400).json({ error: 'service_id requerido' });
    }

    // Verificar que el servicio existe y está activo
    const { data: service, error: svcError } = await supabase
      .from('services')
      .select('id, name, active, base_price, duration_minutes')
      .eq('id', service_id)
      .single();

    if (svcError || !service) {
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }

    if (!service.active) {
      return res.status(400).json({ error: 'El servicio no está activo' });
    }

    // Verificar que no lo tenga ya asignado
    const { data: existing } = await supabase
      .from('employee_services')
      .select('employee_id')
      .eq('employee_id', req.employee.id)
      .eq('service_id', service_id)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: 'Ya tenés asignado ese servicio' });
    }

    // 1. Insertar en employee_services (fuente de verdad para turnos)
    const { data, error } = await supabase
      .from('employee_services')
      .insert({
        employee_id: req.employee.id,
        service_id,
        commission_percent: 0 // el admin lo ajusta después
      })
      .select()
      .single();

    if (error) throw error;

    // 2. Sincronizar el perfil JSONB (descripción personalizada para el landing)
    const { data: profile } = await supabase
      .from('employee_profiles')
      .select('services')
      .eq('employee_id', req.employee.id)
      .maybeSingle();

    const profileServices = profile?.services || [];
    profileServices.push({
      service_id,
      name: service.name,
      base_price: service.base_price,
      duration_minutes: service.duration_minutes,
      description: description || ''
    });

    await supabase
      .from('employee_profiles')
      .upsert({
        employee_id: req.employee.id,
        services: profileServices,
        updated_at: new Date().toISOString()
      }, { onConflict: 'employee_id' });

    res.status(201).json({
      message: 'Servicio anexado',
      service: {
        service_id: data.service_id,
        name: service.name,
        commission_percent: data.commission_percent
      }
    });
  } catch (err) {
    console.error('Error al anexar servicio:', err.message);
    res.status(500).json({ error: 'Error al anexar servicio' });
  }
});

// DELETE /api/employee/services/:service_id
// Quita un servicio de la profesional y sincroniza el perfil JSONB.
router.delete('/services/:service_id', requireEmployee, async (req, res) => {
  try {
    const { service_id } = req.params;

    // 1. Quitar de employee_services
    const { error } = await supabase
      .from('employee_services')
      .delete()
      .eq('employee_id', req.employee.id)
      .eq('service_id', service_id);

    if (error) throw error;

    // 2. Sincronizar el perfil JSONB
    const { data: profile } = await supabase
      .from('employee_profiles')
      .select('services')
      .eq('employee_id', req.employee.id)
      .maybeSingle();

    if (profile?.services?.length) {
      const updatedServices = profile.services.filter(s => s.service_id !== service_id);
      await supabase
        .from('employee_profiles')
        .update({ services: updatedServices, updated_at: new Date().toISOString() })
        .eq('employee_id', req.employee.id);
    }

    res.json({ message: 'Servicio quitado' });
  } catch (err) {
    console.error('Error al quitar servicio:', err.message);
    res.status(500).json({ error: 'Error al quitar servicio' });
  }
});

// GET /api/employee/services/available
// Devuelve los servicios activos que la profesional NO tiene asignados.
router.get('/services/available', requireEmployee, async (req, res) => {
  try {
    const { data: allServices, error } = await supabase
      .from('services')
      .select('id, name, base_price, duration_minutes, category')
      .eq('active', true)
      .order('name');

    if (error) throw error;

    const { data: assigned } = await supabase
      .from('employee_services')
      .select('service_id')
      .eq('employee_id', req.employee.id);

    const assignedIds = new Set((assigned || []).map(a => a.service_id));

    const available = (allServices || []).filter(s => !assignedIds.has(s.id));

    res.json(available);
  } catch (err) {
    console.error('Error al obtener servicios disponibles:', err.message);
    res.status(500).json({ error: 'Error al obtener servicios disponibles' });
  }
});

// DELETE /api/employee/profile/gallery/:index
// Elimina una foto de la galería por índice.
router.delete('/gallery/:index', requireEmployee, async (req, res) => {
  try {
    const index = parseInt(req.params.index, 10);
    if (isNaN(index) || index < 0) {
      return res.status(400).json({ error: 'Índice inválido' });
    }

    const { data: profile, error } = await supabase
      .from('employee_profiles')
      .select('gallery')
      .eq('employee_id', req.employee.id)
      .maybeSingle();

    if (error) throw error;

    const gallery = profile?.gallery || [];
    if (index >= gallery.length) {
      return res.status(404).json({ error: 'Foto no encontrada en galería' });
    }

    const removed = gallery.splice(index, 1)[0];

    // Borrar del Storage (best effort)
    if (removed.url) {
      const pathMatch = removed.url.match(/\/employee-profiles\/(.+)$/);
      if (pathMatch) {
        await supabase.storage.from(PROFILE_BUCKET).remove([pathMatch[1]]);
      }
    }

    const { error: updateError } = await supabase
      .from('employee_profiles')
      .update({ gallery, updated_at: new Date().toISOString() })
      .eq('employee_id', req.employee.id);

    if (updateError) throw updateError;

    res.json({ message: 'Foto eliminada', gallery_count: gallery.length });
  } catch (err) {
    console.error('Error al eliminar foto de galería:', err.message);
    res.status(500).json({ error: 'Error al eliminar foto' });
  }
});

module.exports = router;
