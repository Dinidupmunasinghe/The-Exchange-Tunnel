# Exchange Tunnel — Backend API

Node.js + Express 5 + Sequelize API for **Exchange Tunnel**, a credit-based engagement exchange for
**Telegram** channels and posts. Users earn credits by subscribing to channels and liking,
commenting on or reposting posts, and spend credits on campaigns that bring the same engagement
to their own Telegram content. Paid plans are sold as PayPal subscriptions.

(The repository folder names still say "Facebook"/"Soundcloud"; those are leftovers. Some DB
columns such as `facebookPostId` are mapped to `messageKey` in the models.)

## Stack

- Express 5, Sequelize 6 — Postgres (Neon / Render) or MySQL
- Telegram Bot API (login widget, membership checks, deep-link login with in-bot confirmation)
- Telethon MTProto bridge (`src/scripts/telegram_mtproto_bridge.py`) for actions done as the user
- PayPal Subscriptions (plans, approval, webhooks, server-side confirmation)

## Run locally

```bash
cd backend
npm install
cp .env.example .env    # then fill it in
npm run dev             # http://localhost:5000, health: /api/health
```

The UI (`../Facebook Engagement Exchange UI`) proxies `/api` to port 5000 during `npm run dev`.

### Database

Set `DATABASE_URL` (Postgres, e.g. a free [Neon](https://neon.tech) database) — SSL is enabled
automatically. Tables are created on first start; additive schema patches run on every boot
(`src/server.js`). Use a **separate database/branch for local development**, never production.

### Required environment

| Variable | Notes |
|---|---|
| `JWT_SECRET`, `ENCRYPTION_SECRET` | ≥ 32 random chars. In production the server refuses to start without them. |
| `ADMIN_LOGIN_EMAIL`, `ADMIN_LOGIN_PASSWORD` | Admin panel at `/admin`. Optional `ADMIN_JWT_SECRET`. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_NAME` | From @BotFather. The token never leaves the server (avatars go through `/api/media`). |
| `TELEGRAM_WEBHOOK_SECRET` | Required. Pass it as `secret_token` to `setWebhook`; keep `callback_query` in allowed updates. |
| `TELEGRAM_MTPROTO_API_ID/HASH`, `TELEGRAM_MTPROTO_PYTHON` | For user-session actions. |
| `PAYPAL_CLIENT_ID/SECRET`, `PAYPAL_MODE`, `PAYPAL_WEBHOOK_ID` | Webhook signatures are always verified. |
| `CORS_ORIGIN`, `FRONTEND_URL` | Your site URL(s). |

See `.env.example` for the full list.

## Credit rules (enforced server-side)

- Campaign budgets are locked up front. Deleting/cancelling refunds only unfinished slots, once.
- Undoing an engagement (user, admin, or background audit) claws back the worker's reward and
  reopens the slot; the owner is not refunded (they still get the engagement they paid for).
- Free plan: one-time welcome credits at signup. Paid plans: credits per confirmed PayPal payment,
  each sale credited exactly once; refunds/chargebacks claw credits back.

## API overview (`/api`)

Public: `GET /health`, `POST /auth/register`, `POST /auth/login`, `POST /auth/telegram`,
`POST /auth/telegram-deeplink/start`, `GET /auth/telegram-deeplink/poll`, `GET /packages`,
`POST /payments/paypal/webhook`, `GET /media/tg/:kind/:id` (signed).

Authenticated: `/users/*` (profile, dashboard, analytics, Telegram link), `/telegram/*`,
`/campaigns`, `/tasks`, `/transactions`, `/repost/*`, `/payments/*` (subscribe, confirm, cancel).

Admin (`/admin-auth/login` → bearer token): `/admin/*`.

## Deploy

`render.yaml` describes the Render web service (free tier: keep `AUDITS_ENABLED=false`,
`LOW_MEMORY_HOST=true`). The frontend is deployed on Vercel (`../vercel.json`).
