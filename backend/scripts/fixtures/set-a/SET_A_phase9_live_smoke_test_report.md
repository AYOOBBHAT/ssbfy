# Phase 9B — Live Structured Question + Mock Test Creation

## Purpose

SET A remains reference data only. Phase 9A created one legitimate exam Post. This phase created **four new** smoke-test Questions (one of each presentation) and **one** mixed Mock Test through the normal Admin services:

- `questionService.create()` (same path as Admin `POST /api/questions`)
- `testService.create()` (same path as Admin `POST /api/tests`)

No SET A Test, PYQ, or Post was created. SET A questions were not reused or modified. Structured stems did not send client `questionText`; the backend flattened it.

Mobile visual testing is **not** part of this phase (reserved for 9C). Records were left in place.

## Pre-flight

Database: **`ssbfy`**

| Check | Value |
|---|---|
| Phase 9 Post | present, active, `6a9fe271a6683cc1b21ccded` |
| SET A questions | 250 |
| SET A presentations | plain 49 / two_statements 8 / numbered_list 179 / table 14 |
| SET A Test | none |
| Phase 9 questions | 0 |
| Phase 9 Tests | 0 |
| Posts | 1 (the Phase 9A smoke Post only) |

Marker search `PHASE9_SMOKE_TEST_2026` on Questions and Tests: **0**. Creation proceeded.

## Post Used

Post ID: `6a9fe271a6683cc1b21ccded`  
Name: `PHASE9_SMOKE_TEST_2026 — JKSSB Structured Question Test`  
`isActive`: true  

All four questions: `postIds = ["6a9fe271a6683cc1b21ccded"]`. No additional Post was created.

## Questions Created

Path: `questionService.create()` → `prepareQuestionPresentation` → `questionRepository.create` (`Question.create` only inside that repository, which is the Admin service internals).

| Question | Presentation | Question Type | Created | ID |
|---|---|---|---|---|
| Q1 | Plain | single_correct | Yes | `6aa01e60f2afe2eb763a4bc1` |
| Q2 | Two Statements | single_correct | Yes | `6aa01e60f2afe2eb763a4bc7` |
| Q3 | Numbered List | single_correct | Yes | `6aa01e61f2afe2eb763a4bcd` |
| Q4 | Table | single_correct | Yes | `6aa01e61f2afe2eb763a4bd3` |

Read-back after each create: unique IDs, valid options, exactly one in-range correct index, generated `questionText` present, structured `content` valid for non-plain kinds, topic belongs to subject, Post attached.

## Subject / Topic

Existing live catalog, first active Subject by name, then first active Topic under it. **No new Subject or Topic.**

| | Name | ID |
|---|---|---|
| Subject | Agriculture | `6a9fc94b49c76ddf80e52ba8` |
| Topic | Agricultural Policy and Institutions | `6a9fc94f49c76ddf80e52d0f` |

All four questions share this pair (Admin-compatible global subject + topic under that subject).

## API Verification

Public projection used:

- `projectPublicQuestion` (same helper as `GET /questions/:id` and `GET /questions?ids=`)
- `questionService.getById` after each insert

Each public payload includes `questionText`, `options`, `presentationKind`, and `content` (`content` is null for plain).

Each public payload does **not** include `correctAnswers`, `correctAnswerIndex`, `correctAnswerValue`, or `explanation`.

No API code was changed.

## Mock Test

Path: `testService.create({ title, kind: 'mock', questionIds, duration: 10 })`.  
`negativeMarking` omitted; service default **0**. `type` omitted; inferred as **`topic`** because all four questions share one topic (presentation mix, not taxonomy mix).

| Field | Value |
|---|---|
| Test ID | `6aa01e61f2afe2eb763a4bda` |
| title | `PHASE9_SMOKE_TEST_2026 — Structured Questions Mock` |
| kind | `mock` |
| status | `active` |
| type (inferred) | `topic` |
| duration | 10 minutes |
| negativeMarking | 0 |
| question count | 4 |

Question order (`questionIds`):

1. `6aa01e60f2afe2eb763a4bc1` — plain  
2. `6aa01e60f2afe2eb763a4bc7` — two_statements  
3. `6aa01e61f2afe2eb763a4bcd` — numbered_list  
4. `6aa01e61f2afe2eb763a4bd3` — table  

No SET A IDs. Discoverable: `testService.listForDiscovery(null, { kind: 'mock' })` returned this Test. Catalog rules: active, non-empty `questionIds`, kind mock.

Live Test count after create: **1** (this smoke Test only).

## SET A Integrity

SET A = **250** (IDs and `updatedAt` unchanged vs pre-flight snapshot).  
Presentations unchanged: plain 49 / two_statements 8 / numbered_list 179 / table 14.  
SET A Test created: **0**  
SET A Post created: **0**  
SET A questions were not attached to the smoke Test.

## Database Changes

| Collection | Before | After |
|---|---|---|
| questions | 250 | 254 |
| tests | 0 | 1 |
| posts | 1 | 1 |

Questions created: 4  
Tests created: 1  
Questions modified: 0  
Questions deleted: 0  
Tests modified: 0  
Tests deleted: 0  
Posts created this phase: 0  

## Verification Results

`npm run verify:phase9-smoke-test` — **ok: true**, failures: none.

The verifier remains read-only. It now checks:

- 4 Phase 9 questions, one of each `presentationKind`, all `single_correct`
- valid options / one in-range correct index / generated `questionText` / structured content
- Post `6a9fe271a6683cc1b21ccded` on every Phase 9 question
- 1 Phase 9 mock Test, 4 `questionIds`, intended order, no SET A IDs
- SET A still 250 with original presentation counts
- public projection does not emit private answer fields

Local ID snapshot: `backend/scripts/fixtures/set-a/PHASE9_smoke_test_ids.json`

## Issues / Warnings

None that block this phase.

Carried (unchanged, out of scope): `GET /questions?ids=` payload size; soft duplicate detection; Admin Test picker presentation is badge-only.

`Test.type` is `topic` (inferred), not `mixed`. That field is taxonomy (single topic), not presentation. The Test still contains all four presentation kinds in the required order.

Mobile TestScreen / submit / result / Review Answers were not run.

## Final Verdict

**PASS**

Smoke-test questions and Mock Test are in place. No cleanup. Waiting for explicit approval before Phase 9C (mobile end-to-end).

---

## Final safety check

SET A questions modified: 0  
SET A questions deleted: 0  
SET A Test created: 0  
SET A Post created: 0  

Phase 9 questions created: 4  
Phase 9 Test created: 1  
Phase 9 Post created: 0  

Other questions modified: 0  
Other tests modified: 0  
Unexpected writes: 0  

---

# Phase 9C — Mobile End-to-End Verification

## Environment

This Cursor session **could not operate the student app**.

| Item | Value |
|---|---|
| Device / emulator | None attached (`adb` not installed; no Android SDK under `%LOCALAPPDATA%\Android\Sdk`) |
| Android / iOS | Not launched |
| App | SSBFY Expo app `mobile/` version **1.0.2** (`app.json`; Android `versionCode` 37) |
| Mobile env file | `mobile/.env` **absent** (not created; would fall back to `https://api.jkssbfy.in/api`) |
| Backend used for DB checks | Atlas database **`ssbfy`** (read-only verify) |
| Metro / Expo | Not started (no device to connect; config not changed) |
| Browser / device automation | Not available in this session |

No production env vars were modified. No mobile/backend code was changed.

## Mock Test Discovery

Not observed in the student UI.

Pre-flight (read-only `npm run verify:phase9-smoke-test`) confirmed the Test still exists and meets mock catalog rules: title `PHASE9_SMOKE_TEST_2026 — Structured Questions Mock`, kind `mock`, status `active`, duration 10, four `questionIds` in order plain → two_statements → numbered_list → table.

## Test Start

Not started from this session. No new TestAttempt was created here.

## Plain Question

Result: **FAIL** (not visually executed in this session)

## Two Statements

Result: **FAIL** (not visually executed in this session)

## Numbered List

Result: **FAIL** (not visually executed in this session)

## Table

Result: **FAIL** (not visually executed in this session)

## Answer Persistence

Result: **FAIL** (not visually executed in this session)

## Timer

Result: **FAIL** (not visually executed in this session)

## Submission

Result: **FAIL** (this session did not submit)

A **pre-existing** submitted attempt was already in Mongo from immediately after Phase 9B (not created by this 9C run):

| Field | Value |
|---|---|
| TestAttempt | `6aa01e727a012eb44cc636c7` |
| Result | `6aa01e927a012eb44cc636d6` |
| start | 2026-09-08T14:40:50.691Z |
| end | 2026-09-08T14:41:22.800Z |
| timeTaken | 32 s |
| score | 1 |
| accuracy | 25% |
| attemptNumber | 1 |
| paper `questionIds` | match Phase 9B order |

That attempt’s selected answers were **not** the intended smoke key (Q1 B, Q2 C, Q3 B, Q4 C). Snapshot correctness flags: Q1 true, Q2–Q4 false. Private option indexes are not listed here.

## Result Screen

Result: **FAIL** (not visually executed)

DB Result document: score **1**, accuracy **25%**. Expected 9C path was 4/4 and 100%.

## Review Answers

Result: **FAIL** (not visually executed)

Read-only inspection of that attempt’s `resultSnapshot.items`: all four rows have `presentationKind: "plain"` and no structured `content`, while the live Question documents still have plain / two_statements / numbered_list / table. Review Answers uses `QuestionPresentation` on review payloads; a snapshot that is all-plain would flatten Q2–Q4.

## Personal Rank

Result: **NOT AVAILABLE** (result UI not opened; no extra users/attempts created)

## Navigation

Result: **FAIL** (not visually executed)

## Ads Observation

Not observed. AdMob config was not changed.

## Performance Observation

Not observed. No app session in this environment.

## Issues Found

### 1. Environment — cannot drive the mobile UI

- **Severity:** blocker for Phase 9C
- **Class:** G. Environment issue
- **Screen:** n/a
- **presentationKind:** n/a
- **Expected:** Expo/Android student flow on the configured backend
- **Actual:** no emulator/adb, no `mobile/.env`, no device automation; Expo was not started
- **Reproduction:** this agent session on Windows without Android SDK
- **Suspected component:** session tooling, not product code
- **Action:** none (no code change)

### 2. Existing attempt snapshot dropped structured presentation

- **Severity:** high for Review Answers (and possibly TestScreen if the live API omitted `presentationKind`)
- **Class:** B. API issue (submit snapshot). May also present as C. Mobile rendering if review hydrates only from the snapshot.
- **Screen:** Review Answers (inferred from stored snapshot; UI not opened here)
- **presentationKind:** live docs are two_statements / numbered_list / table; snapshot stored `plain` for all four
- **Expected:** snapshot items keep the same `presentationKind` + `content` as the Question docs
- **Actual:** `resultSnapshot.items[].presentationKind` is `plain` for all four; `content` absent; flattened `questionText` lengths 59 / 276 / 177 / 160
- **Reproduction:** TestAttempt `6aa01e727a012eb44cc636c7` submitted ~32s after Test create (2026-09-08T14:41:22Z)
- **Suspected components:** `testAttemptService.submit` → `buildResultSnapshotAtSubmit` (`backend/src/utils/attemptResultSnapshot.js`); `resultSnapshotQuestionSchema` defaults in `backend/src/models/TestAttempt.js`; production API at `api.jkssbfy.in` may not be running the same snapshot code as this repo
- **Action:** **stopped**. No patch in 9C.

No additional questions, Tests, or Posts were created. The existing attempt/result were **not** deleted.

## Database Integrity

`npm run verify:phase9-smoke-test` after this phase: **ok: true**.

| Check | Value |
|---|---|
| SET A questions | 250 |
| SET A presentations | plain 49 / two_statements 8 / numbered_list 179 / table 14 |
| Phase 9 questions | 4 |
| Phase 9 Post | 1 (`6a9fe271a6683cc1b21ccded`) |
| Phase 9 Mock Test | 1 (`6aa01e61f2afe2eb763a4bda`) |
| Total questions | 254 |
| Total tests | 1 |
| Total posts | 1 |
| TestAttempts for Phase 9 Test | 1 (pre-existing; this session created 0) |
| Results for Phase 9 Test | 1 (pre-existing; this session created 0) |

## Final Verdict

**FAIL**

Live student UI, structured rendering, persistence, submit-as-4/4, result, and Review Answers were not verified on a device in this session. Smoke-test records remain. Waiting for a device/emulator session (or explicit approval to investigate the snapshot/plain Review issue) before treating mobile validation as complete.

---

## Phase 9C final safety check

SET A questions modified: 0  
SET A questions deleted: 0  
SET A Test created: 0  
SET A Post created: 0  

Phase 9 questions created during Phase 9C: 0  
Phase 9 Test created during Phase 9C: 0  
Phase 9 Post created during Phase 9C: 0  

Any TestAttempt created by normal submission: **1 already in DB** (this 9C session created **0**)  
Any Result created by normal submission: **1 already in DB** (this 9C session created **0**)  

Unexpected data modifications: 0  
Code changes: 0  
Cleanup: none  

---

# Phase 9E — Deployed API + Fresh Snapshot Verification

Stopped at the deployment gate. No fresh TestAttempt or Result was created. The old attempt was not modified. Did not proceed to Phase 9F.

## Local Backend Version

- current commit: `5d42bf92d97d60256530eab8aa0acd3b41641a1b` (`5d42bf9 _`, 2026-09-08 20:08:10 +0530)
- `672d57acd4c626b9189208f29a7a2ac4ec410579` (`672d57a`, 2026-09-08 13:39:50 +0530) is an ancestor of HEAD
- snapshot fix present: **yes**

`backend/src/utils/attemptResultSnapshot.js` still copies presentation into submit snapshots via `...presentationFieldsFromQuestion(q)` (submit builder ~line 174 and retry builder ~line 262). That helper copies `presentationKind` and `content`.

## Production API Version

- production SHA: **not exposed**
- verification method:
  1. Inspected existing routes. `GET /health` and `GET /api/health` return `success`, `status`, `uptime`, `timestamp`, `environment` only. `GET /api/app/version` returns Android force-update policy only. No git SHA, build SHA, or deployment version field. Response headers have `x-request-id` and nginx/`helmet` headers; no commit header.
  2. Did **not** add a version endpoint.
  3. Probed `https://api.jkssbfy.in/health` at `2026-09-08T14:57:13.186Z`: `environment=production`, `uptime=255652` seconds. Node `process.uptime()` implies process start **2026-09-05T15:56:21Z** (5 Sep 2026, 21:26 IST).
  4. Snapshot-fix commit `672d57a` was created **2026-09-08 13:39:50 +0530**. The process serving production health started ~64 hours **before that commit existed**.
- confirmed current: **no**

`GET /api/questions` and `GET /api/questions/:id` require authentication (401 without a token). No student JWT was used. Public question presentation on the deployed API was therefore not used as a substitute SHA.

## Deployment Gate

**STOPPED**

**PRODUCTION API MUST BE DEPLOYED FIRST.**

The Node process answering `https://api.jkssbfy.in` cannot be running `672d57a` or later. Creating a fresh attempt against it would repeat the Phase 9C/9D snapshot gap.

Parts 7–13 (start, submit, new snapshot, Review API) were **not** run.

## Fresh Attempt

- attempt ID: none (not created)
- created through normal start endpoint: no
- submitted through normal submit endpoint: no

Existing Phase 9 attempts (read-only): exactly **1**

| Attempt | ID | Score | Accuracy | Notes |
|---|---|---|---|---|
| Old (do not modify) | `6aa01e727a012eb44cc636c7` | 1 | 25% | completed; snapshot still lacks `presentationKind` / `content` |
| New 9E | — | — | — | not created |

No second newer attempt exists. A new attempt would have been allowed only after a current production deploy.

## Snapshot Verification

Not performed for a new attempt (none created). Live Question documents in Atlas still have the intended kinds. The old snapshot is unchanged.

| Question | Live presentation | Snapshot presentation | Content preserved |
|---|---|---|---|
| Q1 | plain | n/a (no new snapshot) | n/a |
| Q2 | two_statements | n/a (no new snapshot) | n/a |
| Q3 | numbered_list | n/a (no new snapshot) | n/a |
| Q4 | table | n/a (no new snapshot) | n/a |

## Scoring

Not re-tested on a new attempt. Old attempt remains score **1**, accuracy **25%**.

## Review API

Not called for a new attempt. No new snapshot exists for Review to replay.

## Old Attempt

Confirmed unchanged by read-only `npm run investigate:phase9-snapshot`:

- ID `6aa01e727a012eb44cc636c7` still the only Phase 9 TestAttempt
- score **1**, accuracy **25%**, `timeTaken` 32, `attemptNumber` 1
- `resultSnapshot` items still omit `presentationKind` and `content` (`snapshotKind: null`)
- matching Result `6aa01e927a012eb44cc636d6` still score 1 / accuracy 25
- no migration

## SET A Integrity

Unchanged vs Phase 9B/9D:

- SET A questions = **250**
- plain **49** / two_statements **8** / numbered_list **179** / table **14**
- SET A Test = **0**
- SET A Post = **0**

## Database Counts

Read-only after this phase (no 9E writes):

| Collection / subset | Actual |
|---|---|
| Questions | 254 |
| Phase 9 questions | 4 |
| Tests | 1 |
| Posts | 1 |
| Phase 9 TestAttempts | 1 (expected 2 only after a successful new attempt) |
| Phase 9 Results | 1 |

## Phase 9 Mock Test (public deployed API)

`GET https://api.jkssbfy.in/api/tests/6aa01e61f2afe2eb763a4bda` (no auth):

- Test ID `6aa01e61f2afe2eb763a4bda`
- `kind` = `mock`
- `status` = `active`
- exactly 4 `questionIds` in order: plain → two_statements → numbered_list → table IDs listed in Phase 9B

Test document was not modified.

Phase 9 questions were **not** fetched through the deployed questions API (401 without auth). Live kinds were confirmed in Atlas by the existing read-only verify/investigate scripts.

## Mobile

Mobile visual verification: **NOT PERFORMED**

## Automated verification

- `npm run verify:phase9-smoke-test` — **ok: true**
- `npm run investigate:phase9-snapshot` — **ok: true** (still the old attempt; live vs old snapshot mismatch remains, as designed)

Scripts were not changed. They remain read-only.

## Issues

1. Production API at `https://api.jkssbfy.in` is running a Node process started 2026-09-05, before commit `672d57a`. It cannot contain the snapshot fix.
2. No existing health/version endpoint exposes a git SHA. Uptime vs commit time was used as a negative proof; a SHA would still be needed after deploy to confirm the new process.
3. Authenticated `GET /questions` on production was not called (no student token in this session).

## Final Verdict

**FAIL**

Gate: **STOPPED**. **PRODUCTION API MUST BE DEPLOYED FIRST.**

Waiting for an explicit deploy of `672d57a` or later, then explicit approval to retry Phase 9E (exactly one new start/submit). Do not proceed to Phase 9F automatically.

---

## Phase 9E final safety check

SET A questions modified: 0  
SET A questions deleted: 0  
SET A Test created: 0  
SET A Post created: 0  

New Questions created in 9E: 0  
New Tests created in 9E: 0  
New Posts created in 9E: 0  

New TestAttempt created in 9E: 0  
New Result created in 9E: 0  

Old TestAttempt modified: 0  
Old Result modified: 0  

Unexpected writes: 0  

