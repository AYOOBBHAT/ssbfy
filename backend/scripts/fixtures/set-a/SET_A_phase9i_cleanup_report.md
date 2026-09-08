# Phase 9I — Controlled Smoke-Test Cleanup

## Database

- name: `ssbfy`
- host: `memora.evyfu0y.mongodb.net`
- mode: **EXECUTED**
- transaction: yes

## Pre-Cleanup Counts

| Collection | Count |
|---|---:|
| users | 29 |
| questions | 254 |
| tests | 1 |
| posts | 1 |
| testAttempts | 3 |
| results | 2 |
| SET A | 250 |

## Preflight Gates

| Gate | Result | Detail |
|---|---|---|
| database-identity | PASS | ssbfy |
| set-a-count | PASS | 250 |
| set-a-kinds | PASS | {"plain":49,"two_statements":8,"numbered_list":179,"table":14} |
| phase9-questions | PASS | 4 allowlisted questions exist |
| phase9-question-marker | PASS | 4 |
| phase9-test | PASS | exists with exact four question IDs |
| phase9-post | PASS | PHASE9_SMOKE_TEST_2026 — JKSSB Structured Question Test |
| phase9-attempts | PASS | exactly 3 allowlisted attempts |
| old-attempt | PASS | completed |
| new-attempt | PASS | completed |
| open-attempt | PASS | open / incomplete |
| no-extra-attempts | PASS | no other attempts on Phase 9 Test |
| open-has-result | PASS | none |
| phase9-results | PASS | 6aa01e927a012eb44cc636d6, 6aa02a70c3be60ada0ed4814 |
| other-tests | PASS | none |
| other-post-questions | PASS | only the four smoke questions |
| test-postId | PASS | Phase 9 Test.postId is not the smoke Post |
| other-post-content | PASS | none |
| phase9-in-set-a | PASS | none |
| test-includes-set-a | PASS | none |
| attempts-include-set-a | PASS | none |
| deletion-set-a | PASS | question deletion set has 4 Phase 9 IDs and 0 SET A IDs |
| secondary-attempt-refs | PASS | none |
| analytics-refs | PASS | none |
| extra-collection-refs | PASS | none |
| baseline-questions | PASS | 254 |
| baseline-tests | PASS | 1 (Phase 9 only) |
| baseline-posts | PASS | 1 (Phase 9 only) |

## Deletion Allowlist

- Results (discovered): `6aa01e927a012eb44cc636d6`, `6aa02a70c3be60ada0ed4814`
- TestAttempts: `6aa01e727a012eb44cc636c7`, `6aa02a34c3be60ada0ed4805`, `6aa02b6cc3be60ada0ed4884`
- Test: `6aa01e61f2afe2eb763a4bda`
- Questions: `6aa01e60f2afe2eb763a4bc1`, `6aa01e60f2afe2eb763a4bc7`, `6aa01e61f2afe2eb763a4bcd`, `6aa01e61f2afe2eb763a4bd3`
- Post: `6a9fe271a6683cc1b21ccded`

## Deletion Order

1. Results
2. TestAttempts
3. Test
4. Questions
5. Post

## Deleted Results

- `6aa01e927a012eb44cc636d6`
- `6aa02a70c3be60ada0ed4814`

## Deleted Attempts

- `6aa01e727a012eb44cc636c7`
- `6aa02a34c3be60ada0ed4805`
- `6aa02b6cc3be60ada0ed4884`

## Deleted Test

- `6aa01e61f2afe2eb763a4bda`

## Deleted Questions

- `6aa01e60f2afe2eb763a4bc1`
- `6aa01e60f2afe2eb763a4bc7`
- `6aa01e61f2afe2eb763a4bcd`
- `6aa01e61f2afe2eb763a4bd3`

## Deleted Post

- `6a9fe271a6683cc1b21ccded`

## Post-Cleanup Counts

| Collection | Count |
|---|---:|
| users | 29 |
| questions | 250 |
| tests | 0 |
| posts | 0 |
| testAttempts | 0 |
| results | 0 |
| SET A | 250 |
| Phase 9 questions | 0 |
| Phase 9 tests | 0 |
| Phase 9 posts | 0 |
| Phase 9 attempts | 0 |
| Phase 9 results | 0 |

## SET A Protection

SET A before: 250  
SET A after: 250  
SET A deleted: 0  
SET A modified: 0  
Presentation after: {"plain":49,"two_statements":8,"numbered_list":179,"table":14}

## User Protection

Users deleted: 0  
Users modified: 0

## Remaining References

None.

## Verification

User count unchanged.
User ID set unchanged.
SET A still 250.
No SET A question modified (id+updatedAt fingerprint).
No remaining references to Phase 9 IDs in scanned collections.
Global counts match expected post-cleanup totals.

## Final safety statement

Phase 9 Results deleted: 2  
Phase 9 TestAttempts deleted: 3  
Phase 9 Test deleted: 1  
Phase 9 Questions deleted: 4  
Phase 9 Post deleted: 1  

Users deleted: 0  
Users modified: 0  

SET A questions deleted: 0  
SET A questions modified: 0  

Unexpected records deleted: 0

## Final Verdict

**PASS**
