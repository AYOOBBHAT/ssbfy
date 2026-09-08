# SET A — Gate 2 Dry Run

Status:
**BLOCKED — DRY-RUN NOT EXECUTED**

Database:
`ssbfy`

Input:
`SET_A_metadata_import_ready.jsonl`

## Blockers

1. `SET_A_metadata_import_ready.jsonl` does not exist at C:\Users\AYOOB\OneDrive\Desktop\ssbfy\backend\scripts\fixtures\set-a\SET_A_metadata_import_ready.jsonl.
2. MONGODB_URI is unavailable. No MongoDB session was opened.

This wrapper invokes existing `parseImportBuffer` + `analyzeRows` only.
`commitValidRows` is not imported. HTTP admin endpoints were not called.
Fake credentials were not created.

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

## Database before/after

Not read (blocked before a Mongo dry-run session), or blocked after a failed preflight.

## Hashes

| File | SHA-256 | Status |
|---|---|---|
| `SET_A_import_ready.jsonl` | `7aad2b3b0a772c1807dce9c326d599e204a99293fae2cd10e1248e4b4db03f40` | unchanged |
| `SET_A_structured.jsonl` | `8025d729630c783c6c3b0d3ae33e3fc3322faa34356c8a9b263e94b8926e0fb4` | unchanged |
| Original answer key | `07f77efbc334ca63e8c13b44c36adcf45c12fa86f7f839cf87351d4ee206b259` | unchanged |
| `SET_A_metadata_import_ready.jsonl` | n/a | missing |

NO QUESTION IMPORT WAS PERFORMED.
NO QUESTION DOCUMENTS WERE WRITTEN.
NO QUESTION DOCUMENTS WERE MODIFIED.
NO QUESTION DOCUMENTS WERE DELETED.
NO SUBJECT/TOPIC CHANGES WERE MADE.
