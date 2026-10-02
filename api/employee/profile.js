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
// Actualiza bio, galería y servicios. La foto se sube aparte.
router.put('/', requireEmployee, async (req, res) => {
  try {
    const { bio, gallery, services } = req.body;

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

    // Validar estructura de servicios
    if (services !== undefined) {
      if (!Array.isArray(services)) {
        return res.status(400).json({ error: 'Servicios debe ser un array' });
      }
      for (const svc of services) {
        if (!svc.name || typeof svc.name !== 'string') {
          return res.status(400).json({ error: 'Cada servicio necesita un nombre' });
        }
        if (svc.duration_minutes && (isNaN(svc.duration_minutes) || svc.duration_minutes <= 0)) {
          return res.status(400).json({ error: 'Duración debe ser un número positivo' });
        }
      }
    }

    const updateData = {
      updated_at: new Date().toISOString()
    };
    if (bio !== undefined) updateData.bio = String(bio).slice(0, 2000);
    if (gallery !== undefined) updateData.gallery = gallery;
    if (services !== undefined) updateData.services = services;

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
        services: profile.services,
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
