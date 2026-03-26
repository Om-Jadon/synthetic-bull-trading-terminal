# NEXTBULL UI (Phase 2)

Hyperliquid-inspired trading terminal frontend for OpenSoft 2026.

## Local Development

From repository root:

```bash
cd ui
npm install
npm run dev
```

Frontend runs on `http://localhost:3000` and expects backend on `http://localhost:8080`.

## Environment

Environment variables are defined in repository-level `.env` and `.env.example`:

- `NEXT_PUBLIC_WS_URL` for browser WebSocket stream
- `NEXT_PUBLIC_API_URL` for browser REST calls
- `BACKEND_PORT`, `FRONTEND_PORT` for container/runtime ports

## Quality Checks

```bash
npm run test
npm run lint
npm run build
```

## Docker Compose

From repository root:

```bash
docker compose up --build
```

Services:

- `backend` on `${BACKEND_PORT}`
- `frontend` on `${FRONTEND_PORT}`

## Design Contract

UI implementation follows `.impeccable.md`:

- Dark-only desk aesthetic
- Locked trade colors (`#26a69a`/`#ef5350`)
- Brand gold only for identity accent
- RAF-batched WebSocket processing
- Motion with semantic purpose (price flash, spread pulse, tape entrance, panel load-in)
