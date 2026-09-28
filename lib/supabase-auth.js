const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️  Supabase auth credentials not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in .env');
}

// Cliente separado, y el único lugar del proyecto donde se llama
// signInWithPassword. Existe para que esa llamada no pueda contaminar el
// cliente de service_role que usa el resto del sistema. Ver lib/supabase.js.
const authClient = createClient(supabaseUrl || 'http://localhost:54321', supabaseKey || 'placeholder', {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

module.exports = authClient;
