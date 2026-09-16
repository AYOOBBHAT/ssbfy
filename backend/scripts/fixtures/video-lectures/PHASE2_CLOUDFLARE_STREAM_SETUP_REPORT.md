# Phase 2 — Cloudflare Stream Setup

**Status:** BLOCKED  
**Date:** 2026-09-12  
**Scope:** Backend-only Stream client + optional env vars + read-only connectivity script. No VideoLecture feature.

Git snapshot at start: `main`, up to date with `origin/main`. Pre-existing dirty: `mobile/app.json`, Phase 1 audit files. Those were not reset.

---

## Cloudflare Account

Stream is **not yet connected from this machine**. Local `backend/.env` (gitignored) has empty placeholders for the two variable names only. No Account ID or API token values were supplied to Cursor, committed, or printed.

**Enable Stream (dashboard, you do this):**

1. Sign in at [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Open **Stream**. If prompted, enable Stream for the account.
3. Copy the **Account ID** from the account home (overview). Do not paste it into git, chat logs, or this report.

Official references:

- [Direct creator uploads](https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/)
- [List videos](https://developers.cloudflare.com/api/resources/stream/methods/list)
- [API token permissions](https://developers.cloudflare.com/fundamentals/api/reference/permissions/)

---

## API Configuration

Variable names only (no values):

| Name | Where | Required at process start? |
|------|--------|------------------------------|
| `CLOUDFLARE_ACCOUNT_ID` | `backend/.env` (local), host env (production) | No — optional until a Stream call |
| `CLOUDFLARE_STREAM_API_TOKEN` | same | No — optional until a Stream call |

Tracked empty placeholders: `backend/.env.example`.  
Loaded in `backend/src/config/env.js` as optional strings (not `required()`).  
The Stream client reads `process.env` directly so connectivity tests do not need `JWT_SECRET`.

Never set `VITE_*` or `EXPO_PUBLIC_*` copies of the token.

---

## Token Permissions

Create the token yourself in the dashboard (Cursor must not receive the secret):

1. **My Profile → API Tokens → Create Token → Create Custom Token**
2. Name example: `ssbfy-stream-backend`
3. Permissions: **Account → Stream → Edit**  
   API names: **Stream Write** (direct upload) and list videos also accepts **Stream Write** or **Stream Read** ([list videos](https://developers.cloudflare.com/api/resources/stream/methods/list), [direct upload](https://developers.cloudflare.com/api/resources/stream/subresources/direct_upload/methods/create/))
4. Account Resources: include **this account only**
5. Do **not** add Zone DNS, Workers, R2, Pages, or account administrator
6. Paste Account ID + token into **local** `backend/.env` only
7. Re-run `npm run verify:cloudflare-stream` from `backend/`

---

## Backend Integration

| File | Role |
|------|------|
| `backend/src/config/env.js` | Optional `cloudflareAccountId` / `cloudflareStreamApiToken` |
| `backend/src/services/cloudflareStreamService.js` | Fetch client: token verify, list summary, `createDirectUploadUrl` (not invoked in Phase 2) |
| `backend/scripts/verify-cloudflare-stream.mjs` | Read-only connectivity |
| `backend/scripts/verify-phase2-cloudflare-stream.mjs` | Setup verifier |

HTTP client: **Node 20 `fetch`**. No extra SDK. Not imported from `app.js` / routes — startup, health, auth, questions, tests, payments unchanged.

---

## Connectivity Test

Command: `npm run verify:cloudflare-stream`

**Result this session:** `configured: false`. Missing filled `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_STREAM_API_TOKEN`.

The script would, when configured:

1. `GET /user/tokens/verify` — token recognized
2. `GET /accounts/{account_id}/stream?include_counts=true&limit=1` twice — Stream access + count unchanged
3. Never mint an upload URL, never upload bytes, never connect MongoDB

---

## Direct Upload Capability

Official `POST /accounts/{account_id}/stream/direct_upload` **creates a pending Stream video UID** before any file is sent (`uploadURL` + `uid` in the JSON). TUS `POST /stream?direct_user=true` is the same class of resource.

Phase 2 **does not call** those endpoints so:

- Cloudflare videos created = 0
- Existing videos unmodified

`cloudflareStreamService.createDirectUploadUrl` exists for Phase 4 and is documented as mutating. Connectivity tests must not invoke it.

Until credentials work, Write permission is **unverified**. After you add the token, a successful list+verify implies Stream access; Write is confirmed only when Phase 4 mints a URL (or you accept a temporary pending UID).

---

## Webhook Preparation

**Not configured.** Official [Stream webhooks](https://developers.cloudflare.com/stream/manage-video-library/using-webhooks/):

- One notification URL per Cloudflare **account** (`PUT /accounts/{id}/stream/webhook`)
- POST after processing completes (success or error)
- Body includes `uid`, `readyToStream`, `status.state` (`ready` / `error`), duration, thumbnail, `playback.hls`
- Authenticate with `Webhook-Signature: time=…,sig1=…` HMAC-SHA256 of `time + '.' + rawBody` using the subscribe-response `secret`
- No localhost; public HTTPS required

Phase 4 should capture raw body (same idea as Razorpay) and verify HMAC. Do not subscribe in Phase 2.

---

## Signed Playback Preparation

**Not implemented.** Official [securing Stream](https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/):

- Set `requireSignedURLs` on upload
- Low volume: `POST /accounts/{id}/stream/{uid}/token` (~1 hour, rate-limited / low daily volume)
- Production: Stream **signing keys**, JWT minted on SSBFY backend; replace UID with token in HLS URL
- Token never stored in Mongo; short TTL at playback time

Phase 7 work. No playback tokens were created.

---

## Local Environment

- Loader: `dotenv` via `backend/src/config/env.js` and `scripts/lib/db.mjs` `loadBackendEnv()`
- Secrets file: `backend/.env` (gitignored). Empty Cloudflare keys were appended as placeholders; **you must fill them**
- Example: `backend/.env.example` (empty values, tracked)

This workspace’s local `.env` is not a full production clone. Cloudflare connectivity is blocked until you paste real values locally.

---

## Production Environment

No PM2/EC2 config files live in this repo. Production already uses host environment variables (same pattern as `JWT_SECRET`, `RAZORPAY_*`, `SUPABASE_*`).

**Manual later (do not deploy Phase 2 automatically):**

```
CLOUDFLARE_ACCOUNT_ID=<account id>
CLOUDFLARE_STREAM_API_TOKEN=<stream edit token>
```

Do not restart PM2 or change production env without explicit approval. `productionConfigured`: false.

---

## Cloudflare Resource Counts

| Check | Value |
|-------|--------|
| Count before connectivity | not queried (no credentials) |
| Count after | not queried |
| Videos created this phase | 0 |
| Existing videos modified | 0 |

When credentials exist, the connectivity script records `videoCountBefore` / `videoCountAfter` and requires them equal.

---

## MongoDB Changes

| Item | Count |
|------|--------|
| Writes | 0 |
| Collections created | 0 |
| Indexes created | 0 |
| VideoLecture documents | 0 |
| Playlist documents | 0 |

No `build:indexes`, no `syncIndexes()`, no models added to `src/models/index.js`.

---

## Security

- Token not in source, admin, or mobile
- Token not in reports or connectivity JSON
- `.gitignore` includes `.env` and `backend/.env`
- Service never logs `Authorization`
- `createDirectUploadUrl` return value is not printed by Phase 2 scripts

---

## Issues

1. **BLOCKED:** Cloudflare credentials are not filled locally — connectivity cannot pass.
2. Direct Creator Upload cannot be proven without creating a pending UID; Phase 2 intentionally skipped that call.
3. Production host env not updated (by design).
4. Local `.env` is incomplete versus a full API runtime; Stream client was decoupled from `JWT_SECRET` so the connectivity script can run once Cloudflare vars are set.

---

## Phase 3 Readiness

**Not ready.** Phase 3 (VideoLecture model) should wait until:

1. You create the Stream-scoped API token and enable Stream
2. Values are in local `backend/.env`
3. `npm run verify:cloudflare-stream` prints `ok: true` (still without minting upload URLs)
4. Optional: same two names on production when you choose to deploy later

Phase 2 **code foundation** is in place (env names, client, verifiers). Phase 3 must not start until connectivity is PASS.

---

## Safety check

| Item | Result |
|------|--------|
| MongoDB writes | 0 |
| VideoLecture / Playlist | not created |
| Cloudflare videos created | 0 |
| Questions / Tests / Posts / Users / SET A | unmodified |
| Mobile | unmodified (pre-existing `app.json` dirty) |
| Admin feature pages | unmodified |
| Production deployed | NO |
| Secrets committed | NO |
