# SipNGo

Order-ahead app for a drinks kiosk. Customers browse the menu, customise a
drink, pay in-app, and collect with a QR code. Staff work a live order board and
scan the code to close the order out.

Built with Next.js 16 (App Router), libSQL/Turso, Stripe Checkout, and a
Trusted Web Activity wrapper for Android.

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
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | no | Web Push keys. Absent, push is disabled and only the in-app banner shows. |
| `VAPID_SUBJECT` | no | `mailto:` address push services use to contact you. |
| `DATABASE_URL` | production | Turso database URL (`libsql://…`). Unset means a local file. |
| `DATABASE_AUTH_TOKEN` | production | Turso auth token. Required whenever `DATABASE_URL` is remote. |
| `DATABASE_PATH` | no | Local SQLite file, used only when `DATABASE_URL` is unset. |
| `CAPACITOR_SERVER_URL` | no | Points the Android wrapper at a dev server. |
| `EXTRA_DEV_ORIGINS` | no | Comma-separated extra origins Next accepts in dev (tunnels, LAN IPs). |

`.env.local` is gitignored and must stay that way. Never commit it, and never
commit a local `*.db` file — it contains real customer records.

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

## Notifications

Two separate things, often confused:

- **In-app banner** — shown while a page is open, rendered by `Toast` through a
  portal to `document.body`. The portal is not decoration: an ancestor that
  animates `opacity` creates a stacking context, which traps a child's
  `z-index` inside it and lets the sticky header paint over the banner.
- **Push notification** — delivered by the browser's push service to the
  service worker, so it arrives **with the app closed and the screen off**.
  This is the one customers actually need.

Customers are asked for permission by `PushNotificationPrompt`, on a tap rather
than on page load: browsers block permission requests made without a user
gesture, and a denial is close to permanent.

Who gets told what:

| Event | Who is notified |
| --- | --- |
| Order paid | Staff and admins — "new order, needs making" |
| Order set to preparing / ready / cancelled | The customer who placed it |

Delivery never blocks or fails an order. A subscription the push service
reports as gone (404/410) is deleted, which is how the table stays free of
dead endpoints.

> The Android app is a Trusted Web Activity, so it runs on Chrome and receives
> these like any browser would. A plain WebView wrapper could not: Android's
> WebView has no Push API at all, which is why the app is packaged this way.

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

`android/` is a **Trusted Web Activity**: a thin Android wrapper that opens the
deployed site inside Chrome with no browser chrome. It is not a copy of the
app, and it is deliberately not a WebView — Android's WebView has no Push API,
so a WebView wrapper can never deliver a notification with the app closed.
Chrome can, which is the whole reason for this packaging.

| Change | What you do |
| --- | --- |
| Menu, prices, pages, styling, features, bug fixes | Push to `main`. Vercel redeploys and **every installed phone shows it on next open.** No new APK. |
| App icon, app name, permissions, the URL it opens | Rebuild the APK and reinstall. |

### Getting an APK

Run **Actions → Build Android app → Run workflow**, or push a change under
`android/`. The APK is attached to the run as `sipngo-twa-<commit>`.

The `server_url` input builds against a different deployment without editing
anything:

```
server_url: https://staging.example.com
```

### Signing, and why the URL bar appears

Chrome hides its address bar only when Digital Asset Links verifies, and that
compares two things:

1. the SHA-256 fingerprint in `public/.well-known/assetlinks.json`
2. the certificate the APK was actually signed with

They match only when CI signs with the release keystore, which needs four
repository secrets:

| Secret | What it holds |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | the keystore file, base64-encoded |
| `ANDROID_KEYSTORE_PASSWORD` | its password |
| `ANDROID_KEY_ALIAS` | `sipngo` |
| `ANDROID_KEY_PASSWORD` | the key password |

Without them the build still succeeds and still delivers push — it falls back
to debug signing, and Chrome shows its address bar. The "Report what was built"
step prints both fingerprints side by side so a mismatch is obvious.

> **Keep the keystore.** Android identifies an app by package name *and*
> signing certificate. Lose the keystore and you cannot ship an update that
> installs over an existing copy — every user has to uninstall first.

### Notifications on Android 13+

The manifest declares `POST_NOTIFICATIONS`. Chrome asks for it the first time
the site requests notification permission, so the in-app card handles it.

### iOS

Not set up. It needs a Mac with Xcode and a paid Apple Developer account,
neither of which is available here. Note that iOS supports Web Push only for a
PWA the user has added to their home screen.

## Editor tooling (MCP)

`.mcp.json` declares a GitHub MCP server for anyone working on this repo with
an MCP-aware assistant. It exists for one concrete reason: GitHub Actions run
logs cannot be read without a token, so a failed build reports
`Process completed with exit code 1` and nothing else. Two Android builds
failed that way during development, which is why the workflow now captures
Gradle's output and re-emits it as an annotation — a workaround for missing
log access.

The file holds no credentials. It references `GITHUB_PERSONAL_ACCESS_TOKEN`
from the environment, so it is safe to commit. Set the token once as a user
environment variable:

```powershell
[Environment]::SetEnvironmentVariable("GITHUB_PERSONAL_ACCESS_TOKEN", "ghp_your_token", "User")
```

Then restart the editor. Create the token at
https://github.com/settings/tokens with `repo`, `workflow`, and `read:org`.

Worth adding later, but not configured because the services are not set up:

- **Vercel** — deployment status, environment variables, and runtime logs.
  Missing variables were the real cause of an empty menu that took several
  rounds to diagnose, and a generated admin password was lost to a log nobody
  could read.
- **Sentry** — there is no error monitoring at all. A customer hitting a 500
  mid-order is currently invisible, because the API deliberately returns
  generic errors.

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
