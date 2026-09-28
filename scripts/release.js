#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { getReleaseState, setStage, setFlag, STAGES } = require('../lib/features');

// Herramienta de release: ver en qué etapa está la app y encender la siguiente.
//
//   node scripts/release.js status
//   node scripts/release.js stage 2            sube a la etapa 2
//   node scripts/release.js next               sube una etapa
//   node scripts/release.js on commissions     enciende una funcionalidad
//   node scripts/release.js off commissions    la apaga (sin bajar la etapa)
//   node scripts/release.js plan               muestra qué se enciende al subir

const VERDE = '\x1b[32m';
const GRIS = '\x1b[90m';
const ROJO = '\x1b[31m';
const NEGRITA = '\x1b[1m';
const RESET = '\x1b[0m';

const marca = (on) => (on ? `${VERDE}● ON ${RESET}` : `${ROJO}○ off${RESET}`);

async function status() {
  const state = await getReleaseState({ force: true });
  const etapa = STAGES.find((s) => s.stage === state.stage);

  console.log(`\n${NEGRITA}VAS · release${RESET}`);
  console.log(`Etapa actual: ${NEGRITA}${state.stage} — ${etapa?.label || '?'}${RESET}`);
  console.log(`  ${GRIS}${etapa?.description || ''}${RESET}`);

  if (state.degraded) {
    console.log(`\n${ROJO}AVISO: no se pudo leer el estado desde la base. Se asume todo activo.${RESET}`);
    console.log(`${GRIS}¿Corriste supabase/migrations/004_release_flags.sql?${RESET}`);
    return;
  }

  console.log('');
  for (const s of STAGES) {
    const enCurso = s.stage === state.stage;
    console.log(`  ${enCurso ? NEGRITA : GRIS}${s.stage} ${s.label}${RESET}${enCurso ? '  ← acá estamos' : ''}`);
  }

  console.log(`\n${NEGRITA}Funcionalidades${RESET}`);
  let cambios = 0;
  for (const f of state.features) {
    if (!f.active) cambios++;
    const detalle = f.active
      ? (f.enabled ? '' : `${GRIS}(apagada a mano)${RESET}`)
      : (f.enabled ? `${GRIS}(espera etapa ${f.stage})${RESET}` : `${GRIS}(apagada a mano)${RESET}`);
    console.log(`  ${marca(f.active)}  ${f.label.padEnd(28)} etapa ${f.stage}  ${detalle}`);
  }

  console.log(`\n  ${cambios} funcionalidad(es) fuera de servicio.`);
  if (state.stage < STAGES[STAGES.length - 1].stage) {
    const sig = STAGES[state.stage + 1];
    console.log(`  Próximo paso al cobrar: ${NEGRITA}node scripts/release.js next${RESET} → etapa ${sig.stage} (${sig.label})\n`);
  } else {
    console.log(`  Etapa final alcanzada.${RESET}\n`);
  }
}

function plan() {
  console.log(`\n${NEGRITA}Qué se enciende en cada etapa${RESET}\n`);
  for (const s of STAGES) {
    const fs = require('../lib/features').FEATURES.filter((f) => f.stage === s.stage);
    if (!fs.length) continue;
    console.log(`  ${NEGRITA}Etapa ${s.stage} · ${s.label}${RESET}`);
    console.log(`    ${GRIS}${s.description}${RESET}`);
    for (const f of fs) console.log(`      ${ROJO}+${RESET} ${f.label}`);
    console.log('');
  }
}

async function main() {
  const [, , cmd, arg] = process.argv;

  switch (cmd) {
    case undefined:
    case 'status':
      await status();
      break;

    case 'plan':
      plan();
      break;

    case 'stage': {
      if (!arg) throw new Error('Falta la etapa. Ejemplo: node scripts/release.js stage 2');
      const state = await setStage(arg);
      console.log(`Etapa ${NEGRITA}${state.stage}${RESET} activa.`);
      break;
    }

    case 'next': {
      const current = (await getReleaseState({ force: true })).stage;
      const target = current + 1;
      if (target > STAGES[STAGES.length - 1].stage) {
        console.log('Ya está en la etapa final.');
        break;
      }
      const state = await setStage(target);
      const nuevos = state.features.filter((f) => f.active && f.stage === target);
      console.log(`Etapa ${NEGRITA}${state.stage}${RESET} activa: ${STAGES[target].label}`);
      console.log(`\nSe encendieron ${nuevos.length}:`);
      for (const f of nuevos) console.log(`  ${VERDE}+${RESET} ${f.label}`);
      console.log(`\n${GRIS}Verificá que las clientas y los profesionales ya puedan usarlas.${RESET}\n`);
      break;
    }

    case 'on':
    case 'off': {
      if (!arg) throw new Error('Falta la funcionalidad. Ejemplo: node scripts/release.js on commissions');
      const state = await setFlag(arg, cmd === 'on');
      const f = state.features.find((x) => x.key === arg);
      console.log(`${f.label}: ${f.active ? 'activa' : 'inactiva'}`);
      break;
    }

    default:
      console.log(`Comandos: status, plan, stage <n>, next, on <func>, off <func>`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\n${ROJO}${err.message}${RESET}\n`);
  process.exit(1);
});
