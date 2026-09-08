# Phase 7 — JKSSB Question Format Production Audit

## Purpose

SET A was imported only as **reference material** so SSBFY could implement the question formats JKSSB currently asks. SET A is **not** a Previous Year Paper product object.

This phase does **not**:

- create a SET A Test
- create a SET A PYQ
- create a Post for SET A
- invent a year for SET A
- modify the 250 imported questions

The goal is to verify that a **new** Admin-created question can use each supported presentation and travel through:

Admin form → API validation → MongoDB Question → Test.questionIds → Mock Test → TestScreen → answers → scoring → result → Review Answers.

SET A rows in Mongo, if present, are ordinary Question documents. They are evidence that the four presentations already exist in the database, not a special product type.

## Architecture

`questionType` = answer behavior: `single_correct` | `multiple_correct` | `image_based`  
(`backend/src/models/Question.js` `QUESTION_TYPES`)

`presentationKind` = stem display: `plain` | `two_statements` | `numbered_list` | `table`  
(`backend/src/utils/questionPresentation.js` `PRESENTATION_KINDS`)

`content` = structured stem payload (absent/null on plain and legacy docs)

These fields are independent. Two statements in the stem do **not** imply `multiple_correct`. Scoring never reads `presentationKind`.

`Test.kind` (`mock` | `previous_year`) is a product label on Test. It does not gate which presentations are allowed on `questionIds`.

## Admin Create

File: `admin/src/pages/AddQuestion.jsx`  
Helpers: `admin/src/utils/questionPresentationForm.js`  
UI: `admin/src/components/QuestionPresentationFields.jsx`

Question Type and Presentation are separate `<select>`s with helper copy: “Question Type is how the answer works. Presentation is how the question stem is displayed.”

| Case | questionType | presentationKind | Admin can create? |
|---|---|---|---|
| A | single_correct | plain | Yes — questionText + 4 options + one correct index |
| B | single_correct | two_statements | Yes — intro, two labeled statements, prompt; options remain A–D |
| C | single_correct | numbered_list | Yes — intro, items `{n,text}` (2–20), prompt |
| D | single_correct | table | Yes — intro, columns (1–8), rows (1–20), prompt |

`buildPresentationPayload` **omits `questionText`** for structured kinds so the backend remains the source of flattened text. Plain never sends structured `content` on create.

Default statement labels are `Statement – I` / `Statement – II`.

## Admin Edit

File: `admin/src/pages/AddQuestion.jsx` edit `useEffect` + `changePresentationKind` + `applyPresentationOnUpdate` in `questionService.js`.

| Scenario | Behavior |
|---|---|
| A. Existing plain | `normalizePresentationKind` missing/unknown → `plain`; questionText loaded |
| B. Existing structured | `presentationKind` + `contentDraftFromQuestion` load intro/statements/items/table |
| C. Structured → plain | Edit payload sends `presentationKind: plain` and `content: null`; service `doc.set('content', undefined)` |
| D. Plain → structured | Structured editor appears; payload sends `content` without client `questionText` |
| E. Legacy missing kind | Treated as plain |

`changePresentationKind` does not wipe the in-memory content draft. That is UI-only; the payload builder does not send leftover structured fields for plain.

## Backend Validation

File: `backend/src/utils/questionPresentation.js` `prepareQuestionPresentation`  
Wired from: `createQuestionValidators` / `updateQuestionValidators` (`questionValidators.js`) and Question `pre('validate')` + `questionService.create/update`.

| Kind | Rules |
|---|---|
| plain | `questionText` required (max 20000). Non-empty `content` rejected |
| two_statements | exactly 2 statements; label + text required; intro/prompt optional |
| numbered_list | 2–20 items; `n` positive integer; text required; intro/prompt optional |
| table | 1–8 columns; 1–20 rows; each row length = column count; cells strings (empty allowed); intro/prompt optional |

Invalid structured content throws `AppError` 400. Structured `questionText` is **always regenerated** via `flattenQuestionContentToText`; a client-supplied stem cannot win.

Update validator `assertUpdatePresentation` skips when only `content` is patched without `presentationKind`; `applyPresentationOnUpdate` still runs `prepareQuestionPresentation`.

## MongoDB Question Shape

Confirmed from `Question.js` + `prepareQuestionPresentation` return value (no sample inserts).

Plain: `questionType`, `presentationKind: "plain"`, `questionText`, `options`, `correctAnswers`. `content` omitted/undefined.

Structured: same plus `content` object (two_statements / numbered_list / table shapes above) and backend-generated `questionText`.

Live database `ssbfy`:

| presentationKind | count |
|---|---:|
| plain | 49 |
| two_statements | 8 |
| numbered_list | 179 |
| table | 14 |
| missing (legacy → treat as plain) | 0 |
| other | 0 |
| **total** | **250** |

questionType: single_correct=250, multiple_correct=0, image_based=0.  
Structured questions that are not single_correct: 0 (allowed by architecture; none required).

## Public API

`projectPublicQuestion` returns `questionText`, `options`, `questionType`, `questionImage`, taxonomy, `year`, plus `presentationKind` + `content` via `presentationFieldsFromQuestion`.

It does **not** copy `correctAnswers`, `correctAnswerIndex`, `correctAnswerValue`, or `explanation`.

Used by: `GET /questions` (including `ids=`), daily practice, battle public questions, `getById` student path.

Unknown `presentationKind` on read becomes `plain` (catch in `presentationFieldsFromQuestion`). Missing kind → plain. Structured `content` is cloned JSON, not flattened away.

## Mock Test Compatibility

Test stores ordered `questionIds` only (`backend/src/models/Test.js`).  
`classifyQuestions` checks active question + active subject/topic. **No presentationKind filter.**

A mock may mix:

1. plain  
2. two_statements  
3. numbered_list  
4. table  

`Test.kind` is independent. Creating `kind=mock` vs `previous_year` does not change which Question presentations are legal.

Live Tests inspected: **0**. This audit created **0**.

Start snapshots `test.questionIds` onto the attempt; TestScreen fetches those ids via `getQuestionsByIds` and reorders to attempt order.

## Mobile Rendering

`mobile/src/components/QuestionPresentation.js` + `mobile/src/utils/questionPresentation.js` `resolveQuestionPresentation`.

Used by:

- `TestScreen` (`variant="test"`)
- `ReviewAnswersScreen` (`variant="review"`)

| Kind | Render |
|---|---|
| plain | `questionText` |
| two_statements | intro; each statement label + text in a block; prompt |
| numbered_list | intro; `{n}. {text}` using supplied `n`; prompt |
| table | intro; header row + cells; horizontal `ScrollView`; prompt |

Invalid/unknown kind or invalid content → plain fallback to `questionText`. Options stay in the parent (TestScreen Pressables / review option rows). Presentation does not change single vs multi select (`questionType` does).

## Answer / Scoring Compatibility

Options and `correctAnswers` are **indexes into `options[]`**, not into statements/items/table cells.

`scoreQuestionSession` / `testAttemptService.submit` / `computeIsCorrect` compare selected option index sets to `correctAnswers`. `presentationKind` is unused.

- two_statements + single_correct → one option index  
- numbered_list + single_correct → one option index  
- table + single_correct → one option index  

`multiple_correct` is a separate `questionType` and uses exact set match. Stem structure never promotes a question to multiple_correct.

## Snapshot Compatibility

| Snapshot | Copies presentationKind + content | Scoring source |
|---|---|---|
| TestAttempt.resultSnapshot | `presentationFieldsFromQuestion` in `buildResultSnapshotAtSubmit` | selected vs correct indexes |
| LearningSession.snapshot | same in `buildLearningSessionSnapshotV1` | same |
| BattleSession.questionSnapshots | `buildBattleQuestionSnapshot` / restore via `questionFromBattleSnapshot` | same |
| Practice reveal review rows | `buildReviewQuestion` | `scoreQuestionSession` |

Schema defaults `presentationKind: 'plain'`, `content: null` so **old snapshots** without those fields remain valid and render as plain. Placeholder deleted-question items are plain.

Historical review rebuilds Question-shaped objects with presentation fields, so ReviewAnswersScreen can render structured stems from the snapshot rather than re-flattening.

## Result / Review Compatibility

Submit → ResultScreen → ReviewAnswersScreen with the same question objects (live public questions or snapshot items). Both screens use `QuestionPresentation`. There is no review-only flatten path for two_statements / numbered_list / table when `content` is present and valid. Fallback to `questionText` only if content is invalid (same as TestScreen).

## Previous Year / Daily / Battle Compatibility

| Feature | Question source | presentation filter? |
|---|---|---|
| Previous Year Papers | same Test + questionIds engine | no |
| Daily Practice | `findRandomActive({ isActive: true })` then `projectPublicQuestions` | no |
| Battle | live questions or battle snapshots → `projectPublicQuestions` | no |
| Weak/smart practice | random active by topic/scope + public projection | no |

No production branch of the form `if (test.kind === "previous_year") allow structured`. Structured presentation belongs to Question.

## SET A Isolation

Scanned: `backend/src`, `admin/src`, `mobile/src`.

SET A markers found in production source: **0**.

Import/audit scripts and `backend/scripts/fixtures/set-a/` may mention SET A; that is **not** runtime product logic.

Live questions with `sourceQuestionNumber`: **0** (Question schema does not define this field).

The four presentations work for **new Admin questions** with no SET A metadata.

## Edge Cases

| Case | Backend write | Public/mobile read |
|---|---|---|
| missing presentationKind | default/plain on save | plain |
| unknown presentationKind | 400 | catch → plain |
| two_statements invalid content | 400 | fallback questionText |
| numbered_list invalid n | 400 (`n` must be ≥ 1) | client may still parse non-positive n (warning) |
| table mismatched row length | 400 | fallback questionText |
| empty/null content on structured | 400 | fallback |
| old documents | readable | plain |
| structured missing questionText on write | generated from content | n/a |
| stale client questionText | overwritten on write | mobile prefers content when valid |

## Performance

No speculative change. Visible concerns:

- Structured `content` is duplicated alongside flattened `questionText` in API payloads.
- TestScreen loads **all** attempt questions in one `GET /questions?ids=` (CSV of ObjectIds). A 250-question mixed paper is a large JSON body.
- Tables use nested horizontal ScrollView (wide JKSSB match-the-following).

None of these block creating **new** mixed-format mock tests of typical size.

## Findings

### PASS

- Production src (backend/admin/mobile) has no SET A / sourceQuestionNumber special case.
- Test model has no presentationKind field.
- testService does not filter questionIds by presentationKind.
- projectPublicQuestion does not emit correctAnswers / explanation.
- Structured writes ignore client questionText; backend flattens from content.
- Public API preserves structured content.
- Missing presentationKind projects as plain.
- Scoring uses option indexes only; presentationKind does not change correctness.
- Live questions: 250 total; structured content valid for two_statements=8, numbered_list=179, table=14.
- Live Tests: 0 (none created by this audit).
- Admin duplicate detection uses canonical stem for all presentation kinds.
- Admin Test picker shows a presentationKind indicator.
- Mobile numbered_list parser requires n>=1 and 2–20 items, matching backend.

- Admin Cases A–D are supported without flattening in the client.
- Backend is the source of truth for structured `questionText`.
- Mock Tests do not restrict presentationKind.
- Mobile TestScreen and ReviewAnswersScreen share QuestionPresentation.
- Scoring is index-based and presentation-agnostic.
- Snapshots copy presentationKind + content; legacy snapshots default to plain.
- PYQ / Daily / Battle consume the same Question documents.
- SET A is not special-cased in production code.

### WARNINGS

- Large tests that mix structured stems increase GET /questions?ids= payload (content + flattened questionText). TestScreen already loads all questions at once. File: mobile/src/screens/TestScreen.js getQuestionsByIds. Intentionally not optimized in Phase 8.

### FAILURES

- none

## Final Verdict

**PASS WITH WARNINGS**

MongoDB writes: 0  
Questions created: 0  
Questions modified: 0  
Questions deleted: 0  
Tests created: 0  
Tests modified: 0  
Tests deleted: 0  
Posts created: 0  
Posts modified: 0  
Indexes created: 0  

Do not implement fixes or create a SET A Test without explicit approval.
