# SET A import dry-run report (Phase 5C)

Mechanical merge + offline validation + **attempted** admin dry-run.

Not modified:

- `SET_A_structured.jsonl`
- `SET_A_answer_key.json`
- `SET_A_final_answer_key_proposed.json`

Not called: `POST /questions/admin/import/commit`.

No MongoDB writes. No `forceImportDuplicates`. No Phase 5D.

## Offline validation

| Check | Result |
|---|---|
| Source records | 250 |
| Import-ready records | 250 |
| Answers merged | 250 (no nulls) |
| Join | `sourceQuestionNumber` == proposed `questionNumber` == line position 1–250 |
| Importer shape (`validateJsonRecordShape` + `prepareQuestionPresentation`) | 250/250 pass |
| Content/options/presentation vs source | identical except added `correctAnswers` |

Scripts run (all passed, no Mongo writes):

- `npm run verify:set-a-jsonl` — 16 checks
- `npm run verify:set-a-answer-key` — 11 checks
- `npm run verify:set-a-answer-audit` — 13 checks
- `npm run verify:set-a-final-answer-key` — 13 checks
- `npm run verify:set-a-import-ready` — 24 checks
- `npm run verify:question-import-jsonl` — 15 checks
- `npm run verify:question-presentation` — 10 checks
- `npm run verify:practice-scoring` — all checks passed

Merge script was run twice; `SET_A_import_ready.jsonl` SHA-256 was identical both times.

### Presentation distribution

| presentationKind | Count |
|---|---|
| numbered_list | 179 |
| plain | 49 |
| table | 14 |
| two_statements | 8 |
| **Total** | **250** |

### Answer distribution

Joined from the **proposed** key only (A→0, B→1, C→2, D→3).

| Letter | Index | Count |
|---|---|---|
| A | 0 | 67 |
| B | 1 | 82 |
| C | 2 | 65 |
| D | 3 | 36 |
| **Total** | | **250** |

Q38 remains C / `[2]` (CANNOT_VERIFY, low). Q94 remains A / `[0]` (UNCERTAIN, medium). Confidence fields are **not** stored on import-ready records; letters were not upgraded.

Proposed-key letter changes carried through:

- Q88 A → `[0]`
- Q120 C → `[2]`
- Q151 A → `[0]`

## Dry-run result

**HTTP dry-run was not executed.**

Safety preflight (required before any request):

1. Target would have been **only** `POST /api/questions/admin/import/dry-run` (the Phase 4 production dry-run handler). That handler calls `analyzeRows` and does **not** call `commitValidRows`.
2. Local `GET /health` was not reachable.
3. `backend/.env` is absent. Server startup requires `MONGODB_URI` and `JWT_SECRET`.
4. Process environment has neither `MONGODB_URI` nor `JWT_SECRET`.
5. No admin JWT is available. The route uses `adminChain` (`authenticate` + `requireRole(admin)`).
6. `analyzeRows` always calls `buildLookupCaches()` (Mongo **reads** of subjects/topics, then duplicate lookup). A live dry-run still needs a database session even though it does not insert questions.

Because a live request could not be issued against a known local dry-run server with admin auth, the request was **not** sent. Production was not used.

| Field | Value |
|---|---|
| total | not observed (request not sent) |
| valid | not observed |
| invalid | not observed |
| duplicates | not observed |
| would import | not observed |
| errors | not observed |

Expected if the same file were posted to the existing dry-run endpoint **without inventing subject/topic**: all 250 rows invalid on metadata (see below). That is a code-path prediction, not a live HTTP result.

## Errors

No live dry-run errors. Offline importer-shape validation reported **0** invalid records.

## Duplicate records

Not observed (dry-run not executed). Offline JSONL has 250 unique `sourceQuestionNumber` values and 250 unique record blobs. Duplicate detection in the importer is `subjectId + normalized flattened questionText`; without a resolved subject the live pipeline never reaches that check.

## Metadata issues

SET A source does **not** provide `subject`, `topic`, `difficulty`, `year`, `explanation`, or `postIds`. They were **not** invented.

The existing importer (`resolveSubjectAndTopic` in `questionImportService.js`) requires:

- `subject is required`
- `topic is required`

Those checks run during dry-run **and** commit after JSON shape validation. Missing names/ids will reject every row even when `correctAnswers` and presentation are valid.

`validateJsonRecordShape` (offline) does **not** require subject/topic; that is why offline validation can pass while a live dry-run would still fail 250/250 until metadata is assigned in a later, explicit phase.

Do not invent subject/topic to force a green dry-run.

## Safety

- Commit endpoint was **NOT** called.
- No Question documents were created.
- No existing Question documents were modified.
- No `forceImportDuplicates` was used.
- Original JSONL, original answer key, and proposed final answer key were not modified.
- Importer logic, Question schema, scoring, mobile, and admin UI were not modified.

## Hashes

Unchanged sources:

- `SET_A_structured.jsonl`: `8025d729630c783c6c3b0d3ae33e3fc3322faa34356c8a9b263e94b8926e0fb4`
- `SET_A_answer_key.json`: `07f77efbc334ca63e8c13b44c36adcf45c12fa86f7f839cf87351d4ee206b259`

This phase:

- `SET_A_final_answer_key_proposed.json`: `1ba869a795b0bd6bd2c3b14c0d313f7166a1a645d1a4fb7f3c31336e44bfb4d8`
- `SET_A_import_ready.jsonl`: `7aad2b3b0a772c1807dce9c326d599e204a99293fae2cd10e1248e4b4db03f40`

## Stop

Phase 5C ends here. Do not commit. Do not start Phase 5D.
