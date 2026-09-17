# Phase 8B — Video Lecture Security Hardening

Implements **only** the approved Phase 8A fixes. No architecture redesign,
playlists, Mongo watch history, or Question/Test/PYQ/Battle/Daily changes.

Live lecture `6aab91a444cb8fe55c5ab870` /
UID `bc458651fedcffe67384e5d7e01afe18` was **not** played, minted, or modified.

---

## Phase 8A findings addressed

| ID | Action |
|---|---|
| VL-SEC-01 + VL-SEC-02 | Shorter signed-playback TTL (5-minute floor, not 1 hour) |
| VL-SEC-09 | Signing-key env, when present, is mandatory; `/token` only if both unset |
| VL-SEC-03 + VL-SEC-04 | Dedicated upload-url limiter, 10 / 10 min per admin+IP |
| VL-SEC-05 | Insert-first webhook idempotency; no published → non-published downgrade |
| VL-SEC-06 | Covered by insert-before-update (same event cannot re-apply state) |
| VL-SEC-07, 08, 10–15 | **Not in this phase** (not approved) |

---

## Exact TTL policy

`TTL = clamp(durationSeconds + 15 minutes, 5 minutes, 6 hours)`

| Duration | TTL |
|---|---|
| 8 seconds (live clip) | 908 seconds (~15m 8s) |
| 30 minutes | 45 minutes |
| 2 hours | 2h 15m |
| ≥ 6h − 15m | 6 hours max |
| Unknown duration | 2 hours (still inside the clamp) |

Server-generated only from Mongo `durationSeconds`. The client cannot send
`expiresAt`, TTL, duration, or Cloudflare UID on `POST /playback`.

Signed URLs are still a shareable capability until `exp` (VL-SEC-01 residual).
The 8s premium clip is no longer valid for a full hour.

Playback JSON remains `{ lectureId, playbackUrl, expiresAt, durationSeconds, access }`.
No API token, PEM, webhook secret, or Account ID.

---

## Upload-url rate-limit policy

`POST /api/video-lectures/admin/upload-url`

- Still `adminChain` (JWT + admin role) **before** the limiter so `req.user.id` exists.
- Dedicated `lectureUploadUrlLimiter`: **10 requests / 600 seconds**.
- Bucket: `video_lecture_upload_url` + `admin:{userId}` + client IP.
- Sensitivity **HIGH** (fail-closed / emergency limiter). HTTP **429** with the
  existing generic “Too many requests” body (no limit numbers leaked).
- List/get/edit/archive are **not** on this bucket. Edit/archive still use
  `adminMutationLimiter` (120/min).

**Why 10 / 10 min:** each hit mints a Cloudflare pending video. The Admin UI
mints once per lecture; retries need a small burst. 10/10min is ~12× tighter
than `apiLimiter` (60/min) and 72× tighter than the previous 120/min mutation
bucket, without blocking a normal single-lecture upload.

Direct-upload expiry unchanged: 300–7200s, default **1800s** (already short-lived).
`maxDurationSeconds` still required 1–14400. Client still cannot supply UID or
status. New lectures start as `uploading`, never published. No abandoned-upload
Cloudflare cleanup in this phase.

---

## Signing-key preference

If `CLOUDFLARE_STREAM_SIGNING_KEY_ID` **or** PEM is set → local RS256 only.
Incomplete pair → 503 (no silent `/token` fallback).

Both unset → existing `POST /accounts/{id}/stream/{uid}/token` fallback.

Credentials stay backend-only. `.env.example` documents this. No real keys in
source control. Mobile unchanged.

---

## Webhook hardening

HMAC-SHA256, raw body, constant-time compare, ±300s timestamp: **unchanged**.

1. Lookup by existing Cloudflare UID — never `create`.
2. Archived lectures skipped (cannot resurrect).
3. **Published cannot move to processing, failed, or any other status.**
4. `WebhookEvent.tryInsertEvent` runs **before** `updateById`. Duplicate event
   id → idempotent skip, no second transition.
5. Patch whitelist only: `status`, `durationSeconds`, `thumbnailUrl`.

Cloudflare field used for event identity remains
`cf-stream:{uid}:{state}:{modified}` (existing helper; no invented fields).

---

## Mobile

No player/architecture change. Client still POSTs playback with empty body,
uses returned `playbackUrl`, does not persist it. AsyncStorage progress unchanged.

---

## Security invariants

- Student list/detail: no playback URL, no UID.
- Playback: JWT + published + `isPremiumUser` before mint.
- Signed URLs not stored in Mongo or logs.
- Admin upload-url: admin + dedicated 429 limiter.
- Webhook cannot create lectures or change access/taxonomy/title.

---

## Verifier results

Recorded after this session’s runs.

| Command | Result |
|---|---|
| `verify:phase8b-video-lecture-security` | PASS (13 checks). `mongoWrites: 0`, `playbackTokensMinted: 0`, `directUploadInvoked: false` |
| `verify:phase8a-video-lecture-security` | PASS (16 checks) |
| `verify:phase7b-video-lecture` | PASS (12 checks) |
| `verify:phase6-real-video-upload` | PASS (25 checks). Lecture still `6aab91a444cb8fe55c5ab870`, premium, published, 8s. `mongoWrites: 0`. `getVideoInvoked: true` (metadata only, **no playback token**) |
| `admin`: `verify:phase5-video-lecture` | PASS (15 checks) |
| `verify:phase4-video-lecture` | PASS (12 checks) |
| `verify:phase3-video-lecture` | PASS (16 checks) |
| `verify:phase2-cloudflare-stream` | PASS (14 checks) |
| `node --check` on edited modules | PASS (exit 0). Repo has no compile `build` script. |
| mobile `verify:imports` | PASS |

8B verifier does not mint tokens or upload URLs.

---

## Confirmation

- Real lecture left premium + published; not played.
- No Cloudflare/Mongo writes by the 8B verifier.
- No EAS build.
- No packages installed.
- No `.env` secrets added to source control.

STOP. Phase 8B only.
