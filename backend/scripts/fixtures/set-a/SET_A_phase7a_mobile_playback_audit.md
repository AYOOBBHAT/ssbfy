# Phase 7A — Mobile Video Lecture Playback Architecture Audit

Read-only. No implementation. No Mongo/Cloudflare writes. No package installs.
No Admin, backend, or mobile application-code changes in this phase.

**Verified live lecture (Phase 6, not re-fetched here):**

| Field | Value |
|---|---|
| Mongo ID | `6aab91a444cb8fe55c5ab870` |
| Cloudflare UID | `bc458651fedcffe67384e5d7e01afe18` |
| title | test video |
| subject / topic | Geography / Physical Geography |
| access | **premium** |
| status | **published** |
| Cloudflare | ready / streamable |
| duration | 8 seconds |

A student must **not** be able to play this lecture merely because it is published.
Playback authorization is a separate gate. This lecture is the only real VideoLecture
today, so Phase 7B cannot be “free HLS first, premium later” without leaving the
only real asset unplayable for entitled users — or accidentally playable for everyone.

---

## What already exists

### Mobile

- Expo SDK `~54.0.36`, React Native `0.81.5`, React `19.1.0`, EAS (`mobile/eas.json`).
- Navigation: auth stack vs authenticated `RootStack` + five tabs (Home, Practice, Tests, Papers, Profile) in `mobile/src/navigation/AppNavigator.js`.
- PDF/Notes/Premium/Battle live on the **root stack**, not a dedicated Lectures tab.
- API: axios client `mobile/src/services/api.js` — `EXPO_PUBLIC_API_BASE_URL` or `https://api.jkssbfy.in/api`, Bearer JWT from `AuthContext`, 15s timeout, 401 logging.
- Auth: JWT in memory + AsyncStorage `@ssbfy/auth_session`. `GET /users/me` overwrites `isPremium` with backend truth.
- Premium: `userHasPremiumAccess` mirrors backend `isPremiumUser` (lifetime **or** `subscriptionEnd > now`).
- PDF gating pattern: list metadata + `locked`; open via `GET /notes/pdfs/:id/signed-url`; 403 → `PremiumPdfUpgradeModal` / `navigate('Premium', { from })`.
- `app.json`: `"orientation": "portrait"`, Android package `com.ayoobbhat.ssbfy`, HTTPS intent filter for battles, AdMob plugin, **no** video player plugin.
- Feature flags: `ENABLE_NOTES = false` only. No lecture flag.
- Home has PDF/Notes cards (gated by `ENABLE_NOTES`) and a premium banner. **No Video Lectures entry.**

### Mobile media dependencies (installed)

| Package | Role | Usable as in-app HLS player? |
|---|---|---|
| `expo-web-browser` | In-app browser for **PDFs** | **No** |
| `expo-status-bar` | Status bar | No |
| `react-native-google-mobile-ads` | Ads | No |
| Transitive `react-native-webview` (optional peer of Expo) | Not a direct app dependency | **Do not adopt as the player** |

**Not installed:** `expo-video`, `expo-av`, `react-native-video`, `expo-screen-orientation`.

### Backend VideoLecture

- Model: title, description, subjectId, topicId, cloudflareVideoId, thumbnailUrl, durationSeconds, access (`free`|`premium`), status, order, timestamps.
- Indexes: `idx_vl_subject_topic_status_order`, `idx_vl_status_created`, unique partial `uniq_videolecture_cf_uid`.
- Admin routes only (`adminChain`): upload-url, list, get, patch, archive.
- **No student list/detail/playback routes.**
- Provision always sets `requireSignedURLs: true`.
- Admin DTO includes `cloudflareVideoId` (acceptable for Admin; must never be copied to mobile DTOs).
- Webhook `POST /api/webhooks/cloudflare/stream` is authoritative for published/failed.
- `cloudflareStreamService`: `verifyApiToken`, `listVideosSummary`, `createDirectUploadUrl`, `getVideo`, `deleteVideo`. **No playback-token helper.**
- Env: account id, API token, webhook secret, duration/upload expiry. **No Stream signing keys.**
- Premium truth: `isPremiumUser` / `isLifetimeUser` + `hasActiveSubscription` in `backend/src/utils/freeTierAccess.js`.
- PDF analog: authenticated list + dedicated signed-url; PDF TTL 30–120s (too short for HLS).

### Not present (and must stay out of 7B unless listed below)

- Playlist model/routes/UI, exam linkage, mobile lecture screens, watch-progress collection, Stream signing keys, student VideoLecture API.

---

## What is missing (playback)

1. Student VideoLecture HTTP API (list / detail / playback authorization).
2. Backend minting of Cloudflare **signed playback tokens** (signing keys or `/token` API).
3. Mobile `expo-video` (+ EAS native rebuild).
4. Mobile lecture list + player screens and navigation entry.
5. Per-lecture `locked` + premium upsell UX (PDF-style, but **per `access` field**).
6. Orientation unlock for fullscreen landscape.
7. Decision on thumbnail signing (stored `thumbnailUrl` is not proven anonymously fetchable).
8. Playback rate limiter (token farming).
9. Watch-progress persistence (optional; must not block 7B playback).

---

## Answers (1–25)

### 1. Recommended mobile video player package based on packages already installed

**None of the installed packages is a video player.** Do not reuse `expo-web-browser` (PDF opener) or a WebView. Recommended **new** 7B dependency: **`expo-video`**, Expo SDK 54 first-party player.

### 2. Whether expo-video or another existing package should be reused

**Install `expo-video` in 7B.** Do not use `expo-av` (legacy Video on SDK 54). Do not use `react-native-video` unless `expo-video` is proven blocked. `expo-video` requires a **new EAS build** (native); it cannot ship as an OTA-only JS change.

### 3. Exact backend endpoint(s) needed

Do **not** reuse Admin routes (`/api/video-lectures/admin/*`) from the student app.

| Need | Method | Path | Auth |
|---|---|---|---|
| Published lecture listing | `GET` | `/api/video-lectures` | `authenticate` |
| Lecture details (no playback URL) | `GET` | `/api/video-lectures/:id` | `authenticate` |
| Secure playback authorization | `POST` | `/api/video-lectures/:id/playback` | `authenticate` + entitlement |

List query: `subjectId`, `topicId`, `page`, `pageSize`. Server **must** force `status=published` (never draft/uploading/processing/failed/archived).

`POST` (not `GET`) for playback so intermediaries are less likely to cache signed URLs. Mirror PDF’s dedicated open endpoint, not PDF’s “signed URL in the list” behavior.

### 4. Whether Cloudflare signed playback should be used for premium content

**Yes. Mandatory.** The live lecture was created with `requireSignedURLs: true`. Unsigned `…/{uid}/manifest/video.m3u8` must not be given to clients. Premium gating is **application-level** (`isPremiumUser`) **in addition to** Stream signed tokens.

### 5. Recommended authorization lifetime for playback tokens/URLs

Do **not** reuse the PDF 30–120s TTL (an HLS session outlives that).

Recommended `exp`:

```
clamp( durationSeconds + 15 minutes , 1 hour , 6 hours )
```

If `durationSeconds` is null, default **2 hours**. Cap at **6 hours** so a leaked URL cannot be reused indefinitely. The verified clip is 8s; still use the same formula so real lectures work.

Mobile must **not** persist the playback URL in AsyncStorage. Re-mint on player 403 / expiry.

### 6. How backend should determine access

| Question | Rule |
|---|---|
| Authenticated user | `authenticate` JWT (`sub` + role). Reload User from Mongo at playback time. |
| Active premium | `isPremiumUser(user)` — lifetime (`isPremium === true` && no `subscriptionEnd`) **or** `subscriptionEnd > now`. Do **not** trust a stale client `user.isPremium` alone. |
| Free lecture | `lecture.access === 'free'` **and** `status === 'published'` → mint token for any authenticated student. |
| Premium lecture | `lecture.access === 'premium'` **and** published → mint only if `isPremiumUser` **or** admin role. Else **403** `Premium required` (same message family as PDFs). |
| Unpublished | 404 (do not leak processing/failed). |

The verified lecture is **premium + published**. A logged-in free student: list row with `locked: true`; playback **403**. A premium student: playback **200** with signed HLS.

### 7. How the mobile app obtains playback authorization without Cloudflare secrets

```
Student JWT
  → POST /api/video-lectures/:id/playback
  ← { playbackUrl, expiresAt, … }
  → expo-video plays playbackUrl (HTTPS HLS)
```

The browser/app never receives `CLOUDFLARE_STREAM_API_TOKEN`, `CLOUDFLARE_STREAM_WEBHOOK_SECRET`, `CLOUDFLARE_ACCOUNT_ID`, Stream signing PEM, or `JWT_SECRET`. Backend mints the Stream JWT (local signing keys **or** Cloudflare `POST /stream/{uid}/token`). Mobile only sees a host + token path, which is a **capability URL**, not an account credential.

### 8. Whether free lectures can use public playback or should also use signed playback

**Signed for free as well.** Provisioning already sets `requireSignedURLs: true` for every lecture. Public UID URLs would:

- fight the existing Stream setting,
- allow hotlinking / CDN-cost theft,
- create a second playback path that is easy to misuse on a premium row.

Free vs premium is decided by **whether the backend mints a token**, not by Cloudflare public vs private.

### 9. Recommended response shape for mobile

**List / detail** (never include `cloudflareVideoId`, `uploadURL`, admin status except published, or playback URLs):

```json
{
  "success": true,
  "data": {
    "lectures": [
      {
        "id": "…",
        "title": "test video",
        "description": "",
        "subjectId": "…",
        "topicId": "…",
        "subjectName": "Geography",
        "topicName": "Physical Geography",
        "access": "premium",
        "durationSeconds": 8,
        "thumbnailUrl": null,
        "locked": true,
        "order": 0
      }
    ],
    "pagination": { "total": 1, "page": 1, "pageSize": 20, "totalPages": 1 }
  }
}
```

`locked: true` when `access === 'premium'` and the caller is not premium/admin. `locked: false` for free published lectures (authenticated).

**Playback:**

```json
{
  "success": true,
  "data": {
    "lectureId": "6aab91a444cb8fe55c5ab870",
    "playbackUrl": "https://videodelivery.net/<TOKEN>/manifest/video.m3u8",
    "expiresAt": "2026-09-17T09:00:00.000Z",
    "durationSeconds": 8,
    "access": "premium"
  }
}
```

Do not return DASH unless needed. Do not return the raw Cloudflare `getVideo()` object.

### 10. Whether thumbnailUrl can be used directly

**Do not assume yes.** Mongo `thumbnailUrl` is copied from Cloudflare webhook/getVideo. With `requireSignedURLs: true`, Cloudflare typically also requires a token for thumbnails. Phase 6 only confirmed the field is **populated**, not that it is anonymously fetchable.

7B: treat catalog thumbnails as **best-effort**. Prefer a signed thumbnail URL minted with the same token (or a short-lived thumbnail-only token). If unsigned fetch 403s, show a placeholder. Never log the full thumbnail URL if it contains a token.

### 11. How HLS playback should be handled on Android and iOS

`expo-video` `VideoView` + `useVideoPlayer`:

- URI is Cloudflare HLS (`…/manifest/video.m3u8`). If the signed URL has no `.m3u8` suffix, set `contentType: 'hls'`.
- iOS: AVPlayer HLS. Android: ExoPlayer/Media3 HLS.
- HTTPS only (Cloudflare). No cleartext HTTP.
- Do not download/offline-cache HLS in 7B (billing + token expiry).
- Keep axios timeout irrelevant to streaming; only the **authorization** call uses axios.

### 12. Recommended full-screen behavior

Dedicated `LecturePlayer` screen on **RootStack** (same pattern as `Test` / `PdfList`) so tabs are hidden. Use `expo-video` native fullscreen + native controls. Do not fullscreen inside a tab scene. Hide/show status bar with the player.

### 13. Recommended orientation behavior

Today `app.json` locks **portrait**. Native fullscreen landscape will fight that.

7B: set Expo orientation to `default` (or equivalent) and **programmatically lock portrait** on all existing screens via `expo-screen-orientation`; allow **landscape in the player/fullscreen only**; relock portrait on blur/unmount. Do not globally unlock the whole app.

### 14. Resume playback architecture

7B v1 (enough to play the verified lecture):

- Optional **local** resume: AsyncStorage key `@ssbfy/lecture-resume/{userId}/{lectureId}` → `{ positionSeconds, updatedAt }`.
- Seek on load if `0 < position < duration - 5`.
- Do **not** store signed playback URLs there.

Cross-device resume needs a later Mongo collection (see 16–17). Do not block 7B on it. Phase 1 already deferred watch analytics.

### 15. Watched / completed architecture

Local v1: `completed: positionSeconds >= 0.9 * durationSeconds` or native `ended`. Show a checkmark on the list from local state.

Server-side watched/completed is a later collection, not fields on `VideoLecture` (that document is global library content, not per-user).

### 16. Whether watch progress should be stored immediately or batched

If/when server progress exists: **batch**. Write on pause, background, end, and every **10–15s** while playing — never per timeupdate tick. Local AsyncStorage can write on those same events (debounced).

### 17. Recommended indexes if watch progress is introduced

New collection e.g. `videolectureprogresses` (later phase, **not 7B required**):

| Index | Keys | Why |
|---|---|---|
| unique compound | `{ userId: 1, lectureId: 1 }` | One progress row per user/lecture |
| user recency | `{ userId: 1, updatedAt: -1 }` | “Continue watching” |
| optional | `{ lectureId: 1, completedAt: 1 }` | Completions analytics |

Do **not** call `syncIndexes()`. Follow the existing production index process.

Do **not** add progress fields onto `VideoLecture`.

### 18. Network / offline / error handling

| Case | Behavior |
|---|---|
| 401 | Existing interceptor / session expiry |
| 403 Premium required | Upsell modal → `Premium` (`from: 'lecture'`) — do not start the player |
| 404 | Lecture unavailable |
| 429 | Back off; do not auto-remint in a tight loop |
| Auth network failure | Existing `getApiErrorMessage` + retry |
| HLS buffer / 403 mid-play | Re-call playback once; if still failing, show error |
| Offline | Catalog may show last in-memory list; playback requires network. No offline file cache in 7B |

Axios 15s timeout applies to minting, not to the video stream.

### 19. Premium gating UX

Reuse PDF language and components (`PremiumPdfUpgradeModal` / `PremiumUpsellCard` / `navigate('Premium', { from: 'lecture' })`).

- List: show the premium lecture (title, topic, duration, lock badge). Tapping play on a locked row opens upsell — **does not** call playback.
- Do not hide premium lectures from free users (discovery), matching PDFs.
- Client `userHasPremiumAccess` is UX-only; **server re-checks** on `POST /playback`.
- The verified Geography “test video” must appear **locked** for free students.

### 20. Whether the current VideoLecture model needs any additions

**No schema change required for 7B playback.** `access`, `status`, `cloudflareVideoId`, `durationSeconds`, `thumbnailUrl` are sufficient.

Do not store playback URLs, tokens, or watch position on `VideoLecture`.

### 21. Whether current Cloudflare service needs additions

**Yes, in 7B only:** a server-side `createSignedPlaybackToken(uid, { expiresInSeconds })` (name TBD) that returns a token string. Never log it.

Production-scale: **Stream signing keys** (JWT minted locally). Cloudflare documents `POST /accounts/{account_id}/stream/{uid}/token` as low-volume.

7B may use the `/token` API to ship the first premium lecture, with signing keys as a hard follow-up before traffic grows. Do not call `getVideo` from the student request path on every play (extra latency + over-fetch). Do not call `deleteVideo` or `createDirectUploadUrl` from playback.

### 22. Security risks of exposing public playback URLs

- Anyone with the URL can play and hotlink; delivery is billed per minute.
- Premium content leak if a premium UID is served unsigned.
- URLs in logs, screenshots, or share sheets outlive the session.
- List endpoints that embed playback URLs multiply leak surface.

Mitigation already partly in place: `requireSignedURLs: true` on the live object. Keep it. Never send UID-based public HLS to mobile.

### 23. How to prevent a premium lecture URL from being reused indefinitely

- Short JWT `exp` (section 5).
- Re-check `isPremiumUser` **every mint** (subscription can lapse).
- Do not put playback URLs in list/detail or AsyncStorage.
- Rate-limit `POST /playback` per user.
- Optional later: Stream `accessRules` (not required for 7B).
- Client cannot extend `exp`; it can only ask the backend again.

### 24. Whether a dedicated playback authorization endpoint is preferable

**Yes.** Prefer `POST /api/video-lectures/:id/playback` over returning Cloudflare playback URLs from list/detail or proxying `getVideo()`. Matches PDF `GET /pdfs/:id/signed-url`, keeps entitlement on one choke point, and avoids caching signed URLs on catalog responses.

### 25. Backward compatibility impact

- **Additive.** Old APKs ignore new routes/screens; they cannot play lectures (acceptable).
- Do not change Admin VideoLecture contracts, webhook, Question/Test/PYQ/Battle/Daily, or PDF signing.
- Do not change the live lecture document.
- New native modules ⇒ **EAS build**, not OTA-only.
- `app.json` orientation change (7B) can affect other screens if not re-locked — must be paired with `expo-screen-orientation`.

---

## What should be implemented in Phase 7B

In scope:

1. Student `GET /api/video-lectures`, `GET /api/video-lectures/:id`, `POST /api/video-lectures/:id/playback`.
2. Entitlement: published-only; premium lecture ⇒ `isPremiumUser` or admin; free lecture ⇒ any authenticated user; still signed HLS.
3. `cloudflareStreamService` playback-token helper; env for signing keys **or** documented `/token` API use.
4. Mobile: `expo-video` (+ `expo-screen-orientation` if unlocking orientation), lecture list + player, Home/Profile entry, axios service using existing `api.js`.
5. PDF-style locked/upsell UX. The live Geography premium lecture is the first real playback target.
6. Do not persist playback URLs. Optional local resume only.
7. Playback rate limit. No `syncIndexes()`. No playlists. No Cloudflare/Mongo lecture mutation. No auto test upload.

Out of 7B:

- Playlists / exam linkage
- Server-side watch-progress collection (design only; implement later)
- Offline downloads
- Changing the verified lecture’s access/status
- Admin contract changes
- Mobile calling Cloudflare account APIs

---

## Security summary

| Secret / capability | Client? |
|---|---|
| Stream API token | never |
| Webhook secret | never |
| Account ID | never |
| Stream signing key | never (backend only, 7B) |
| Signed HLS URL | yes, short-lived, memory-only |
| `cloudflareVideoId` | Admin only; omit from mobile DTOs |

---

## Phase 7A isolation

- Application code not modified
- `package.json` / lockfiles / `.env` not modified
- No package installs
- No Cloudflare API calls from this audit verifier
- No Mongo writes
- No test lectures created

STOP. Do not start Phase 7B in this change.
