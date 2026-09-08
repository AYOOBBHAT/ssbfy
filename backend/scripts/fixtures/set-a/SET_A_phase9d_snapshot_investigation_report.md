# Phase 9D — TestAttempt Snapshot Investigation

## Scope

Read-only. No Question, Test, TestAttempt, Result, or Post was written, repaired, or deleted. No new attempt was created. No product code was patched.

Goal: find the exact point where structured `presentationKind` / `content` were lost on the existing Phase 9 Mock Test attempt.

## Existing Phase 9 Attempt

Exactly **one** TestAttempt and **one** Result for Test `6aa01e61f2afe2eb763a4bda`.

| Field | Value |
|---|---|
| Attempt `_id` | `6aa01e727a012eb44cc636c7` |
| userId | present (not listed) |
| testId | `6aa01e61f2afe2eb763a4bda` |
| questionIds | Q1–Q4 in paper order (matches Phase 9B) |
| score | 1 |
| accuracy | 25 |
| startTime | 2026-09-08T14:40:50.691Z |
| endTime | 2026-09-08T14:41:22.800Z |
| timeTaken | 32 s |
| attemptNumber | 1 |
| status field | none on the schema; completed = `endTime != null` |
| snapshot | `resultSnapshot.version = 1`, 4 items |

Selected option indexes are not listed. They were **not** the intended B/C/B/C key. Snapshot `isCorrect`: Q1 true, Q2–Q4 false. Scoring is consistent with index matching, not with presentation.

Timeline vs Phase 9B Test create (`2026-09-08T14:40:35.699Z`): start +15 s, submit +47 s. That is a real student start/submit against the live API (mobile default `https://api.jkssbfy.in/api`), not this investigation and not the Phase 9C agent session.

## Live Question State

Unchanged. `npm run verify:phase9-smoke-test` and `npm run investigate:phase9-snapshot` both read:

| Q | Live `presentationKind` | Live `content` keys |
|---|---|---|
| Q1 `6aa01e60f2afe2eb763a4bc1` | `plain` | (absent) |
| Q2 `6aa01e60f2afe2eb763a4bc7` | `two_statements` | intro, statements, prompt |
| Q3 `6aa01e61f2afe2eb763a4bcd` | `numbered_list` | intro, items, prompt |
| Q4 `6aa01e61f2afe2eb763a4bd3` | `table` | intro, columns, rows, prompt |

Current `presentationFieldsFromQuestion(liveDoc)` would emit those same kinds (structured `content` present for Q2–Q4).

## Snapshot State

Native BSON (no Mongoose defaults):

| Q | Snapshot `presentationKind` | Snapshot `content` | Flattened `questionText` length |
|---|---|---|---|
| Q1 | **key absent** (`null`) | absent | 59 (matches live) |
| Q2 | **key absent** | absent | 276 (matches live flatten) |
| Q3 | **key absent** | absent | 177 |
| Q4 | **key absent** | absent | 160 |

Phase 9C described these as `presentationKind: "plain"`. That was an application-layer default, not a stored string. On disk the structured fields were **never written**.

`questionText` and `options` **were** frozen. Only presentation structure is missing.

## TestAttempt Creation Path

Start does **not** snapshot question stems.

1. `POST /api/tests/:id/start`  
   `backend/src/routes/testRoutes.js` → `testController.start` → `testAttemptService.start`
2. `testService.assertAvailableForNewStart` + `testService.getById` (filtered `questionIds`)
3. `testAttemptRepository.create({ userId, testId, questionIds, answers: [], startTime })`  
   No `presentationKind`, no `content`, no `questionText`.

Progress: `PATCH /api/tests/:id/progress` merges `selectedOptionIndexes` only.

Submit (where the snapshot is built):

1. `POST /api/tests/:id/submit`  
   `testController.submit` → `testAttemptService.submit`
2. Load open attempt; `validateAnswerCoverage`
3. `questionRepository.findByIdsForScoring(attempt.questionIds)`  
   Full lean Question documents, **no** `projectPublicQuestion`, **no** field `select`
4. Score using `correctAnswers` / `correctAnswerIndex` vs selected indexes (`getCorrectIndexSet`, `indexSetsEqual`). **Does not read `presentationKind` or `content`.**
5. `buildResultSnapshotAtSubmit(attempt.questionIds, qMap, answerByQ, weakTopics)`  
   `backend/src/utils/attemptResultSnapshot.js`
6. `testAttemptRepository.finalizeAttempt` → `findOneAndUpdate` `$set` of `answers`, `endTime`, `score`, `accuracy`, `timeTaken`, `resultSnapshot`
7. `resultRepository.create` — score/accuracy/timeTaken/weakTopics only; **no question snapshot**

## Snapshot Builder

Current `buildResultSnapshotAtSubmit` (commit `672d57a`, 2026-09-08 13:39 IST, on `origin/main`) copies:

- `questionText`, `options`, `questionType`, `questionImage`
- `...presentationFieldsFromQuestion(q)` → `presentationKind` + `content`
- explanation, taxonomy, `correctAnswers`, `selectedOptionIndexes`, `isCorrect`

It receives **A. the full Question lean document** from `findByIdsForScoring`, not the public projection.

Placeholder items (deleted questions / backfill only) explicitly set `presentationKind: 'plain'` and `content: null`. This attempt’s items are real questions with matching `questionText` lengths, not placeholders.

If this HEAD builder had run against the live docs, Q2–Q4 snapshot kinds would be `two_statements` / `numbered_list` / `table` with `content` present. They are not. Therefore **this snapshot was not produced by the current builder.**

## Question Projection

`projectPublicQuestion` (`questionService.js`) **does** include `presentationKind` + `content` via `presentationFieldsFromQuestion`. That helper is **not** on the submit scoring path.

Public list used by TestScreen:

`GET /api/questions?ids=` → `questionController.list` → `questionService.listByIds` → `findActiveByIds` → `projectPublicQuestions`

Those fields are stripped of answers/explanation only. They are not stripped of presentation.

Loss did **not** happen in the public projection used at submit (submit never uses it). If the API process at 14:41Z was older than `672d57a`, public GET would also have omitted presentation — TestScreen for **that** attempt would have fallen back to flattened `questionText`. That was not visually confirmed in 9C.

## Review API

`GET /api/results/attempt/:attemptId`  
`resultController.getAttemptResult` → `testAttemptService.getResultViewByAttemptId` → `buildHistoricalResultViewPayload`

When `hasImmutableSnapshot(attempt)` (version 1 + non-empty items), review **does not refetch live Questions**. It maps snapshot items through `questionDocFromSnapshotItem` → `presentationFieldsFromQuestion(item)`.

For this attempt, missing snapshot kind/content ⇒ Review API emits `presentationKind: "plain"` and `content: null` for all four. It is **not** discarding structured fields that exist on the snapshot. The backend is faithfully replaying a stem-only freeze.

Authenticated review also includes selected/correct indexes (from the snapshot). Those are not listed here.

Submit HTTP body does **not** include `reviewQuestions`. Result/Review after a mock submit hydrates from this attempt endpoint (and/or in-memory TestScreen questions until Result hydrates).

## Review Answers Mobile Flow

`ReviewAnswersScreen` does not fetch. It renders `route.params.questions` with `QuestionPresentation`.

`ResultScreen.handleReviewAnswers` passes the Result payload’s `questions`.

`resolveQuestionPresentation` (`mobile/src/utils/questionPresentation.js`): missing/unknown kind or invalid `content` → **plain `questionText`**. That is why Q2–Q4 would appear as one flattened paragraph in Review for **this** attempt. Mobile is behaving as designed given a plain payload.

## Result Snapshot

The `results` collection document does **not** store questions, `presentationKind`, or `content`. Fields: score, accuracy, timeTaken, weakTopics, userId, testId, timestamps.

Question freeze lives only on `TestAttempt.resultSnapshot`.

## Learning/Battle Snapshot Comparison

Not TestAttempt-only in **current** source:

| Builder | Copies `presentationFieldsFromQuestion`? |
|---|---|
| `attemptResultSnapshot.js` | yes (since `672d57a`) |
| `learningSessionSnapshot.js` | yes |
| `battleQuestionSnapshot.js` | yes |

Schemas for all three snapshot item types default `presentationKind` to `'plain'` and `content` to `null` when omitted. That is the legacy-compatibility default, not proof that defaults overwrote a structured write. On this attempt the keys are **absent** in BSON, which matches a writer that never emitted them (pre-`672d57a` TestAttempt builder), not a writer that set `two_statements` and then defaulted back to `'plain'`.

## Backward Compatibility

Default `presentationKind = plain` / `content = null` is correct for historical attempts that never stored structure.

This Phase 9 attempt is **new**, but it was frozen like a pre-presentation snapshot: `questionText`+`options` only. It should stay that way as historical data. Do not rewrite it.

## Scoring Impact

Scoring uses live Question **answer indexes** at submit (`getCorrectIndexSet` vs `selectedOptionIndexes`). It does not use `presentationKind` or `content`.

The 1/4 score is explained by which options were selected, not by flattened stems. Structured presentation **does not affect scoring**.

## Root Cause

**H. Multiple causes** (mechanical **A** + process **G**)

**A — Snapshot creation (loss point)**  
Structured fields were not present on `resultSnapshot.items` when `finalizeAttempt` `$set` the snapshot. Review later treats missing kind as plain.

**G — Environment / version mismatch (why current source did not run)**  
Current `buildResultSnapshotAtSubmit` would have copied live kinds from `findByIdsForScoring`. The BSON does not contain those kinds. Commit `672d57a` (13:39 IST, on `origin/main`) added that copy in the same change as the snapshot schema fields. The attempt was submitted at 14:41:22 UTC (20:11 IST), ~47 s after the questions were inserted and ~3 min after origin commit `5d42bf9` (20:08 IST). The student app talks to `api.jkssbfy.in`. The process that wrote this snapshot behaved as **pre-`672d57a`**: no `presentationKind`/`content` keys.

Not B (public projection unused at submit).  
Not C (start only stores `questionIds`).  
Not D (Review API replays the snapshot honestly).  
Not E (mobile Review falls back to `questionText` when kind/content are missing — correct).  
Not F as the product intent for a 2026-09-08 structured attempt, though the on-disk shape matches old attempts.

## Recommended Fix

Do **not** patch this repo’s snapshot builder; it already copies presentation fields.

1. Confirm production `api.jkssbfy.in` is running a revision **at or after** `672d57a`.
2. If it is not, deploy that revision. That is the smallest real fix (ops, not a new code change).
3. After that, a **new** attempt’s snapshot should contain Q2–Q4 structured fields. TestScreen public GET would also include them (same commit).
4. Do **not** change Review Answers or `QuestionPresentation`.
5. Do **not** change scoring.
6. Do **not** repair this existing snapshot.

If production is already on `672d57a+` and a **new** attempt still stores missing kinds, then re-open as a live submit-path defect. Current evidence does not show that.

## Migration Recommendation

**Do not migrate** TestAttempt `6aa01e727a012eb44cc636c7`. Historical freeze is intentionally immutable. Rebuilding from live Questions would mix later bank edits into past review. Leave this attempt as flattened Review.

No SET A or Question backfill.

## Files Involved

Read-only inspection (no edits except the investigation script + this report + npm script name):

| File | Role |
|---|---|
| `backend/src/services/testAttemptService.js` | start / submit / `getResultViewByAttemptId` |
| `backend/src/utils/attemptResultSnapshot.js` | `buildResultSnapshotAtSubmit` |
| `backend/src/repositories/questionRepository.js` | `findByIdsForScoring` |
| `backend/src/repositories/testAttemptRepository.js` | `finalizeAttempt` |
| `backend/src/models/TestAttempt.js` | snapshot item defaults |
| `backend/src/services/questionService.js` | `projectPublicQuestion` (TestScreen, not submit) |
| `backend/src/controllers/testController.js` | start/submit HTTP |
| `backend/src/controllers/resultController.js` | Review API |
| `mobile/src/screens/TestScreen.js` | `GET /questions?ids=` |
| `mobile/src/screens/ResultScreen.js` | hydrates review questions |
| `mobile/src/screens/ReviewAnswersScreen.js` | renders params |
| `mobile/src/utils/questionPresentation.js` | plain fallback |
| `backend/src/utils/learningSessionSnapshot.js` | current copy of presentation fields |
| `backend/src/utils/battleQuestionSnapshot.js` | current copy of presentation fields |

If a future code change were needed (only if production already has `672d57a` and still drops fields): `buildResultSnapshotAtSubmit` + `finalizeAttempt`. Not recommended until that is proven.

## Database Safety

Questions modified: 0  
Questions deleted: 0  
Tests modified: 0  
Tests deleted: 0  
TestAttempts modified: 0  
TestAttempts deleted: 0  
Results modified: 0  
Results deleted: 0  
Posts modified: 0  
SET A modified: 0  

`npm run verify:phase9-smoke-test` — ok.  
`npm run investigate:phase9-snapshot` — ok (read-only).

SET A: 250; plain 49 / two_statements 8 / numbered_list 179 / table 14; no SET A Test.

## Final Verdict

**ROOT CAUSE IDENTIFIED**

Structured fields were never stored on this attempt’s `resultSnapshot.items`. The current submit builder would store them from live Question docs. Review Answers and scoring are not the writers of the defect. Do not migrate the existing attempt. Confirm/deploy `672d57a+` on the public API before another smoke submit.
