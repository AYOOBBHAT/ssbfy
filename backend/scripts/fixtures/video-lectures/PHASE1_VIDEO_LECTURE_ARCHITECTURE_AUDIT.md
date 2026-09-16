# Phase 1 — Video Lecture Architecture Audit

**Status:** PASS WITH WARNINGS  
**Date:** 2026-09-12  
**Mode:** Read-only architecture audit. No application source, schemas, routes, env, MongoDB, or Cloudflare resources were created or mutated.  
**Git snapshot at audit start:** branch `main`, tracking `origin/main`, up to date. Unrelated pre-existing dirty file: `mobile/app.json` (not touched).

This document distinguishes **CURRENT SSBFY CODE** from **PROPOSED CLOUDFLARE INTEGRATION**. Proposed items are design only.

Official external sources used:

- [Direct creator uploads](https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/)
- [Direct upload API](https://developers.cloudflare.com/api/resources/stream/subresources/direct_upload/methods/create/)
- [TUS initiate upload](https://developers.cloudflare.com/api/resources/stream/methods/create)
- [Secure your Stream / signed tokens](https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/)
- [Stream webhooks](https://developers.cloudflare.com/stream/manage-video-library/using-webhooks/)
- [Stream pricing](https://developers.cloudflare.com/stream/pricing/)
- [Expo SDK 54 `expo-video`](https://docs.expo.dev/versions/v54.0.0/sdk/video)

---

## Current Stack

| Area | Path | Stack |
|------|------|--------|
| Backend | `backend/` | Express 4 ESM (`"type": "module"`), Mongoose 8, Node `engines.node >= 20`, npm (`package-lock.json`) |
| Admin | `admin/` | Vite 8, React 19.2, react-router-dom 7, axios, npm |
| Mobile | `mobile/` | Expo `~54.0.36`, React Native `0.81.5`, React `19.1.0`, npm, EAS |
| API mount | `backend/src/app.js` | `app.use('/api', apiRoutes)` |
| Server entry | `backend/src/server.js` | `connectDb()` then listen `0.0.0.0` |
| Models | `backend/src/models/` | 24 models; no VideoLecture / Playlist / Course / Lesson |
| Admin host | `admin/vercel.json` | SPA rewrite to `index.html` |
| Mobile package | `com.ayoobbhat.ssbfy` | Expo app.json `versionCode` 38 |

**Package managers:** npm in all three packages (`package-lock.json` present; no yarn.lock / pnpm-lock).

**Upload-related packages (current):**

- Backend: `multer` (PDF + CSV/JSONL imports only), `@supabase/supabase-js` (PDF storage)
- Admin: `axios` only (FormData to backend). No `tus-js-client`, Uppy, or Cloudflare SDK
- Mobile: no `expo-video`, `expo-av`, or `react-native-video`

**Storage-related packages (current):** `@supabase/supabase-js` only. No AWS S3, R2, Cloudinary SDK, or Cloudflare SDK in application dependencies.

**Media/video packages (current):** none.

Relevant backend layout:

- `backend/src/routes/` — Express routers mounted from `routes/index.js`
- `backend/src/controllers/` — thin HTTP adapters
- `backend/src/services/` — business rules
- `backend/src/repositories/` — Mongoose access
- `backend/src/middlewares/` — auth, upload, rate limit, validation
- `backend/src/validators/` — `express-validator`
- `backend/scripts/` — audits / verifiers / index builder

---

## Current Upload Architecture

### CURRENT SSBFY CODE

SSBFY has **two** upload pipelines, both through the Node process:

1. **PDF notes** (`POST /api/notes/upload-pdf`)
   - Middleware: `adminChain` → `handlePdfUpload` (`backend/src/middlewares/upload.js`) → validators → `pdfNoteController.upload`
   - Multer disk storage in OS temp (`os.tmpdir()`), field name `file`
   - MIME/extension: `application/pdf` or `.pdf`
   - Size: `env.pdfMaxSizeMb` default **25 MB** (`PDF_MAX_SIZE_MB`)
   - Controller reads the temp file into a Buffer and uploads to **private Supabase Storage** (`pdfSupabaseStorage.uploadTempPdfToSupabase`)
   - Mongo stores metadata only (`PdfNote.storedName`, `fileName`, `fileSize`, `mimeType`). `fileUrl` is kept empty on new uploads and is never returned on the wire
   - Admin axios timeout for this call: **120 seconds** (`admin/src/services/api.js`)
   - Default admin axios timeout for JSON: **20 seconds**

2. **Question import CSV/JSONL/JSON** (`POST /api/questions/admin/import/dry-run|commit`)
   - `handleCsvUpload` — multer **memory** storage, max **5 MB**
   - Parsed into Mongo questions; file is not persisted

There is **no** signed/presigned upload URL flow for files. There is **no** S3, R2, or Cloudflare Stream integration. Question images are a URL string (`Question.questionImage`), not an upload pipeline.

Admin PDF UI: `admin/src/pages/UploadPdfNote.jsx` + `ManagePdfNotes.jsx`. Client-side 25 MB check, no upload progress bar (only `submitting` disable). Copy still mentions Cloudinary; actual storage is Supabase — observation only, not changed.

### Which middleware is reusable vs must NOT be reused

| Middleware | Reuse for video? | Reason |
|------------|------------------|--------|
| `adminChain` | **Yes** | Auth + admin role |
| `adminMutationLimiter` | **Yes** (for minting URLs / metadata writes) | Existing admin mutation bucket |
| `validateRequest` / `express-validator` | **Yes** | Metadata validation |
| `handlePdfUpload` / `uploadPdfSingle` | **NO** | Writes video-sized files to EC2 temp disk |
| `handleCsvUpload` | **NO** | Memory buffer; 5 MB cap |
| `pdfSupabaseStorage` | **NO** | Wrong product; PDFs ≠ Stream |
| Admin FormData → backend | **NO** | Body transits Node; 20s/120s timeouts; Express JSON 1 MB is unrelated but the PDF path already buffers whole files |

**Intended video path (PROPOSED, not implemented):**

```
Admin browser → SSBFY backend (JSON: mint one-time URL) → Cloudflare Stream
Admin browser → Cloudflare Stream (TUS/POST bytes) → processing
SSBFY backend stores UID + metadata only
```

Never: Admin → Node/EC2 → Cloudflare.

---

## Authentication

### CURRENT SSBFY CODE

Users authenticate with a Bearer JWT (`Authorization: Bearer <token>`).

- Sign: `backend/src/utils/jwt.js` `signAuthToken({ sub, role })` using `JWT_SECRET`
- Role-aware expiry: `JWT_EXPIRES_IN` (users, default 7d) vs `JWT_ADMIN_EXPIRES_IN` (admins, default 8h)
- Verify: `authenticate` in `backend/src/middlewares/auth.js` — requires `sub` + known `role` (`admin` \| `user` from `constants/roles.js`)
- `authOptional` populates `req.user` when a valid token is present; otherwise continues anonymously
- Admin enforcement: `requireAdmin` / `adminChain` = `[authenticate, requireRole(ROLES.ADMIN)]` in `backend/src/middlewares/adminGuard.js`
- Signup hardcodes `role: USER`; admins are promoted out of band (comment in `authService.js`)
- Google Sign-In exists for students; same JWT after verification

**Admin-only route pattern to copy** (do not create yet):

```js
router.post(
  '/upload-url',
  adminMutationLimiter,   // recommended
  ...adminChain,          // authenticate + requireRole(admin)
  validators,
  validateRequest,
  controller.mintUploadUrl
);
```

Examples already using this pattern:

- `POST /api/notes/upload-pdf` — `...adminChain, handlePdfUpload, ...`
- `POST /api/tests` — `adminMutationLimiter, ...adminChain, ...`
- `POST /api/subjects`, `POST /api/topics`
- `GET /api/questions/admin` — `...adminChain` without mutation limiter on that GET
- Nested admin routers: `/api/admin/subscription-plans`, `/api/admin/payments` (mounted with `adminMutationLimiter`)

Student routes typically: `authenticate` (or `authOptional`) then controller. PDF list requires `authenticate`. Test start uses `authenticate` + `checkTestAccess`.

**Future `POST /api/video-lectures/upload-url` (or `POST /api/video-lectures/:id/upload-url`) should follow `adminChain` + `adminMutationLimiter` + validators. It must not use multer.**

---

## Subject/Topic Architecture

### CURRENT SSBFY CODE

**Subject** (`backend/src/models/Subject.js`):

- Global unique name (case-insensitive collation index `uniq_subject_name_ci_global`)
- Fields: `name`, `order`, `isActive`, optional deprecated `postId` (compatibility only), `updatedBy`, timestamps
- Subjects are **not** owned by exams. Exam tagging lives on content (`Question.postIds`, `Note.postIds`, `PdfNote.postIds`)

**Topic** (`backend/src/models/Topic.js`):

- **Scoped to Subject**, not globally unique
- Required `subjectId`
- Unique `{ subjectId, name }` case-insensitive (`uniq_subjectId_name_ci`)
- `canonicalTopicId`, `aliases`, `previousNames`, `deprecated`, lineage metadata, `order`, `isActive`, `updatedBy`

**Question** (`backend/src/models/Question.js`):

- Required `subjectId` + `topicId`
- Optional `postIds[]` exam tags
- Service `resolveHierarchy` refuses inactive subject/topic and requires `topic.subjectId === subjectId`

**Note** uses the same required `subjectId` + `topicId` plus optional `postIds`.

**Services:** `subjectService.js`, `topicService.js` (duplicate name → 409), `canonicalTopicService.js`.

**HTTP:** `GET/POST /api/subjects`, `GET/POST /api/topics` — list is `authOptional`; writes are `adminChain`.

**VideoLecture must use this same taxonomy:** required `subjectId` + `topicId`, validate topic belongs to subject via the same hierarchy rule. Optional `postIds` is a later tagging choice, not hierarchy.

---

## Existing Content Architecture

### CURRENT SSBFY CODE

There is **no** lesson, course, chapter, module, playlist, or lecture entity.

Closest existing objects:

| Entity | What it actually is | Can it be a playlist? |
|--------|---------------------|------------------------|
| `Post` | Exam/job catalog tag (slug + name). Used as **tags**, not a content tree | No — tagging only |
| `Subject` / `Topic` | Global academic taxonomy | Taxonomy for lectures; not a playlist |
| `Note` | Markdown study note pinned to one subject+topic | No — text notes |
| `PdfNote` | PDF file tagged to one or more Posts; **not** subject/topic scoped | No — different axis (exam PDFs) |
| `SavedMaterial` | Per-user bookmark of a note or PDF | No — user library |
| `Test` | Timed assessment (`kind: mock \| previous_year`) with `questionIds` | No — exam paper engine |
| `LearningSession` / `PracticeIssuance` | Practice attempt machinery | No |
| `BattleSession` | PvP quiz | No |

**Conclusion:** a new **Playlist** entity is required. Do not overload `Post`, `Test`, or `Note`. Lectures should live under Subject → Topic, matching Questions and text Notes, and be assembled into playlists later.

---

## Existing Exam/Test Architecture

### CURRENT SSBFY CODE

`Test` (`backend/src/models/Test.js`) is a **playable paper**, not a content collection:

- `type`: `subject | post | topic | mixed` (how questions were selected)
- `kind`: `mock` (default) or `previous_year`
- PYQ extras: `year`, `postId`, optional `pdfNoteId`, `description`
- Engine: `questionIds[]`, `duration`, `negativeMarking`, `status` (`active` \| `disabled`)
- Student discovery: `GET /api/tests` with kind filters
- Attempts: `TestAttempt` + scoring + results + mock rank
- Free-tier gate: `checkTestAccess` + device quota (`FREE_TEST_LIMIT`)

Admin: `CreateTest.jsx`, `ManageTests.jsx`, `POST /api/tests`, `GET /api/tests/admin/list`, `PATCH /api/tests/:id/status`.

**Lectures must not reference Test.** A “FAA Mathematics 2026” lecture set is a Playlist (optionally tagged with a `Post`), not a Test. Tests remain mocks/PYQs. Additive only.

---

## Current Premium System

### CURRENT SSBFY CODE

Single helper: `isPremiumUser(user)` in `backend/src/utils/freeTierAccess.js`.

- Lifetime: `isPremium === true` AND no `subscriptionEnd`
- Timed: `subscriptionEnd > now` (`hasActiveSubscription`)
- `/api/users/me` overwrites `user.isPremium` with the computed value (`userService.getProfile`)
- Mobile mirrors this in `mobile/src/utils/premiumAccess.js` `userHasPremiumAccess`
- Payments: Razorpay (`paymentService`, webhook, `WebhookEvent` idempotency)
- Plans: `SubscriptionPlan`

**Where premium is enforced today:**

- PDF open: `GET /api/notes/pdfs/:id/signed-url` requires premium or admin. List: free users get metadata with `locked: true` and **no** `signedUrl`
- Mock tests: free device quota via `checkTestAccess`; premium skips quota
- Text notes: **not** premium-gated
- Battle / practice: separate free-tier rules; not PDF-style signed URLs

**Reusable for video:** `isPremiumUser`, `/users/me` contract, PDF “locked metadata vs signed asset” pattern.

**Difference:** all PDFs are premium-gated. Video needs **per-lecture** `access: free | premium`. Do not assume every lecture is premium.

---

## Mobile Video Player

### CURRENT SSBFY CODE

`mobile/package.json` has **no** video player:

- No `expo-video`
- No `expo-av`
- No `react-native-video`

PDF viewing uses `expo-web-browser`. Navigation (`AppNavigator.js`) tabs: Home, Practice, Tests, Papers, Profile. PDF/Notes live inside Home/Profile stacks, not a Lectures tab.

### PROPOSED (Expo SDK 54)

Official player for this SDK: **`expo-video`** ([SDK 54 docs](https://docs.expo.dev/versions/v54.0.0/sdk/video)).

- HLS is supported on iOS and Android
- For Cloudflare `…/manifest/video.m3u8`, URI already contains `.m3u8`
- If a signed URL lacks the extension, set `contentType: 'hls'`
- iOS HLS caching is not available; do not rely on client cache for billing or resume
- `expo-av` is legacy relative to SDK 54’s `expo-video`

**Do not install in Phase 1.** Phase 6 should add `expo-video` aligned to Expo 54.

---

## Cloudflare Stream Integration

### CURRENT SSBFY CODE

Zero Cloudflare Stream usage. No SDK, env vars, webhooks, or video UIDs.

### PROPOSED CLOUDFLARE INTEGRATION

**Direct creator uploads** so the API token never leaves the backend.

| Method | When | API |
|--------|------|-----|
| Basic POST | Files **under 200 MB** on a reliable connection | `POST /accounts/{account_id}/stream/direct_upload` → `{ uploadURL, uid }` then browser `multipart/form-data` POST to `uploadURL` (single-use) |
| **TUS** | Files **over 200 MB**, or any unreliable network | `POST /accounts/{account_id}/stream?direct_user=true` with `Tus-Resumable: 1.0.0`, `Upload-Length`, `Upload-Metadata`. One-time URL is the **`Location` header**, not JSON body |

Recommendation: **TUS-first for all admin lecture uploads** (lectures will exceed 200 MB; admin Wi‑Fi/VPN is not guaranteed). Optional POST fallback for small clips is a product decision.

`maxDurationSeconds` is required to reserve storage. `expiry` should be short (minutes, not days). Set `requireSignedURLs` / `requiresignedurls` at create time for private videos.

**Video UID:** returned at URL mint; persist on `VideoLecture.cloudflareVideoId` immediately.

**Status:** poll `GET /accounts/{account_id}/stream/{uid}` for `readyToStream` and `status.state` (`ready` / `error` / in-progress), **or** account webhook.

**Playback:**

- HLS: `https://customer-<code>.cloudflarestream.com/<uid>/manifest/video.m3u8`
- DASH: `…/manifest/video.mpd`
- Thumbnail: `…/thumbnails/thumbnail.jpg`
- If `requireSignedURLs=true`, replace `<uid>` with a signed **token**

**Signed playback:**

- Test/low volume: `POST /accounts/{account_id}/stream/{uid}/token` (Cloudflare documents this as unsuitable above ~1000 tokens/day)
- Production student traffic: **Stream signing keys** (JWT minted on SSBFY backend). Requires approval — see Risks

**Webhooks:** one notification URL per Cloudflare **account**. HMAC `Webhook-Signature: time=…,sig1=…` over `time + '.' + rawBody`. Public HTTPS only (no localhost). Completes after processing success **or** failure.

**Allowed origins:** Stream `allowedOrigins` for playback/player; separate from SSBFY CORS `ALLOWED_ORIGINS`.

**SSBFY integration points (future, not created):**

1. `cloudflareStreamService.js` — mint upload URL, fetch video, mint playback token (token stays server-side)
2. `POST /api/video-lectures/:id/upload-url` — admin
3. `POST /api/video-lectures/webhook` — public, raw body, HMAC, idempotent
4. `POST /api/video-lectures/:id/playback` — student JWT, premium check if needed, short-lived HLS URL
5. `env.js` Cloudflare names (see Environment Variables)
6. Extend `express.json` `verify` to capture raw body for the Stream webhook path (same pattern as Razorpay in `app.js`)

---

## Proposed VideoLecture Architecture

Reusable independently. **Not owned by an exam or Test.**

```
Subject → Topic → VideoLecture (many) → Playlist(s) → optional Post tag / exam campaign
```

### Status machine (recommended)

User sketch: `draft | processing | published | failed | archived`.

**Recommend adding `ready`** so Cloudflare completion is not the same as student visibility:

| Status | Meaning |
|--------|---------|
| `draft` | Metadata exists; upload URL not consumed (or not yet minted) |
| `processing` | Bytes accepted; Cloudflare encoding |
| `ready` | `readyToStream` / `status.state=ready`; **not** in student catalog until publish |
| `published` | Student-visible |
| `failed` | Upload expired, non-video, encode error |
| `archived` | Hidden; retain UID; do not hard-delete CF asset in v1 without an explicit admin tool |

Admin poll of CF (when `processing`) plus webhook is the fit for this backend: webhook is primary; `GET admin/:id` may refresh from CF if webhook was missed (local tunnel limitation).

### MUST HAVE NOW

| Field | Notes |
|-------|--------|
| `_id` | Mongo ObjectId |
| `title` | required, trimmed |
| `description` | optional string |
| `subjectId` | required, ref Subject |
| `topicId` | required, ref Topic; must belong to subject |
| `cloudflareVideoId` | Stream UID; unique sparse; null until mint |
| `status` | enum above |
| `access` | `free` \| `premium` |
| `topicOrder` | number, default 0; default order **within a topic** for dynamic playlists |
| `durationSeconds` | from CF webhook; 0 until ready |
| `thumbnailTimestampPct` | CF default 0; do not persist a permanent public thumbnail URL for private videos |
| `readyToStream` | boolean from CF |
| `requireSignedUrls` | boolean; recommend always `true` |
| `processingError` | `{ code, message }` |
| `upload` | `{ lengthBytes, expiresAt, tus }` metadata; never store the upload URL long-term |
| `uploadedBy` | admin User id |
| `publishedAt` | set on first publish |
| `createdAt` / `updatedAt` | timestamps |

Do **not** store: HLS/DASH URLs, API tokens, raw video, Supabase paths, Test ids.

### FUTURE / OPTIONAL

`slug`, `tags[]`, `transcript`, `captions`, `scheduledPublishAt`, `postIds[]` (exam tags like Question), `viewCount`, `watchProgress` (separate collection), `deletedAt`, Cloudflare `preview` URL, `maxDurationSeconds` snapshot, `inputWidth` / `inputHeight`.

**Do not create this model in Phase 1.**

---

## Proposed Playlist Architecture

New collection. Mode is exclusive: `dynamic` **or** `curated`.

| Field | Dynamic | Curated |
|-------|---------|---------|
| `title` | required | required |
| `description` | optional | optional |
| `mode` | `dynamic` | `curated` |
| `subjectId` | required | optional (display) |
| `topicIds[]` | required, ≥1 | unused |
| `items[]` `{ lectureId, order }` | **must be empty** — resolved at read time | required ordered list |
| `postId` | optional exam tag (Post) | optional |
| `year` | optional campaign year | optional |
| `status` | `draft` \| `published` \| `archived` | same |
| `createdBy` | admin | admin |

Do **not** create an `Exam` collection in v1. A published playlist titled e.g. “FAA Mathematics 2026” with `postId` pointing at the FAA Post is enough. `Test` stays assessment-only.

---

## Dynamic Playlist Behavior

Store **rules**, not lecture IDs.

Example: FAA Mathematics 2026 / mode=dynamic / subject=Mathematics / topics=Percentage, Profit & Loss, Time & Work.

Read path:

```
VideoLecture.find({
  subjectId,
  topicId: { $in: topicIds },
  status: 'published'
}).sort({ topicId: 1, topicOrder: 1, createdAt: 1 })
```

A newly **published** Percentage lecture appears automatically. Draft/processing/ready/failed/archived do not. Topic membership is the rule; renaming a topic does not drop lectures (same `topicId`). If a lecture moves to another topic outside `topicIds`, it leaves the playlist on the next read.

Do not materialize membership in v1 (avoids drift). If the catalog becomes huge, a later cache can be added without changing the rule document.

---

## Curated Playlist Behavior

Store explicit `items[]` with `order`. Admin adds/removes/reorders via nested routes. New published lectures do **not** auto-join. Validate each `lectureId` exists and is not archived. Student GET returns those lectures in stored order, skipping unpublished unless the caller is admin.

---

## Proposed API

Mount like existing resources (`/api/questions`, `/api/tests`). JSON envelope: `{ success, message, data }` via `sendSuccess` / `sendCreated`. Validation failures: 422. Admin forbidden: 403.

### Video lectures

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/api/video-lectures` | adminChain | Create draft metadata |
| `GET` | `/api/video-lectures/admin` | adminChain | Paginated admin list (`page`/`pageSize` like questions) |
| `GET` | `/api/video-lectures/admin/:id` | adminChain | Detail + processing fields |
| `PATCH` | `/api/video-lectures/:id` | adminChain | Title, topic, access, topicOrder, publish/archive |
| `POST` | `/api/video-lectures/:id/upload-url` | adminChain | Mint one-time CF URL; body includes `uploadLengthBytes` |
| `DELETE` | `/api/video-lectures/:id` | adminChain | Archive (preferred) |
| `GET` | `/api/video-lectures` | authenticate | Published catalog; query `subjectId`, `topicId` |
| `GET` | `/api/video-lectures/:id` | authenticate | Metadata; `locked` for premium if user is free |
| `POST` | `/api/video-lectures/:id/playback` | authenticate | Short-lived HLS (and thumbnail) token URLs |
| `POST` | `/api/video-lectures/webhook` | **public** + HMAC | Register **before** any `authenticate` |

Literal paths (`/admin`, `/webhook`, `/upload-url`) must be declared before `/:id` (same lesson as questions).

### Playlists (later phase)

| Method | Path | Auth |
|--------|------|------|
| `POST` | `/api/playlists` | admin |
| `GET` | `/api/playlists` | authenticate |
| `GET` | `/api/playlists/:id` | authenticate — **resolves** dynamic membership |
| `PATCH` | `/api/playlists/:id` | admin |
| `DELETE` | `/api/playlists/:id` | admin (archive) |
| `POST` | `/api/playlists/:id/lectures` | admin, curated only |
| `DELETE` | `/api/playlists/:id/lectures/:lectureId` | admin, curated only |
| `PATCH` | `/api/playlists/:id/lectures/order` | admin, curated only |

Dynamic playlists store `subjectId` + `topicIds` + `mode`, **not** every lecture ID.

---

## Proposed Admin Workflow

Follow existing pages: `AdminLayout` + `Navbar` links + `page-title` / `card form` / `alert-success` / `alert-error` / `<select>` subject→topic (see `AddQuestion.jsx`, `ManageTopics.jsx`). Modals: `modal-overlay`. No toast library.

**Proposed routes (not created):**

- Navbar: **Lectures**
- `/lectures` → Manage Lectures (filters: subject, topic, status, access)
- `/lectures/new` → Create Lecture (title, description, subject, topic, free/premium, topicOrder) → then upload
- `/lectures/:id` → Edit + upload/replace + processing status + Publish
- Later: `/playlists`, `/playlists/new`

**Upload UX (required because current admin cannot safely ship large files through axios):**

- Desktop browser (Vite admin on Vercel). Do not target a phone-admin flow in v1
- After create, request upload URL with `file.size`
- TUS client (to be added later, e.g. `tus-js-client` or Uppy Tus) uploads **directly to Cloudflare** with progress
- Resume after network interruption
- Poll admin GET until `ready` or rely on webhook + refresh
- Explicit Publish

Do not send the file to `VITE_API_BASE_URL`. Do not reuse `uploadPdfNote` FormData helper.

Free/premium: a `<select>` (PDF notes have no such control today — all PDFs are premium).

---

## Proposed Mobile Workflow

Additive. Do not attach lectures to Tests, Battle, or Daily Practice.

1. Authenticated catalog: `GET /api/video-lectures?subjectId=&topicId=`
2. Browse Subject → Topic → lecture list (reuse taxonomy caches / `formatTaxonomyLabel`)
3. Row shows duration, premium lock (same visual language as PDF `locked`)
4. Open: `POST /api/video-lectures/:id/playback` then `expo-video` with HLS URI
5. Free lecture: playback allowed if published
6. Premium lecture: if `userHasPremiumAccess` is false, send to existing `PremiumScreen` (do not return a playable URL)
7. Later: playlist screen; watch resume; saved materials type `lecture`

Home entry vs new tab is an approval item. Default recommendation: Home card + Profile link first, new tab only if lectures become a primary pillar.

---

## Security

| Requirement | Approach |
|-------------|----------|
| CF API token backend-only | `CLOUDFLARE_STREAM_API_TOKEN` in server env; never `VITE_*` or `EXPO_PUBLIC_*` |
| One-time upload URLs | Short `expiry`; bind to admin JWT + lecture id; do not log full URL |
| Admin authorization | `adminChain` on mint/create/patch |
| Premium playback | `isPremiumUser` on playback for `access=premium`; never return UID-based public HLS for private videos |
| Webhook verification | HMAC-SHA256 of raw body; constant-time compare; reject stale `time`; 200 on bad sig without leaking (match Razorpay’s fail-closed processing, but prefer **401/403** for Stream once a dedicated secret exists — Razorpay currently returns 200 on bad sig to avoid retries; decide at implementation) |
| Input validation | title length, MongoIds, topic belongs to subject, `uploadLengthBytes` bounds, MIME allow-list in admin (mp4/mov/webm) |
| Rate limiting | `adminMutationLimiter` on mint; dedicated playback limiter (token farming); `webhookLimiter` on webhook |
| No permanent private URLs | Playback tokens short-lived (minutes); do not persist HLS |
| No Mongo blobs / no EC2 video | Metadata + UID only |
| CORS | SSBFY `ALLOWED_ORIGINS` for admin JSON; if backend is used as a TUS creation proxy, expose `Location` and TUS headers — prefer returning JSON `{ uploadUrl }` to avoid expanding CORS |
| Webhook idempotency | Upsert lecture by `cloudflareVideoId`; do not mix Razorpay `WebhookEvent.eventId` uniqueness without a `provider` prefix |

---

## Environment Variables

### CURRENT SSBFY CODE (names only)

Loaded by `backend/src/config/env.js` + `backend/.env.example`. Production values live on the host, not in git. `SYNC_INDEXES` is a one-shot production index sync. Admin: `VITE_API_BASE_URL`. Mobile: `EXPO_PUBLIC_API_BASE_URL`. `server.js` comments Railway-style `PORT`; Razorpay docs mention PM2 as the live process manager, but **no `ecosystem.config` is in this repo**.

Do not print existing secrets. This audit did not read `.env`.

### PROPOSED (do not add yet)

| Name | Role |
|------|------|
| `CLOUDFLARE_ACCOUNT_ID` | Account id in Stream API paths |
| `CLOUDFLARE_STREAM_API_TOKEN` | Bearer token, backend only |
| `CLOUDFLARE_STREAM_CUSTOMER_SUBDOMAIN` | `customer-<code>` host for HLS |
| `CLOUDFLARE_STREAM_WEBHOOK_SECRET` | HMAC key from Stream webhook subscribe response |
| `CLOUDFLARE_STREAM_MAX_DURATION_SECONDS` | Reservation cap per upload |
| `CLOUDFLARE_STREAM_UPLOAD_EXPIRY_SECONDS` | One-time URL lifetime |
| `CLOUDFLARE_STREAM_PLAYBACK_TTL_SECONDS` | Signed token TTL |
| `CLOUDFLARE_STREAM_REQUIRE_SIGNED_URLS` | Default `true` |
| `CLOUDFLARE_STREAM_SIGNING_KEY_ID` | Future production JWT signing |
| `CLOUDFLARE_STREAM_SIGNING_KEY_PEM` | Future; never send to clients |

Local: add to `backend/.env` / `.env.example` in Phase 2. Production: same names on EC2/PM2 (or whatever process manager is already used). Never Vercel/EAS public env.

---

## Database Index Considerations

Do **not** create indexes now. Production uses `autoIndex: false`; new indexes later via schema + `npm run build:indexes` (`createIndexes`, not `syncIndexes()`).

**VideoLecture expected queries:**

1. Dynamic playlist / topic list: `{ subjectId, topicId: { $in }, status: 'published' }` sort `topicOrder`, `createdAt`
2. Student catalog by subject: `{ subjectId, status: 'published' }`
3. Admin recent: `{ createdAt: -1 }` maybe with status
4. Webhook / playback: `{ cloudflareVideoId }` unique
5. Optional: `{ status, access, createdAt }`

**Recommended (not created):**

| Name | Keys | Why |
|------|------|-----|
| `uniq_videolecture_cf_uid` | `{ cloudflareVideoId: 1 }` unique, partial filter uid is string | Webhook + playback |
| `idx_vl_subject_topic_status_order` | `{ subjectId: 1, topicId: 1, status: 1, topicOrder: 1, createdAt: 1 }` | Dynamic playlist + topic list |
| `idx_vl_status_created` | `{ status: 1, createdAt: -1 }` | Admin + published catalog |

A four-key index `{ subjectId, topicId, status, createdAt }` is useful but weaker than including `topicOrder` if dynamic playlists sort by order. `{ access: 1 }` alone is low value; filter `access` after status/subject.

**Playlist:** `{ status: 1, postId: 1 }`, `{ mode: 1, subjectId: 1 }`. Unique slug only if slugs are adopted.

---

## Cost Considerations

Official Stream pricing (no SSBFY usage estimate):

- **Minutes stored:** prepaid, **$5 per 1,000 minutes** of uploaded duration (and live recordings)
- **Minutes delivered:** postpaid, **$1 per 1,000 minutes** delivered (HLS/DASH/player/MP4/WebRTC)
- **Encoding / ingest / extra egress:** included in those two dimensions
- Buffering and preload **count** as delivery; some player caches may not
- `maxDurationSeconds` **reserves** storage until the upload finishes or the URL expires

Costs therefore scale with library duration (storage) and student watch/buffer time (delivery), not with Mongo metadata. Hundreds of lectures are a storage problem; many concurrent students are a delivery problem. Do not forecast monthly USD without hours uploaded and minutes watched.

Signing-key vs `/token` API: `/token` is rate-limited and documented for low volume; production playback should use local signing keys to avoid Cloudflare API rate limits and extra latency.

---

## Code Reuse

| Existing component | Reuse? | Reason |
|---|---|---|
| `authenticate` / `adminChain` / `requireAdmin` | **Yes** | Same JWT + admin role |
| `adminMutationLimiter` | **Yes** | Admin mint + writes |
| `webhookLimiter` | **Yes** | Public webhook IP shaping |
| `subjectService` / `topicService` | **Yes** | Validate subject/topic existence and activity |
| Question `resolveHierarchy` pattern | **Yes** (copy pattern, do not couple to questions) | topic must belong to subject |
| `isPremiumUser` / `userService.getProfile` | **Yes** | Premium gate + `/me` |
| `sendSuccess` / `sendCreated` / `AppError` / `asyncHandler` | **Yes** | Envelope + errors |
| `validateRequest` / `express-validator` | **Yes** | Input validation |
| Admin pagination (`page` / `pageSize`) | **Yes** | Match questions/payments |
| `handlePdfUpload` / multer | **No** | EC2/temp/memory; size limits |
| `pdfSupabaseStorage` | **No** | Wrong store |
| Razorpay webhook HMAC + `req.rawBody` | **Pattern yes** | Capture raw body; Stream uses `time.sig1` HMAC, not `X-Razorpay-Signature` |
| `WebhookEvent` collection | **Careful** | Unique `eventId` is Razorpay-shaped; prefix or new collection |
| Admin form/select/alert/modal | **Yes** | `AddQuestion` / `ManageTopics` conventions |
| Admin FormData PDF upload helper | **No** | Sends bytes to API |
| Mobile `api.js` + auth interceptor | **Yes** | New `videoLectureService.js` |
| Mobile `userHasPremiumAccess` / `PremiumScreen` | **Yes** | Lock UX |
| Mobile `expo-web-browser` PDF opener | **No** | Not a video player |
| `Test` / `checkTestAccess` | **No** | Different product |
| `SavedMaterial` | **Later** | Would need a new `materialType` |
| `Note` | **No** | Text notes; separate |

---

## Risks / Open Questions

1. **Signing keys vs `/token` API** — student volume will exceed the documented low-volume token endpoint. Production premium (and likely all) playback needs signing keys.
2. **One Stream webhook per Cloudflare account** — cannot share the account webhook with another product/environment without a fan-out proxy.
3. **Local webhook testing** — Stream cannot hit localhost; Phase 4 needs a tunnel or poll-only dev mode.
4. **Razorpay webhook returns 200 on bad signature** — copying that blindly for Stream can hide attacks; prefer 401/403 once secret is configured.
5. **Admin has no TUS/progress** — must add a client in Phase 5; 20s axios timeout is fatal if anyone pipes video through the API.
6. **`express.json` 1 MB + CORS allowlist** — fine for JSON minting; TUS proxy would need extra CORS headers.
7. **`ready` vs auto-publish** — without `ready`, a processing video could be published too early or webhook would auto-publish without editorial control.
8. **PDF pattern is all-premium** — video `access` is a new product behavior.
9. **Index build** — production will not auto-create indexes; Phase 3 must run `build:indexes` in a maintenance window, not `syncIndexes()`.
10. **Pre-existing dirty `mobile/app.json`** — unrelated; left untouched.
11. **UploadPdfNote Cloudinary copy** — stale UI text; not in scope.
12. **Free lecture + `requireSignedURLs`** — still mint short-lived tokens so HLS cannot be hotlinked forever.
13. **Replacing a video** — need a later “replace UID” flow; v1 can be upload-once.
14. **Watch progress / analytics** — separate collections later; do not block playback v1.
15. **Expo `expo-video` is a new native dependency** — requires EAS build, not OTA-only.

---

## Recommended Implementation Phases

Adjusted to this repo (no existing player, multer-through-EC2 PDFs, Razorpay-style webhooks, global Subject/Topic).

| Phase | Scope | Must not |
|-------|--------|----------|
| **1** | This audit + verifier | Implement Stream |
| **2** | Cloudflare account, Stream enabled, API token (Stream Write), env names documented on server, webhook URL reserved | Commit secrets; ship student UI |
| **3** | `VideoLecture` model, repository, service, admin CRUD routes, validators, indexes via `build:indexes` | Multer; CF upload yet if token missing |
| **4** | Direct TUS upload-url + webhook + processing states + raw body verify | Store video on EC2/Supabase |
| **5** | Admin Lectures pages, TUS progress, publish control | Pipe file through axios to API |
| **6** | Mobile catalog + `expo-video` HLS for **free** published lectures | Premium signed playback if keys not ready |
| **7** | Premium playback tokens + locked metadata | Public UID URLs |
| **8** | Watch progress / resume (new collection keyed by userId+lectureId) | Change TestAttempt |
| **9** | Playlist model: dynamic + curated APIs + admin | Mutate Test |
| **10** | Playlist ↔ Post tagging (“FAA Mathematics 2026”); Home/entry points | Make Tests depend on lectures |
| **11** | Delivery/watch analytics | PII in CF metadata |

Stop after each phase. Do **not** auto-start Phase 2.

---

## Final Recommendation

**PHASE 1 STATUS: PASS WITH WARNINGS**

SSBFY can add Cloudflare Stream as an **additive** product: Subject → Topic → reusable VideoLecture → later Playlist. Current Test/Post/PDF/Question systems stay unchanged. Uploads must **not** reuse multer/Supabase. Admin JWT + `adminChain` is the correct gate for minting one-time Stream upload URLs. Student playback should use short-lived signed HLS, gated with existing `isPremiumUser` for premium rows. Mobile needs a **new** `expo-video` dependency on Expo 54. A new Playlist entity is required; Test is the wrong abstraction.

**Warnings (non-blocking for an audit, blocking for implementation until decided):**

- No video player in the app yet (expected)
- Admin cannot upload large files today (expected)
- Production signing keys not designed yet
- One webhook per CF account
- Unrelated dirty `mobile/app.json`

**Safety check (this phase):**

| Item | Result |
|------|--------|
| MongoDB writes | 0 |
| MongoDB collections created | 0 |
| MongoDB indexes created | 0 |
| Cloudflare resources / videos / tokens created | 0 |
| `backend/src` modified | 0 |
| Admin app modified | 0 |
| Mobile app modified | 0 (pre-existing `mobile/app.json` dirty, not by this audit) |
| Environment files modified | 0 |
| Production deployed | NO |

Allowed writes: this fixture pair, `backend/scripts/verify-phase1-video-lecture-audit.mjs`, and `backend/package.json` script `verify:phase1-video-lecture-audit`.

---

## Git safety record

```
On branch main
Your branch is up to date with 'origin/main'.
Changes not staged for commit:
  modified:   mobile/app.json
```

Unrelated work was not reset, checked out, or overwritten.
