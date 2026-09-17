# Phase 6 — Real Video Lecture Upload Verification

## Purpose

Read-only verification of the **one** VideoLecture uploaded through the production
Admin Panel. This verifier does not create, upload, archive, delete, mint upload
URLs, invoke syncIndexes, or modify Mongo / Cloudflare / application code.

## Discovery

The lecture was discovered read-only from MongoDB (`videolectures`, newest
`createdAt` first). No ID was assumed in advance.

| Field | Value |
|---|---|
| VideoLecture Mongo ID | `6aab91a444cb8fe55c5ab870` |
| Cloudflare UID | `bc458651fedcffe67384e5d7e01afe18` |
| title | test video |
| subject | Geography (`6a9fc94b49c76ddf80e52b93`) |
| topic | Physical Geography (`6a9fc94b49c76ddf80e52c07`) |
| topic belongs to subject | yes |
| access | `premium` |
| status | `published` |
| durationSeconds (Mongo) | 8 |
| thumbnail present | yes |
| createdAt | 2026-09-17T07:07:16.439Z |
| updatedAt | 2026-09-17T07:07:33.395Z |
| order | 0 |

## Cloudflare Stream (GET video only)

| Field | Value |
|---|---|
| getVideo succeeded | yes |
| ready / streamable | yes |
| status.state | `ready` |
| readyToStream | yes |
| duration (Cloudflare, seconds) | 8 |
| thumbnail present on Cloudflare | yes |
| mapped lecture status | `published` |
| Mongo status matches mapped status | yes |

Signed playback/thumbnail URLs, API tokens, account IDs, and webhook secrets
were not printed.

## Webhook

| Field | Value |
|---|---|
| Endpoint exists | yes (`POST /api/webhooks/cloudflare/stream`) |
| Handler can update existing lectures | yes |
| Matching WebhookEvent found | yes |
| Matching WebhookEvent count | 1 |
| Duplicate flag stored on WebhookEvent | no (idempotency is unique `eventId` insert) |

- eventId `cf-stream:bc458651fedcffe67384e5d7e01afe18:ready:2026-09-17T07:07:22.558293Z` · type `stream.published` · state `ready` · receivedAt 2026-09-17T07:07:33.404Z · processed yes · duplicate-flag-on-doc no

## Counts

Historical before/after for **this** upload was not recorded at upload time.
Do not fabricate it. Current counts and the last existing audit snapshot:

| Collection | Current | Phase 4 snapshot (after blocked provision) |
|---|---|---|
| videolectures | 1 | 0 |
| subjects | 11 | see Phase 4 report |
| topics | 48 | see Phase 4 report |
| tests | 0 | 0 (Phase 4 report) |
| webhookevents | 1 | n/a |
| playlists | 0 | n/a (collection absent or empty) |

Phase 4 snapshot source: `scripts/fixtures/set-a/SET_A_phase4_controlled_upload_url_report.md`.

## Duplicates and unexpected documents

| Check | Result |
|---|---|
| Duplicate VideoLecture for this Cloudflare UID | no |
| Other VideoLecture documents | 0 |
| Unexpected extra lectures near upload timestamp | no |
| Unexpected writes by this verifier | no |
| Playlist model / collection | no Playlist model and no playlists collection |
| Test / exam / playlist fields on lecture | none; lecture has no test/playlist/exam/mobile fields |
| Tests created near lecture timestamp | 0 |
| Mobile lecture collections | no extra lecture collections (no mobile lecture data created) |

Other VideoLecture documents (id, title, status, createdAt only):

_none_

## Checks

- PASS this verifier does not mint uploads or write Mongo/Cloudflare
- PASS package.json has verify:phase6-real-video-upload
- PASS webhook endpoint exists in application routes
- PASS Playlist model is still absent
- PASS Mongo VideoLecture collection is readable
- PASS Mongo VideoLecture exists
- PASS title exists
- PASS subjectId exists and references a real Subject
- PASS topicId exists and references a real Topic
- PASS topic belongs to subject
- PASS access is valid
- PASS status is valid
- PASS cloudflareVideoId exists
- PASS cloudflareVideoId is unique
- PASS no duplicate VideoLecture was created for this upload
- PASS current VideoLecture count is reported without fabricating history
- PASS no Test, Playlist, Exam linkage, or mobile lecture data from this upload
- PASS webhook endpoint exists and was capable of updating the lecture
- PASS Cloudflare Stream getVideo for this UID succeeds
- PASS Cloudflare reports the video as ready/streamable
- PASS durationSeconds is populated when Cloudflare supplied it
- PASS thumbnailUrl is populated when Cloudflare supplied it
- PASS Mongo status matches the expected Cloudflare processing lifecycle
- PASS Cloudflare metadata and Mongo metadata are consistent where applicable
- PASS matching Cloudflare webhook event exists for published lecture
- NOTE Phase 4 snapshot videolectures=0; current=1

## Verifier isolation

| Action | Performed |
|---|---|
| Mongo reads | yes |
| Mongo writes | **no** |
| Cloudflare GET video | yes |
| Cloudflare createDirectUploadUrl | **no** |
| Cloudflare delete / archive | **no** |
| Application code changes | **no** |
| Admin / mobile code changes | **no** |
| Secrets printed | **no** |

## Result

**PASS**
