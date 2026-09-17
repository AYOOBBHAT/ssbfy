# Phase 8D — Production Cloudflare Stream RS256 Signing-Key Configuration + Verification

**Stopped.** Production EC2 `backend/.env` could not be inspected. This phase
did **not** create a Cloudflare signing key, did **not** invent missing values,
did **not** restart PM2, and did **not** mint a playback token.

No application source was changed except this report and the static verifier.
No Mongo writes. No Cloudflare uploads. No `.env` edits. No git commit of
secrets. Secrets, PEMs, API tokens, webhook secrets, JWTs, and signed URLs
are **not printed**.

The live lecture `6aab91a444cb8fe55c5ab870` was **not played**.

---

## Required result fields

| Field | Result |
|---|---|
| production signing key configured | **no** |
| production signing key complete | **no** |
| backend loaded both variables | **no** |
| selected signing path | **fallback** (workstation / any process using the inspected env); **unverified on EC2** |
| PM2 status | **unverified** (SSH denied; no `ssbfy-api` inspect) |
| API health result | **PASS** — `GET https://api.jkssbfy.in/health` → `success: true`, `status: ok`, `environment: production` |
| playback endpoint verification result | **not attempted** (STOP: production signing keys not configured / not inspectable) |
| TTL verification | **PASS in code** — `clamp(duration + 15 minutes, 5 minutes, 6 hours)`; 8s lecture → **908s** |
| existing lecture ID (reference only) | `6aab91a444cb8fe55c5ab870` |
| whether the lecture was played | **NO** |
| whether any MongoDB data was changed | **NO** |
| whether any Cloudflare video was uploaded | **NO** |
| whether any secrets were printed | **NO** |

**Phase result: FAIL**

---

## 1. Production EC2 `backend/.env` (presence / completeness only)

SSH from this workstation:

| Target | Result |
|---|---|
| `root@api.jkssbfy.in` | **Permission denied (publickey)** |
| `ubuntu@api.jkssbfy.in` | **Permission denied (publickey)** |
| `ubuntu@172.31.32.214:22` | previously **timed out** (Phase 8C); not re-used as a write path |

`%USERPROFILE%\.ssh` contains **only** `known_hosts` (no IdentityFile / PEM).

Therefore the production host file `~/ssbfy/backend/.env` (historical path)
**was not opened**. Presence of:

- `CLOUDFLARE_STREAM_SIGNING_KEY_ID`
- `CLOUDFLARE_STREAM_SIGNING_KEY_PEM`

on EC2 is **unknown**. Per Phase 8D rules, unknown is **not** treated as
configured. Values were not invented. No key was created.

**STOP after this fact.** Remaining live production actions (PM2 restart,
authenticated `POST /api/video-lectures/:id/playback`) were not performed.

---

## 2. Workstation `backend/.env` (the only env file this session could inspect)

Presence-only (no values, no lengths of secrets):

| Variable | configured | complete |
|---|---|---|
| `CLOUDFLARE_STREAM_SIGNING_KEY_ID` | **no** | **no** |
| `CLOUDFLARE_STREAM_SIGNING_KEY_PEM` | **no** | **no** |
| Pair (both required together) | **no** | **no** |

This gitignored file is **not** a dump of the EC2 process. It is reported
because it is the only `.env` available. A Node process that loaded **this**
file would **not** have both signing variables.

---

## 3. Did the production backend load both variables?

**No — not verified on the running production process.**

Code **does** load the names at process start:

- `backend/src/config/env.js` — `dotenv.config()` then
  `cloudflareStreamSigningKeyId` / `cloudflareStreamSigningKeyPem`
- `backend/src/services/cloudflareStreamService.js` —
  `playbackSigningConfig()` reads the same `process.env` keys on each mint

Without SSH, `process.env` on PM2 `ssbfy-api` cannot be listed. This phase
did **not** restart PM2, so it also did not force a reload of an
already-configured host `.env`.

`GET /health` proves a production Node process is up; it does **not** expose
whether signing keys are in that process environment (health payload is
liveness only: `success`, `status`, `uptime`, `timestamp`, `environment`).

Health probe used for this report:

- URL: `https://api.jkssbfy.in/health`
- HTTP: **200**
- Body (non-secret): `success=true`, `status=ok`, `environment=production`,
  `uptime=13879`, `timestamp=2026-09-17T10:57:11.085Z`
- Implied `process.uptime()` start ≈ **2026-09-17T07:05:52Z** (12:35 IST)

No PM2 process table was read. Status of `ssbfy-api`: **unverified**.
Restart of `ssbfy-api`: **not performed**.

---

## 4. Selected signing path (Phase 8B implementation, unchanged)

File: `backend/src/services/cloudflareStreamService.js` →
`createSignedPlaybackToken`

This phase **did not modify** that implementation. Static re-read confirms:

| Condition | Path |
|---|---|
| **Both** `CLOUDFLARE_STREAM_SIGNING_KEY_ID` and a decodable PEM | **RS256** local `jwt.sign` (`algorithm: 'RS256'`, `kid` set) |
| **Either** var set without a complete pair | **Fail closed** — HTTP 503 `Cloudflare Stream signing key is incomplete.` (no silent `/token`) |
| **Both** signing vars absent | **Fallback** `POST /accounts/{id}/stream/{uid}/token` with `{ exp, downloadable: false }` |

Workstation inspected env: both signing vars absent → this process would use
**`/token` fallback** (needs `CLOUDFLARE_STREAM_API_TOKEN`).

Production EC2 path: **unverified**. Nothing in this session deployed signing
keys to the host. Do not claim RS256 on production.

Mobile / Admin still must not receive Cloudflare credentials:

- Mobile lecture sources have no `CLOUDFLARE_STREAM_SIGNING_KEY*` /
  `CLOUDFLARE_STREAM_API_TOKEN`
- Signing PEM is backend-only (`env.js` / Stream service)

---

## 5. Controlled playback-token request (existing lecture)

**Not performed.**

| Item | Value |
|---|---|
| Lecture ID (reference only) | `6aab91a444cb8fe55c5ab870` |
| HTTP success/failure | **n/a — request not sent** |
| Signing mechanism selected | **n/a on the live API** (code would choose per §4) |
| `expiresAt` presence | **n/a** |
| Playback URL/token generated | **no** |

Reason: Phase 8D requires STOP when production signing keys are not
configured. Minting would still be a live signed-URL issue even if it used
`/token` fallback; it would not prove the RS256 path.

The lecture was not opened in a player.

---

## 6. Signed playback TTL (Phase 8B rule)

`backend/src/constants/videoLecture.js` → `resolvePlaybackTtlSeconds`:

`TTL = clamp(durationSeconds + 15 minutes, 5 minutes, 6 hours)`

| Constant | Value |
|---|---|
| minimum | `5 * 60` = **300s** |
| buffer | `15 * 60` = **900s** |
| maximum | `6 * 3600` = **21600s** |
| unknown duration default before clamp | 2 hours |

Existing live lecture duration (Phase 6/7B): **8 seconds** →
`8 + 900 = 908` seconds (~15 minutes). That is above the 5-minute floor and
below the 6-hour cap.

`createSignedPlaybackToken` additionally `clampPlaybackTtl`s the incoming
seconds to the same min/max before setting JWT/`/token` `exp`.

Playback mint was not executed, so live `expiresAt` was not observed. The
rule is confirmed **in code** only.

---

## 7. What this phase did **not** do

- Did not create, rotate, or delete a Cloudflare Stream signing key
- Did not modify application runtime source (`cloudflareStreamService.js` etc.)
- Did not edit `backend/.env` or commit `.env`
- Did not add Cloudflare credentials to mobile or Admin frontend
- Did not call `syncIndexes()`
- Did not write Mongo
- Did not upload a Cloudflare video
- Did not create a lecture
- Did not modify VideoLecture `6aab91a444cb8fe55c5ab870`
- Did not play the lecture
- Did not print secrets
- Did not run `verify:phase4-upload-url` (that script can provision a Stream UID)

---

## 8. Operator next step (out of band — not done here)

When SSH (or equivalent host access) exists:

1. Inspect production `backend/.env` for the two signing-key names
   (presence only).
2. If **both absent**: create **one** Stream signing key in Cloudflare
   Dashboard (Stream signing keys) **or** `POST /accounts/{account_id}/stream/keys`
   **only if none already exists**. Store **both** ID and PEM on the host.
   PEM may use `\n` escapes or base64 of the PEM (decoder accepts both).
3. If **one** is set: do **not** fall back; complete the pair or playback 503s.
4. Restart **only** existing PM2 process `ssbfy-api`.
5. Re-run Phase 8D: confirm RS256 without printing the PEM or signed URL.

Do not put signing material on EAS / `EXPO_PUBLIC_` / `VITE_`.

---

## Verifier results (read-only; Phases 8D then 8C–2)

| Command | Result |
|---|---|
| `node scripts/fixtures/set-a/verify-video-lecture-phase8d-signing-production.mjs` | Static checks **PASS** (5). `playbackTokensMinted: 0`, `signingKeysCreated: 0`, `mongoWrites: 0`, `lecturePlayed: false`, `productionEc2Inspected: false`. Workspace signing pair incomplete. Health `ok` / `production`. Script overall line: **FAIL** (EC2 signing env not inspected). |
| `verify:phase8c-video-lecture-signing` | **PASS** (5). Workspace path `token-fallback`. |
| `verify:phase8b-video-lecture-security` | **PASS** (13) |
| `verify:phase8a-video-lecture-security` | **PASS** (16) |
| `verify:phase7b-video-lecture` | **PASS** (12) |
| `node scripts/verify-video-lecture-phase7a.mjs` | **FAIL** (stale Phase 7A contract: still asserts `expo-video` is unset; 7B installed `~3.0.16`). Read-only; no data mutation. Not a signing-key failure. |
| `verify:phase6-real-video-upload` | **PASS** (25). Live lecture still premium + published, duration 8s. `mongoWrites: 0`. `getVideoInvoked: true` (metadata only, no playback mint). |
| `admin`: `verify:phase5-video-lecture` | **PASS** (15) |
| `verify:phase4-video-lecture` | **PASS** (12). Warn: live Cloudflare connectivity script did not pass on this machine (no video created). |
| `verify:phase3-video-lecture` | **PASS** (16) |
| `verify:phase2-cloudflare-stream` | **PASS** (14) |

`verify:phase4-upload-url` was **not** run (mutates Cloudflare / can create a UID).

---

## Confirmation

- production signing key configured: **no**
- production signing key complete: **no**
- backend loaded both variables: **no**
- selected signing path: **fallback** (inspected env); EC2 unverified
- lecture played: **NO**
- MongoDB data changed: **NO**
- Cloudflare video uploaded: **NO**
- secrets printed: **NO**

**FAIL** — production RS256 signing-key configuration was not completed or verified.
