# Exchange Tunnel — Web App

React + Vite + Tailwind frontend for Exchange Tunnel, the Telegram engagement exchange
(earn credits by engaging with Telegram posts, spend them on campaigns for your own channel).

The folder name ("Facebook Engagement Exchange UI") is historical; the app is Telegram-only.

## Run

```bash
npm install
npm run dev        # http://localhost:5173 (proxies /api to the backend on :5000)
npm run typecheck  # TypeScript check
npm run build      # production build into dist/
```

## Environment (`.env`)

| Variable | Notes |
|---|---|
| `VITE_API_BASE_URL` | `/api` for local dev (Vite proxy). In production on Vercel the app calls the Render API. |
| `VITE_TELEGRAM_BOT_NAME` | Bot username without `@` (Telegram login widget and help button). |

## Structure

- `src/app/pages` — user pages (Dashboard, Earn, Launch, Campaigns, Repost, Analytics, Wallet,
  Checkout, Settings) and `pages/admin/*` (admin panel at `/admin`)
- `src/app/components` — layout, route guards, Telegram link UI, shared charts (`charts.tsx`)
- `src/app/services/api.ts` — API client (session handling, retries, timeouts)
- `src/app/landing` — public landing page and pricing
