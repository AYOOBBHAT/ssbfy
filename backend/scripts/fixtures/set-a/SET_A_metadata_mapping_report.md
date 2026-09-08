# SET A metadata mapping report (Phase 5D)

Read-only mapping plan. `SET_A_import_ready.jsonl` was not modified.
No MongoDB writes. No import dry-run. No import commit.

## Existing Taxonomy

**Live catalog: not inspected.**

`backend/.env` is absent and `MONGODB_URI` is unset. Subjects and topics in SSBFY are **admin-created global documents**, not a seeded list in the repository.

A Subject document is: `name` (globally unique, case-insensitive), optional deprecated `postId`, `order`, `isActive`.

A Topic document belongs to one Subject via required `subjectId`, with unique `(subjectId, name)` (case-insensitive). Topics may have `canonicalTopicId`, `aliases`, `deprecated`, `isActive`.

Importer contract (`resolveSubjectAndTopic`):

- Fields: JSONL `subject` and `topic` (names **or** ObjectIds).
- Both **required**.
- Names are resolved case-insensitively to existing active documents.
- Topic must already exist **under that subject**.
- Missing names fail with `subject is required` / `topic is required` / `subject not found` / `topic not found in subject`.

Because the live catalog could not be read, **no subject or topic names are treated as existing**. Fixture strings below are **not** the SSBFY taxonomy.

### Non-authoritative fixture examples (do not use)

These appear only in import tests / the CSV template:

- Geography → States and Capitals; Agriculture; Physical Geography
- Polity → Union Executive; Directive Principles
- Maths → Arithmetic

Admin UI (`ManageTopics`) creates subjects/topics dynamically; there is no hardcoded catalog in mobile or backend.

## SET A Distribution

| Subject | Topic | Questions |
|---|---|---:|
| (unmapped) | (unmapped) | 250 |

All 250 questions are unmapped. Assigning Geography/Polity/etc. would invent a catalog the project does not define in source.

## Question Mapping

Content notes describe the **question**, not an SSBFY topic id.

| Q | Subject | Topic | Confidence | Reason |
|---|---|---|---|---|
| 1 | — | — | low | Polity/law: transgender identity certificate vs Registration of Births and Deaths Act 1969 |
| 2 | — | — | low | S&T/space: ISRO SpaDeX docking mission |
| 3 | — | — | low | S&T/history of science: Indian scientist epithet (Bose/Sarabhai/Ramanujan/Raman) |
| 4 | — | — | low | Economy: Household Consumption Expenditure Survey 2023-24 |
| 5 | — | — | low | Economy/S&T: ethical AI in finance (MuleHunter, RBI sandbox, NSAI, DPDP) |
| 6 | — | — | low | Geography/culture: Kashmir Chillai Kalan / Pheran Day |
| 7 | — | — | low | Defence: Bayraktar Akinci UCAV manufacturer |
| 8 | — | — | low | Environment: wetlands/BHS sites in news (Vembanad, Kaas, Yaya Tso) |
| 9 | — | — | low | Art & culture/sports: Kho-Kho / Chakravyuha origin |
| 10 | — | — | low | Polity: Fundamental Rights available only to citizens (Arts 16, 19, 28, 29) |
| 11 | — | — | low | Polity/judiciary: rarest-of-rare / RG Kar death-penalty statements |
| 12 | — | — | low | Geography: continents and highest peaks |
| 13 | — | — | low | Health: Non-Alcoholic Steatohepatitis (NASH) |
| 14 | — | — | low | IR: ILO as tripartite UN agency / Treaty of Versailles |
| 15 | — | — | low | Environment/IR: US withdrawal from Paris Agreement impacts |
| 16 | — | — | low | Art & culture: Kalaripayattu linked to Parasurama |
| 17 | — | — | low | History/art: Ratnagiri Buddhist excavations |
| 18 | — | — | low | Polity/law: Enemy Property Act / CEPI |
| 19 | — | — | low | Polity: One Nation One Election constitutional amendments |
| 20 | — | — | low | Economy/trade: Diamond Imprest Authorisation Scheme |
| 21 | — | — | low | S&T/chemistry: synthetic dye Rhodamine B |
| 22 | — | — | low | Economy: grey market trading definition |
| 23 | — | — | low | Governance/schemes: Beti Bachao Beti Padhao |
| 24 | — | — | low | Health: food-borne pathogens (norovirus, Campylobacter, TB) |
| 25 | — | — | low | Modern history: Subhas Chandra Bose organisations |
| 26 | — | — | low | Health: Guillain-Barré Syndrome |
| 27 | — | — | low | Health: snakebite envenoming and antivenoms |
| 28 | — | — | low | Polity/energy law: Karnataka HC green-energy open-access ruling |
| 29 | — | — | low | Environment: Olive Ridley sea turtles |
| 30 | — | — | low | Geography: Pacific Ring of Fire |
| 31 | — | — | low | Modern history/defence: Operation Gibraltar 1965 |
| 32 | — | — | low | S&T/physics: Semi-Dirac fermions |
| 33 | — | — | low | IR/reports: WEF Global Risks Report 2025 |
| 34 | — | — | low | Geography: oceanic trenches and locations |
| 35 | — | — | low | S&T/defence: scramjet engine |
| 36 | — | — | low | Environment: Ramsar Wetland City Accreditation |
| 37 | — | — | low | Economy: crypto exchanges and KYC in India |
| 38 | — | — | low | Ancient history/culture: Jalankantha / water-clock terminology |
| 39 | — | — | low | Environment: Ramsar wetland eligibility criteria |
| 40 | — | — | low | Polity: martial law in the Constitution (Art. 34) |
| 41 | — | — | low | Environment/geography: Chinar tree in Kashmir |
| 42 | — | — | low | S&T/space: NVS-02 / NavIC |
| 43 | — | — | low | Environment/health: Paraquat herbicide |
| 44 | — | — | low | Polity: constitutional provisions ensuring liberty |
| 45 | — | — | low | Environment: corpse flower |
| 46 | — | — | low | Defence: BrahMos vs other missile systems |
| 47 | — | — | low | Environment: Punjab state bird / goshawk |
| 48 | — | — | low | Art & culture: Sthala Vriksha |
| 49 | — | — | low | Agriculture: Nano Urea / IFFCO |
| 50 | — | — | low | IR/geography: Greenland strategic importance for the US |
| 51 | — | — | low | Economy/S&T mixed: India’s 75-year achievements incl. Chandrayaan-3 |
| 52 | — | — | low | Health: antibody / serology tests |
| 53 | — | — | low | Defence: Pralay missile |
| 54 | — | — | low | Governance: ASER survey (Pratham) |
| 55 | — | — | low | Polity: parliamentary whip |
| 56 | — | — | low | Geography: Teesta River and hydropower |
| 57 | — | — | low | Polity: Padma awards |
| 58 | — | — | low | Environment/IR: Paris Agreement and India |
| 59 | — | — | low | Modern history: freedom fighters and contributions |
| 60 | — | — | low | Economy/trade: eCoO 2.0 certificates of origin |
| 61 | — | — | low | Economy/resources: National Critical Mineral Mission list |
| 62 | — | — | low | Economy/law: MMDR Act 2015 mining licences |
| 63 | — | — | low | S&T: DeepSeek AI models and energy use |
| 64 | — | — | low | IR: India–Indonesia ties / exercises / G20 |
| 65 | — | — | low | Economy: Mutual Credit Guarantee Scheme for MSMEs |
| 66 | — | — | low | Polity: SC split verdict on burial rights / Art. 21 |
| 67 | — | — | low | Art & culture: folk dances and states |
| 68 | — | — | low | S&T/energy: OSOWOG / International Solar Alliance |
| 69 | — | — | low | Health: sleeping sickness (HAT) |
| 70 | — | — | low | Geography: Singtam and Munshithang bridges / Teesta |
| 71 | — | — | low | Governance: e-Shram microsites |
| 72 | — | — | low | S&T: nuclear fusion vs fission bombs |
| 73 | — | — | low | Economy/labour: Occupational Shortage Index |
| 74 | — | — | low | Environment: eutrophication of lakes |
| 75 | — | — | low | S&T/energy: EAST tokamak (China) |
| 76 | — | — | low | Polity/law: Prohibition of Child Marriage Act 2006 |
| 77 | — | — | low | IR/law: genocide definition and Genocide Convention |
| 78 | — | — | low | S&T/energy: CNG, sour gas, LNG |
| 79 | — | — | low | Agriculture/economy: Indian agriculture GDP, milk, employment |
| 80 | — | — | low | Health/S&T: Suzetrigine non-opioid painkiller |
| 81 | — | — | low | Polity/law: Himachal cannabis project vs NDPS Act |
| 82 | — | — | low | Geography: Indian coastline origin and length |
| 83 | — | — | low | Health: fentanyl |
| 84 | — | — | low | Environment: Indian squid biology/IUCN |
| 85 | — | — | low | Environment: mangrove “link strength” |
| 86 | — | — | low | Geography: DRC land borders |
| 87 | — | — | low | Environment/governance: C&D Waste Management Rules 2016 |
| 88 | — | — | low | Environment/law: Biodiversity Heritage Sites / Guneri |
| 89 | — | — | low | Economy: Union Budget 2025-26 income-tax cut impacts |
| 90 | — | — | low | Governance/S&T: SwaRail SuperApp |
| 91 | — | — | low | Geography: Indian states bordering Bangladesh |
| 92 | — | — | low | Environment: new Ramsar sites (Jharkhand, Sikkim, Tamil Nadu) |
| 93 | — | — | low | Health: Bickerstaff encephalitis vs GBS |
| 94 | — | — | low | Economy/agriculture: food nicknames (caviar, saffron, makhana, pine nuts) |
| 95 | — | — | low | IR: H-1B visa programme |
| 96 | — | — | low | IR/health: WHO membership (US, Liechtenstein, etc.) |
| 97 | — | — | low | Agriculture: extra-long staple cotton |
| 98 | — | — | low | Economy/infra: Sagarmala |
| 99 | — | — | low | S&T/space: Gaia spacecraft (ESA) |
| 100 | — | — | low | S&T/space: Trojan asteroids |
| 101 | — | — | low | Economy: fiscal deficit definition vs inflation |
| 102 | — | — | low | S&T: genetic modification applications |
| 103 | — | — | low | Governance/schemes: PM Internship Scheme |
| 104 | — | — | low | Governance: NAAC accreditation |
| 105 | — | — | low | Environment/culture: sacred groves (Orans, Devara Kadu, Sarpa Kavu) |
| 106 | — | — | low | Geography: Mount Taranaki (New Zealand) |
| 107 | — | — | low | Health: brucellosis |
| 108 | — | — | low | Economy/banking: SLR and LCR dual liquidity mandates |
| 109 | — | — | low | Polity: Art. 25 and anti-conversion laws |
| 110 | — | — | low | Agriculture: Pulse Mission crops |
| 111 | — | — | low | IR: International Criminal Court / India |
| 112 | — | — | low | Polity: Foreigners Tribunals |
| 113 | — | — | low | Art & culture/IR: Aga Khan IV restorations and Padma |
| 114 | — | — | low | Environment: flue-gas desulphurisation at coal plants |
| 115 | — | — | low | Defence/history: Fort William renamed Vijay Durg |
| 116 | — | — | low | Defence: Stryker ICV |
| 117 | — | — | low | Environment: Arctic warming / albedo |
| 118 | — | — | low | Polity/law: parole in India |
| 119 | — | — | low | Polity/law: Bombay Prevention of Beggary Act 1959 |
| 120 | — | — | low | Economy/governance: Viksit Bharat 2047 Budget priorities |
| 121 | — | — | low | S&T: Human Genome Project |
| 122 | — | — | low | S&T/energy: Atomic Energy Act / CLNDA Budget 2025 |
| 123 | — | — | low | Agriculture/schemes: PM-KISAN |
| 124 | — | — | low | Health/S&T: GARBH-INi-DRISHTI / ferret facility |
| 125 | — | — | low | Agriculture/energy: ethanol feedstocks |
| 126 | — | — | low | S&T/energy: nuclear power share and GHG intensity |
| 127 | — | — | low | Economy/infra: Dedicated Freight Corridors |
| 128 | — | — | low | Economy/infra: Indian Railways network and electrification |
| 129 | — | — | low | Governance/schemes: NAMASTE sanitation |
| 130 | — | — | low | Agriculture: potash / potassium oxide |
| 131 | — | — | low | Governance: National Commission for Safai Karamcharis |
| 132 | — | — | low | Economy: RBI repo-rate cut effects |
| 133 | — | — | low | Polity: Governor’s assent (Art. 200) |
| 134 | — | — | low | Art & culture: National Mission for Manuscripts |
| 135 | — | — | low | Environment: NTCA / tiger reserves |
| 136 | — | — | low | IR/geography: Netzarim Corridor (Gaza) |
| 137 | — | — | low | Environment: La Niña 2025 and global temperature |
| 138 | — | — | low | Defence/IR: India–UK Aero India 2025 agreements |
| 139 | — | — | low | Governance/health: ASHA workers |
| 140 | — | — | low | Environment: Sambar deer / Satkosia |
| 141 | — | — | low | Economy: Gross Domestic Knowledge Product |
| 142 | — | — | low | Polity: President’s Rule |
| 143 | — | — | low | IR: India–UK Young Professionals Scheme |
| 144 | — | — | low | Economy: rupee depreciation factors |
| 145 | — | — | low | Environment: marine heatwaves |
| 146 | — | — | low | Art & culture/history: UNESCO WH sites and dynasties |
| 147 | — | — | low | Defence: INS Imphal / Project 15B |
| 148 | — | — | low | Health: human coronavirus HKU1 |
| 149 | — | — | low | Polity: CAG of India |
| 150 | — | — | low | Economy/culture: GI tags (Katarni rice, Magahi paan, Shahi litchi) |
| 151 | — | — | low | Modern history: R.G. Bhandarkar |
| 152 | — | — | low | IR: Raisina Dialogue |
| 153 | — | — | low | Art & culture: Shivaji temple in Maharashtra |
| 154 | — | — | low | Modern history: Biswedari feudal system (Patiala) |
| 155 | — | — | low | Modern history: Patharughat uprising |
| 156 | — | — | low | IR/reports: Future of Free Speech Index 2025 |
| 157 | — | — | low | S&T: audible enclaves |
| 158 | — | — | low | Geography/history: Ana Sagar Lake, Ajmer |
| 159 | — | — | low | Agriculture: arecanut cultivation |
| 160 | — | — | low | Geography: vernal equinox |
| 161 | — | — | low | Geography: soil erosion sequence (rill/gully/badland) |
| 162 | — | — | low | S&T: Samarth incubation (telecom/IT) |
| 163 | — | — | low | Governance: Smart Cities Mission |
| 164 | — | — | low | Economy: BHIM-UPI incentive scheme |
| 165 | — | — | low | Defence/S&T: sonic weapons |
| 166 | — | — | low | S&T/space: Crew-9 ISS experiments |
| 167 | — | — | low | S&T/space: ISS partner agencies |
| 168 | — | — | low | S&T/energy: Indian nuclear plant–state pairs |
| 169 | — | — | low | IR/reports: World Happiness Report 2025 |
| 170 | — | — | low | Geography: Red Sea littoral states |
| 171 | — | — | low | S&T/space: ISRO YUVIKA |
| 172 | — | — | low | IR/reports: Global Residence Program Index (Henley) |
| 173 | — | — | low | Agriculture/schemes: National Programme for Dairy Development |
| 174 | — | — | low | Economy/law: antitrust / Competition Act |
| 175 | — | — | low | Polity: Inner Line Permit states |
| 176 | — | — | low | Ancient history: pottery wares by age |
| 177 | — | — | low | Environment: World Water Day 2025 |
| 178 | — | — | low | Environment/S&T: Challenger 150 deep-sea initiative |
| 179 | — | — | low | Environment: greenhouse gases |
| 180 | — | — | low | Governance: CPGRAMS |
| 181 | — | — | low | Governance/schemes: PMJVK minority affairs |
| 182 | — | — | low | Geography/history: lapis lazuli / Badakhshan |
| 183 | — | — | low | Art & culture: Shigmotsav / Goan folk dances |
| 184 | — | — | low | Geography: Cook Strait |
| 185 | — | — | low | Modern history/polity: Lohia’s Sapta Kranti |
| 186 | — | — | low | Polity/law: IT Act s.69 blocking orders |
| 187 | — | — | low | Medieval history: Aurangzeb |
| 188 | — | — | low | Geography: Himalayan rivers and source glaciers |
| 189 | — | — | low | Defence/IR: Indian Navy IOS SAGAR / AIKEYME |
| 190 | — | — | low | Ancient history: Nalanda and Vikramshila |
| 191 | — | — | low | Agriculture: Indian cotton industry 2024-25 |
| 192 | — | — | low | Economy/IR: Mar-a-Lago Accord (US dollar) |
| 193 | — | — | low | Modern history: first woman legislator (Muthulakshmi Reddi clues) |
| 194 | — | — | low | Environment/agriculture: Anthurium flower (Mizoram) |
| 195 | — | — | low | S&T: DNA fingerprinting / STRs |
| 196 | — | — | low | Economy: Equalisation Levy |
| 197 | — | — | low | Health: tuberculosis / NTEP |
| 198 | — | — | low | Ancient history: Poompuhar / Cholas / Pallavas |
| 199 | — | — | low | Health: tirzepatide weight-loss drug |
| 200 | — | — | low | Agriculture/governance: Bharatiya Beej Sahakari Samiti |
| 201 | — | — | low | Polity/judiciary: HC judge transfers / Collegium |
| 202 | — | — | low | Governance/schemes: PM Internship Scheme (again) |
| 203 | — | — | low | Health/S&T: ICMR i-DRONE |
| 204 | — | — | low | Geography/S&T: Bedmap3 Antarctic mapping |
| 205 | — | — | low | Polity/law: defamation |
| 206 | — | — | low | Defence: VL-SRSAM |
| 207 | — | — | low | Health: One Health approach |
| 208 | — | — | low | Polity/judiciary: removal of SC judges |
| 209 | — | — | low | IR/environment: UN World Water Development Report (UNESCO) |
| 210 | — | — | low | IR: Commonwealth membership and Games |
| 211 | — | — | low | Environment: wildlife health surveillance in India |
| 212 | — | — | low | Economy/S&T: PRIP Pharma-MedTech scheme |
| 213 | — | — | low | S&T/space: Gaia mission orbit (L2 vs L1) |
| 214 | — | — | low | Art & culture: Sangita Kalanidhi award |
| 215 | — | — | low | S&T/physics: gravitational waves |
| 216 | — | — | low | Polity/judiciary: Three Judges Cases |
| 217 | — | — | low | S&T: Abel Prize |
| 218 | — | — | low | Polity: Leader of Opposition |
| 219 | — | — | low | Health: orphan drugs |
| 220 | — | — | low | Art & culture: Sarhul festival (Jharkhand) |
| 221 | — | — | low | Economy/governance: Sahkar Taxi cooperative |
| 222 | — | — | low | S&T/physics: AMoRE neutrinoless double beta decay |
| 223 | — | — | low | IR/defence: Indian rescue operations and locations |
| 224 | — | — | low | Environment/health: asbestos |
| 225 | — | — | low | Geography: Myanmar earthquake / Sagaing Fault |
| 226 | — | — | low | Art & culture/S&T: Studio Ghibli / ChatGPT image style |
| 227 | — | — | low | IR/geography: conflict locations (Aleppo, Khartoum, North Kivu) |
| 228 | — | — | low | Geography: Kaffeklubben Island northernmost land |
| 229 | — | — | low | Art & culture: Gounsa Temple (Korea, not Bihar) |
| 230 | — | — | low | Health: SPEN / Whipple operation |
| 231 | — | — | low | Health: food adulteration / calcium carbide |
| 232 | — | — | low | Geography/environment: Sukhatal Lake / Naini Lake |
| 233 | — | — | low | Governance: Baalpan ki Kavita (MoE) |
| 234 | — | — | low | Economy: Gold Monetisation Scheme |
| 235 | — | — | low | Medieval history: Vijayanagara Empire |
| 236 | — | — | low | Geography: seismic seiches |
| 237 | — | — | low | Economy/IR: US tariff impacts |
| 238 | — | — | low | S&T/space: Fram2 polar human spaceflight |
| 239 | — | — | low | Art & culture/history: Mahabodhi Temple |
| 240 | — | — | low | IR: Dragon-Elephant Tango (India–China) |
| 241 | — | — | low | Polity/IR: democratic backsliding |
| 242 | — | — | low | Governance/S&T: SAHYOG / I4C portal |
| 243 | — | — | low | IR: BIMSTEC members |
| 244 | — | — | low | Environment: deep-sea mining / Clarion-Clipperton Zone |
| 245 | — | — | low | S&T/space: Jupiter missions and agencies |
| 246 | — | — | low | Agriculture: farm mechanisation |
| 247 | — | — | low | IR: UN Security Council composition |
| 248 | — | — | low | Environment: Green Credit Programme |
| 249 | — | — | low | Geography/infra: India’s first vertical-lift railway sea bridge |
| 250 | — | — | low | Art & culture: Indian painting styles and regions |

## Unmapped

All 250 questions (Q1–Q250).

Live taxonomy inspection was blocked, so no existing topic could be confirmed as appropriate. Questions were left `subject: null`, `topic: null`, `confidence: low` rather than inventing names to satisfy the importer.

## Low Confidence

All 250 mappings are low confidence because they are unmapped.

## Medium Confidence

None. No existing SSBFY topic was confirmed.

## Potentially Ambiguous

Not applicable to the SSBFY catalog (no live topics to choose between).

Content-domain overlaps that will matter **after** the live catalog is read (not assigned here):

| Q | Why two domains could compete |
|---|---|
| 5 | Economy (RBI/finance) vs Science & Tech (AI/DPDP) |
| 8 | Environment vs Geography (sites/locations) |
| 28 | Polity/constitutional law vs Environment/energy |
| 51 | Economy vs Science & Tech (Chandrayaan mixed achievements) |
| 81 | Polity/NDPS vs Agriculture (cannabis) |
| 88 | Environment vs Polity (BHS statute) |
| 94 | Economy/agriculture nicknames vs Current Affairs |
| 120 | Economy (Budget) vs Governance (Viksit Bharat) |
| 146 | Art & culture vs Ancient/medieval history |
| 206 | Defence vs Science & Tech (DRDO missile) |
| 223 | IR vs Defence (rescue operations) |
| 250 | Art & culture vs Geography (painting regions) |
