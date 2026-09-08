# SET A Phase 7 Test Planning Report

## Current Test Architecture

Tests are Mongo documents in collection `tests` (`backend/src/models/Test.js`). They are **not** Question documents. Product kind lives on Test as `kind`, distinct from taxonomy `type`.

**Test fields (actual schema):**

| Field | Type / notes |
|---|---|
| title | required string |
| type | enum `subject` \| `post` \| `topic` \| `mixed` (taxonomy; inferred on create if omitted) |
| kind | enum `mock` \| `previous_year`; default `mock`; missing/legacy treated as mock |
| year | integer 1900–2100 or null; required for previous_year |
| postId | ObjectId ref Post or null; required for previous_year |
| description | string, max 2000 |
| pdfNoteId | optional ObjectId ref PdfNote |
| questionIds | array of Question ObjectIds; **array order is the paper order** |
| duration | required number, min 1 (minutes) |
| negativeMarking | number, default 0, min 0 |
| status | `active` \| `disabled`; default active |
| disabledAt | Date or null |
| timestamps | createdAt / updatedAt |

**Test creation flow:** `POST /tests` (admin) → `createTestValidators` → `testController.create` → `testService.create`.

- Rejects duplicate `questionIds` (Set length check). JavaScript Set **preserves insertion order**, so ordered unique ids stay in caller order.
- `classifyQuestions` requires every id to exist, `isActive !== false`, and subject + topic active.
- `kind=previous_year` requires valid year, existing **active** Post, optional PdfNote.
- `inferTestType` from selected questions (single topic → topic, single subject → subject, else mixed / post).
- Always writes `status: active`, `disabledAt: null`. There is **no draft** and **no general Test update** of title/questionIds after create.

**Test update flow:** `PATCH /tests/:id/status` only (`active` / `disabled`). Disable hides the paper from student discovery except resume of an open attempt. Start of **new** attempts is blocked on disabled tests (`assertAvailableForNewStart`). Submit/progress/history still work for attempts already open.

**Test retrieval flow:**

- Student catalog: `GET /tests` with optional `kind`, `postId`, `year`. Default omitted kind is the **mock** catalog (explicit mock **or** missing/null kind). `kind=previous_year` returns only PYQs.
- Admin: `GET /tests/admin/list` (all tests, populate post).
- Detail: `GET /tests/:id` — same document with `questionIds` filtered to currently servable questions, **original order preserved**.

**Attempt behavior:** `POST /tests/:id/start` snapshots `test.questionIds` onto `TestAttempt.questionIds` (deduped, order preserved). Resume returns the open attempt. `PATCH /tests/:id/progress` merges answers. `POST /tests/:id/submit` scores against live Question docs for that snapshot, writes immutable `resultSnapshot`, sets `endTime`.

**Retry:** Free users cannot start again after a submitted attempt (`Test already completed`). Premium users may start a new attempt (`canRetry: premium` in `GET /tests/status/mine`). Rank uses **best completed score** per user.

**Result / rank:** Personal only. `GET /tests/:id/rank` returns this user's standing. No leaderboard list is returned.

## Test.kind / Previous Year Support

`kind` is the real field name. Values: `mock` | `previous_year` (`backend/src/constants/testKind.js`).

- `normalizeTestKind`: only exact `previous_year` is PYQ; everything else is mock.
- Create: `buildCreateKindFields` **requires year + postId** for previous_year and clears those fields for mock so a mock cannot be accidentally tagged.
- Discovery: `GET /tests?kind=previous_year` filters `{ kind: 'previous_year' }` plus optional postId/year. Index `idx_test_pyq_discovery` exists for this path.
- Mobile Previous Year Papers calls `getTests({ kind: 'previous_year' })` and keeps `test.kind === 'previous_year'`. Identification is **never** by title string.

SET A as one Previous Year Paper is the supported product shape: one Test, `kind: previous_year`, ordered `questionIds`.

## 250-Question Compatibility

| Requirement | Supported now? |
|---|---|
| One Test | Yes |
| 250 questionIds | Yes. Validators: array min 1, **no maximum**. Schema: unbounded ObjectId array. |
| Ordered questions | Yes if the create payload is already booklet-ordered. Array order is preserved through create, getById filter, attempt snapshot, scoring, and TestScreen. |
| kind = previous_year | Yes |
| optional year | **No for PYQ.** Year is **required** for `previous_year`. Optional/null only for mock. |
| postId | **Required** for previous_year. Must be an existing active Post. |
| description | Yes, optional, max 2000 |
| duration | Yes, integer minutes ≥ 1, **no max** |
| negative marking | Yes, ≥ 0, default 0 |
| active/published status | Create always **active**. Disable via status patch. No unpublished/draft enum. |

Document size for 250 ObjectIds is negligible. Compatibility blocker for *creating* a PYQ is missing **year** and **postId**, not the count 250.

## Question Ordering

Live Question documents **do not** store `sourceQuestionNumber` (Phase 6 warning; unchanged).

Safest order construction **without modifying Questions:**

1. Read `SET_A_metadata_import_ready.jsonl` (sourceQuestionNumber 1–250).
2. Flatten each row with `prepareQuestionPresentation` (same as import).
3. Match live Question by `subjectId + stored questionText`.
4. Emit `questionIds` in sourceQuestionNumber ascending order.

Join used for the proposed mapping: `250/250` matched. Duplicate join keys: 0. Duplicate questionIds: 0. Inactive mapped questions: 0.

**Do not** use Admin “select all visible” as the source of truth. Page size is 30; selection order is click/Set insertion order, not booklet order.

## SET A Metadata Available

From project source (not invented):

- Booklet file: `SET A - (1-250) Questions.pdf` (School of UPSC, 57 pages) — `SET_A_review_report.md`
- Source name / title stem: **SET A - (1-250) Questions**
- Question count: 250, numbered 1–250
- All `single_correct`
- Presentation: 49 plain / 8 two_statements / 179 numbered_list / 14 table
- Subject/topic taxonomy: 11 subjects, 48 topics (from Gate 1 catalog + import)
- Answer key exists as a separate audited fixture (not a Test field)

Subject distribution in the proposed ordered paper:

| Subject | Count |
|---|---:|
| Economy | 30 |
| Environment | 30 |
| History and Culture | 30 |
| Science and Technology | 29 |
| Indian Polity | 26 |
| Geography | 22 |
| International Relations | 22 |
| Health | 20 |
| Governance and Schemes | 15 |
| Agriculture | 14 |
| Defence | 12 |

## Missing Metadata / Decisions Required

- **Year is not available from the current SET A source metadata.**
- **postId is not available from the current SET A source metadata.**
- Duration is not in the source.
- Negative marking is not in the source.
- Test.description is not in the source (PDF attribution is documentation only).
- pdfNoteId is not in the source.

Live Post catalog (for the creation-phase decision; do not invent a postId):

| postId | name | slug | active |
|---|---|---|---|
| — | none | — | — |

Decisions:

- year — Year is not available from the current SET A source metadata.
- postId — postId is not available from the current SET A source metadata. PYQ create requires an existing active Post.
- duration — no duration is present in SET A source metadata (minutes, integer ≥ 1).
- negativeMarking — no marking scheme is present in SET A source metadata. System default on create is 0. If set > 0, unanswered and wrong answers both subtract that amount.
- description — optional (max 2000). Source PDF attribution exists in SET_A_review_report.md but is not a Test.description field today.
- pdfNoteId — optional. No PdfNote id is present in SET A source metadata.
- student visibility — testService.create always writes status=active, which immediately lists the paper in Previous Year Papers. Decide whether to disable immediately after create.
- creation path — Admin Create Test cannot reliably preserve booklet order 1–250. Prefer POST /tests with the proposed ordered questionIds.
- An active Post must exist before SET A can be created as previous_year. None were found in this audit.

## Test Validation Limits

Inspected: `testValidators.js`, `testService.create`, `buildCreateKindFields`, Test schema.

| Check | Current rule |
|---|---|
| Min questions | 1 |
| Max questions | **none** (250 allowed) |
| Duplicate questionIds | rejected |
| Each questionId | MongoId + classifyQuestions (exists, active, subject/topic active) |
| duration | integer ≥ 1, no max |
| negativeMarking | optional float ≥ 0 |
| kind | `mock` \| `previous_year` |
| previous_year year | required, integer 1900–2100 |
| previous_year postId | required MongoId + active Post |
| status on create | always `active` (not client-controlled) |
| status patch | `active` \| `disabled` |

**250 questions are allowed.** No validator change is required for count.

## Previous Year Papers Discovery

- API: `GET /tests?kind=previous_year` (`listTestsQueryValidators`, `buildTestDiscoveryMongoFilter`).
- Optional `postId`, `year`.
- No server pagination: `testRepository.findAll` returns all matches sorted `createdAt: -1`.
- Student filter: hide disabled unless open attempt; hide empty `questionIds`.
- Mobile: `usePreviousYearPapers` → cards show title, description, duration, question count (`questionIds.length`), year, exam name from Posts catalog.
- Client groups by year (`groupPreviousYearPapersByYear`).

A newly created SET A Test with `kind=previous_year`, valid year + postId, `status=active`, and 250 servable questionIds **would automatically appear** in Previous Year Papers. It would **not** appear on the mock catalog (`GET /tests` without kind / `kind=mock`).

## Student Test Flow

Existing path (no mobile changes in this phase):

Previous Year Papers → card start (`POST /tests/:id/start`, same quota middleware as mocks) → `TestScreen` with `kind: previous_year`, `durationMinutes` from the paper, `originMainTab` Home or Papers → fetch `GET /questions?ids=` for attempt.questionIds in that order → navigate/answer/mark-for-review → autosave progress → timer from duration → submit → ResultScreen → personal rank.

PYQ-specific: resume copy mentions Previous Year Papers; CTA labels “Start/Continue/Retry Paper”; back navigation uses `originMainTab`. TestScreen itself is shared with mocks.

**250-question warnings (do not change code now):** one questions fetch (~6.2KB of ids plus full stems/options/content), client holds 250 questions in memory, autosave sends one entry per question, numbered navigation over 250 items, long timer. Functionally supported; UX/performance should be watched at creation time.

## Scoring

Submit path: `testAttemptService.submit` (not presentationKind).

For every question in attempt order:

- Correct = exact set match of selected indexes vs `correctAnswers` (`indexSetsEqual`).
- **single_correct:** correct set length 1; user must select exactly that index.
- **multiple_correct:** exact set (no extra/missing). SET A has **zero** multiple_correct.
- Invalid/out-of-range indexes are dropped; empty selection is unanswered.
- If correct: `rawScore += 1`.
- Else: `rawScore -= negativeMarking` (including unanswered).
- Final `score = max(0, rawScore)`.
- Accuracy = correctCount / total * 100 (two decimals).

**Marks per question:** +1. There is no per-question marks field.

**Proposed configuration effect:** if `negativeMarking` is left default **0**, SET A scores as correct count out of 250, unanswered = 0 (not penalized). If `negativeMarking` is e.g. 0.33, every wrong **and unanswered** subtracts 0.33, then floored at 0.

## Personal Rank

`GET /tests/:id/rank` → `testRankService.getPersonalRank` → `resolvePersonalRank`.

- Requires authenticated JWT user.
- Test must exist (any kind; **no previous_year special case**).
- Uses completed attempts only (`endTime != null`).
- Best score per user; rank = 1 + count of users with a strictly better best score (ties share rank; no time tie-break).
- `totalParticipants` = distinct users with a completed attempt.
- Percentile = round(((total - rank) / total) * 100) only if total ≥ 20; else `null`.
- Payload keys only: testId, rank, totalParticipants, percentile, score, attemptId. No user list / leaderboard.
- Mobile ResultScreen treats any Test result with a testId as eligible for this card (`isMock = !!testId && !retry`); PYQ is not excluded. `shouldFetchMockPersonalRank` only blocks battle/daily/practice/retry session types.

Free vs premium does not change rank math. Premium may retry; rank still uses that user's **best** completed score. No public leaderboard exists or should be added.

## Admin Test Creation

`admin/src/pages/CreateTest.jsx` **can** set:

- kind mock / previous_year
- year, postId, description, optional pdfNoteId
- duration, negativeMarking
- title
- question selection (paginated 30)

It **cannot** set status (create is always active). It **cannot** reliably order all 250 SET A questions to booklet order: filters, search, “select all visible”, and Set insertion order do not read `sourceQuestionNumber`. There is no Test edit UI for reordering questionIds after create.

**Recommendation:** do not create SET A through click-selection. Use `POST /tests` with `SET_A_test_creation_proposal.json` after decisions are filled.

## Existing Test Audit

Read-only `tests.find({})`.

- Total Test documents: **0**
- previous_year: **0**
- mock (including missing kind): **0**

| _id | title | kind | year | status | questions | SET A overlap |
|---|---|---|---|---|---:|---:|
| — | none | — | — | — | 0 | 0 |

SET A-like detections (title match, ≥200 overlapping ids, or exact 250-id set):

| _id | title | kind | questions | overlap | exact SET A set | title like SET A |
|---|---|---|---:|---:|---|---|
| — | none | — | — | — | — | — |

No existing Test uses the exact SET A question set or a SET A-like title. Creation planning may continue after decisions.

## Proposed Test Configuration

Local artifact only (not inserted): `backend/scripts/fixtures/set-a/SET_A_test_creation_proposal.json`

| Field | Proposed value |
|---|---|
| title | SET A - (1-250) Questions (from source PDF name) |
| kind | previous_year |
| year | REQUIRES_DECISION |
| postId | REQUIRES_DECISION |
| description | REQUIRES_DECISION |
| pdfNoteId | REQUIRES_DECISION |
| type | mixed (inferred) |
| questionCount | 250 |
| questionIds | booklet order Q1–Q250 from proposed mapping file |
| duration | REQUIRES_DECISION |
| negativeMarking | REQUIRES_DECISION |
| status | active (only value create writes) |

## Proposed Question Ordering

Local artifact only: `backend/scripts/fixtures/set-a/SET_A_test_question_order_proposed.json`

- Entries: 250
- Q1–Q250 exactly once: yes
- Every questionId exists in live questions: yes
- No questionId duplicated: yes
- Order: sourceQuestionNumber ascending

First five:

- Q1 → `6a9fd2229ad821dc3f065e75`
- Q2 → `6a9fd2229ad821dc3f065e76`
- Q3 → `6a9fd2229ad821dc3f065e77`
- Q4 → `6a9fd2229ad821dc3f065e78`
- Q5 → `6a9fd2229ad821dc3f065e79`

Last five:

- Q246 → `6a9fd2229ad821dc3f065f6b`
- Q247 → `6a9fd2229ad821dc3f065f6c`
- Q248 → `6a9fd2229ad821dc3f065f6d`
- Q249 → `6a9fd2229ad821dc3f065f6e`
- Q250 → `6a9fd2229ad821dc3f065f6f`

## Risks / Warnings

- Question documents do not store sourceQuestionNumber. Booklet order must be constructed from SET_A_metadata_import_ready.jsonl joined to live questions.
- 250-question GET /questions?ids= CSV is ~6.2KB of ObjectIds. TestScreen loads all questions in one request and autosaves all 250 answer slots. Watch payload size, render cost, and timer UX.
- Admin Create Test pages questions 30 at a time. Select-all-visible + Set insertion order is click/page order, not sourceQuestionNumber order.
- Free-tier device quota (FREE_TEST_LIMIT, default 3) applies to all Tests including previous_year. There is no PYQ-specific quota bypass.
- If negativeMarking > 0, submit scoring subtracts that amount for every non-exact-match, including unanswered and out-of-range invalid indexes.
- No active Post documents were found. previous_year create cannot succeed until an active Post exists and its postId is supplied.

- Create immediately publishes to student PYQ discovery.
- Admin UI ordering is unsafe for this paper.
- Unanswered is penalized when negativeMarking > 0.
- URL length / 250-question client load.

## Required Changes Before Creation

**No schema, validator, Question, or UI code changes are required** for a 250-question `previous_year` Test, provided year + postId + duration + negativeMarking are supplied at create time.

Required **before** the creation phase (human decisions, not code):

1. Choose calendar year (1900–2100). Do not invent it from this audit.
2. Choose an existing active `postId` from the Posts table above.
3. Choose duration (minutes).
4. Choose negativeMarking (0 vs exam-faithful penalty, knowing unanswered is penalized if > 0).
5. Confirm title `SET A - (1-250) Questions` or supply another title explicitly.
6. Optional description / pdfNoteId.
7. Confirm create-as-active vs disable-immediately-after-create.
8. Create via ordered `questionIds` from the proposal file (API or a future creation script), **not** Admin click-order.
9. Explicit approval to leave read-only mode and insert one Test.

If an existing SET A Test is listed above, skip creation entirely.

## Final Verdict

**READY WITH DECISIONS**

MongoDB writes: 0
Questions modified: 0
Tests created: 0
Tests modified: 0
Tests deleted: 0

Do not proceed to Test creation until this report is approved and the REQUIRES_DECISION fields are filled.
