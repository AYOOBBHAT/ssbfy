# SET A final answer review (Phase 5B.2)

Review only. This phase produces a **proposed** key.

Not modified:

- `SET_A_structured.jsonl`
- `SET_A_answer_key.json`

Not created: `SET_A_import_ready.jsonl`.

No MongoDB connection, no importer dry-run, no importer commit, no Phase 5C.

The SET A PDF is a question booklet only. It contains **no answer key**. All letters were originally externally solved, then audited in 5B.1 and re-resolved here where uncertainty remained.

## Final resolution summary

Total questions: 250

High confidence: 219
Medium confidence: 30
Low confidence: 1

CONFIRMED: 219
PROBABLY_CORRECT: 29
UNCERTAIN: 1
LIKELY_WRONG: 0
CANNOT_VERIFY: 1

Answer coverage: 250 letters (A/B/C/D). No null answers.

Letter changes from the original key: 3 (Q88, Q120, Q151). No additional letter changes.

## Changed answers

| Q | Original | Proposed | Reason |
|---|---|---|---|
| 88 | B | A | Only statement 1 is correct. Centre does not notify BHS; Guneri is Gujarat’s first BHS, not second. |
| 120 | D | C | Budget 2025 says seventy per cent of women in economic activities, not hundred per cent. Four of five listed priorities match. |
| 151 | B | A | The incorrect Bhandarkar claim is the 1903 Governor’s Executive Council statement, not the Paramhansa Sabha / Prarthana Samaj statement. |

## Remaining uncertainty

| Q | Proposed | Confidence | Verdict | Why it remains flagged |
|---|---|---|---|---|
| 38 | C | low | CANNOT_VERIFY | Exact PDF term “Jalankantha” is not independently attested. Water-clock is the only defensible option among the four. |
| 94 | A | medium | UNCERTAIN | Nickname pairs are largely non-standard / swapped. No “none” option. A is retained as the least-bad letter. |
| 96 | A | medium | PROBABLY_CORRECT | Strict WHO membership is only Liechtenstein (no “only one” option). A is the 2025 current-affairs reading that also counts the US withdrawal notice. |
| 206 | B | medium | PROBABLY_CORRECT | Official PIB does not confirm “up to 40 km”; later figures are ~80 km. Options omit “1 and 3”. B is the letter if statement 3 is not treated as strictly correct. |
| 3 | A | medium | PROBABLY_CORRECT | “Mahatma Gandhi of Indian Science” is not a settled official epithet; J.C. Bose is the best fit among the given names. |

Q153 remains **A / high / CONFIRMED** (Maharashtra’s first Shivaji temple, not India’s first). It is not unresolved.

## Evidence

### Q88 — B → A (CONFIRMED, high)

SOURCE: Three BHS statements. (1) ecological definition. (2) sites “declared by the Central Government under the Biodiversity Act, 2002.” (3) Guneri inland mangrove is “Gujarat’s second” BHS. Prompt: how many are correct. Options: only one / only two / all three / none.

EXTERNAL EVIDENCE: Biological Diversity Act, 2002, section 37 — the **State Government** may notify Biodiversity Heritage Sites in consultation with local bodies. Indian Express, Times of India, and ANI (30 Jan 2025), citing a Gujarat government / Forest and Environment Department notification: Inland Mangrove Guneri, Lakhpat, Kutch, is Gujarat’s **first** BHS.

REASONING: Statement 1 matches the statutory BHS concept. Statement 2 is false (State, not Centre). Statement 3 is false (first, not second). Only one statement is correct → **A**. Original B is wrong.

### Q120 — D → C (CONFIRMED, high)

SOURCE: Five listed Viksit Bharat 2047 priorities, including “Hundred per cent of women in economic activities.” Options: only two / only three / only four / all five.

EXTERNAL EVIDENCE: Union Budget 2025-26 speech (indiabudget.gov.in), paragraph 5, and the matching PIB summary. The speech lists: (a) zero-poverty; (b) hundred per cent good quality school education; (c) access to high-quality, affordable, and comprehensive healthcare; (d) hundred per cent skilled labour with meaningful employment; (e) **seventy per cent** women in economic activities; (f) farmers making India the food basket of the world.

REASONING: Items 1–4 match the Budget wording. Item 5 does not: the official figure is 70%, not 100%. Exactly four listed statements are correct → **C**. Original D (all five) is wrong.

### Q151 — B → A (CONFIRMED, high)

SOURCE: Which statement is **not** correct about Ramkrishna Gopal Bhandarkar. A: elected member of the Governor’s Executive Council in 1903. B: associated with both Paramhansa Sabha and Prarthana Samaj. C: co-founded Maharashtra Girls Education Society (MGE). D: BORI established in his honour.

EXTERNAL EVIDENCE: Pune Prarthana Samaj institutional note: Bhandarkar joined Paramhansa Sabha and later helped found Prarthana Samaj (1867). Standard biographical record: elected to the **Imperial Legislative Council** in 1903 as a non-official member; nominated to the Bombay Legislative Council 1904–07 — not the Governor’s Executive Council. Huzurpaga / MGE lists Bhandarkar among founders (1884). BORI opened 6 July 1917 to honour him.

REASONING: B, C, and D are correct statements. A is the incorrect statement → the answer is **A**. Original B cannot be the “not correct” option.

### Q28 — B retained (CONFIRMED, high)

SOURCE: Karnataka High Court ruling on central and state green-energy rules. (1) Central rules aimed to let consumers access green energy through open access. (2) KERC state rules allowed purchase of non-renewable energy. (3) Centre could not override the Electricity Act using residuary powers. Options: 1 only / 1 and 3 only / 2 and 3 only / all three.

EXTERNAL EVIDENCE: *Brindavan Hydropower Pvt. Ltd. v. Union of India*, Karnataka High Court, 20 December 2024 (reported on Indian Kanoon / LiveLaw). The court struck down the Electricity (Promoting Renewable Energy Through Green Energy Open Access) Rules, 2022 and the KERC (Terms and Conditions for Green Energy Open Access) Regulations, 2022. It held that open access under the Electricity Act, 2003 lies with State Commissions (ss. 42(2), 181) and that the Centre cannot use residual rule-making under s. 176(2) to usurp that field. The 2022 KERC instrument was **green** open-access regulation, not a regime for purchasing non-renewable energy. Broader 2025 KERC open-access regulations came later, after this judgment.

REASONING: 1 true, 2 false, 3 true → **B**. Letter unchanged.

### Q38 — C retained (CANNOT_VERIFY, low)

SOURCE: PDF and JSONL: “‘Jalankantha’ in ancient times was referred to:” (a) Floating houses (b) A yoga posture (c) Water clock (d) An aquatic flower. The PDF text dump prints **Jalankantha**, matching the JSONL. This is not an extraction error.

EXTERNAL EVIDENCE: Sanskrit / Indological sources attest **jalayantra** / **jala-yantra** as a water instrument, including water-clocks (e.g. Fleet and later jala-yantra notes). No authoritative inscriptional or textbook source was found for the exact spelling “Jalankantha.”

REASONING: Among the four options, water-clock is the only historically defensible meaning if the printed word is a variant of jalayantra. The exact term cannot be verified. Keep **C**, low confidence, CANNOT_VERIFY. Do not silently rewrite the JSONL.

### Q94 — A retained (UNCERTAIN, medium)

SOURCE: PDF pairs match JSONL: Caviar–Golden Diamond; Saffron–Red Diamond; Makhana–Seed Diamond; Pine nuts–Black Diamond. Prompt: how many pairs are correct. Options: only one / only two / only three / all four. There is no “none.”

EXTERNAL EVIDENCE: Common marketing / current-affairs nicknames are not statutory. Typical usage: saffron “red gold” (sometimes “red diamond” in 2025 CA compilations); caviar “black gold” / “black diamond of the sea,” not golden diamond (Alphonso mango is often “golden diamond”); Bihar makhana “black diamond”; pine nuts sometimes “seed diamond.” As written, three of four pairs look swapped.

REASONING: If saffron–red diamond is counted as the one intended match, **A** follows. If none of the nicknames are accepted as standard, the question has no matching option. The item is defective. Original **A** is retained as the least-bad letter, not confirmed.

### Q96 — A retained (PROBABLY_CORRECT, medium)

SOURCE: How many of USA, Liechtenstein, Switzerland, Iran, North Korea are **not part of** WHO. Options: only two / only three / only four / none. There is no “only one.”

EXTERNAL EVIDENCE: WHO membership: Liechtenstein is not a Member State (it is an IHR party). Switzerland, Iran, and the DPRK are members. The United States notified withdrawal on 20 January 2025; under the WHO Constitution the withdrawal is effective **22 January 2026**. During 2025 the US remained a member.

REASONING: A strict 2025 membership count is **only Liechtenstein** — an option the paper does not offer. Original **A** treats USA + Liechtenstein as the two non-members, which matches 2025 current-affairs coverage of the US notice, not the legal effective date. Keep A. Do not force CONFIRMED. Do not invent a different letter.

### Q127 — D retained (CONFIRMED, high)

SOURCE: Which route is **not part of** the Dedicated Freight Corridors. A JNPT–Dadri. B Dankuni–Sahnewal. C Kharagpur–Vijayawada. D Bangalore–Chennai.

EXTERNAL EVIDENCE: DFCCIL / Ministry of Railways: Western DFC is JNPT–Dadri; Eastern DFC is Dankuni–Sahnewal (Ludhiana/Sahnewal–Dankuni). DFCCIL MD statements and DPRs: proposed East Coast DFC is **Kharagpur–Vijayawada**. The Southern DFC concept is typically Madgaon/Goa–Chennai, not a named Bangalore–Chennai DFC.

REASONING: The stem does not restrict the question to the two commissioned corridors. A, B, and C are DFC alignments (operational or proposed). D is not → **D**.

### Q166 — D retained (CONFIRMED, high)

SOURCE: Crew-9 scientific achievements: (1) flame spread in microgravity; (2) microalgae converting CO2 to oxygen; (3) European Enhanced Exploration Exercise Device combining cycling, rowing, and resistance; (4) microbial samples from the ISS exterior. Options include all four.

EXTERNAL EVIDENCE: NASA, “Ahead of Crew Return, NASA’s Crew-9 Concludes Science Mission”: SoFIE-RTDFS / flame-spread work; Nick Hague processed Arthrospira C (photosynthetic micro-algae converting CO2 to O2); Butch Wilmore installed/evaluated E4D; Wilmore swabbed the ISS exterior for ISS External Microorganisms. Wilmore returned with Crew-9.

REASONING: All four statements match NASA’s Crew-9 science wrap-up → **D**.

### Q206 — B retained (PROBABLY_CORRECT, medium)

SOURCE: VL-SRSAM statements. (1) ship-based naval short-range air defence. (2) procured from France. (3) destroy targets at a range of up to 40 km. Options: 1 and 2 only / **1 only** / 2 and 3 only / 2 only. There is no “1 and 3.”

EXTERNAL EVIDENCE: PIB (24 June 2022): VL-SRSAM is an indigenous DRDO / Indian Navy ship-borne system to neutralise aerial threats at close ranges, including sea-skimming targets. It is not a French procurement. PIB does not state “up to 40 km.” Earlier reporting used ~40–50 km; later parliamentary / defence notes cite about **80 km**.

REASONING: 1 true, 2 false. Statement 3 is not a clean official figure for the system as later described, and accepting it would leave no matching option. Original **B** (1 only) is the defensible letter. Residual range ambiguity keeps it below CONFIRMED.

## Extraction issues

The structured JSONL was not edited. PDF vs JSONL checks for the known extraction-flagged items:

| Q | PDF vs JSONL | Effect on the key |
|---|---|---|
| 8 | Three-column table matches (Vembanad/Ashtamudi–Kerala; Kaas–Uttar Pradesh; Yaya Tso–Ladakh). | Confirmed B. Kaas is Maharashtra, not UP. |
| 34 | Ocean-trench table matches. | Unaudited high original; not reopened. |
| 38 | PDF prints “Jalankantha”; JSONL matches. Not an OCR invention. | Still CANNOT_VERIFY on the term itself. |
| 94 | Pairs match; prompt sat on the following PDF page. | UNCERTAIN; letter A retained. |
| 146 | WH–dynasty wrapping matches JSONL. | PROBABLY_CORRECT A. |
| 168 | Nuclear-plant table matches. | Unaudited / not letter-changed. |
| 176 | Pottery pairs match JSONL. | CONFIRMED D (none of the pairs are standard). |
| 222 | PDF option letters e–h stored as A–D in JSONL (layout). Content of the two AMoRE statements matches. | No letter change. |
| 223 | Rescue-operation table matches. | No letter change. |
| 227 | Conflict-location table matches. | No letter change. |
| 245 | Jupiter-mission table matches. | No letter change. |
| 250 | Painting table matches, including the PDF spelling “Odissa.” | CONFIRMED D (how many pairs are not correct). |

No JSONL rewrite is recommended in this phase.

## Integrity

SHA-256 (must remain unchanged):

- `SET_A_structured.jsonl`: `8025d729630c783c6c3b0d3ae33e3fc3322faa34356c8a9b263e94b8926e0fb4`
- `SET_A_answer_key.json`: `07f77efbc334ca63e8c13b44c36adcf45c12fa86f7f839cf87351d4ee206b259`

The proposed key is a separate file: `SET_A_final_answer_key_proposed.json`.

## Stop

Phase 5B.2 ends here. Do not merge letters into the JSONL, do not create `SET_A_import_ready.jsonl`, and do not start Phase 5C until this proposed key is explicitly approved.
