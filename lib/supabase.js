const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️  Supabase credentials not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env');
}

const supabase = createClient(
  supabaseUrl || 'http://localhost:54321',
  supabaseKey || 'placeholder'
);

module.exports = supabase;
