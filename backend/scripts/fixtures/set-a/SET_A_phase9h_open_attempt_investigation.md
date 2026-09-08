# Phase 9H — Extra Open Attempt Investigation

## Status

READ-ONLY

Generated: 2026-09-08T15:50:29.538Z

MongoDB writes performed by this investigation: **0**

## Database Identity

- database name: `ssbfy`
- cluster host: `memora.evyfu0y.mongodb.net`
- protocol: `mongodb+srv`
- identity: **intended SSBFY database (ssbfy, SET A 250)**

Credentials and the full MongoDB URI are not included.

## Extra Open Attempt

| Field | Value |
|---|---|
| _id | `6aa02b6cc3be60ada0ed4884` |
| userId | …7f83fa |
| testId | `6aa01e61f2afe2eb763a4bda` |
| questionIds | `6aa01e60f2afe2eb763a4bc1`, `6aa01e60f2afe2eb763a4bc7`, `6aa01e61f2afe2eb763a4bcd`, `6aa01e61f2afe2eb763a4bd3` |
| status field on schema | none (open = `endTime === null`) |
| derived status | **open** |
| startTime | 2026-09-08T15:36:12.848Z |
| endTime | null |
| attemptNumber | 1 |
| score | null |
| accuracy | null |
| timeTaken | null |
| createdAt | 2026-09-08T15:36:12.849Z |
| updatedAt | 2026-09-08T15:38:14.960Z |
| expiresAt | null |
| resultSnapshot | absent |
| document keys | __v, _id, accuracy, answers, attemptNumber, createdAt, endTime, questionIds, resultSnapshot, score, startTime, testId, timeTaken, updatedAt, userId |

Truly open/incomplete: **yes**

User premium (boolean only): **false**  
User role (no email): **user**

## Comparison With Completed Attempts

| Label | Attempt | userId (masked) | same user as open | state | attemptNumber | score | snapshot | answer rows | start | end |
|---|---|---|---|---|---:|---:|---|---:|---|---|
| old | `6aa01e727a012eb44cc636c7` | …c6366a | no | completed | 1 | 1 | yes | 4 | 2026-09-08T14:40:50.691Z | 2026-09-08T14:41:22.800Z |
| completed-new | `6aa02a34c3be60ada0ed4805` | …ed47dd | no | completed | 1 | 2 | yes | 4 | 2026-09-08T15:31:00.322Z | 2026-09-08T15:32:00.118Z |
| extra-open | `6aa02b6cc3be60ada0ed4884` | …7f83fa | yes | open | 1 | null | no | 4 | 2026-09-08T15:36:12.848Z | null |

Same test: **yes**  
Same user as old attempt: **no**  
Same user as new completed attempt: **no**  
Different user from both completed attempts: **yes**

questionIds match Phase 9 order on all three: **yes**

## Creation Source

Code path: `POST /api/tests/:id/start` → `testController.start` → `testAttemptService.start` → `testAttemptRepository.create({ userId, testId, questionIds, answers: [], startTime, attemptNumber })`.

Open attempts are created **before** the student answers. A second start for the same user+test **resumes** the open row (unique partial index `uniq_attempt_user_test_open`). Abandoned starts remain open forever: there is no expire/abandon API and no TTL.

Classification: **A. Normal abandoned attempt**

Evidence: Document matches testAttemptService.start → testAttemptRepository.create (startTime set, endTime null, no snapshot). Belongs to a different user than both completed attempts. The Phase 9 Test is a public active mock, so any authenticated student can start it. No server-side abandon/expire ran. Logs were not available in this session. updatedAt is later than createdAt, consistent with PATCH /tests/:id/progress after start.

Server/PM2/API logs were **not** available in this session. Cause is inferred from document shape, timestamps, and user inequality — not from access logs.

## Answer State

- answers present: **yes**
- answer row count: **4**
- answered question count (non-empty selections): **0**
- resultSnapshot present: **no**

Selected option values are not listed.

## Result Relationship

Result schema: `userId` + `testId` + score/accuracy/timeTaken/weakTopics. **No attemptId.**

Results for this Test: **2**  
Results that pair to the open attempt (same userId + testId + would require a score/timeTaken): **no**

Open attempt has no Result: **confirmed**

## API Lifecycle

Existing TestAttempt HTTP operations:

| Method | Path | Effect on an open attempt |
|---|---|---|
| POST | `/tests/:id/start` | Resume if open exists for this user; else create open row |
| PATCH | `/tests/:id/progress` | Merge answers into the open row (does not finalize) |
| POST | `/tests/:id/submit` | Finalize: set endTime, score, resultSnapshot; create Result |
| GET | `/tests/:id/attempts` | Submitted history only (`endTime != null`) |
| GET | `/tests/:id/rank` | Completed attempts only |
| GET | `/tests/status/mine` | Flags `hasOpenAttempt` / `hasCompletedAttempt` |

There is **no** abandon, cancel, expire, or delete-attempt student endpoint.

Internal `deleteOpenAttemptByIdForUser` exists only to roll back a start when free-tier `deviceId`/quota fails **after** the row was inserted. It is not a user-facing abandon.

## Expiration Behavior

- TestAttempt schema: **no `expiresAt`**, no status enum, no TTL index.
- Test `duration` (10 minutes) is a **client timer** (mobile `TestScreen`). The server does not expire the row when duration elapses; submit remains valid while `endTime` is null.
- PracticeIssuance / BattleSession have TTLs; TestAttempt does not.
- This open attempt **will not naturally expire**.

## User Impact

Masked user: …7f83fa  
Same as phone-test completed user: **no**  
Other Phase 9 attempts for this user: **0**

Impact while the row remains:

- Rankings: none (rank aggregations filter `endTime != null`).
- Result / score stats: none (no Result; profile analytics use completed attempts).
- Catalog participant counts: completed-only.
- This user: `GET /tests/status/mine` shows `hasOpenAttempt: true` for the smoke Test. Another `POST /start` **resumes** this row. They cannot start a second concurrent open attempt (unique index). Free users who never submitted are not blocked by "Test already completed"; they are parked on Resume.
- Free-tier device quota: consumed at successful start (if this user is free). Deleting later does **not** automatically refund `DeviceUsage.freeAttemptsUsed` (out of scope unless a later phase says so).
- Unrelated users, SET A, and the two completed attempts: unaffected by later deletion of this row.

## Secondary References

Search for `6aa02b6cc3be60ada0ed4884` in results, learningsessions, battlesessions, practiceissuances, userlearninganalytics, and a capped scan of other non-empty collections.

Hits: **0**

None.

## Phase 9 Integrity

| Item | Actual | Expected |
|---|---:|---:|
| Questions | 254 | 254 |
| Phase 9 questions | 4 | 4 |
| Tests | 1 | 1 |
| Posts | 1 | 1 |
| Phase 9 attempts | 3 | 3 |
| Phase 9 completed | 2 | 2 |
| Phase 9 open | 1 | 1 |
| Phase 9 results | 2 | 2 |
| SET A | 250 | 250 |

SET A questions proposed for deletion: **0**  
Other tests using Phase 9 questions: **0**  
Other content using Phase 9 Post: **only the four Phase 9 questions**

New completed attempt structured snapshot: **yes**

## Cleanup Classification

**SAFE TO DELETE LATER**

The row is a genuine in-progress TestAttempt created by the normal start path, then left unsubmitted. It has no Result and no secondary references. It does not enter rankings, Result stats, or completed-attempt analytics. There is no application expiration; waiting will not remove it. There is no student abandon endpoint; later cleanup should delete the document (with the rest of Phase 9 smoke data), not submit it. Deleting it does not modify SET A, the Test, Questions, Post, or the two completed attempts/results unless those are deleted in the same approved cleanup.

Dependencies if deleted later: none besides the attempt document itself (no Result, no secondary refs). Deleting the attempt alone is sufficient for this extra row. It should still be included in the broader Phase 9 smoke cleanup (attempts → test → questions → post), not deleted in isolation unless a later phase says so.

## Proposed Future Cleanup

READ-ONLY — NOT EXECUTED

1. Results: `6aa01e927a012eb44cc636d6`, `6aa02a70c3be60ada0ed4814` — smoke-test score rows (`testId` only).
2. TestAttempts, including OPEN `6aa02b6cc3be60ada0ed4884`: `6aa01e727a012eb44cc636c7`, `6aa02a34c3be60ada0ed4805`, `6aa02b6cc3be60ada0ed4884`.
3. Test `6aa01e61f2afe2eb763a4bda`.
4. Questions `6aa01e60f2afe2eb763a4bc1`, `6aa01e60f2afe2eb763a4bc7`, `6aa01e61f2afe2eb763a4bcd`, `6aa01e61f2afe2eb763a4bd3`.
5. Post `6a9fe271a6683cc1b21ccded`.

OPEN ATTEMPT `6aa02b6cc3be60ada0ed4884`: **safe to include in future cleanup.** Do not submit or expire it first; there is no expire API. Do not refund device quota in this investigation.

Test user accounts: **NOT PROPOSED**.

## Final Verdict

**PASS**

Do not delete, submit, or expire anything until an explicit cleanup phase.
