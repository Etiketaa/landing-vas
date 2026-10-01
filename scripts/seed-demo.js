#!/usr/bin/env node
// Carga (o borra) un catálogo de demostración en la base real.
//
//   node scripts/seed-demo.js              muestra qué haría, sin escribir
//   node scripts/seed-demo.js --confirmar  escribe el catálogo
//   node scripts/seed-demo.js --limpiar --confirmar   lo borra
//
// Todo pasa por la API del panel (POST/PUT/DELETE /api/admin/*) y no por
// inserts directos, a propósito: esos endpoints son los que crean la cuenta de
// login de cada profesional junto con la fila, y los que limpian en cascada.
// Escribir por la API es la única forma de garantizar que lo que queda en la
// base es exactamente lo mismo que quedaría si lo cargás a mano desde el panel.
//
// Sin `--confirmar` no escribe nada.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const BASE = process.env.SEED_BASE_URL || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'vas@centro.com';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;
const CLAVE_DEMO = process.env.SEED_DEMO_PASSWORD || 'DemoVAS2026';

// El sufijo del email es la única forma de reconocer una profesional de prueba
// sin guardar ids en ningún lado. `--limpiar` se apoya en esto.
const SUFIJO_DEMO = '@vas-centro.test';

// Catálogo inventado. Los precios están en pesos argentinos y las duraciones
// en minutos, y están puestos para que las reglas de precio que ya hay en la
// base (fin de semana x1.2, happy hour -15%, último momento -20%) se puedan
// ver Working sobre turnos de verdad.
//
// El `deposit_percent` va en 0-100: es el porcentaje de la seña que la clienta
// tiene que pagar para que el turno quede confirmado. Antes el único servicio
// que había estaba en 0, así que ninguna reserva pedía seña y el flujo de pago
// nunca se ejecutaba. Acá todos los servicios tienen seña.
const SERVICIOS = [
  // nombre, categoría, precio base, duración, % seña
  ['Tintura completa', 'cabello', 8000, 90, 30],
  ['Balayage', 'cabello', 18000, 150, 30],
  ['Corte + brushing', 'cabello', 9500, 60, 30],
  ['Depilación láser axilas', 'depilacion', 12000, 30, 40],
  ['Depilación láser media pierna', 'depilacion', 22000, 60, 40],
  ['Depilación cera bikini', 'depilacion', 9000, 30, 40],
  ['Limpieza facial profunda', 'estetica', 18000, 60, 35],
  ['Hidratación con ácidos', 'estetica', 21000, 75, 35],
  ['Diseño de cejas + tintura', 'estetica', 7500, 30, 30],
  ['Maquillaje social', 'maquillaje', 16000, 60, 35],
  ['Maquillaje para eventos', 'maquillaje', 28000, 90, 40],
  ['Consultorio dermatólogo', 'dermatologia', 25000, 40, 40],
];

// Una profesional por categoría, para que cada servicio tenga a alguien que lo
// haga de verdad. Sin esto, un servicio sin profesional queda con los turnos
// "sin asignar" y bloquea el centro entero sin que nadie los atienda.
//
// `comision` es un número de relleno: el porcentaje real todavía no está
// acordado. Está para que se vea la mecánica andando, no para cobrar.
const PROFESIONALES = [
  {
    nombre: 'Valentina Ríos',
    rol: 'Dermatóloga',
    email: `valentina.demo${SUFIJO_DEMO}`,
    comision: 60,
    categorias: ['dermatologia'],
  },
  {
    nombre: 'Camila Ferreyra',
    rol: 'Cosmetóloga',
    email: `camila.demo${SUFIJO_DEMO}`,
    comision: 50,
    categorias: ['estetica'],
  },
  {
    nombre: 'Lucía Acosta',
    rol: 'Maquilladora',
    email: `lucia.demo${SUFIJO_DEMO}`,
    comision: 55,
    categorias: ['maquillaje'],
  },
  {
    nombre: 'Belén Soto',
    rol: 'Depiladora',
    email: `belen.demo${SUFIJO_DEMO}`,
    comision: 45,
    categorias: ['depilacion'],
  },
  {
    nombre: 'Rocío Álvarez',
    rol: 'Estilista',
    email: `rocio.demo${SUFIJO_DEMO}`,
    comision: 45,
    categorias: ['cabello'],
  },
];

const NEGRITA = '\x1b[1m';
const VERDE = '\x1b[32m';
const AMARILLO = '\x1b[33m';
const ROJO = '\x1b[31m';
const GRIS = '\x1b[90m';
const RESET = '\x1b[0m';

const pesos = (n) => `$${Number(n).toLocaleString('es-AR')}`;

let token = null;

async function api(ruta, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${ruta}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const texto = await res.text();
  let datos = null;
  try {
    datos = texto ? JSON.parse(texto) : null;
  } catch {
    datos = { error: texto.slice(0, 200) };
  }
  if (!res.ok) {
    const err = new Error(datos?.error || `HTTP ${res.status} en ${ruta}`);
    err.status = res.status;
    throw err;
  }
  return datos;
}

// La columna `role` de `employees` no la acepta el endpoint de alta (el rol de
// login va en app_metadata, que es otra cosa). Se escribe aparte y sólo para
// mostrar la especialidad en el microsite de la profesional.
async function ponerEspecialidad(employeeId, rol) {
  const supabase = require('../lib/supabase');
  const { error } = await supabase.from('employees').update({ role: rol }).eq('id', employeeId);
  if (error) console.log(`  ${ROJO}×${RESET} no se pudo anotar el rol de ${employeeId}: ${error.message}`);
}

async function ponerComisiones(employeeId, idsServicios, porcentaje) {
  const supabase = require('../lib/supabase');
  for (const service_id of idsServicios) {
    const { error } = await supabase
      .from('employee_services')
      .update({ commission_percent: porcentaje })
      .eq('employee_id', employeeId)
      .eq('service_id', service_id);
    if (error) {
      console.log(`  ${ROJO}×${RESET} comisión de ${service_id}: ${error.message}`);
      return;
    }
  }
}

async function cargar() {
  console.log(`\n${NEGRITA}1. Servicios${RESET}`);
  const existentes = await supabaseGet('/api/admin/services');
  const porNombre = new Map((existentes || []).map((s) => [s.name, s]));
  const idsPorNombre = new Map();

  for (const [name, category, base_price, duration_minutes, deposit_percent] of SERVICIOS) {
    const previo = porNombre.get(name);
    const payload = {
      name,
      category,
      base_price,
      duration_minutes,
      deposit_percent,
      commission_percent: 50,
      description: 'DEMO — catálogo de prueba, se borra con scripts/seed-demo.js --limpiar',
      active: true,
    };

    if (previo) {
      await api(`/api/admin/services/${previo.id}`, { method: 'PUT', body: payload });
      idsPorNombre.set(name, previo.id);
      console.log(`  ${VERDE}↻${RESET} ${name.padEnd(32)} ${GRIS}actualizado${RESET} ${pesos(base_price)} · ${duration_minutes}min · seña ${deposit_percent}%`);
    } else {
      const creado = await api('/api/admin/services', { method: 'POST', body: payload });
      idsPorNombre.set(name, creado.id);
      console.log(`  ${VERDE}+${RESET} ${name.padEnd(32)} ${pesos(base_price)} · ${duration_minutes}min · seña ${deposit_percent}%`);
    }
  }

  console.log(`\n${NEGRITA}2. Profesionales${RESET}`);
  const todas = await emailsDeLogin();
  for (const p of PROFESIONALES) {
    const serviciosDeElla = SERVICIOS.filter(([, cat]) => p.categorias.includes(cat)).map(([n]) => idsPorNombre.get(n));
    const previa = (todas || []).find((e) => (e.email || '').toLowerCase() === p.email);

    let employeeId;
    if (previa) {
      // Reusar la fila: se reapuntan los servicios y se restablece la clave de
      // la demo, así volver a correr el script deja las cuentas como estaban.
      await api(`/api/admin/employees/${previa.id}`, {
        method: 'PUT',
        body: {
          name: p.nombre,
          email: p.email,
          password: CLAVE_DEMO,
          phone: null,
          active: true,
          service_ids: serviciosDeElla,
        },
      });
      employeeId = previa.id;
      console.log(`  ${VERDE}↻${RESET} ${p.nombre.padEnd(20)} ${GRIS}ya existía${RESET} ${serviciosDeElla.length} servicio(s)`);
    } else {
      const creado = await api('/api/admin/employees', {
        method: 'POST',
        body: {
          name: p.nombre,
          email: p.email,
          password: CLAVE_DEMO,
          active: true,
          service_ids: serviciosDeElla,
        },
      });
      employeeId = creado.id;
      console.log(`  ${VERDE}+${RESET} ${p.nombre.padEnd(20)} ${p.rol.padEnd(14)} ${serviciosDeElla.length} servicio(s)`);
    }

    await ponerEspecialidad(employeeId, p.rol);
    await ponerComisiones(employeeId, serviciosDeElla, p.comision);
  }

  console.log(`\n${VERDE}${NEGRITA}Listo.${RESET}`);
  console.log(`${GRIS}  contraseña de las 5 demo: ${CLAVE_DEMO}${RESET}`);
  console.log(`${GRIS}  sus emails terminan en ${SUFIJO_DEMO} — se borran con --limpiar${RESET}`);
}

// La columna `employees.email` no la escribe el endpoint de alta: el email
// vive en la cuenta de login, no en la fila. Para reconocer las demo hay que
// mirar las dos: la columna por si un alta vieja la llenó, y el login por si
// no. Sin esto, `--limpiar` no encontraría a nadie.
async function emailsDeLogin() {
  const { loginStatusFor } = require('../lib/employee-auth');
  // Ojo: este endpoint devuelve el array pelado, no `{ data }`.
  const todos = await supabaseGet('/api/admin/employees');
  const estados = await loginStatusFor((todos || []).map((e) => e.id));
  return (todos || []).map((e) => ({
    ...e,
    email: e.email || estados[e.id]?.email || '',
  }));
}

async function limpiar() {
  console.log(`\n${AMARILLO}${NEGRITA}Esto borra datos reales:${RESET}`);
  console.log(`  ${SERVICIOS.length} servicios de prueba`);
  console.log(`  ${PROFESIONALES.length} profesionales y sus cuentas de login`);
  console.log(`${ROJO}  y los turnos asociados a esos servicios (el endpoint los borra en cascada).${RESET}`);

  const empleados = await emailsDeLogin();
  const demos = (empleados || []).filter((e) => (e.email || '').toLowerCase().endsWith(SUFIJO_DEMO));
  const servicios = await supabaseGet('/api/admin/services');
  const nombresDemo = new Set(SERVICIOS.map(([n]) => n));
  const serviciosDemo = (servicios || []).filter((s) => nombresDemo.has(s.name));

  console.log(`\n  a borrar ahora: ${serviciosDemo.length} servicios, ${demos.length} profesionales`);
  const turnos = await turnosDe(serviciosDemo.map((s) => s.id));
  if (turnos > 0) {
    console.log(`  ${ROJO}${turnos} turno(s) van a desaparecer con estos servicios.${RESET}`);
  }

  for (const e of demos) {
    const r = await api(`/api/admin/employees/${e.id}`, { method: 'DELETE' }).catch((x) => ({ error: x.message }));
    console.log(`  ${VERDE}−${RESET} ${e.name} ${r?.baja ? GRIS + '(con historial: queda dada de baja, no se borra)' + RESET : ''}`);
  }

  for (const s of serviciosDemo) {
    await api(`/api/admin/services/${s.id}`, { method: 'DELETE' }).catch((x) => console.log(`  ${ROJO}×${RESET} ${s.name}: ${x.message}`));
    console.log(`  ${VERDE}−${RESET} ${s.name}`);
  }

  console.log(`\n${VERDE}${NEGRITA}Limpio.${RESET}`);
}

async function turnosDe(ids) {
  if (!ids.length) return 0;
  const supabase = require('../lib/supabase');
  const { count } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .in('service_id', ids);
  return count || 0;
}

async function supabaseGet(ruta) {
  return api(ruta);
}

async function main() {
  const args = process.argv.slice(2);
  const confirmar = args.includes('--confirmar');
  const limpiarFlag = args.includes('--limpiar');

  if (!process.env.SUPABASE_SERVICE_KEY) {
    console.error(`${ROJO}Falta SUPABASE_SERVICE_KEY en .env${RESET}`);
    process.exit(1);
  }
  if (limpiarFlag) {
    if (!confirmar) {
      console.log(`\n${AMARILLO}Falta --confirmar. No se borró nada.${RESET}`);
      process.exit(1);
    }
  } else if (!confirmar) {
    console.log(`\n${NEGRITA}Catálogo de demostración${RESET} ${GRIS}(no se escribe nada sin --confirmar)${RESET}\n`);
    console.log(`${NEGRITA}Servicios${RESET}`);
    for (const [name, cat, price, dur, dep] of SERVICIOS) {
      console.log(`  ${name.padEnd(32)} ${pesos(price).padStart(9)}  ${String(dur).padStart(3)}min  seña ${dep}%  ${GRIS}${cat}${RESET}`);
    }
    console.log(`\n${NEGRITA}Profesionales${RESET}`);
    for (const p of PROFESIONALES) {
      const n = SERVICIOS.filter(([, c]) => p.categorias.includes(c)).length;
      console.log(`  ${p.nombre.padEnd(20)} ${p.rol.padEnd(14)} ${p.email.padEnd(34)} ${n} servicio(s)  ${GRIS}comisión demo ${p.comision}%${RESET}`);
    }
    console.log(`\n${GRIS}Los porcentajes de comisión son de relleno: los reales todavía no están acordados.${RESET}`);
    console.log(`${GRIS}Corre con --confirmar para escribirlo, o --limpiar --confirmar para borrarlo.${RESET}`);
    return;
  }

  if (!ADMIN_PASSWORD) {
    console.error(`${ROJO}Falta la contraseña del admin. Pasala así: SEED_ADMIN_PASSWORD=... node scripts/seed-demo.js --confirmar${RESET}`);
    process.exit(1);
  }

  console.log(`\n${GRIS}conectando a ${BASE}…${RESET}`);
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  token = login.token;
  console.log(`${VERDE}sesión de admin abierta${RESET} ${GRIS}(${login.user.email})${RESET}`);

  if (limpiarFlag) await limpiar();
  else await cargar();
}

main().catch((err) => {
  console.error(`\n${ROJO}Falló: ${err.message}${RESET}`);
  if (err.status === 401) console.error(`${GRIS}¿La contraseña del admin no es la de --confirmar?${RESET}`);
  process.exit(1);
});
