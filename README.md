# VAS Centro de Estética

Landing y sistema de reservas para VAS Centro de Estética, Bahía Blanca.

Producción: https://vas-centro.vercel.app

## Qué hace

- **Reservas** con horario real, solapamiento por duración de servicio y **seña
  obligatoria**: el turno queda confirmado recién cuando la clienta sube el
  comprobante de la transferencia.
- **Comprobantes** comprimidos en el cliente y guardados en Supabase Storage con
  URL firmada.
- **Panel de administración** para servicios, precios y reglas, agenda,
  profesionales, horarios, caja, clientes y gift cards.
- **Portal de profesionales**: cada una entra con su usuario y ve sólo sus turnos.
- **Caja diaria** con apertura, movimientos y cierre con arqueo.
- **Gift cards** con venta, canje y saldo.

## Arrancar en local

```bash
npm install
cp .env.example .env   # completar SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY
npm run dev
```

## Migraciones

Se aplican en el SQL Editor de Supabase, en orden. Son idempotentes.

| Archivo | Qué hace |
|---|---|
| `supabase/migrations/001_initial.sql` | Tablas base: servicios, reservas, reglas de precio, leads |
| `supabase/migrations/002_admin_tables.sql` | Tablas de administración: clientes, empleados, caja, horarios |
| `supabase/migrations/003_fix_schema.sql` | `employees.email` y `password_hash` (sin ellos ningún profesional puede entrar), tabla `marketing_leads`, `employee_services.commission_percent` |
| `supabase/migrations/004_release_flags.sql` | Tablas del release programable: `app_settings` y `feature_flags` |
| `supabase/seed.sql` | Datos iniciales: servicios, horarios y reglas de precio |

> Hay dos caminos de migración en el repo y no son equivalentes:
> `supabase/migrations.sql` (un solo archivo) y `supabase/migrations/001+002`.
> El segundo es el que está al día. El primero le faltan `clients`,
> `gift_cards`, `employee_sessions` y las columnas de seña y pago.

## Release programable

La app se entrega de a partes, a medida que se cobran. Hay un único número de
etapa y cada funcionalidad declara en cuál aparece; subirlo enciende un lote
completo de una vez.

```bash
npm run release:plan      # qué se enciende en cada etapa
npm run release:status    # en qué etapa está la app ahora
npm run release:next      # sube una etapa
node scripts/release.js stage 2          # va a una etapa concreta
node scripts/release.js off commissions  # apaga una funcionalidad sin bajar la etapa
```

Las etapas:

| Etapa | Contenido |
|---|---|
| 0 · Base | Landing, agenda, servicios y seña obligatoria |
| 1 · Operación diaria | Caja, portal de profesionales, elegir profesional, gift cards |
| 2 · Comisiones | Planilla de comisiones y reportes de facturación |
| 3 · Fidelización | Frecuencia de clientas, historial de visitas, membresías |
| 4 · Comunicación | Avisos y recordatorios automáticos por WhatsApp |

También se maneja desde **Panel → Release**.

Detalle importante: si las tablas de release no están disponibles, el sistema
asume que todo está activo en vez de bloquear las reservas. Es deliberado — que
una clienta no pueda reservar es peor que mostrar de más una funcionalidad — pero
queda avisado en el panel y en los logs. Ver `lib/features.js`.

## Estructura

```
api/            Rutas. admin/ exige rol admin, employee/ token de profesional
lib/            Lógica compartida: agenda, precios, releases, auth, Supabase
public/         Landing, /pago (seña), /admin, /employee, /giftcard
scripts/        Utilidades de línea de comandos
supabase/       Migraciones y seed
```

Dos clientes de Supabase a propósito: `lib/supabase.js` es el de service_role y
tiene `persistSession: false`; `lib/supabase-auth.js` es el único donde se llama
`signInWithPassword`. Mezclarlos hacía que un login degradara el cliente de
service_role y todas las escrituras empezaran a fallar por RLS.

## Pendiente

- **Dominio sin comprar.** Los recordatorios por email salen desde
  `onboarding@resend.dev`, así que sólo llegan al dueño. Por eso los avisos por
  WhatsApp son el canal que falta.
- **WhatsApp automático** (etapa 4) requiere la API de Meta con verificación de
  empresa y plantillas aprobadas. Es lo que más depende de terceros.
- **Comisiones** (etapa 2) falta la planilla. Los porcentajes por profesional y
  servicio se guardan en `employee_services.commission_percent` y todavía no
  están acordados.
- **Paleta y tipografía sin definir.** Los colores están concentrados en
  variables CSS para que cambiar la identidad sea editar un lugar.
