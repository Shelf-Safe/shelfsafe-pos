# ShelfSafe POS Simulator

Login:
- username: `sam`
- password: `password123`

## Run
```bash
npm install
npm start
```

Open `http://localhost:4010`

## What this version does
- simulates 250 pharmacy inventory items
- first bootstrap exposes a **full seed-like dataset** for ShelfSafe collections
- later syncs expose **changed entities only** for performance
- inventory rows flash when stock changes
- inventory auto-mutates every 15 seconds

## API endpoints for ShelfSafe
- `POST /api/auth/login`
- `GET /api/bootstrap/full-dataset`
- `GET /api/sync/changes?cursor=0`
- `GET /api/inventory`
- `GET /api/inventory/changes?cursor=0`
- `GET /api/activity`
- `GET /api/simulator/status`
- `POST /api/simulator/force-change`

## Bootstrap collections returned
- organizations
- users
- locations
- suppliers
- products
- medications
- inventoryLots
- stockTxns
- alerts
- notifications
- recalls
- reports
- auditLogs


## Deployment modes

- `server.js` keeps the original localhost interval-based simulator for local testing.
- `serverLive.js` is the Vercel-friendly illusion mode. It advances inventory only when requests arrive, so it works without a forever-running background process.

### Localhost
```bash
npm install
npm start
```

### Vercel
Deploy this folder as-is. `vercel.json` routes requests to `serverLive.js`.
