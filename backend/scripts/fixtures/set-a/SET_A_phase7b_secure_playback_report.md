# Phase 7B — Secure Video Lecture Playback

## Purpose

Student catalog + signed HLS playback for published VideoLectures. The live
Geography lecture (`6aab91a444cb8fe55c5ab870`, premium, published, 8s,
Cloudflare UID `bc458651fedcffe67384e5d7e01afe18`) was **not** modified,
uploaded, or played by this phase.

## Backend changes

- Student routes on `src/routes/videoLectureRoutes.js` (admin routes unchanged;
  registered first so `/admin` is not captured by `/:id`):
  - `GET /api/video-lectures` — published only, pagination, subject/topic/access filters
  - `GET /api/video-lectures/:id` — published only
  - `POST /api/video-lectures/:id/playback` — entitlement + signed HLS
- `videoLectureService.listPublished` / `getPublished` / `authorizePlayback`
- `videoLectureRepository.findPublishedById` (status = published only)
- Student list uses a safe projection (no `cloudflareVideoId`, no playback URL)
- Rate limits: `lectureReadLimiter` (80/min), `lecturePlaybackLimiter` (20/min, HIGH)
- Student DTO omits `cloudflareVideoId`, playback URLs, and processing status
- `thumbnailUrl` is `null` in list/detail (stored Stream UID thumbnails are not
  anonymously fetchable with `requireSignedURLs: true`)
- `resolvePlaybackTtlSeconds` in `src/constants/videoLecture.js`
- Existing `isPremiumUser` from `utils/freeTierAccess.js` (same as PDFs)
- Admin entitlement: admin role is not locked out of premium lectures
- Phase 3 verifier provision check was scoped to `provisionDirectUpload` so
  student published-catalog filtering does not fail the “do not auto-publish
  on provision” assertion

Admin VideoLecture create/upload/edit/archive workflow was not changed.

## Cloudflare signing configuration required

Playback uses **signed tokens** because lectures are created with
`requireSignedURLs: true`. A published/Cloudflare-ready video is **not**
automatically playable.

**Preferred (production volume):** Stream signing key, minted locally as RS256 JWT.

This is **separate** from `CLOUDFLARE_STREAM_API_TOKEN` (Account API token).

| Env (backend only) | Purpose |
|---|---|
| `CLOUDFLARE_STREAM_SIGNING_KEY_ID` | Key id from `POST /accounts/{id}/stream/keys` |
| `CLOUDFLARE_STREAM_SIGNING_KEY_PEM` | Private PEM (or base64 of PEM). Shown once at key creation |
| `CLOUDFLARE_STREAM_CUSTOMER_SUBDOMAIN` | Optional `customer-xxxxx.cloudflarestream.com`. Empty → `videodelivery.net` |

Create a signing key (dashboard Stream → Signing keys, or API
`POST /accounts/{account_id}/stream/keys`). Store the key id and PEM in
backend env only. Do not put them in mobile, admin Vite, or `EXPO_PUBLIC_` /
`VITE_` variables.

**Fallback (current account token, low volume):** if signing key env is unset,
`POST /accounts/{id}/stream/{uid}/token` using existing
`CLOUDFLARE_STREAM_API_TOKEN`. Suitable until student playback volume grows.

Placeholders added to `backend/.env.example`. Real secrets are not in source
control. Mobile never receives account id, API token, webhook secret, or
signing PEM.

Signed HLS URL shape:

`https://videodelivery.net/{token}/manifest/video.m3u8`

(or the customer subdomain host when configured)

## API endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/video-lectures` | JWT | published metadata + `locked`; pageSize 1–50, default 20 |
| GET | `/api/video-lectures/:id` | JWT | same, one lecture |
| POST | `/api/video-lectures/:id/playback` | JWT | `{ lectureId, playbackUrl, expiresAt, durationSeconds, access }` |

`lectureId` is the route param. Request body cannot change `access`.
Entitlement uses the authenticated JWT user loaded from Mongo + `isPremiumUser`,
not a client `userId`.

List/detail never return a playback URL.

Mint failure returns **502** without Cloudflare internals.

## Premium gating

- Premium lecture: `isPremiumUser(user)` **or** admin role, else **403**
  `Premium required` (same message/status as PDFs in `pdfNoteService`).
- Free lecture: any authenticated user; still signed HLS.
- Unpublished / archived / processing / failed: **404** (not distinguished).
- Mobile shows lock + upgrade modal **without** calling playback first
  (`item.locked` / `access === 'premium'` + `userHasPremiumAccess`).
- Backend still enforces entitlement on `POST /playback`.
- PDF premium authorization (`pdfNoteService` + `isPremiumUser`) was not modified.

The live lecture is **premium**. A free student must not play it.

## Token lifetime

`clamp(durationSeconds + 15 minutes, 1 hour, 6 hours)`.

The 8-second live clip therefore gets **1 hour**, not the PDF 90s TTL.

Tokens are not stored in Mongo, logs, AsyncStorage, or route params.

## Thumbnails

Stored `thumbnailUrl` values from Cloudflare Stream are UID-based and are not
treated as public. Student list/detail return `thumbnailUrl: null`. Cards use
a play-icon placeholder. No extra thumbnail endpoint and no Cloudflare
management calls from mobile.

## Mobile changes

- Installed `expo-video@~3.0.16` (Expo SDK 54) + `app.json` plugin `expo-video`
- Existing axios client: `mobile/src/services/videoLectureService.js`
  (`listVideoLectures`, `getVideoLecture`, `requestLecturePlayback`)
- `VideoLecturesScreen` — subject/topic chips, cards, premium upsell
- `LecturePlayerScreen` — HLS via `expo-video` native controls + fullscreen
- Home + Profile navigation entries
- Local progress: `mobile/src/utils/lectureProgress.js`
- Upgrade copy: `LECTURE_UPSELL_*`, `HOME_LECTURES_SUB`

Playback URL lives only in player component state. It is not shown in UI,
not logged, and not written to AsyncStorage.

**EAS:** `expo-video` is native. A **new EAS build** is required before this
is production-ready. Metro/JS alone is not sufficient. `expo-web-browser` and
WebView are not used for lecture playback.

## Local progress behavior

AsyncStorage key `@ssbfy/lecture-progress/{userId}/{lectureId}`.

Stored fields: `positionSeconds`, `durationSeconds`, `completed`, `updatedAt`.

- Save every ~12s while playing
- Save immediately on pause
- Save when leaving the player
- Save on completion

Completed at ≥90% duration. Completed lectures restart from the beginning.
In-progress lectures resume from the saved position (if > 2s).

Does not bypass premium. Not synced to Mongo. No watch-progress collection.

## Security controls

1. Student cannot call Cloudflare with management credentials (none shipped to mobile).
2. List/detail do not return a playback URL.
3. Premium requires `isPremiumUser` (or admin) server-side.
4. Free lectures are authorized for any authenticated user, still signed.
5. Unpublished lectures 404 on detail/playback (`findPublishedById`).
6. Archived lectures 404 (status is not published).
7. Signed playback expires (1h–6h).
8. No `playbackUrl` field on the VideoLecture schema; not written to Mongo.
9. Auth logs lectureId/access/TTL only — not the URL/token.
10. Cloudflare credentials are backend-only (`env.js` + `.env`, never
    `EXPO_PUBLIC_` / `VITE_`).
11. Request body cannot change lecture `access`.
12. `lectureId` comes from route params.
13. Entitlement uses JWT `req.user`, not a body/query `userId`.
14. PDF premium flow unchanged.

## Verifier results

| Command | Result |
|---|---|
| `backend`: `npm run verify:phase7b-video-lecture` | PASS (12 checks). `mongoWrites: 0`, `cloudflareVideosCreated: 0`, `directUploadInvoked: false`, `playbackTokensMinted: 0` |
| `backend`: `npm run verify:phase6-real-video-upload` | PASS (25 checks). Live lecture still `6aab91a444cb8fe55c5ab870` / UID `bc458651fedcffe67384e5d7e01afe18`, Geography / Physical Geography, premium, published, 8s. `mongoWrites: 0` |
| `admin`: `npm run verify:phase5-video-lecture` | PASS (15 checks) |
| `backend`: `npm run verify:phase4-video-lecture` | PASS (12 checks) |
| `backend`: `npm run verify:phase3-video-lecture` | PASS (16 checks) |
| `backend`: `npm run verify:phase2-cloudflare-stream` | PASS (14 checks) |
| `mobile`: `npm run verify:imports` | PASS |

The 7B verifier does not mint tokens, call Cloudflare, write Mongo, or create lectures.

Question / Test / PYQ / Battle / Daily services were not modified.
No Playlist model, exam linkage, Mongo watch-progress, or `syncIndexes()` added
in this phase.

## EAS / native dependency status

| Check | Result |
|---|---|
| `expo-video` in `mobile/package.json` | `~3.0.16` (SDK 54 compatible) |
| `app.json` plugin | `"expo-video"` |
| Resolved `npx expo config` plugins | includes `expo-video` |
| `package-lock.json` | includes `expo-video` |
| `npx expo-doctor` | 17/18 passed. The single failure is **pre-existing** patch drift: `expo` 54.0.36 vs expected ~54.0.37 and `expo-constants` 18.0.13 vs ~18.0.14. **Not** an `expo-video` mismatch. Not upgraded in this phase. |

A new EAS Android/iOS build is required so the native `expo-video` module is
in the binary. This phase did **not** start an EAS production build.

## Confirmation

No lecture, Cloudflare video, Mongo document, or test data was created or
modified automatically. The live lecture `6aab91a444cb8fe55c5ab870` was not
altered. No playback token was minted against it by this phase.

## Manual test (do not automate)

Do not play or edit the live lecture from scripts. After a native build:

1. Create a **new EAS build** (preview or production) that includes `expo-video`.
   Restarting Metro on an old binary is not enough.
2. Confirm backend env: `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_STREAM_API_TOKEN`
   (fallback token mint) **or** `CLOUDFLARE_STREAM_SIGNING_KEY_ID` +
   `CLOUDFLARE_STREAM_SIGNING_KEY_PEM` (preferred).
3. Sign in as a **premium** student (or admin).
4. Home → **Video Lectures** (also Profile → Video Lectures).
5. Filter **Geography** → **Physical Geography**.
6. Open **test video** (`6aab91a444cb8fe55c5ab870`). Card should show Premium,
   ~0:08 duration, no public thumbnail.
7. Player should call `POST /api/video-lectures/6aab91a444cb8fe55c5ab870/playback`
   and play ~8s HLS. The signed URL must not appear on screen.
8. Leave mid-play and reopen: should resume from local progress (not completed).
   After watching ~90%+, card can show **Watched**; replay starts at 0.
9. Sign in as a **free** student on the same device: the card is locked;
   tap opens the existing premium upgrade UI; playback is **not** requested
   first. Forcing `POST /playback` must 403 `Premium required`.
10. Confirm a second account on the same device does not inherit the first
    account’s resume position.

STOP. No playlists, exam linkage, or Mongo watch history in this phase.
