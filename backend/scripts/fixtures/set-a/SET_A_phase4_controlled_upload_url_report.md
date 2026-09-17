# Phase 4 — Controlled Cloudflare Stream upload-URL (step 4)

## Purpose

Obtain **exactly one** pending Cloudflare Stream direct-upload URL through the
existing admin endpoint `POST /api/video-lectures/admin/upload-url`.
No MP4 bytes are uploaded in this step. No automatic deletion.

## Prerequisites

- `MONGODB_URI` (read-only Subject/Topic + counts)
- Admin JWT via existing login (`ADMIN_EMAIL` + `ADMIN_PASSWORD`) **or**
  existing admin user + `JWT_SECRET` (`signAuthToken`, same as login)
- Reachable API: `https://api.jkssbfy.in/api/video-lectures/admin/upload-url`
- Valid Cloudflare Stream token **on the API host** (this script does not mint locally)

| Prerequisite | Present |
|---|---|
| MONGODB_URI | yes |
| Admin login env (ADMIN_EMAIL + ADMIN_PASSWORD) | NO |
| JWT_SECRET (for signAuthToken) | NO |
| Existing admin user in Mongo | yes |
| Cloudflare list readable from this machine | yes |

## Result

**BLOCKED.** admin JWT: set ADMIN_EMAIL + ADMIN_PASSWORD (existing /api/auth/login) or JWT_SECRET to issue signAuthToken for an existing admin user


## Exact metadata used

| Field | Value |
|---|---|
| title | `PHASE4_CF_UPLOAD_TEST_2026` |
| description | `Temporary technical verification only` |
| access | `free` |
| requested order | `9999` (not accepted by upload-url; schema default applies) |
| maxDurationSeconds | `60` (required by existing validators) |
| subject | Agriculture (`6a9fc94b49c76ddf80e52ba8`) |
| topic | Agricultural Policy and Institutions (`6a9fc94f49c76ddf80e52d0f`) |

## Mongo count before/after

| Collection | Before | After |
|---|---|---|
| videolectures | 0 | 0 |
| subjects | 11 | 11 |
| topics | 48 | 48 |
| questions | 250 | 250 |
| users | 59 | 59 |
| tests | 0 | 0 |

## Cloudflare video count before/after

| | Count |
|---|---|
| Before | 0 |
| After | 0 |

## Created objects

| | Value |
|---|---|
| VideoLecture ID | n/a |
| Cloudflare UID | n/a |
| status | n/a |
| reusedExisting | no |

## Bytes uploaded

**NO**

## Webhook triggered

**NO** at this stage (no bytes uploaded; Cloudflare does not encode until a file is sent).

## Unexpected writes

None observed from this script (Mongo is read-only here; only the admin upload-url endpoint may write one VideoLecture).

Direct upload URL (if issued) is printed to stdout only and is **not** stored in this report.
