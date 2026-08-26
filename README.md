# SipNGo

Order-ahead app for a drinks kiosk. Customers browse the menu, customise a
drink, pay in-app, and collect with a QR code. Staff work a live order board and
scan the code to close the order out.

Built with Next.js 16 (App Router), SQLite via `better-sqlite3`, Stripe
Checkout, and Capacitor for the Android wrapper.

---

## Getting started

```bash
npm install
cp .env.example .env.local
```

Generate a signing key and put it in `.env.local` as `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` to create the first admin account, then:

```bash
npm run dev
```

The database file is created and migrated automatically on first request, and
a starter drinks menu is seeded if the menu is empty.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `JWT_SECRET` | yes | Signs session cookies. The app refuses to start without it. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | first run | Seeds the initial admin. Both or neither; password must be 12+ characters. |
| `STRIPE_SECRET_KEY` | production | Live payments. Absent outside production, payments are simulated. |
| `ALLOW_SIMULATED_PAYMENTS` | no | Set to `true` to run a production deployment in demo mode with no real charges. |
| `STRIPE_WEBHOOK_SECRET` | production | Verifies incoming webhooks. |
| `NEXT_PUBLIC_APP_URL` | yes | Used to build Stripe return URLs. |
| `ICED_SURCHARGE_CENTS` | no | Surcharge for an iced drink, in sen. Defaults to `100`. |
| `DATABASE_URL` | production | Turso database URL (`libsql://…`). Unset means a local file. |
| `DATABASE_AUTH_TOKEN` | production | Turso auth token. Required whenever `DATABASE_URL` is remote. |
| `DATABASE_PATH` | no | Local SQLite file, used only when `DATABASE_URL` is unset. |
| `CAPACITOR_SERVER_URL` | no | Points the Android wrapper at a dev server. |
| `EXTRA_DEV_ORIGINS` | no | Comma-separated extra origins Next accepts in dev (tunnels, LAN IPs). |

`.env.local` is gitignored and must stay that way. Never commit it, and never
commit `sipngo.db` — it contains real customer records.

## Payments

With no `STRIPE_SECRET_KEY` set, checkout marks the order paid without charging
anything. That is the default in development.

In production the same situation is an error, because a real deployment that
loses its Stripe key should fail loudly rather than quietly give orders away.
A deliberate showcase deployment opts in instead:

```
ALLOW_SIMULATED_PAYMENTS=true
```

With that set, customers can place and track orders end to end without Stripe
configured. Never set it on a deployment taking real money.

Point a Stripe webhook at `POST /api/webhook` and set `STRIPE_WEBHOOK_SECRET`.
Handled events:

- `checkout.session.completed` — marks the order paid and awards loyalty points
- `checkout.session.expired` — cancels an abandoned order
- `charge.refunded` — cancels the order and reverses its points

Award and reversal both go through the `points_ledger` table, which has a
`UNIQUE (order_id, reason)` constraint, so a replayed webhook cannot
double-credit an account.

## Order lifecycle

```
pending_payment ──▶ paid ──▶ preparing ──▶ ready ──▶ picked_up
       │             │           │
       └─────────────┴───────────┴──▶ cancelled
```

Transitions are enforced server-side in `src/lib/order-status.ts`. An order
cannot move backwards, and `picked_up` and `cancelled` are terminal. Customers
may cancel their own order while it is `pending_payment` or `paid`; after that
it is a staff action. **Cancelling a paid order does not issue a Stripe refund
— that is still a manual step in the Stripe dashboard.**

## Database

libSQL, spoken over the network in production and against a local file in
development. Schema changes are an ordered, append-only list in
`src/lib/db.ts`, tracked in `schema_migrations` and applied on first request;
never edit a migration that has shipped, add a new entry instead.

Every query goes through `src/lib/sql.ts` (`one` / `all` / `run` /
`transaction`) rather than the driver directly, so result-shape handling lives
in one place.

**Local development needs no account.** With `DATABASE_URL` unset the app opens
`sipngo.db` as a plain file. The test suite does the same against a temporary
file, so it runs offline.

**Production uses [Turso](https://turso.tech).** Create a database, then set
`DATABASE_URL` and `DATABASE_AUTH_TOKEN`. Because the data no longer lives on
the server's filesystem, the app runs anywhere — including serverless hosts
like Vercel that have no persistent disk.

> One caveat inherited from SQLite: `datetime('now')` and friends run on the
> database, so timestamps are UTC. `src/lib/dates.ts` converts for display.

## Commands

```bash
npm run dev        # development server
npm run build      # production build
npm start          # serve the production build
npm test           # unit and integration tests
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
```

## Android app

`android/` is a Capacitor shell around the deployed site. It is not a copy of
the app: it opens `https://sipngo-production.up.railway.app` in a native
WebView with the SipNGo icon, splash screen, and no browser chrome.

That distinction is the important one:

| Change | What you do |
| --- | --- |
| Menu, prices, pages, styling, features, bug fixes | Push to `main`. Railway redeploys and **every installed phone shows it on next open.** No new APK. |
| App icon, app name, permissions, the URL it points at | Rebuild the APK and reinstall. |

So almost nothing needs a rebuild.

### Getting an APK

Push to `main`, or run **Actions → Build Android app → Run workflow** on
GitHub. The finished APK is attached to that run as an artifact named
`sipngo-debug-<commit>`. Download it, transfer it to the phone, and open it —
Android will ask you to allow installing from this source.

Building locally instead needs Android Studio and a JDK:

```bash
CAPACITOR_SERVER_URL=http://192.168.1.20:3000 npx cap sync android
cd android && ./gradlew assembleDebug
```

Leave `CAPACITOR_SERVER_URL` unset to point at production. The APK lands in
`android/app/build/outputs/apk/debug/`.

> If Gradle fails with `PKIX path building failed`, something on the machine is
> intercepting TLS — Norton and similar antivirus products do this — and the
> JDK does not trust its certificate. Building through GitHub Actions avoids
> this entirely.

### Limitations

- The app needs a network connection. It shows the live site, so there is no
  offline mode beyond the service worker's cached icons.
- This is a **debug-signed** APK: fine for installing directly on a phone, but
  the Play Store needs a release build signed with your own upload key.
- `public/.well-known/assetlinks.json` holds Digital Asset Links for a Trusted
  Web Activity build, which is a separate packaging route from this one.

### iOS

Not set up. It needs a Mac with Xcode and a paid Apple Developer account;
neither is available here. `npx cap add ios` on a Mac is the starting point,
and the same Capacitor config applies.

## Project layout

```
src/
  app/
    (customer)/     menu, cart, orders, account
    admin/          live order board, menu management
    api/            route handlers
  components/       shared UI
  context/          auth and cart providers
  hooks/            usePolling — visibility-aware polling
  lib/
    auth.ts         JWT signing, session cookies, role guards
    db.ts           connection, migrations, admin seed
    env.ts          validated environment access
    orders.ts       order creation, status changes, points ledger
    order-status.ts the status state machine
    rate-limit.ts   login and signup throttling
    validation.ts   zod schemas for every request body
```

## Known gaps

- Loyalty points accrue and display a tier, but there is no way to redeem them.
- Refunds must be issued by hand in Stripe.
- No store opening hours: orders can be placed at any time of day.
- No email receipts.
