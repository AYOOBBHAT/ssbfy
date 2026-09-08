# Phase 8 — JKSSB Question Warning Fixes

## Scope

Code-only fixes for three Phase 7 warnings:

1. Admin duplicate detection skipped structured presentations.
2. Mobile numbered-list parsing was looser than backend validation.
3. Admin Test picker showed flattened `questionText` with no presentation kind.

Out of scope (intentionally unchanged):

- SET A → Test / PYQ / Post / year
- Question schema, `presentationKind` values, `content` shape, scoring
- `GET /questions?ids=` payload size
- MongoDB writes, indexes, migrations, imports

## Duplicate Detection

### before

Soft duplicate lookup is `GET /questions/admin/similar` → `questionService.findSimilar` → `questionRepository.findExactDuplicate` / `findSimilar`.

Comparison is **normalized `questionText`** within the same `subjectId` (`normalizeForDuplicate`: lowercase, collapse whitespace). There is **no unique index** and create is not blocked server-side.

`AddQuestion.jsx` only called similar when `presentationKind === plain`, so two_statements / numbered_list / table never hit that path.

### after

The existing similar API and `normalizeForDuplicate` are unchanged for callers that send `questionText`.

- Backend: `canonicalDuplicateStem()` in `questionPresentation.js` produces the same stem the write path stores (`prepareQuestionPresentation` flatten for structured; trimmed `questionText` for plain / missing kind). `findSimilar` uses that helper so a future structured payload stays consistent.
- Admin: `duplicateStemFromForm()` flattens valid structured content with the **same flatten rules** as the backend, then sends that stem as `questionText` to the existing GET. Incomplete structured forms produce `''` and skip lookup (same as empty plain text).
- Exact-duplicate “Save anyway” gate now applies to **all** presentation kinds. Near-duplicate list is shown for structured too.

Create still does not hard-block duplicates (same as before). Import CSV duplicate detection was not changed.

### implementation

- `backend/src/utils/questionPresentation.js` — `canonicalDuplicateStem`
- `backend/src/services/questionService.js` — `findSimilar` uses it
- `admin/src/utils/questionPresentationForm.js` — `flattenQuestionContentToText`, `duplicateStemFromForm`
- `admin/src/pages/AddQuestion.jsx` — similar effect + submit gate for all kinds

Structured creates still **omit** `questionText` on save; flatten is lookup-only.

### tests

Backend `verify-question-presentation`: matching two_statements / numbered_list stems collide; different content does not; incomplete numbered_list stem is `''`; missing kind is plain.

Admin `verify-question-presentation`: plain stem; matching structured collide; different table/list do not; incomplete two_statements stem is `''`.

## Numbered List Consistency

### backend rules (unchanged)

`sanitizeNumberedList`: 2–20 items; `n` positive integer (`>= 1`); non-empty text; intro/prompt optional. Supplied `n` is stored as-is (not renumbered).

### mobile behavior

**Before:** any integer `n` (including 0 / negative); at least one item; empty text allowed.

**After:** 2–20 items; `n` must be an integer `>= 1`; item text must be non-empty after trim. Valid lists still display **supplied `n`** in order. Malformed lists fall back to `questionText` (plain). No crash, no mutation.

### changes

`mobile/src/utils/questionPresentation.js` `parseNumberedList` aligned with backend min/max/`n`/text rules.

### tests

Existing test still checks `n: [3, 1, 2]` is preserved. Added fallback cases: one item, `n: 0`, empty item text.

## Admin Test Picker

### before

`CreateTest.jsx` listed `q.questionText` plus difficulty / subject / topic. `projectAdminPickerRow` already sent `presentationKind` but the UI ignored it.

### after

A small existing-style badge shows:

- Plain
- Two Statements
- Numbered List
- Table

Missing / unknown kind → **Plain** (`presentationKindLabel` / `normalizePresentationKind`). Flattened stem text is unchanged. No structured renderer in the picker.

### UI change

- `admin/src/pages/CreateTest.jsx` — `presentationKindLabel`
- `admin/src/App.css` — `.badge-presentation`

### tests

Admin helper tests for label mapping and CreateTest source wiring.

## Payload Optimization

Intentionally not changed. Large mixed `GET /questions?ids=` payloads remain a known future optimization, not a correctness bug.

## Backward Compatibility

- Missing `presentationKind` → plain (duplicate stem, picker label, mobile render).
- Structured write path still overwrites `questionText` from `content`.
- Scoring / Test.kind / PYQ / Daily / Battle untouched.
- No Question / Test / Post documents written.

## Verification Results

| Check | Result |
|---|---|
| `backend` `verify:question-presentation` | 11 passed |
| `backend` `verify:practice-scoring` | passed |
| `backend` `verify:jkssb-question-format` | PASS WITH WARNINGS (payload only) |
| `admin` `verify:question-presentation` | 23 passed |
| `admin` `npm run build` | passed |
| `mobile` `verify:question-presentation` | 15 passed |
| `mobile` `verify:imports` | passed |
| `admin` `npx eslint` on touched files | **pre-existing** `react-hooks/set-state-in-effect` on CreateTest effects and AddQuestion similar effect (same pattern as before). Not refactored. |

## Files Changed

- `backend/src/utils/questionPresentation.js`
- `backend/src/services/questionService.js`
- `backend/scripts/verify-question-presentation.mjs`
- `backend/scripts/verify-jkssb-question-format-phase7.mjs`
- `admin/src/utils/questionPresentationForm.js`
- `admin/src/pages/AddQuestion.jsx`
- `admin/src/pages/CreateTest.jsx`
- `admin/src/App.css`
- `admin/scripts/verify-question-presentation.mjs`
- `mobile/src/utils/questionPresentation.js`
- `mobile/scripts/verify-question-presentation.cjs`

Running `verify:jkssb-question-format` regenerates `SET_A_phase7_jkssb_question_format_report.md` (read-only Mongo + source inspect). No data writes.

## Files Not Changed

Question / Test / TestAttempt schemas, scoring, Test.kind, SET A JSONL / answer key / live 250 questions, import pipeline, mobile TestScreen fetch API, indexes.

## Database Safety

MongoDB writes: 0  
Questions created / modified / deleted: 0  
Tests created / modified / deleted: 0  
Posts created / modified: 0  
Indexes created / modified: 0  

SET A questions remain unchanged (live counts still 250: 49 / 8 / 179 / 14).

## Remaining Warnings

1. **Payload size** for large mixed tests (`GET /questions?ids=`). Not a Phase 8 correctness issue.
2. Duplicate protection is still **soft** (warning + Save anyway). No unique index. Same as plain questions before.
3. Admin picker still shows flattened `questionText` beside the badge (by design; no full structured preview).
4. Pre-existing Admin eslint `react-hooks/set-state-in-effect` on several effects.

## Final Verdict

**PASS WITH WARNINGS**
