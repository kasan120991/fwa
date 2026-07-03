# FWA Ops — Server

Internal ops API for Francis Web Agency. Node + Express 5, MySQL via `mysql2` (no ORM), ESM.

## Setup

```bash
npm install
cp .env.example .env   # optional — dev defaults work without it
npm run migrate        # creates the DB (default: fwa_ops) and applies the schema
npm run dev            # starts the API on http://localhost:4000 (auto-reload)
```

`migrate` and the server need a reachable MySQL. Without one, the server still
boots and `GET /api/health` reports `"db": "down"`.

## Layout

```
src/
  index.js              entry — listen + graceful shutdown
  app.js                Express app (middleware + routes)
  config/env.js         env-backed config with dev defaults
  db/
    pool.js             shared mysql2 promise pool + helpers
    schema.sql          contacts + calls (the core data model)
    migrate.js          applies schema.sql
  middleware/           notFound, errorHandler
  routes/               apiRouter (/api) — health now; contacts + calls next
```

## API

- `GET /api/health` → `{ status, db, uptime, timestamp }`

Contacts (Leads + Clients) and Calls (AI Receptionist) routers come next.
