# Phase 8C — Cloudflare Stream Signing Key Configuration Audit

**Read-only.** No Cloudflare keys were created or rotated. No Mongo writes.
No playback tokens or upload URLs were minted. No application code or `.env`
values were changed except adding this report, the static verifier, and its
npm script.

Secrets, PEMs, API tokens, webhook secrets, and JWTs are **not printed**.

The live lecture `6aab91a444cb8fe55c5ab870` was not played.

---

## 1. Production EC2 host

SSH to `root@api.jkssbfy.in` from this session: **Permission denied (publickey).**

There is no PM2/`ecosystem` file in the repo. The **Node process environment on
production EC2 could not be read**.

Do not treat the workstation `backend/.env` as a dump of the EC2 process.

---

## 2. Workstation `backend/.env` (presence only)

This gitignored file is what Phase 6 used for a read-only Cloudflare `getVideo`
against the live UID. It is the only env file this audit could inspect.

| Variable | configured | complete |
|---|---|---|
| `CLOUDFLARE_STREAM_SIGNING_KEY_ID` | **no** | **no** |
| `CLOUDFLARE_STREAM_SIGNING_KEY_PEM` | **no** | **no** |
| Pair (both required together) | **no** | **no** |
| `CLOUDFLARE_STREAM_API_TOKEN` | **yes** | **yes** (non-empty) |
| `CLOUDFLARE_ACCOUNT_ID` | **yes** | **yes** (non-empty) |
| `CLOUDFLARE_STREAM_WEBHOOK_SECRET` | **no** | **no** |

`JWT_SECRET` was not reported.

---

## 3. Playback path this process would use

**Cloudflare `/token` fallback**

Reason: both signing-key variables are absent, so Phase 8B code takes
`POST /accounts/{id}/stream/{uid}/token` using the Account Stream API token.

Not RS256. Not fail-closed (fail-closed is only when *one* of the two signing
vars is set).

**Production EC2 path is unknown** until those same two names are checked on
the host. Nothing in this repo or session deployed signing keys to EC2.
Unless configured out of band, production will also use `/token` after 8B
code is deployed.

---

## 4. Phase 8B implementation (verified in code)

File: `backend/src/services/cloudflareStreamService.js` → `createSignedPlaybackToken`

| Contract | Status |
|---|---|
| Both ID **and** PEM required together for RS256 | **Yes** (`if (!keyId \|\| !pem)` → 503 incomplete) |
| Either var set without a complete pair | **Fail-closed** (no silent `/token`) |
| `/token` only when **both** signing vars are unset | **Yes** |
| Mobile never receives signing credentials | **Yes** — no `CLOUDFLARE_*` / `EXPO_PUBLIC_CLOUDFLARE` in mobile lecture/API sources |
| Admin Vite does not reference signing PEM/API token as `VITE_CLOUDFLARE` | **Yes** (`env.js` has no `VITE_CLOUDFLARE`) |
| `.env.example` placeholders empty | **Yes** |

---

## 5. Cloudflare configuration required (keys are NOT configured here)

Do **not** do this in Phase 8C. Next operator step only:

1. Cloudflare Dashboard → **Stream**.
2. Create a **signing key**  
   Dashboard: Stream settings / signing keys, **or** API  
   `POST /accounts/{account_id}/stream/keys`  
   Docs: [Securing your Stream](https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/).
3. Copy **key id** and **private PEM** (PEM is shown once).
4. Set **backend-only** host env on EC2/PM2 (not mobile, not `EXPO_PUBLIC_`, not `VITE_`):
   - `CLOUDFLARE_STREAM_SIGNING_KEY_ID`
   - `CLOUDFLARE_STREAM_SIGNING_KEY_PEM`  
     PEM may be stored with `\n` escapes or standard base64 of the PEM; the
     backend decoder accepts both.
5. Restart the API process so `process.env` reloads.
6. Confirm **both** are non-empty. If only one is set, playback **503s**.
7. Keep `CLOUDFLARE_STREAM_API_TOKEN` for uploads/webhooks/`/token` emergency
   fallback; do not put it on mobile.

This audit did **not** create that key.

---

## 6. If keys were configured

They are **not** complete on the inspected env file. No mint test was run.

---

## 7–8. API token and webhook secret (backend-only)

| Item | Inspected env file | Backend-only in code |
|---|---|---|
| `CLOUDFLARE_STREAM_API_TOKEN` | configured **yes** | **yes** |
| `CLOUDFLARE_STREAM_WEBHOOK_SECRET` | configured **no** | loaded only in `env.js` / webhook controller |

Phase 6 previously found a Cloudflare webhook event for the live published
lecture in Mongo, so **production almost certainly has a webhook secret on
EC2** even though this workstation `.env` does not. Confirm on the host;
do not copy secrets into git or chat.

---

## Next configuration step

1. On **production EC2**, check presence (not values) of  
   `CLOUDFLARE_STREAM_SIGNING_KEY_ID` and `CLOUDFLARE_STREAM_SIGNING_KEY_PEM`.
2. If absent (expected unless done out of band): create **one** Stream signing
   key in Cloudflare and set **both** variables on the host, then restart.
3. Do not rotate the Account API token in this step unless it is leaked.
4. Do not put signing material on EAS/mobile.

Until both vars are complete on the running process, signed playback uses
**`/token` fallback** (needs `CLOUDFLARE_STREAM_API_TOKEN`).

---

## Verifier results

| Command | Result |
|---|---|
| `verify:phase8c-video-lecture-signing` | PASS (5 checks). `playbackTokensMinted: 0`, `signingKeysCreated: 0`. Workspace dotenv: signing keys not configured; API token configured; webhook secret not in this file; path `token-fallback`. |
| `verify:phase8b-video-lecture-security` | PASS (13 checks) |
| `verify:phase8a-video-lecture-security` | PASS (16 checks) |
| `verify:phase7b-video-lecture` | PASS (12 checks) |
| `verify:phase6-real-video-upload` | PASS (25 checks). Live lecture still premium + published. `mongoWrites: 0`. `getVideoInvoked: true` (metadata only, no playback mint). |
| `admin`: `verify:phase5-video-lecture` | PASS (15 checks) |
| `verify:phase4-video-lecture` | PASS (12 checks) |
| `verify:phase3-video-lecture` | PASS (16 checks) |
| `verify:phase2-cloudflare-stream` | PASS (14 checks) |

---

## Confirmation

- No signing key created or rotated.
- No EAS build.
- No real lecture playback.
- No `.env` edits.
- No secret values in this report.

STOP.
