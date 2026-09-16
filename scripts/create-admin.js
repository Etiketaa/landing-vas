require('dotenv').config();
const supabase = require('../lib/supabase');

async function createAdmin() {
  const email = process.env.ADMIN_EMAIL || 'vas@centro.com';
  const password = process.env.ADMIN_PASSWORD || 'Beruti1958';

  console.log('Creating admin user:', email);

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: 'admin' }
  });

  if (error) {
    if (error.message.includes('already exists')) {
      console.log('User already exists, updating role...');

      const { data: users } = await supabase.auth.admin.listUsers();
      const existing = users.users.find(u => u.email === email);

      if (existing) {
        await supabase.auth.admin.updateUserById(existing.id, {
          app_metadata: { role: 'admin' }
        });
        console.log('Role updated to admin for:', email);
      }
    } else {
      console.error('Error:', error.message);
    }
    return;
  }

  await supabase.from('profiles').insert({
    id: data.user.id,
    email: data.user.email,
    full_name: 'Administrador',
    role: 'admin'
  });

  console.log('Admin user created successfully!');
  console.log('Email:', email);
  console.log('Password:', password);
}

createAdmin();
