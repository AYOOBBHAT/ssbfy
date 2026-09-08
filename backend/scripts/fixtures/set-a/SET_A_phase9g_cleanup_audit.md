# Phase 9G — Smoke-Test Cleanup Audit

## Status

READ-ONLY

Generated: 2026-09-08T15:44:18.655Z

MongoDB writes performed by this audit: **0**

## Database Identity

- database name: `ssbfy`
- cluster host: `memora.evyfu0y.mongodb.net`
- protocol: `mongodb+srv`
- local NODE_ENV: `(not set in local env)`
- identity: **intended SSBFY database (name ssbfy, SET A 250 present)**

Credentials, JWT secrets, and the full MongoDB URI are not included.

## Baseline Counts

| Collection | Count |
|---|---:|
| users | 29 |
| questions | 254 |
| tests | 1 |
| posts | 1 |
| testAttempts | 3 |
| results | 2 |

SET A questions (no `PHASE9_SMOKE_TEST_2026` marker): **250** (expected 250)  
Phase 9 smoke questions (marker / known IDs): **4** (expected 4)

## Phase 9 Questions

| Question | ID | Format | References |
|---|---|---|---|
| Q1 | `6aa01e60f2afe2eb763a4bc1` | plain | Phase 9 Test.questionIds; 3 TestAttempt.questionIds + snapshots |
| Q2 | `6aa01e60f2afe2eb763a4bc7` | two_statements | Phase 9 Test.questionIds; 3 TestAttempt.questionIds + snapshots |
| Q3 | `6aa01e61f2afe2eb763a4bcd` | numbered_list | Phase 9 Test.questionIds; 3 TestAttempt.questionIds + snapshots |
| Q4 | `6aa01e61f2afe2eb763a4bd3` | table | Phase 9 Test.questionIds; 3 TestAttempt.questionIds + snapshots |

Known IDs match live documents: **yes**

Q1–Q4 live fields (no answers):

- Q1 `6aa01e60f2afe2eb763a4bc1`: type=single_correct, kind=plain, subjectId=`6a9fc94b49c76ddf80e52ba8`, topicId=`6a9fc94f49c76ddf80e52d0f`, postIds=[`6a9fe271a6683cc1b21ccded`], createdAt=2026-09-08T14:40:32.365Z, updatedAt=2026-09-08T14:40:32.365Z
- Q2 `6aa01e60f2afe2eb763a4bc7`: type=single_correct, kind=two_statements, subjectId=`6a9fc94b49c76ddf80e52ba8`, topicId=`6a9fc94f49c76ddf80e52d0f`, postIds=[`6a9fe271a6683cc1b21ccded`], createdAt=2026-09-08T14:40:32.778Z, updatedAt=2026-09-08T14:40:32.778Z
- Q3 `6aa01e61f2afe2eb763a4bcd`: type=single_correct, kind=numbered_list, subjectId=`6a9fc94b49c76ddf80e52ba8`, topicId=`6a9fc94f49c76ddf80e52d0f`, postIds=[`6a9fe271a6683cc1b21ccded`], createdAt=2026-09-08T14:40:33.171Z, updatedAt=2026-09-08T14:40:33.171Z
- Q4 `6aa01e61f2afe2eb763a4bd3`: type=single_correct, kind=table, subjectId=`6a9fc94b49c76ddf80e52ba8`, topicId=`6a9fc94f49c76ddf80e52d0f`, postIds=[`6a9fe271a6683cc1b21ccded`], createdAt=2026-09-08T14:40:33.571Z, updatedAt=2026-09-08T14:40:33.571Z

Question stems are the smoke-test stems (marker in title/body). Correct answers are not listed.

## Phase 9 Test

- _id: `6aa01e61f2afe2eb763a4bda`
- title: PHASE9_SMOKE_TEST_2026 — Structured Questions Mock
- kind: `mock`
- status: `active`
- questionIds: `6aa01e60f2afe2eb763a4bc1`, `6aa01e60f2afe2eb763a4bc7`, `6aa01e61f2afe2eb763a4bcd`, `6aa01e61f2afe2eb763a4bd3`
- createdAt: 2026-09-08T14:40:33.972Z
- updatedAt: 2026-09-08T14:40:33.972Z
- postId on Test: null (expected for mock)

Contains exactly the four Phase 9 question IDs in order: **yes**

## Phase 9 Post

- _id: `6a9fe271a6683cc1b21ccded`
- name: PHASE9_SMOKE_TEST_2026 — JKSSB Structured Question Test
- slug: `phase9-smoke-test-2026-jkssb-structured-question-test`
- isActive: true
- createdAt: 2026-09-08T10:24:49.448Z
- updatedAt: 2026-09-08T10:24:49.448Z

Question documents with this postIds tag: **4** (expected 4)

## Phase 9 Attempts

Attempt count for Test `6aa01e61f2afe2eb763a4bda`: **3** (expected 2)

| Label | Attempt ID | userId (masked) | status | score | accuracy | attemptNumber | paired Result |
|---|---|---|---|---:|---:|---:|---|
| old | `6aa01e727a012eb44cc636c7` | …c6366a | completed | 1 | 25 | 1 | `6aa01e927a012eb44cc636d6` |
| completed-new | `6aa02a34c3be60ada0ed4805` | …ed47dd | completed | 2 | 50 | 1 | `6aa02a70c3be60ada0ed4814` |
| extra-open | `6aa02b6cc3be60ada0ed4884` | …7f83fa | open | null | null | 1 | unpaired |

Schema has no `status` field. Completed means `endTime != null`.

Old attempt `6aa01e727a012eb44cc636c7` present: **yes**  
New attempt: `6aa02a34c3be60ada0ed4805`

## Phase 9 Results

Result model: `userId` + `testId` + score/accuracy/timeTaken/weakTopics. **No `attemptId` field.**

Paired to attempts by same userId + testId + score + timeTaken, nearest `createdAt` to attempt `endTime`.

| Result ID | Paired attempt | testId | userId (masked) | score | createdAt |
|---|---|---|---|---:|---|
| `6aa01e927a012eb44cc636d6` | `6aa01e727a012eb44cc636c7` | `6aa01e61f2afe2eb763a4bda` | …c6366a | 1 | 2026-09-08T14:41:22.820Z |
| `6aa02a70c3be60ada0ed4814` | `6aa02a34c3be60ada0ed4805` | `6aa01e61f2afe2eb763a4bda` | …ed47dd | 2 | 2026-09-08T15:32:00.177Z |

## New attempt snapshot

Attempt `6aa02a34c3be60ada0ed4805` `resultSnapshot` (answers omitted):

| Q | Question ID | presentationKind | content | structure | questionText | options |
|---|---|---|---|---|---|---:|
| Q1 | `6aa01e60f2afe2eb763a4bc1` | plain | no | none | yes | 4 |
| Q2 | `6aa01e60f2afe2eb763a4bc7` | two_statements | yes | two_statements | yes | 4 |
| Q3 | `6aa01e61f2afe2eb763a4bcd` | numbered_list | yes | numbered_list | yes | 4 |
| Q4 | `6aa01e61f2afe2eb763a4bd3` | table | yes | table | yes | 4 |

Structured snapshot confirmed: **yes**

Additional non-old attempts (cleanup blocker): open=6aa02b6cc3be60ada0ed4884; extra completed=none. The open attempt has no Result (Result is created only on submit).

## Secondary References

Schema paths inspected: Test.questionIds / Test.postId, TestAttempt.questionIds / answers / resultSnapshot, Result.testId, Question.postIds, LearningSession.snapshot.questions.questionId / sourceAttemptId, BattleSession.questionIds / questionSnapshots, PracticeIssuance.questionIds / sourceAttemptId, Note/PdfNote/Subject post fields, UserLearningAnalytics.state (mixed walk), plus a capped scan of other non-empty collections.

| Collection | Document ID | Field | Referenced ID |
|---|---|---|---|
| tests | `6aa01e61f2afe2eb763a4bda` | questionIds | `6aa01e60f2afe2eb763a4bc1` |
| tests | `6aa01e61f2afe2eb763a4bda` | questionIds | `6aa01e60f2afe2eb763a4bc7` |
| tests | `6aa01e61f2afe2eb763a4bda` | questionIds | `6aa01e61f2afe2eb763a4bcd` |
| tests | `6aa01e61f2afe2eb763a4bda` | questionIds | `6aa01e61f2afe2eb763a4bd3` |
| testattempts | `6aa01e727a012eb44cc636c7` | testId | `6aa01e61f2afe2eb763a4bda` |
| testattempts | `6aa01e727a012eb44cc636c7` | questionIds | `6aa01e60f2afe2eb763a4bc1` |
| testattempts | `6aa01e727a012eb44cc636c7` | questionIds | `6aa01e60f2afe2eb763a4bc7` |
| testattempts | `6aa01e727a012eb44cc636c7` | questionIds | `6aa01e61f2afe2eb763a4bcd` |
| testattempts | `6aa01e727a012eb44cc636c7` | questionIds | `6aa01e61f2afe2eb763a4bd3` |
| testattempts | `6aa01e727a012eb44cc636c7` | answers.questionId | `6aa01e60f2afe2eb763a4bc1` |
| testattempts | `6aa01e727a012eb44cc636c7` | answers.questionId | `6aa01e60f2afe2eb763a4bc7` |
| testattempts | `6aa01e727a012eb44cc636c7` | answers.questionId | `6aa01e61f2afe2eb763a4bcd` |
| testattempts | `6aa01e727a012eb44cc636c7` | answers.questionId | `6aa01e61f2afe2eb763a4bd3` |
| testattempts | `6aa01e727a012eb44cc636c7` | resultSnapshot.items.questionId | `6aa01e60f2afe2eb763a4bc1` |
| testattempts | `6aa01e727a012eb44cc636c7` | resultSnapshot.items.postIds | `6a9fe271a6683cc1b21ccded` |
| testattempts | `6aa01e727a012eb44cc636c7` | resultSnapshot.items.questionId | `6aa01e60f2afe2eb763a4bc7` |
| testattempts | `6aa01e727a012eb44cc636c7` | resultSnapshot.items.postIds | `6a9fe271a6683cc1b21ccded` |
| testattempts | `6aa01e727a012eb44cc636c7` | resultSnapshot.items.questionId | `6aa01e61f2afe2eb763a4bcd` |
| testattempts | `6aa01e727a012eb44cc636c7` | resultSnapshot.items.postIds | `6a9fe271a6683cc1b21ccded` |
| testattempts | `6aa01e727a012eb44cc636c7` | resultSnapshot.items.questionId | `6aa01e61f2afe2eb763a4bd3` |
| testattempts | `6aa01e727a012eb44cc636c7` | resultSnapshot.items.postIds | `6a9fe271a6683cc1b21ccded` |
| testattempts | `6aa01e727a012eb44cc636c7` | resultSnapshot.wrongQuestionIds | `6aa01e60f2afe2eb763a4bc7` |
| testattempts | `6aa01e727a012eb44cc636c7` | resultSnapshot.wrongQuestionIds | `6aa01e61f2afe2eb763a4bcd` |
| testattempts | `6aa01e727a012eb44cc636c7` | resultSnapshot.wrongQuestionIds | `6aa01e61f2afe2eb763a4bd3` |
| testattempts | `6aa02a34c3be60ada0ed4805` | testId | `6aa01e61f2afe2eb763a4bda` |
| testattempts | `6aa02a34c3be60ada0ed4805` | questionIds | `6aa01e60f2afe2eb763a4bc1` |
| testattempts | `6aa02a34c3be60ada0ed4805` | questionIds | `6aa01e60f2afe2eb763a4bc7` |
| testattempts | `6aa02a34c3be60ada0ed4805` | questionIds | `6aa01e61f2afe2eb763a4bcd` |
| testattempts | `6aa02a34c3be60ada0ed4805` | questionIds | `6aa01e61f2afe2eb763a4bd3` |
| testattempts | `6aa02a34c3be60ada0ed4805` | answers.questionId | `6aa01e60f2afe2eb763a4bc1` |
| testattempts | `6aa02a34c3be60ada0ed4805` | answers.questionId | `6aa01e60f2afe2eb763a4bc7` |
| testattempts | `6aa02a34c3be60ada0ed4805` | answers.questionId | `6aa01e61f2afe2eb763a4bcd` |
| testattempts | `6aa02a34c3be60ada0ed4805` | answers.questionId | `6aa01e61f2afe2eb763a4bd3` |
| testattempts | `6aa02a34c3be60ada0ed4805` | resultSnapshot.items.questionId | `6aa01e60f2afe2eb763a4bc1` |
| testattempts | `6aa02a34c3be60ada0ed4805` | resultSnapshot.items.postIds | `6a9fe271a6683cc1b21ccded` |
| testattempts | `6aa02a34c3be60ada0ed4805` | resultSnapshot.items.questionId | `6aa01e60f2afe2eb763a4bc7` |
| testattempts | `6aa02a34c3be60ada0ed4805` | resultSnapshot.items.postIds | `6a9fe271a6683cc1b21ccded` |
| testattempts | `6aa02a34c3be60ada0ed4805` | resultSnapshot.items.questionId | `6aa01e61f2afe2eb763a4bcd` |
| testattempts | `6aa02a34c3be60ada0ed4805` | resultSnapshot.items.postIds | `6a9fe271a6683cc1b21ccded` |
| testattempts | `6aa02a34c3be60ada0ed4805` | resultSnapshot.items.questionId | `6aa01e61f2afe2eb763a4bd3` |
| testattempts | `6aa02a34c3be60ada0ed4805` | resultSnapshot.items.postIds | `6a9fe271a6683cc1b21ccded` |
| testattempts | `6aa02a34c3be60ada0ed4805` | resultSnapshot.wrongQuestionIds | `6aa01e60f2afe2eb763a4bc1` |
| testattempts | `6aa02a34c3be60ada0ed4805` | resultSnapshot.wrongQuestionIds | `6aa01e60f2afe2eb763a4bc7` |
| testattempts | `6aa02b6cc3be60ada0ed4884` | testId | `6aa01e61f2afe2eb763a4bda` |
| testattempts | `6aa02b6cc3be60ada0ed4884` | questionIds | `6aa01e60f2afe2eb763a4bc1` |
| testattempts | `6aa02b6cc3be60ada0ed4884` | questionIds | `6aa01e60f2afe2eb763a4bc7` |
| testattempts | `6aa02b6cc3be60ada0ed4884` | questionIds | `6aa01e61f2afe2eb763a4bcd` |
| testattempts | `6aa02b6cc3be60ada0ed4884` | questionIds | `6aa01e61f2afe2eb763a4bd3` |
| testattempts | `6aa02b6cc3be60ada0ed4884` | answers.questionId | `6aa01e60f2afe2eb763a4bc1` |
| testattempts | `6aa02b6cc3be60ada0ed4884` | answers.questionId | `6aa01e60f2afe2eb763a4bc7` |
| testattempts | `6aa02b6cc3be60ada0ed4884` | answers.questionId | `6aa01e61f2afe2eb763a4bcd` |
| testattempts | `6aa02b6cc3be60ada0ed4884` | answers.questionId | `6aa01e61f2afe2eb763a4bd3` |
| results | `6aa01e927a012eb44cc636d6` | testId | `6aa01e61f2afe2eb763a4bda` |
| results | `6aa02a70c3be60ada0ed4814` | testId | `6aa01e61f2afe2eb763a4bda` |
| questions | `6aa01e60f2afe2eb763a4bc1` | postIds | `6a9fe271a6683cc1b21ccded` |
| questions | `6aa01e60f2afe2eb763a4bc7` | postIds | `6a9fe271a6683cc1b21ccded` |
| questions | `6aa01e61f2afe2eb763a4bcd` | postIds | `6a9fe271a6683cc1b21ccded` |
| questions | `6aa01e61f2afe2eb763a4bd3` | postIds | `6a9fe271a6683cc1b21ccded` |


## SET A Protection

SET A questions: **250**  
SET A questions proposed for deletion: **0**

- Live SET A membership = questions **without** marker `PHASE9_SMOKE_TEST_2026` (live docs have no `sourceQuestionNumber`).
- Fixture `SET_A_import_ready.jsonl` lines: 250. Phase 9 Mongo IDs in that file: **0**
- Fixture `SET_A_metadata_import_ready.jsonl` lines: 250. Phase 9 Mongo IDs in that file: **0**
- Phase 9 IDs present in recorded SET A live ID list (`PHASE9_smoke_test_ids.json`): **0**
- Phase 9 Test.questionIds ∩ SET A live IDs: **0**
- Phase 9 attempt questionIds ∩ SET A live IDs: **0**

## Other Tests Using Phase 9 Questions

None. Only the Phase 9 Mock Test.

## Other Content Using Phase 9 Post

Only the four Phase 9 questions. Test.postId is null. No notes/PDFs/subjects.

## Test User

No user deletion/modification proposed.

Test user cleanup: **NOT PROPOSED**

## Proposed Cleanup Order

READ-ONLY — NOT EXECUTED

1. results: `6aa01e927a012eb44cc636d6`, `6aa02a70c3be60ada0ed4814` — Result documents reference testId only (no attemptId). Remove score rows for the smoke Test first.
2. testattempts: `6aa01e727a012eb44cc636c7`, `6aa02a34c3be60ada0ed4805`, `6aa02b6cc3be60ada0ed4884` — Attempts reference the Test and embed the four question IDs plus resultSnapshot copies.
3. tests: `6aa01e61f2afe2eb763a4bda` — After attempts/results are gone, no remaining TestAttempt/Result should point at this Test.
4. questions: `6aa01e60f2afe2eb763a4bc1`, `6aa01e60f2afe2eb763a4bc7`, `6aa01e61f2afe2eb763a4bcd`, `6aa01e61f2afe2eb763a4bd3` — Only this Test referenced these IDs. Snapshots live on attempts, which would already be removed.
5. posts: `6a9fe271a6683cc1b21ccded` — Only the four smoke questions tag this Post via postIds. No Test.postId, notes, PDFs, or subjects.

Do not run this order without a later explicit cleanup phase.

## Unexpected References

- EXTRA_OR_MISSING_PHASE9_ATTEMPTS: {"code":"EXTRA_OR_MISSING_PHASE9_ATTEMPTS","expected":2,"actual":3,"extraOpenIds":["6aa02b6cc3be60ada0ed4884"],"extraCompletedIds":[],"note":"Expected the known old submitted attempt plus exactly one new submitted phone-test attempt. Additional in-progress or extra submitted attempts block cleanup until they are accounted for."}

## Repo / code artifacts (not deleted)

Phase 9 leftover **code and reports** (this phase does not delete them):

- `backend/scripts/create-phase9-smoke-test.mjs`
- `backend/scripts/create-phase9a-smoke-post.mjs`
- `backend/scripts/fixtures/set-a/PHASE9_smoke_post.json`
- `backend/scripts/fixtures/set-a/PHASE9_smoke_test_ids.json`
- `backend/scripts/fixtures/set-a/SET_A_phase9_live_smoke_test_report.md`
- `backend/scripts/fixtures/set-a/SET_A_phase9a_post_report.md`
- `backend/scripts/fixtures/set-a/SET_A_phase9d_snapshot_investigation_report.md`
- `backend/scripts/fixtures/set-a/SET_A_phase9g_cleanup_audit.json`
- `backend/scripts/fixtures/set-a/SET_A_phase9g_cleanup_audit.md`
- `backend/scripts/investigate-phase9-snapshot.mjs`
- `backend/scripts/verify-phase9-smoke-test.mjs`
- `backend/scripts/verify-phase9g-cleanup-audit.mjs`

Temporary product configuration was not added to `backend/src` for the smoke IDs. Creation/verify scripts and fixture reports exist under `backend/scripts`.

## Final database counts (unchanged)

| Item | Actual | Expected |
|---|---:|---:|
| Questions | 254 | 254 |
| Tests | 1 | 1 |
| Posts | 1 | 1 |
| Phase 9 Attempts | 3 | 2 |
| Phase 9 Results | 2 | 2 |
| SET A | 250 | 250 |

## Writes performed

MongoDB writes = 0  
Questions modified = 0  
Questions deleted = 0  
Tests modified = 0  
Tests deleted = 0  
Posts modified = 0  
Posts deleted = 0  
Attempts modified = 0  
Attempts deleted = 0  
Results modified = 0  
Results deleted = 0  

## Final Recommendation

**CLEANUP BLOCKED — UNEXPECTED REFERENCES FOUND**
