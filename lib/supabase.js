const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️  Supabase credentials not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env');
}

// `persistSession: false` es lo que evita el bug más caro del proyecto.
//
// El cliente es un singleton compartido por todos los routers. Antes, api/auth.js
// llamaba `signInWithPassword` SOBRE ESTE MISMO cliente, y eso persistía la
// sesión del usuario adentro del cliente de service_role. A partir de ahí todas
// las consultas del proceso se ejecutaban con el JWT del usuario en vez de la
// service key, y las políticas RLS que exigen `auth.role() = 'service_role'`
// empezaban a fallar con 42501: el panel dejaba de poder crear servicios,
// registrar cobros o guardar clientes, y se quedaba así hasta reiniciar el
// proceso. Con persistencia desactivada el cliente ya no tiene dónde guardar
// una sesión, así que aunque alguien llame a setSession no puede degradarlo.
//
// Para autenticar usuarios hay un cliente aparte: lib/supabase-auth.js.
const supabase = createClient(supabaseUrl || 'http://localhost:54321', supabaseKey || 'placeholder', {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

module.exports = supabase;
