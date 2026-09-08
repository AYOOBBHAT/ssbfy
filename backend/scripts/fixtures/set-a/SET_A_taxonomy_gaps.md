# SET A taxonomy gaps (Phase 5D)

Proposal only. **No subjects or topics were created.**

Live SSBFY taxonomy was **not readable**. Gaps below are relative to (a) an empty inspected catalog and (b) SET A’s actual content. They are **not** instructions to add UPSC-style subjects unless those names already exist in the live database.

## Questions that fit existing taxonomy cleanly

**None confirmed.** The live subject/topic list is unknown. After a read-only catalog dump, many SET A items will likely map 1:1 onto whatever the admin already named (for example a Polity topic covering Fundamental Rights). That matching is deferred to Phase 5E.

## Questions that need a broader existing topic

**Unknown until the live topic list exists.** If SSBFY only has coarse topics (e.g. one “General Studies” topic), many SET A items could use that broader topic — but inventing “General Studies / Miscellaneous” now is forbidden.

## Questions for which no existing topic exists

**All 250**, relative to the inspected (empty) catalog.

Content clusters in SET A that a later catalog would need to cover (labels are **content**, not SSBFY identifiers):

| Content cluster | Approx. Q count | Example Qs |
|---|---:|---|
| Polity & Constitution / law | ~35 | 1, 10, 11, 18, 19, 40, 44, 55, 66, 76, 109, 112, 118, 133, 142, 149, 175, 186, 201, 205, 208, 216, 218 |
| Economy, budget, banking, trade | ~35 | 4, 5, 20, 22, 37, 60, 61, 65, 89, 101, 108, 120, 127, 132, 141, 144, 164, 174, 192, 196, 234, 237 |
| Geography (physical, Indian, world) | ~30 | 6, 12, 30, 34, 56, 70, 82, 86, 91, 106, 136, 160, 161, 170, 184, 188, 204, 225, 228, 232, 236, 249 |
| Environment & ecology | ~30 | 8, 15, 29, 36, 39, 41, 43, 74, 85, 88, 92, 105, 114, 117, 135, 137, 140, 145, 177, 179, 211, 244, 248 |
| Science & technology / space / energy | ~40 | 2, 3, 32, 35, 42, 63, 68, 72, 75, 99, 100, 102, 121, 122, 126, 157, 162, 166, 167, 171, 195, 213, 215, 222, 238, 245 |
| Defence & internal security | ~15 | 7, 31, 46, 53, 115, 116, 138, 147, 165, 189, 206 |
| International relations / reports | ~25 | 14, 33, 50, 64, 95, 96, 111, 143, 152, 156, 169, 210, 223, 227, 240, 241, 243, 247 |
| History, art & culture | ~25 | 9, 16, 17, 25, 38, 48, 59, 67, 113, 134, 146, 151, 153–155, 176, 182, 183, 187, 190, 193, 198, 214, 220, 235, 239, 250 |
| Governance, schemes, social justice | ~20 | 23, 54, 71, 87, 90, 103, 104, 123, 129, 131, 139, 163, 180, 181, 202, 221, 233, 242 |
| Health & medicine | ~20 | 13, 24, 26, 27, 52, 69, 80, 83, 93, 107, 124, 148, 197, 199, 203, 207, 219, 230, 231 |
| Agriculture | ~12 | 49, 79, 97, 110, 125, 130, 159, 173, 191, 200, 246 |

Counts overlap where a question sits on a boundary (listed once by primary content).

## Possible missing topics

**Do not create these now.** After the live catalog is dumped, compare it to the clusters above. Only then decide whether to:

- map onto an existing broader topic,
- add a new topic under an **existing** subject,
- leave a question unmapped,
- or exclude it from the first import.

Likely missing **if** the live catalog is JKSSB-job oriented rather than UPSC-GS (unknown):

- Constitutional law / Fundamental Rights
- Union Budget / banking
- Biodiversity & wetlands
- Indian space programme
- Defence systems
- Ancient/medieval Indian history
- Government schemes

If the live catalog already has those exact names, use those names — do not duplicate them.

## Next step (not this phase)

Read-only dump of `subjects` and `topics` (`find` only, `autoIndex: false`), then remap SET A onto **those exact names**. Do not merge into `SET_A_import_ready.jsonl` until that mapping is approved (Phase 5E).
