# Agent Dashboard "Loading Forever" — Diagnosis & Fix

## The real root cause

The dashboard showed a loading spinner forever on every startup. Tracing the
render flow in `frontend/src/App.js` revealed why:

1. `loading` was initialized to `true`.
2. On startup there is no token, so the connection `useEffect` hit its early
   `return` — **no socket was ever created**. That means the `connect`,
   `connect_error`, timeout, and retry handlers never ran.
3. The component rendered `if (loading)` **before** the token-input screen, so
   the spinner always won and the login screen was unreachable.

Nothing could ever set `loading` back to `false`, because the only code that
did so lived inside socket handlers that never fired without a token. The
spinner persisted forever, regardless of whether the backend was running.

### Why the earlier fix didn't work

A previous attempt added a 10-second connection timeout and exponential-backoff
retry logic. All of that code lived **inside the socket-connection path that the
no-token early `return` skips**, so it never executed. It addressed a symptom
that couldn't occur given the initial state.

### Second blocker: no way to get a token

Even past the spinner, the backend required a valid JWT but exposed **no
endpoint to issue one**, so the dashboard could never actually connect.

## The fix

### Backend — `backend/server.js`
- Added `POST /api/login` that mints a JWT from a username (dev login, no
  password store — replace with real credential checks for production).
- Added `GET /health` for a quick liveness check.
- Added CORS headers and `express.json()` so the React dev server can call the
  REST endpoints.

### Frontend — `frontend/src/App.js`
- `loading` now starts `false` and is only `true` while a connection attempt is
  actually in flight, so the login screen is reachable on startup.
- Reordered rendering: **login → connecting spinner → failure screen →
  dashboard**.
- Made retry actually work: a `reconnectNonce` re-runs the connection effect
  (the old `setToken(token)` could not re-trigger it). `retryCount` now
  increments correctly, stops after 5 attempts, and then shows a manual
  "Try Reconnecting" button.
- Replaced the dead "paste a JWT" field with a username login that fetches a
  token from `/api/login`, then auto-registers the dashboard as an agent on
  connect. Added Cancel / Log Out controls.
- Fixed a Material-UI `Select` controlled-value warning (uses `''` for the
  broadcast option instead of `null`/`undefined`).

## How to run

```bash
./start.sh
```

Or manually:

```bash
cd backend && npm install && npm start      # http://localhost:3001
cd frontend && npm install && npm start     # http://localhost:3000
```

Then open http://localhost:3000, enter any username, and click **Connect**.

## Verification performed
- `POST /api/login` returns a signed token and rejects an empty username.
- A socket connects with that token and receives `agents-list`; a missing token
  produces a `connect_error` (retry screen, not an infinite hang).
- `npm run build` compiles cleanly.

## Files changed
1. `backend/server.js` — login endpoint, health check, CORS, JSON body parsing
2. `frontend/src/App.js` — corrected loading/render logic, working retry, login
3. `.gitignore` — added (excludes `node_modules/`, build output, logs)
