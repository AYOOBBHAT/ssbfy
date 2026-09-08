# SET A Phase 6 Verification Report

## Database

- database name: `ssbfy`
- question count: 250
- subject count: 11
- topic count: 48
- metadata SHA-256: `17901c2f7ceaba12908ed331af12bb914265a2cbe65946d832f4001cbe06dcfa`

Read-only native driver. `connectDb()`, `syncIndexes()`, and import/commit scripts were not run.

## Question Integrity

- JSONL numbering 1–250 unique: yes
- Live Question documents storing `sourceQuestionNumber`: 0
- Join of JSONL 1–250 onto live questions (prepared questionText + subjectId): 250/250
- missing records: 0
- invalid subjectId: 0
- invalid topicId: 0
- topic belongs to another subject: 0

## Presentation Distribution

| Kind | Expected | Actual |
|---|---:|---:|
| plain | 49 | 49 |
| two_statements | 8 | 8 |
| numbered_list | 179 | 179 |
| table | 14 | 14 |
| other | 0 | 0 |
| **Total** | **250** | **250** |

Match: YES

## Answer Integrity

- single_correct: 250
- multiple_correct: 0
- image_based: 0
- invalid answer indexes / arity: 0

All SET A rows are `single_correct` with exactly one in-range index (expected).

## Structured Content Integrity

- two_statements / numbered_list / table / plain structural issues: 0
- No malformed structured records.

## Metadata Integrity

- 11 subjects exist: yes
- 48 topics exist: yes
- every question subjectId/topicId resolves: yes
- every topic belongs to the question's subject: yes

## Source Preservation

Compared live documents to `SET_A_metadata_import_ready.jsonl` using importer flatten (`prepareQuestionPresentation`) for stored `questionText` / sanitized `content`.

- matched: 250/250
- mismatches: 0
- No mismatches.

## Duplicate result

Importer semantics: same subject + exact `questionText`, plus whitespace/case-normalized text.

- exact duplicates: 0
- normalized questionText duplicates: 0
- duplicate sourceQuestionNumber on documents: n/a (field absent)
- duplicate sourceQuestionNumber in JSONL: 0

## API Contract

Inspected `projectPublicQuestion` in `backend/src/services/questionService.js` and `presentationFieldsFromQuestion`.

- `presentationKind` and `content` are copied onto public question payloads (`content` is null for plain).
- Public projection does **not** include `correctAnswers`, `correctAnswerIndex`, `correctAnswerValue`, or `explanation`.
- Admin `projectQuestion` includes answers (admin-only). Admin picker rows include `presentationKind` and flattened `questionText` but omit `content` (list payload); edit/get-by-id uses the full document.
- Missing `presentationKind` normalizes to `plain`. Structured payloads still include `questionText` (flattened) **and** `content` so clients are not limited to flattened text.

## Admin Compatibility

Inspected `admin/src/pages/AddQuestion.jsx` and `QuestionPresentationFields.jsx`.

- Question Type select: Single Correct / Multiple Correct / Image Based.
- Presentation select: Plain / Two Statements / Numbered List / Table, documented as independent of type.
- Plain: question text editor; structured content not required; edit sends `content: null`.
- Two statements: intro, two label/text rows, prompt.
- Numbered list: intro, items with n + text, prompt, add/remove.
- Table: intro, columns/rows with synchronized cells, prompt.
- Missing `presentationKind` on load uses `normalizePresentationKind` → plain.
- Structured submit uses `buildPresentationPayload`, which **omits** client-built `questionText` so the backend flattens.

## Mobile Compatibility

Inspected `mobile/src/components/QuestionPresentation.js`, `TestScreen.js`, `ReviewAnswersScreen.js`, `mobile/src/utils/questionPresentation.js`.

- Both TestScreen and ReviewAnswersScreen render `QuestionPresentation`.
- Plain / two_statements / numbered_list / table have separate render paths.
- Invalid/missing structured content falls back to plain `questionText`.
- Options, selection, scoring, and navigation stay in the parent screens.

## Mock/PYQ Compatibility

Inspected `backend/src/models/Question.js` and `backend/src/models/Test.js`.

- `presentationKind` / `content` live on **Question**, not Test.
- `Test.kind` is `mock` | `previous_year` (product). `Test.questionIds[]` are Question ObjectIds with no presentation filter.
- Mock tests, previous-year papers, daily practice, and battle all consume Question documents. Structured SET A questions are therefore usable in any of those features without a PYQ-only restriction.

## Snapshot/Scoring Compatibility

Inspected `attemptResultSnapshot.js`, `learningSessionSnapshot.js`, `battleQuestionSnapshot.js`, `testAttemptService.js`, `practiceRevealService.js`, `questionScoring.js`.

- New snapshots spread `presentationFieldsFromQuestion` (`presentationKind` + `content`).
- Placeholder/legacy snapshot items default `presentationKind: 'plain'` and `content: null`.
- `scoreQuestionSession` scores from `correctAnswers` / option indexes only; it does not read `presentationKind`.

## Representative Questions

- **Q1** _id=`6a9fd2229ad821dc3f065e75` kind=two_statements type=single_correct subject=Indian Polity topic=Laws and Rights options=4 correctAnswers=[3] contentValid=true
- **Q2** _id=`6a9fd2229ad821dc3f065e76` kind=numbered_list type=single_correct subject=Science and Technology topic=Space Technology options=4 correctAnswers=[1] contentValid=true
- **Q3** _id=`6a9fd2229ad821dc3f065e77` kind=plain type=single_correct subject=History and Culture topic=Modern India options=4 correctAnswers=[0] contentValid=true
- **Q8** _id=`6a9fd2229ad821dc3f065e7c` kind=table type=single_correct subject=Environment topic=Biodiversity and Wildlife options=4 correctAnswers=[1] contentValid=true

Expected kinds: Q1 two_statements, Q2 numbered_list, Q3 plain, Q8 table.

## Warnings

- Question documents do not store sourceQuestionNumber. SET A 1–250 identity is recovered by joining flattened questionText + subjectId to SET_A_metadata_import_ready.jsonl. Smallest future fix: persist sourceQuestionNumber (or an import batch tag) on Question if product needs booklet order in Mongo.

## Failures

- none

## Final Verdict

PASS WITH WARNINGS
