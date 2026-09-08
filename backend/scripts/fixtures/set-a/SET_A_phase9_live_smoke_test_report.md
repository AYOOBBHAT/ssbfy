# Phase 9 — Live JKSSB Structured Question Smoke Test

## Purpose

SET A remains **reference data only**. This phase was supposed to prove the live end-to-end path with **new** records:

- four NEW smoke-test questions (`PHASE9_SMOKE_TEST_2026`)
- one small mixed Mock Test containing only those four questions
- no SET A Test / PYQ / Post
- no SET A question, JSONL, or answer-key changes

The Admin create pathway (`questionService.create`) could not be completed without creating a Post. That extra write is outside the allowed Phase 9 set (4 questions + 1 Test). Per the execution rule, this phase **stopped** rather than inserting around validation or creating a Post.

## Pre-flight

Read-only audit against Atlas database **`ssbfy`**.

| Check | Value |
|---|---|
| Database name | `ssbfy` |
| Question count | 250 |
| Test count | 0 |
| SET A questions | 250 |
| SET A plain | 49 |
| SET A two_statements | 8 |
| SET A numbered_list | 179 |
| SET A table | 14 |
| `PHASE9_SMOKE_TEST_2026` questions | 0 |
| `PHASE9_SMOKE_TEST_2026` tests | 0 |
| Posts | 0 |
| Questions with `postIds` | 0 |
| Subjects with legacy `subject.postId` | 0 |

Marker check passed: no existing Phase 9 records. Creation was allowed to proceed.

A first `questionService.create` call then failed (see Issues Found). A second read-only audit after that failure still showed 250 questions, 0 tests, 0 marker records.

## Questions Created

| Question | Presentation | Created |
|---|---|---|
| Q1 | Plain | No |
| Q2 | Two Statements | No |
| Q3 | Numbered List | No |
| Q4 | Table | No |

Payloads were prepared for `questionService.create` (same validation as Admin Add Question): `questionType: single_correct`, fictional stems containing `PHASE9_SMOKE_TEST_2026`, one of each `presentationKind`. They were **not** committed.

## Mock Test

Not created.

- Test ID: n/a
- kind: n/a
- status: n/a
- question count: n/a
- question order: intended plain → two_statements → numbered_list → table (not written)

`testService.create` was never reached.

## API Verification

Not exercised against live Phase 9 rows (none exist).

Code-level public projection still matches the Phase 7/8 contract. `projectPublicQuestion` returns `questionText`, `options`, `questionType`, taxonomy, `year`, `presentationKind`, and `content` (null for plain). It does **not** emit `correctAnswers`, `correctAnswerIndex`, `correctAnswerValue`, or `explanation`.

Student mock discovery is `GET /tests` (`kind` omitted or `mock`) via `listForDiscovery`. An active mock with four `questionIds` would be visible. Public questions for a started test are loaded with `GET /questions?ids=` → `listByIds` → `findActiveByIds` (request order preserved) → `projectPublicQuestions`.

## Mobile Visual Verification

Not run.

No Phase 9 Mock Test exists. This session has no device/emulator browser pass against TestScreen. UI was not changed.

## Answer Selection

Not run. No attempt was started. No TestAttempt documents were written.

Intended student selections (not stored, not returned by public APIs): Q1 B, Q2 C, Q3 B, Q4 C.

## Submission

Not run. `POST /tests/:id/submit` was not called. Creating a TestAttempt / Result would be extra Mongo writes beyond the allowed 4 questions + 1 Test, and there was no Test to submit.

## Scoring

Not run against live data. Existing scoring was not changed.

Current behavior (`scoreQuestionSession`): +1 per exact index-set match; unanswered is penalized only when `negativeMarking > 0`. Default / intended smoke Test config is `negativeMarking: 0`, duration `10` minutes (validator minimum is 1). A 4/4 selection would score **4/4** and **100%** accuracy if submit had run.

## Result

Not run. Result screen, rank card, and completion CTA were not observed.

## Review Answers

Not run. Structured Review Answers vs TestScreen was not observed live.

## Personal Rank

Not run.

`GET /tests/:id/rank` is personal-only (`testRankService.getPersonalRank` from the JWT). No public leaderboard is created by this flow. With no completed attempt, rank would be unavailable; that was not probed.

## SET A Integrity

Unchanged from pre-flight.

- 250 questions
- plain 49 / two_statements 8 / numbered_list 179 / table 14
- SET A question IDs were not reused
- SET A JSONL and answer keys were not modified
- no SET A Test, PYQ, Post, or year was created

## Database Integrity

After the failed create and the read-only verifier:

| Collection | Count | Notes |
|---|---|---|
| questions | 250 | all SET A; 0 marker |
| tests | 0 | no smoke Test |
| posts | 0 | unchanged |
| testattempts | not written by this phase | |
| results | not written by this phase | |

`npm run verify:phase9-smoke-test` is read-only. It currently **fails as expected** (`Phase 9 questions=0`, `Phase 9 tests=0`) while SET A checks pass.

Create helper (not run to completion): `backend/scripts/create-phase9-smoke-test.mjs`. It now **stops before mongoose write** if `posts` is empty, and will attach an existing active Post as `postIds` if one exists later. It never creates a Post.

## Issues Found

**Blocker: Admin question create requires an exam Post tag; the live Posts collection is empty.**

`questionService.create` → `reconcilePostIds`:

- Global subjects (`subject.postId` empty) **must** include at least one `postIds` entry.
- Those IDs must already exist (`assertPostIds` / `postRepository.existsAllIds`).

All live subjects are global. All 250 SET A questions have empty `postIds` because Gate 2 import (`commitValidRows`) allows empty tags. Admin Add Question uses `questionService.create`, which does not.

The first create attempt used a valid active Subject/Topic pair and no `postIds`. Mongo received **no insert**. Error:

`postIds must include at least one exam when the subject is global (no legacy post link).`

Allowed Phase 9 writes were only:

- 4 new Questions
- 1 new mock Test

Creating a Post, changing `reconcilePostIds`, or raw-inserting questions without going through `questionService.create` was refused.

The Admin JSONL import path can still insert with empty `postIds` (that is how SET A landed). That was **not** used: it would skip the Add Question validation the smoke test is meant to prove.

## Remaining Warnings

Carried from Phase 8 (unchanged; out of scope here):

- `GET /questions?ids=` payload size not optimized
- duplicate detection is still soft (no unique index; create is not hard-blocked)
- Admin Test picker presentation is badge-only

New:

- Live catalog cannot accept Admin-created questions until at least one Post exists, or create policy is explicitly changed
- Mobile TestScreen / submit / result / Review Answers / personal rank were not live-verified

## Final Verdict

**FAIL**

Phase 9 did not create smoke-test questions or a Mock Test. SET A was not modified. No cleanup is needed. Waiting for explicit approval before any further Mongo writes.

---

## Final safety check

SET A questions modified: 0  
SET A questions deleted: 0  
SET A Test created: 0  
SET A Post created: 0  

Phase 9 questions created: 0  
Phase 9 Test created: 0  

Other questions modified: 0  
Other tests modified: 0  

Unexpected MongoDB writes: 0  

---

## What is needed to continue

Do **not** re-run create until one of these is explicitly approved:

1. **Create one smoke-test Post** tagged in name with `PHASE9_SMOKE_TEST_2026`, then run `questionService.create` + `testService.create` (true Admin Add Question path). This is one extra document beyond the original 4+1 allowance.
2. **Use an existing Post** if one is added outside this phase, then re-run `backend/scripts/create-phase9-smoke-test.mjs` (it will attach that Post as `postIds` and still refuse to create a Post itself).
3. **Approve the Admin import pathway** (`analyzeRows` + `commitValidRows`) with empty `postIds`, matching SET A. That is a real Admin tool, but it is not the Add Question form.

Do not clean up (nothing to delete). Do not patch `reconcilePostIds` as part of this smoke test.
