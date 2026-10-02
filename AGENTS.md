# AGENTS.md — VAS Centro de Estética

> Instrucciones compactas para futuras sesiones de OpenCode. Solo hechos que no son obvios desde el código.
>
> Para la reunión con la dueña del centro: **`RESUMEN-CLIENTE.md`** (qué funciona, qué está apagado, decisiones pendientes, accesos de demo).

---

## Arquitectura clave

**Dos clientes Supabase** (no mezclar):
- `lib/supabase.js` — service_role, `persistSession: false`. Para escrituras admin/panel.
- `lib/supabase-auth.js` — único donde se llama `signInWithPassword`. Para login de profesionales.
> Mezclarlos degrada el cliente service_role y rompe RLS en escrituras.

**Entry point**: `server.js` (Express 5, CommonJS). Monta rutas en orden:
1. Core: `/api/services`, `/api/available-slots`, `/api/book`, `/api/marketing`, `/api/cron/*`, `/api/auth`
2. Admin: `/api/admin` (services, schedule, clients, features) — sin flag
3. Feature-gated: `/api/admin/cash`, `/api/admin/giftcards`, `/api/employee/*`, `/api/giftcard`, `/api/payment`
4. Catch-all: `app.get('/{*splat}')` → sirve `public/index.html`

**Release programable**: `current_stage` en `app_settings` + toggles por feature en `feature_flags`. Ver `lib/features.js`. Fallback **fail-open**: si falla la lectura de flags, asume todo activo (no bloquea reservas).

---

## Comandos exactos

```bash
# Desarrollo
npm install
cp .env.example .env   # completar SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY
npm run dev            # nodemon server.js

# Release
npm run release:status   # etapa actual
npm run release:plan     # qué enciende cada etapa
npm run release:next     # sube 1 etapa
node scripts/release.js stage 2          # va a etapa concreta
node scripts/release.js off commissions  # apaga feature sin bajar etapa

# Catálogo demo (idempotente, usa API admin)
npm run demo:cargar      # crea 12 servicios + 5 profesionales (@vas-centro.test / DemoVAS2026)
npm run demo:borrar      # limpia demo
```

---

## Variables de entorno requeridas (producción)

| Variable | Para qué |
|---|---|
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` / `SUPABASE_ANON_KEY` | Base y auth |
| `RESEND_API_KEY` | Emails (hoy solo `onboarding@resend.dev`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | OAuth Calendar profesionales |
| `MP_ACCESS_TOKEN` | MercadoPago Checkout Pro (webhook apunta a `/api/payment/mercadopago/webhook`) |
| `GEMINI_API_KEY` | Verificación IA de comprobantes (lib/verify-proof.js) |
| `CRON_SECRET` | Para que Vercel ejecute los crons |
| `ALLOWED_ORIGINS=https://vas-centro.vercel.app` | CORS |

> El dominio **no está comprado**. Resend usa `onboarding@resend.dev` (solo llega al owner). WhatsApp automático requiere Meta Business + templates verificados + dominio real.

---

## Variables de entorno vs. migraciones — no confundir

Son dos sistemas distintos y van a lugares distintos. Un nuevo deploy no requiere
tocar el SQL Editor; una nueva columna o tabla sí.

| Qué | Dónde | Cuándo |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `CRON_SECRET`, `ALLOWED_ORIGINS`, `MP_*`, `GOOGLE_*`, `GEMINI_API_KEY`, `RESEND_API_KEY` | **Vercel** → Project → Settings → Environment Variables | Una vez o al rotar claves |
| `employee_profiles`, `recibe_por_cuenta_propia`, `google_refresh_token`, `titular`, `bank_name`, `color` | **Supabase** → SQL Editor (migraciones `001`–`008`) | Una vez por migración |
| Buckets de Storage (`payment-proofs`, `employee-profiles`) | Ya creados en Supabase → verificar con `supabase.storage.listBuckets()` | Al crear proyecto nuevo |

Hoy: **todo aplicado.** Variables en Vercel → pendientes las nuevas de `MP_`/`GOOGLE_`/`GEMINI_`/`CRON_SECRET`. Nada falta en Supabase.

---

## Tests existentes (no están en package.json)

```bash
# Requieren token admin en /tmp/opencode/tok.txt (o variable)
TOKEN=$(cat /tmp/opencode/tok.txt) node /tmp/opencode/test-sena.js      # 32 checks — flujo seña completo
TOKEN=$(cat /tmp/opencode/tok.txt) node /tmp/opencode/test-profesionales.js # 33 checks — portal profesionales
```
> Tests no corren en CI. Son scripts ad-hoc que tiran contra la base real (local o prod). Úsalos antes de deployar cambios en seña/agenda.

---

## Migraciones — dos caminos, no equivalentes

| Archivo | Estado |
|---|---|
| `supabase/migrations/001...006` | **Actuales**. Idempotentes. Aplicar en orden en SQL Editor de Supabase. |
| `supabase/migrations.sql` | **Obsoleto**. Le faltan `clients`, `gift_cards`, `employee_sessions`, columnas de seña/pago. No usar. |

Nuevas migraciones pendientes de aplicar en prod:
- `005_bank_data.sql` — `employees.titular`, `bank_name`
- `006_google_calendar.sql` — `google_refresh_token`, `google_calendar_id`, `google_token_expiry`

---

## Puntos frágiles / gotchas

1. **Rate limits**: `/api/book` 30 req/15min, `/api/auth/*` 20 req/15min, general 200 req/15min. `/api/payment` tiene body limit 6 MB antes del global 1 MB.
2. **Horarios**: `business_hours` no tiene unique en `day_of_week` → `upsert` falla. Usar delete+insert.
3. **Seña**: 10 min hardcodeado (`deposit_deadline` = `now + 10min`). Sin comprobante = no se confirma. `api/cron/expire-bookings` corre 0 3 * * * (diario en Hobby) pero el barrido real es oportunista en `available-slots` y `book`.
4. **Admin `/api/admin/dashboard`**: montado en `/api/admin` (no `/api/admin/cash`) a propósito para que funcione aunque la etapa `cash` esté off. Ver `server.js:76`.
5. **Colores profesionales**: determinísticos desde el id (`lib/colors.js`). Si existe `employees.color` (hex válido) gana sobre el derivado.
6. **Baja profesional**: con historial de reservas → banea usuario auth (`active=false`); sin historial → borra fila y usuario auth.
7. **WhatsApp**: todo va al único número `5492914140982`. Números de profesionales son privados.
7. **Comisiones**: se guardan en `employee_services.commission_percent` (por profesional y servicio). `services.commission_percent` = % del centro. Placeholders (no acordados con tía/prima).

---

## Endpoints clave para verificar a mano

```bash
# Landing
curl https://vas-centro.vercel.app/

# Servicios + disponibilidad (muestra qué profesionales libres en cada slot)
curl "https://vas-centro.vercel.app/api/available-slots?service_id=<ID>&date=2026-01-20"

# Admin (requiere token)
curl -H "Authorization: Bearer $TOKEN" https://vas-centro.vercel.app/api/admin/dashboard
curl -H "Authorization: Bearer $TOKEN" https://vas-centro.vercel.app/api/admin/employees
curl -H "Authorization: Bearer $TOKEN" https://vas-centro.vercel.app/api/admin/bookings

# Profesionales (login con email@vas-centro.test / DemoVAS2026)
curl -X POST -H "Content-Type: application/json" \
  -d '{"email":"rocio.demo@vas-centro.test","password":"DemoVAS2026"}' \
  https://vas-centro.vercel.app/api/employee/auth/login
```

---

## Archivos de referencia rápida

| Archivo | Qué resuelve |
|---|---|
| `lib/schedule.js` | Agenda, solapamiento por duración, `getBookedIntervals`, `findAvailableEmployee` |
| `lib/features.js` | Release programable, `requireFeature`, fail-open |
| `lib/colors.js` | Color determinístico por profesional |
| `lib/pricing.js` | Reglas: fin de semana x1.2, happy hour -15%, último momento -20% |
| `lib/employee-auth.js` | Login profesional, creación cuenta Supabase Auth, vinculación `app_metadata.employee_id` |
| `api/available-slots.js` | Devuelve `available_employees` por slot (clave para elegir profesional) |
| `api/book.js` | Crea reserva, elige profesional libre, genera link `/pago/` |
| `api/payment.js` | Flujo seña: upload → confirm → reject. MercadoPago webhook. Crea evento Google Calendar. |
| `api/employee/auth.js` | Login, `/google` OAuth, `/google/callback`, `/google/status`, `/google/disconnect` |
| `lib/google-calendar.js` | OAuth2, `createEvent`, `deleteEvent`, refresh automático, limpieza si 401/invalid_grant |
| `lib/verify-proof.js` | Esqueleto verificación IA (Gemini). Mock activo; descomentar 1 línea + `GEMINI_API_KEY` para real. |
| `scripts/release.js` | CLI release programable |
| `scripts/seed-demo.js` | Carga/limpia catálogo demo vía API admin |

---

## Flujo crítico a validar antes de deployar

1. Reserva sin profesional → se asigna a la primera libre
2. Reserva con profesional elegido → valida que esa profesional ofrezca el servicio Y tenga hueco
3. Pago seña: subida comprobante → `pending_confirmation` → admin confirma → `confirmed` + evento Calendar
4. Admin confirma sin comprobante → **debe fallar** (400)
5. Cancelación admin → borra comprobante de Storage
6. Portal profesional: login → ve solo sus turnos → no puede tocar ajenos (403/404)

---

## Qué NO tocar sin hablar antes

- `server.js` orden de montaje de routers (el catch-all al final rompe todo si se mueve)
- `lib/supabase.js` vs `lib/supabase-auth.js` (mezclarlos rompe RLS)
- `lib/features.js` fail-open (cambiarlo a fail-closed bloquea reservas si falla Supabase)
- `business_hours` upsert (usa delete+insert)
EOF