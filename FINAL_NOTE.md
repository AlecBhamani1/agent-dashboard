# Agent Dashboard "Loading Forever" — Fixed

## TL;DR

The dashboard loaded forever on every startup because the React app rendered its
loading spinner **before** the login screen, and `loading` started as `true`
with nothing able to clear it (no token → no socket → no handlers → spinner
never turned off). On top of that, there was no backend endpoint to obtain the
JWT the app needs to connect.

Both are now fixed. See `IMPLEMENTATION_SUMMARY.md` for the full diagnosis.

## What changed

### `backend/server.js`
- `POST /api/login` — issues a JWT for a given username (dev login).
- `GET /health` — liveness check.
- CORS headers + `express.json()` for the REST endpoints.

### `frontend/src/App.js`
- `loading` starts `false`; it's only `true` during an active connection
  attempt, so the login screen is reachable on startup.
- Render order is now: login → connecting → failure (with manual retry) →
  dashboard.
- Retry logic actually re-triggers now (via a `reconnectNonce`); it backs off,
  caps at 5 attempts, then offers a manual retry.
- Username-based login fetches a token from `/api/login` and auto-registers the
  dashboard on connect.

## How to run

```bash
./start.sh
```

Then open http://localhost:3000, type any username, and click **Connect**.
- Backend: http://localhost:3001
- Frontend: http://localhost:3000

If the backend is down, you now get a clear connection error with a retry
button instead of an infinite spinner.

## Note on the earlier attempt

The previous fix added a connection timeout and retry logic, but placed it
inside the socket code path that never runs when there's no token — so it could
not resolve the hang. The actual problem was the initial `loading` state and
render order, which this change corrects.
