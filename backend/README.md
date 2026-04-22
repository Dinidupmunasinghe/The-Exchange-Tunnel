# Facebook Engagement Exchange Backend

Node.js + Express + MySQL backend for the engagement exchange platform.

## Features

- JWT authentication (`register`, `login`)
- Facebook token connect endpoint
- Campaign creation with credit locking
- Task feed and completion workflow
- Credit transaction ledger
- Daily credit earn limit and basic fraud checks
- Rate limiting + security middleware
- Optional Socket.IO connection

## Project Structure

- `src/controllers` request handlers
- `src/routes` API routes
- `src/models` Sequelize models
- `src/middleware` auth, validation, error handling, rate limits
- `src/services` business logic and Facebook integration
- `src/config` env and db setup

## Environment Setup

1. Copy `.env.example` to `.env`
2. Fill MySQL credentials and secrets
3. Add Meta credentials later when available

## Run Locally

```bash
cd backend
npm install
npm run dev
```

Server starts at `http://localhost:5000`.

## MTProto User Sync (Telethon)

This backend now includes a Python bridge for user-authorized Telegram MTProto actions.

- Python deps required: `telethon`, `pysocks`
- Bridge entrypoint: `src/scripts/telegram_mtproto_bridge.py`
- Configure Python binary via `TELEGRAM_MTPROTO_PYTHON` in `.env`

Protected MTProto routes under `/api/telegram`:

- `POST /user-auth/send-code`
- `POST /user-auth/sign-in`
- `POST /user-auth/sign-in-2fa`
- `POST /actions/join-channel`
- `POST /actions/react`
- `POST /actions/reply`

## API Base

All routes are prefixed with `/api`.

### Public

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`

### Protected

- `GET /api/users/me`
- `GET /api/users/dashboard`
- `POST /api/facebook/connect`
- `GET /api/facebook/posts`
- `POST /api/campaigns`
- `GET /api/campaigns`
- `GET /api/tasks`
- `POST /api/tasks/complete`
- `GET /api/transactions`

## Frontend Integration

In the React app, add:

```bash
VITE_API_BASE_URL=http://localhost:5000/api
```

to `Facebook Engagement Exchange UI/.env`.
