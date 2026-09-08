# SET A — Catalog Creation Plan

Status: AWAITING GATE 1 APPROVAL

Database: `ssbfy`

This plan is derived from `SET_A_taxonomy_proposal.json`. It is **not** a MongoDB write.

- Subjects to create: **11**
- Topics to create: **48**
- Questions mapped (not imported at Gate 1): **250**

Architecture to use after approval:

- `subjectService.create({ name, order })` — omit `postId` (global subjects; model default `isActive: true`)
- `topicService.create({ name, subjectId, order })` — model default `isActive: true`
- Do not use seed scripts, `syncIndexes()`, or `build:indexes`

No MongoDB IDs are included because the catalog does not exist yet.

## Subject totals

| Subject | Questions |
|---|---:|
| Indian Polity | 26 |
| Economy | 30 |
| Geography | 22 |
| Environment | 30 |
| Science and Technology | 29 |
| Defence | 12 |
| International Relations | 22 |
| History and Culture | 30 |
| Governance and Schemes | 15 |
| Agriculture | 14 |
| Health | 20 |

Column total: **250**

## Topic totals

| Subject | Topic | Questions | Question numbers |
|---|---|---:|---|
| Indian Polity | Fundamental Rights | 4 | 10, 44, 66, 109 |
| Indian Polity | Judiciary | 5 | 11, 28, 201, 208, 216 |
| Indian Polity | Parliament | 3 | 19, 55, 218 |
| Indian Polity | Constitutional Bodies | 1 | 149 |
| Indian Polity | Centre-State Relations | 3 | 133, 142, 175 |
| Indian Polity | Laws and Rights | 10 | 1, 18, 40, 76, 81, 112, 118, 119, 186, 205 |
| Economy | Indian Economy and Surveys | 4 | 4, 51, 73, 141 |
| Economy | Banking and Monetary Policy | 3 | 108, 132, 144 |
| Economy | Public Finance and Budget | 6 | 89, 101, 120, 164, 196, 234 |
| Economy | Trade Industry and Infrastructure | 12 | 20, 60, 61, 62, 65, 98, 127, 128, 150, 212, 221, 237 |
| Economy | Financial Markets and Taxation | 5 | 5, 22, 37, 174, 192 |
| Geography | Physical Geography | 8 | 12, 30, 34, 160, 161, 204, 225, 236 |
| Geography | Indian Geography | 5 | 6, 82, 91, 158, 232 |
| Geography | Rivers and Water Resources | 3 | 56, 70, 188 |
| Geography | World Geography | 5 | 86, 106, 170, 184, 228 |
| Geography | Transport Infrastructure | 1 | 249 |
| Environment | Biodiversity and Wildlife | 13 | 8, 29, 41, 45, 47, 84, 85, 88, 105, 135, 140, 178, 211 |
| Environment | Wetlands and Conservation | 3 | 36, 39, 92 |
| Environment | Climate Change | 7 | 15, 58, 117, 137, 145, 177, 179 |
| Environment | Pollution and Environmental Regulation | 7 | 43, 74, 87, 114, 224, 244, 248 |
| Science and Technology | Space Technology | 10 | 2, 42, 99, 100, 166, 167, 171, 213, 238, 245 |
| Science and Technology | Energy and Nuclear Science | 7 | 68, 72, 75, 78, 122, 126, 168 |
| Science and Technology | Physics and Research | 5 | 32, 157, 215, 217, 222 |
| Science and Technology | Biotechnology | 3 | 102, 121, 195 |
| Science and Technology | Digital Technology and AI | 3 | 63, 162, 226 |
| Science and Technology | Chemistry and Materials | 1 | 21 |
| Defence | Missile and Weapon Systems | 6 | 7, 35, 46, 53, 165, 206 |
| Defence | Armed Forces and Platforms | 2 | 116, 147 |
| Defence | Military History and Operations | 2 | 31, 115 |
| Defence | Defence Cooperation | 2 | 138, 189 |
| International Relations | International Organisations | 8 | 14, 77, 96, 111, 209, 210, 243, 247 |
| International Relations | India's Bilateral Relations | 4 | 64, 95, 143, 240 |
| International Relations | Global Reports and Indices | 4 | 33, 156, 169, 172 |
| International Relations | World Affairs and Conflicts | 6 | 50, 136, 152, 223, 227, 241 |
| History and Culture | Ancient and Medieval India | 7 | 38, 176, 182, 187, 190, 198, 235 |
| History and Culture | Modern India | 8 | 3, 25, 59, 151, 154, 155, 185, 193 |
| History and Culture | Art Architecture and Heritage | 8 | 17, 113, 134, 146, 153, 229, 239, 250 |
| History and Culture | Culture Festivals and Sports | 7 | 9, 16, 48, 67, 183, 214, 220 |
| Governance and Schemes | Social Welfare Schemes | 5 | 23, 71, 129, 131, 181 |
| Governance and Schemes | Education and Skills | 5 | 54, 103, 104, 202, 233 |
| Governance and Schemes | Administration and e-Governance | 4 | 57, 90, 180, 242 |
| Governance and Schemes | Urban Development | 1 | 163 |
| Agriculture | Crops and Commodities | 7 | 94, 97, 110, 125, 159, 191, 194 |
| Agriculture | Farm Inputs and Technology | 3 | 49, 130, 246 |
| Agriculture | Agricultural Policy and Institutions | 4 | 79, 123, 173, 200 |
| Health | Diseases and Public Health | 13 | 13, 24, 26, 27, 52, 69, 93, 107, 124, 139, 148, 197, 203 |
| Health | Medicines and Therapeutics | 5 | 80, 83, 199, 219, 230 |
| Health | One Health and Food Safety | 2 | 207, 231 |

Column total: **250**

## Subjects and topics

## Indian Polity

Order: 1
isActive: true
Questions: 26

### Fundamental Rights

Order: 1
isActive: true
Questions: 4

Question numbers: 10, 44, 66, 109

### Judiciary

Order: 2
isActive: true
Questions: 5

Question numbers: 11, 28, 201, 208, 216

### Parliament

Order: 3
isActive: true
Questions: 3

Question numbers: 19, 55, 218

### Constitutional Bodies

Order: 4
isActive: true
Questions: 1

Question numbers: 149

### Centre-State Relations

Order: 5
isActive: true
Questions: 3

Question numbers: 133, 142, 175

### Laws and Rights

Order: 6
isActive: true
Questions: 10

Question numbers: 1, 18, 40, 76, 81, 112, 118, 119, 186, 205

## Economy

Order: 2
isActive: true
Questions: 30

### Indian Economy and Surveys

Order: 1
isActive: true
Questions: 4

Question numbers: 4, 51, 73, 141

### Banking and Monetary Policy

Order: 2
isActive: true
Questions: 3

Question numbers: 108, 132, 144

### Public Finance and Budget

Order: 3
isActive: true
Questions: 6

Question numbers: 89, 101, 120, 164, 196, 234

### Trade Industry and Infrastructure

Order: 4
isActive: true
Questions: 12

Question numbers: 20, 60, 61, 62, 65, 98, 127, 128, 150, 212, 221, 237

### Financial Markets and Taxation

Order: 5
isActive: true
Questions: 5

Question numbers: 5, 22, 37, 174, 192

## Geography

Order: 3
isActive: true
Questions: 22

### Physical Geography

Order: 1
isActive: true
Questions: 8

Question numbers: 12, 30, 34, 160, 161, 204, 225, 236

### Indian Geography

Order: 2
isActive: true
Questions: 5

Question numbers: 6, 82, 91, 158, 232

### Rivers and Water Resources

Order: 3
isActive: true
Questions: 3

Question numbers: 56, 70, 188

### World Geography

Order: 4
isActive: true
Questions: 5

Question numbers: 86, 106, 170, 184, 228

### Transport Infrastructure

Order: 5
isActive: true
Questions: 1

Question numbers: 249

## Environment

Order: 4
isActive: true
Questions: 30

### Biodiversity and Wildlife

Order: 1
isActive: true
Questions: 13

Question numbers: 8, 29, 41, 45, 47, 84, 85, 88, 105, 135, 140, 178, 211

### Wetlands and Conservation

Order: 2
isActive: true
Questions: 3

Question numbers: 36, 39, 92

### Climate Change

Order: 3
isActive: true
Questions: 7

Question numbers: 15, 58, 117, 137, 145, 177, 179

### Pollution and Environmental Regulation

Order: 4
isActive: true
Questions: 7

Question numbers: 43, 74, 87, 114, 224, 244, 248

## Science and Technology

Order: 5
isActive: true
Questions: 29

### Space Technology

Order: 1
isActive: true
Questions: 10

Question numbers: 2, 42, 99, 100, 166, 167, 171, 213, 238, 245

### Energy and Nuclear Science

Order: 2
isActive: true
Questions: 7

Question numbers: 68, 72, 75, 78, 122, 126, 168

### Physics and Research

Order: 3
isActive: true
Questions: 5

Question numbers: 32, 157, 215, 217, 222

### Biotechnology

Order: 4
isActive: true
Questions: 3

Question numbers: 102, 121, 195

### Digital Technology and AI

Order: 5
isActive: true
Questions: 3

Question numbers: 63, 162, 226

### Chemistry and Materials

Order: 6
isActive: true
Questions: 1

Question numbers: 21

## Defence

Order: 6
isActive: true
Questions: 12

### Missile and Weapon Systems

Order: 1
isActive: true
Questions: 6

Question numbers: 7, 35, 46, 53, 165, 206

### Armed Forces and Platforms

Order: 2
isActive: true
Questions: 2

Question numbers: 116, 147

### Military History and Operations

Order: 3
isActive: true
Questions: 2

Question numbers: 31, 115

### Defence Cooperation

Order: 4
isActive: true
Questions: 2

Question numbers: 138, 189

## International Relations

Order: 7
isActive: true
Questions: 22

### International Organisations

Order: 1
isActive: true
Questions: 8

Question numbers: 14, 77, 96, 111, 209, 210, 243, 247

### India's Bilateral Relations

Order: 2
isActive: true
Questions: 4

Question numbers: 64, 95, 143, 240

### Global Reports and Indices

Order: 3
isActive: true
Questions: 4

Question numbers: 33, 156, 169, 172

### World Affairs and Conflicts

Order: 4
isActive: true
Questions: 6

Question numbers: 50, 136, 152, 223, 227, 241

## History and Culture

Order: 8
isActive: true
Questions: 30

### Ancient and Medieval India

Order: 1
isActive: true
Questions: 7

Question numbers: 38, 176, 182, 187, 190, 198, 235

### Modern India

Order: 2
isActive: true
Questions: 8

Question numbers: 3, 25, 59, 151, 154, 155, 185, 193

### Art Architecture and Heritage

Order: 3
isActive: true
Questions: 8

Question numbers: 17, 113, 134, 146, 153, 229, 239, 250

### Culture Festivals and Sports

Order: 4
isActive: true
Questions: 7

Question numbers: 9, 16, 48, 67, 183, 214, 220

## Governance and Schemes

Order: 9
isActive: true
Questions: 15

### Social Welfare Schemes

Order: 1
isActive: true
Questions: 5

Question numbers: 23, 71, 129, 131, 181

### Education and Skills

Order: 2
isActive: true
Questions: 5

Question numbers: 54, 103, 104, 202, 233

### Administration and e-Governance

Order: 3
isActive: true
Questions: 4

Question numbers: 57, 90, 180, 242

### Urban Development

Order: 4
isActive: true
Questions: 1

Question numbers: 163

## Agriculture

Order: 10
isActive: true
Questions: 14

### Crops and Commodities

Order: 1
isActive: true
Questions: 7

Question numbers: 94, 97, 110, 125, 159, 191, 194

### Farm Inputs and Technology

Order: 2
isActive: true
Questions: 3

Question numbers: 49, 130, 246

### Agricultural Policy and Institutions

Order: 3
isActive: true
Questions: 4

Question numbers: 79, 123, 173, 200

## Health

Order: 11
isActive: true
Questions: 20

### Diseases and Public Health

Order: 1
isActive: true
Questions: 13

Question numbers: 13, 24, 26, 27, 52, 69, 93, 107, 124, 139, 148, 197, 203

### Medicines and Therapeutics

Order: 2
isActive: true
Questions: 5

Question numbers: 80, 83, 199, 219, 230

### One Health and Food Safety

Order: 3
isActive: true
Questions: 2

Question numbers: 207, 231

## Gate 1

MongoDB writes are **blocked** until the explicit user message:

`APPROVE GATE 1`

Question import is **not** part of Gate 1.
