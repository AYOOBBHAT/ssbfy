# Phase 5 — Admin Video Lecture Upload UI

## Purpose

Production Admin workflow for the existing VideoLecture backend: add lectures
(browser → Cloudflare direct upload), manage/filter, edit metadata, and archive.
No playlists, no mobile player, no automatic test videos.

## Files created

- `admin/src/pages/AddLecture.jsx`
- `admin/src/pages/ManageLectures.jsx`
- `admin/src/utils/cloudflareDirectUpload.js`
- `admin/src/constants/videoLectureUi.js`
- `admin/scripts/verify-video-lecture-phase5.mjs`

## Files modified

- `admin/src/App.jsx` — routes `/add-lecture`, `/manage-lectures` inside `RequireAdmin`
- `admin/src/components/Navbar.jsx` — Add Lecture, Manage Lectures
- `admin/src/pages/Dashboard.jsx` — Add Lecture + Video Lectures cards
- `admin/src/services/api.js` — authenticated lecture helpers (existing axios client)
- `admin/src/App.css` — lecture thumbnail, progress, status badge colors
- `admin/package.json` — `verify:phase5-video-lecture`

Backend schemas, routes, validators, webhook, and Cloudflare service were **not** changed.

## Routes added

| Path | Page | Guard |
|---|---|---|
| `/add-lecture` | Add Lecture | `RequireAdmin` (JWT admin) + backend `adminChain` |
| `/manage-lectures` | Manage Lectures | same |

No `/lectures/new`.

## API contracts used (existing)

| Action | Method | Path |
|---|---|---|
| Provision upload URL | `POST` | `/api/video-lectures/admin/upload-url` |
| Get lecture | `GET` | `/api/video-lectures/admin/:id` |
| List (filters + pagination) | `GET` | `/api/video-lectures/admin` |
| Edit metadata | `PATCH` | `/api/video-lectures/admin/:id` |
| Archive | `PATCH` | `/api/video-lectures/admin/:id/archive` |
| Subjects | `GET` | `/api/subjects` |
| Topics | `GET` | `/api/topics?subjectId=` |

Provision body: `title`, `description`, `subjectId`, `topicId`, `access`, `maxDurationSeconds`.
The client never sends `cloudflareVideoId` or `status`.

## Upload architecture

```
Admin browser
  → POST /api/video-lectures/admin/upload-url  (metadata + JWT only)
  ← lectureId, cloudflareVideoId, uploadURL, status=uploading
  → POST/TUS uploadURL  (video bytes; no SSBFY token, no Cloudflare API token)
  → poll GET /api/video-lectures/admin/:id until published | failed | timeout
```

Cloudflare webhook remains authoritative for `processing` / `published` / `failed`.
The UI does not mark a lecture published when the browser upload returns.

If the Cloudflare byte upload fails after provisioning, the UI does **not** mint a
second upload URL. Retry uses the same in-memory URL only (not localStorage).

## Security checks

- Add/Manage/Edit/Archive are behind `RequireAdmin`; APIs remain `adminChain`.
- Students hitting these routes are sent to `/login`.
- Admin source does not reference `CLOUDFLARE_STREAM_API_TOKEN`,
  `CLOUDFLARE_STREAM_WEBHOOK_SECRET`, `CLOUDFLARE_ACCOUNT_ID`, or `JWT_SECRET`.
- One-time `uploadURL` is kept in component memory only.
- Browser does not call Cloudflare account/management APIs.
- Video bytes are not posted to the SSBFY backend.

## Verification results

| Check | Result |
|---|---|
| `admin`: `npm run verify:phase5-video-lecture` | PASS (15 checks) |
| `backend`: `npm run verify:phase4-video-lecture` | PASS |
| `backend`: `npm run verify:phase3-video-lecture` | PASS |
| `backend`: `npm run verify:phase2-cloudflare-stream` | PASS |
| `admin`: `npm run build` | PASS (vite, 3.23s) |

## Verifier isolation

- No real video uploaded
- No Cloudflare upload URL minted by the verifier
- No Mongo writes
- No Cloudflare writes
- No test lectures created

## Stop

Phase 5 Admin UI is complete. Next phases (mobile playback, playlists, exam
linkage, controlled MP4 upload) were not started.
