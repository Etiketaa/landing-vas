# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Express + vanilla HTML/CSS/JS + Supabase (existing codebase)

## Users

Primary: Women 25–55 in Bahía Blanca seeking aesthetic treatments (facial, body, hair removal, nails, eyebrows, eyelashes, massages). They arrive via local search, social media, or word of mouth, and their job is to evaluate VAS and book an appointment.

Secondary: Existing clients booking repeat appointments; gift card purchasers.

## Product Purpose

Showcase VAS Centro de Estética's services and convert visitors into booked appointments. The site also captures leads via a marketing popup (10% off offer) and serves as the operational hub for the business (admin panel, employee portal, gift cards, daily cash register).

Success = bookings/appointments converted from visits.

## Positioning

VAS offers specific equipment/technology not available elsewhere in Bahía Blanca. (Exact models/specs to be confirmed — future work must not fabricate this claim.)

Supporting signals in current copy: "fórmulas internacionales exclusivas", "tecnicas innovadoras", "equipo de ultima generacion", "tecnicas innovadoras y formulas exclusivas".

## Operating Context

- Physical location: Bahía Blanca, Buenos Aires, Argentina
- Booking flow: Web form → deposit required → instant confirmation
- Admin panel: Full business management (clients, services, schedule, cash register, gift cards, features)
- Employee portal: Professionals manage their schedules and bookings
- Marketing: Popup lead capture (name + phone) for 10% off first visit
- Payments: Integrated payment flow (separate /pago page)
- Communications: WhatsApp, email, phone for confirmations/reminders

## Capabilities and Constraints

Confirmed functionality:
- Public landing page with hero, about, services, showcase, stats, footer
- Booking modal with service selection, date/time picker, price display, notes
- Admin dashboard (login-protected)
- Employee portal (login-protected)
- Gift card purchase/redemption flow
- Marketing popup with lead capture
- Supabase backend (auth, database, realtime)
- Automated cron jobs (expire bookings, send reminders)

Technical constraints:
- Single-page vanilla JS frontend (no framework)
- Express server serves static files + API routes
- Supabase for auth/data; no separate CMS
- Spanish-language only (es)
- Deploy target: Vercel (vercel.json present)

Explicitly undecided:
- Exact equipment/technology models that differentiate VAS
- Whether real facility/team photography will replace stock images
- Full testimonial/review corpus for social proof

## Brand Commitments

- Name: **VAS** (all caps)
- Logo: Playfair Display serif treatment, tracking +0.03em, font-weight 700
- Color palette (CSS custom properties):
  - `--primary: #b08968` (warm bronze)
  - `--primary-dark: #8b6f47`
  - `--primary-light: #ddb892`
  - `--accent: #7f5539`
  - `--cream: #fefae0`
  - `--cream-dark: #f5e6d3`
  - `--text: #3d2c2c`
  - `--text-light: #8a7568`
  - `--white: #ffffff`
  - `--bg: #faf6f1`
- Typography: DM Sans (UI) + Playfair Display (headlines/logo)
- Voice: Warm, professional, Spanish (es-AR)
- Social presence: Facebook, Instagram, WhatsApp (links in footer)

## Evidence on Hand

- Before/after treatment photos (with client consent) — **must not be fabricated**
- Currently: Hero and About sections use Pexels stock images (placeholders)
- Real facility/team photos: not confirmed as available
- Google reviews / written testimonials: not confirmed as available
- Equipment photos/specs: not confirmed as available
- Certifications/awards/press: not confirmed as available

Future work must not invent testimonials, before/afters, team bios, or equipment claims.

## Product Principles

1. **Trust through transparency** — Show real pricing, real results, real people; no hidden fees or mystery.
2. **Effortless booking** — From landing to confirmed appointment in minimal taps; deposit flow is clear and fast.
3. **Local expertise** — Bahía Blanca roots, Argentine context, neighborhood trust; not a generic chain.

## Accessibility & Inclusion

Standard WCAG AA compliance baseline. No demographic-specific requirements beyond standard web accessibility.