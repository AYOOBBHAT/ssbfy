# SET A — Import Final Verification

Status: **SUCCESS**

Database: `ssbfy`

Input: `SET_A_metadata_import_ready.jsonl`
Metadata SHA-256: `17901c2f7ceaba12908ed331af12bb914265a2cbe65946d832f4001cbe06dcfa`

Importer: existing `parseImportBuffer` + `analyzeRows` + `commitValidRows`
forceImportDuplicates: false

Verification uses the importer flatten (`prepareQuestionPresentation`) for structured stems, which is the `questionText` stored on Question documents.

## Counts

| Metric | Count |
|---|---:|
| Question count before | 0 |
| Question count after | 250 |
| Imported | 250 |
| Matched 1–250 | 250 |
| Insert errors | 0 |
| Duplicates | 0 |
| Invalid | 0 |
| Subjects | 11 |
| Topics | 48 |

## Subject Distribution

| Subject | Questions |
|---|---:|
| Agriculture | 14 |
| Defence | 12 |
| Economy | 30 |
| Environment | 30 |
| Geography | 22 |
| Governance and Schemes | 15 |
| Health | 20 |
| History and Culture | 30 |
| Indian Polity | 26 |
| International Relations | 22 |
| Science and Technology | 29 |

## Topic Distribution

| Subject | Topic | Questions |
|---|---|---:|
| Agriculture | Agricultural Policy and Institutions | 4 |
| Agriculture | Crops and Commodities | 7 |
| Agriculture | Farm Inputs and Technology | 3 |
| Defence | Armed Forces and Platforms | 2 |
| Defence | Defence Cooperation | 2 |
| Defence | Military History and Operations | 2 |
| Defence | Missile and Weapon Systems | 6 |
| Economy | Banking and Monetary Policy | 3 |
| Economy | Financial Markets and Taxation | 5 |
| Economy | Indian Economy and Surveys | 4 |
| Economy | Public Finance and Budget | 6 |
| Economy | Trade Industry and Infrastructure | 12 |
| Environment | Biodiversity and Wildlife | 13 |
| Environment | Climate Change | 7 |
| Environment | Pollution and Environmental Regulation | 7 |
| Environment | Wetlands and Conservation | 3 |
| Geography | Indian Geography | 5 |
| Geography | Physical Geography | 8 |
| Geography | Rivers and Water Resources | 3 |
| Geography | Transport Infrastructure | 1 |
| Geography | World Geography | 5 |
| Governance and Schemes | Administration and e-Governance | 4 |
| Governance and Schemes | Education and Skills | 5 |
| Governance and Schemes | Social Welfare Schemes | 5 |
| Governance and Schemes | Urban Development | 1 |
| Health | Diseases and Public Health | 13 |
| Health | Medicines and Therapeutics | 5 |
| Health | One Health and Food Safety | 2 |
| History and Culture | Ancient and Medieval India | 7 |
| History and Culture | Art Architecture and Heritage | 8 |
| History and Culture | Culture Festivals and Sports | 7 |
| History and Culture | Modern India | 8 |
| Indian Polity | Centre-State Relations | 3 |
| Indian Polity | Constitutional Bodies | 1 |
| Indian Polity | Fundamental Rights | 4 |
| Indian Polity | Judiciary | 5 |
| Indian Polity | Laws and Rights | 10 |
| Indian Polity | Parliament | 3 |
| International Relations | Global Reports and Indices | 4 |
| International Relations | India's Bilateral Relations | 4 |
| International Relations | International Organisations | 8 |
| International Relations | World Affairs and Conflicts | 6 |
| Science and Technology | Biotechnology | 3 |
| Science and Technology | Chemistry and Materials | 1 |
| Science and Technology | Digital Technology and AI | 3 |
| Science and Technology | Energy and Nuclear Science | 7 |
| Science and Technology | Physics and Research | 5 |
| Science and Technology | Space Technology | 10 |

## Structured presentation

| Kind | Count |
|---|---:|
| plain | 49 |
| two_statements | 8 |
| numbered_list | 179 |
| table | 14 |

## Duplicate results

No duplicates.

## Integrity

All 250 SET A records are present. Every question has a valid subjectId and topicId; each topic belongs to its subject. correctAnswers, questionType, presentationKind, content, options, and stored questionText are preserved. Questions before import were 0, so no existing questions were modified or deleted.

## MongoDB operations

- inserts: 250
- updates: 0
- deletes: 0
