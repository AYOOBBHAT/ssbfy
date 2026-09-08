# SET A — Gate 2 Dry Run

Status:
**BLOCKED — DRY-RUN NOT EXECUTED**

Database:
`ssbfy` (not connected in this session)

Input:
`SET_A_metadata_import_ready.jsonl` — **file not present on disk**

## Blockers

1. `backend/scripts/fixtures/set-a/SET_A_metadata_import_ready.jsonl` does not exist in this workspace. Catalog result files (`SET_A_catalog_creation_result.md` / `.json`) are also absent. The catalog plan is still `AWAITING_GATE_1_APPROVAL`.
2. `backend/.env` exists but is empty (0 bytes). `MONGODB_URI` is unset. Local `mongodb://127.0.0.1:27017` refused the connection.
3. `JWT_SECRET` is unset. The HTTP dry-run route requires `adminChain` (`authenticate` + admin role). No admin JWT is available. Fake credentials were not created. Authentication was not bypassed.

Because of (1)–(3), the existing importer dry-run was **not** invoked.

## Existing importer (inspected, not executed)

| Piece | Location |
|---|---|
| Service | `backend/src/services/questionImportService.js` — `analyzeRows` (dry-run), `commitValidRows` (writes) |
| Parse | `parseImportBuffer` — JSONL / JSON / CSV |
| Dry-run HTTP | `POST /questions/admin/import/dry-run` — calls `analyzeRows` only; does **not** call `commitValidRows` |
| Commit HTTP | `POST /questions/admin/import/commit` — **not called** |
| Auth | `adminChain` on both import routes |
| CLI | None |
| Subject/topic | Exact name (case-insensitive) **or** ObjectId; topic must belong to subject; inactive rejected |
| Duplicates | In-batch key `subjectId::normalized questionText`, then `questionRepository.findExactDuplicate` |
| `forceImportDuplicates` | Commit-only, default false. Dry-run never inserts. Unused here. |

Intended dry-run method (blocked): call the same `analyzeRows` function the dry-run controller uses, with mongoose `autoIndex: false` (not `connectDb()`, which enables autoIndex in development). HTTP was not used because there is no admin JWT and no running API.

`commitValidRows` was not imported for execution. `forceImportDuplicates` was not set.

## Summary

| Metric | Count |
|---|---:|
| Total records | not run |
| Valid | not run |
| Invalid | not run |
| Database duplicates | not run |
| In-file duplicates | not run |
| Subject failures | not run |
| Topic failures | not run |
| Question validation failures | not run |

## Subject Distribution

Not computed. Dry-run did not run.

## Topic Distribution

Not computed. Dry-run did not run.

## Validation Errors

Dry-run did not run. No per-question importer errors are available.

## Duplicate Results

Dry-run did not run.

## Structured Presentation

Not computed from the metadata-enriched file (file missing). Source `SET_A_import_ready.jsonl` still contains:

| Presentation Kind | Count |
|---|---:|
| plain | 49 |
| two_statements | 8 |
| numbered_list | 179 |
| table | 14 |
| **Total** | **250** |

## Answer Distribution

Not computed from the metadata-enriched file (file missing). Source `SET_A_import_ready.jsonl` still contains:

| Letter | Index | Count |
|---|---:|---:|
| A | 0 | 67 |
| B | 1 | 82 |
| C | 2 | 65 |
| D | 3 | 36 |
| **Total** | | **250** |

## Database before/after

| Collection | Before | After |
|---|---:|---:|
| questions | not read | not read |
| subjects | not read | not read |
| topics | not read | not read |

No MongoDB session was opened. Counts could not change because no database operations ran.

## Hashes

| File | SHA-256 | Status |
|---|---|---|
| `SET_A_import_ready.jsonl` | `7aad2b3b0a772c1807dce9c326d599e204a99293fae2cd10e1248e4b4db03f40` | unchanged |
| `SET_A_structured.jsonl` | `8025d729630c783c6c3b0d3ae33e3fc3322faa34356c8a9b263e94b8926e0fb4` | unchanged |
| Original answer key | `07f77efbc334ca63e8c13b44c36adcf45c12fa86f7f839cf87351d4ee206b259` | unchanged |
| `SET_A_metadata_import_ready.jsonl` | n/a | **file missing — not modified** |

## Safety

NO QUESTION IMPORT WAS PERFORMED.
NO QUESTION DOCUMENTS WERE WRITTEN.
NO QUESTION DOCUMENTS WERE MODIFIED.
NO QUESTION DOCUMENTS WERE DELETED.
NO SUBJECT/TOPIC CHANGES WERE MADE.

To unblock:

1. Put a real `MONGODB_URI` (database `ssbfy`) in `backend/.env`.
2. Place `SET_A_metadata_import_ready.jsonl` (250 records with `subject`/`topic`) at `backend/scripts/fixtures/set-a/`.
3. Re-run this Gate 2 dry-run only. Do not import until that dry-run passes and you type `APPROVE GATE 2 IMPORT`.
