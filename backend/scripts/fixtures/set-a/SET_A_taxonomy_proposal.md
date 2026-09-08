# SET A — SSBFY Taxonomy Proposal

Status: PROPOSED — NOT APPROVED

## Executive Summary

The live SSBFY database (`ssbfy`) is the expected application database, but **subjects = 0** and **topics = 0**. There is nothing to map SET A onto today.

This file proposes a reusable Subject/Topic catalog derived from all 250 SET A questions. Names follow the existing architecture: global unique subject names (case-insensitive), topics unique within a subject, optional `order` and `isActive`, and **one** subject + **one** topic per question.

**No MongoDB documents were created.** No seed/migration scripts were added. Importer files and the Phase 5D unmapped mapping were not modified.

The tree is meant to absorb future UPSC-style current-affairs sets, not one topic per question.

## Proposed Subjects

### Indian Polity

Purpose:
Constitution, institutions, and domestic public law. Recurs across SET A (rights, courts, Parliament, CAG, Governors, statutes).

Topics:
1. Fundamental Rights
2. Judiciary
3. Parliament
4. Constitutional Bodies
5. Centre-State Relations
6. Laws and Rights

### Economy

Purpose:
Macro, banking, budget, trade, and infrastructure economics. Covers SET A budget, RBI, freight corridors, minerals, and taxation items.

Topics:
1. Indian Economy and Surveys
2. Banking and Monetary Policy
3. Public Finance and Budget
4. Trade Industry and Infrastructure
5. Financial Markets and Taxation

### Geography

Purpose:
Physical, Indian, and world location knowledge plus transport geography. Matches SET A maps, rivers, borders, and landforms.

Topics:
1. Physical Geography
2. Indian Geography
3. Rivers and Water Resources
4. World Geography
5. Transport Infrastructure

### Environment

Purpose:
Biodiversity, wetlands, climate, and environmental regulation. SET A is heavy on Ramsar, wildlife, pollution rules, and climate reports.

Topics:
1. Biodiversity and Wildlife
2. Wetlands and Conservation
3. Climate Change
4. Pollution and Environmental Regulation

### Science and Technology

Purpose:
Space, energy, physics, biotech, and digital systems. Reusable for ISRO, nuclear, AI, and research-award questions.

Topics:
1. Space Technology
2. Energy and Nuclear Science
3. Physics and Research
4. Biotechnology
5. Digital Technology and AI
6. Chemistry and Materials

### Defence

Purpose:
Weapons, platforms, operations, and defence cooperation. Distinct from IR when the tested fact is a system or service, not diplomacy.

Topics:
1. Missile and Weapon Systems
2. Armed Forces and Platforms
3. Military History and Operations
4. Defence Cooperation

### International Relations

Purpose:
Organisations, bilateral ties, indices, and world affairs. For WHO/UN/ICC, dialogues, and conflict-location items.

Topics:
1. International Organisations
2. India's Bilateral Relations
3. Global Reports and Indices
4. World Affairs and Conflicts

### History and Culture

Purpose:
Ancient to modern India plus art, heritage, festivals, and sports origins. Matches SET A temples, movements, and cultural pairs.

Topics:
1. Ancient and Medieval India
2. Modern India
3. Art Architecture and Heritage
4. Culture Festivals and Sports

### Governance and Schemes

Purpose:
Government programmes and administrative machinery. For BBBP, internships, CPGRAMS, Smart Cities, and similar scheme/process items.

Topics:
1. Social Welfare Schemes
2. Education and Skills
3. Administration and e-Governance
4. Urban Development

### Agriculture

Purpose:
Crops, inputs, and farm policy. SET A includes cotton, pulses, urea, dairy, potash, and mechanisation.

Topics:
1. Crops and Commodities
2. Farm Inputs and Technology
3. Agricultural Policy and Institutions

### Health

Purpose:
Disease, therapeutics, and One Health / food safety. SET A has GBS, TB, antivenoms, and public-health schemes that are medically dominant.

Topics:
1. Diseases and Public Health
2. Medicines and Therapeutics
3. One Health and Food Safety

## Question Distribution

| Subject | Questions | Percentage |
|---|---:|---:|
| Indian Polity | 26 | 10.4% |
| Economy | 30 | 12.0% |
| Geography | 22 | 8.8% |
| Environment | 30 | 12.0% |
| Science and Technology | 29 | 11.6% |
| Defence | 12 | 4.8% |
| International Relations | 22 | 8.8% |
| History and Culture | 30 | 12.0% |
| Governance and Schemes | 15 | 6.0% |
| Agriculture | 14 | 5.6% |
| Health | 20 | 8.0% |

| Subject | Topic | Questions |
|---|---|---:|
| Indian Polity | Fundamental Rights | 4 |
| Indian Polity | Judiciary | 5 |
| Indian Polity | Parliament | 3 |
| Indian Polity | Constitutional Bodies | 1 |
| Indian Polity | Centre-State Relations | 3 |
| Indian Polity | Laws and Rights | 10 |
| Economy | Indian Economy and Surveys | 4 |
| Economy | Banking and Monetary Policy | 3 |
| Economy | Public Finance and Budget | 6 |
| Economy | Trade Industry and Infrastructure | 12 |
| Economy | Financial Markets and Taxation | 5 |
| Geography | Physical Geography | 8 |
| Geography | Indian Geography | 5 |
| Geography | Rivers and Water Resources | 3 |
| Geography | World Geography | 5 |
| Geography | Transport Infrastructure | 1 |
| Environment | Biodiversity and Wildlife | 13 |
| Environment | Wetlands and Conservation | 3 |
| Environment | Climate Change | 7 |
| Environment | Pollution and Environmental Regulation | 7 |
| Science and Technology | Space Technology | 10 |
| Science and Technology | Energy and Nuclear Science | 7 |
| Science and Technology | Physics and Research | 5 |
| Science and Technology | Biotechnology | 3 |
| Science and Technology | Digital Technology and AI | 3 |
| Science and Technology | Chemistry and Materials | 1 |
| Defence | Missile and Weapon Systems | 6 |
| Defence | Armed Forces and Platforms | 2 |
| Defence | Military History and Operations | 2 |
| Defence | Defence Cooperation | 2 |
| International Relations | International Organisations | 8 |
| International Relations | India's Bilateral Relations | 4 |
| International Relations | Global Reports and Indices | 4 |
| International Relations | World Affairs and Conflicts | 6 |
| History and Culture | Ancient and Medieval India | 7 |
| History and Culture | Modern India | 8 |
| History and Culture | Art Architecture and Heritage | 8 |
| History and Culture | Culture Festivals and Sports | 7 |
| Governance and Schemes | Social Welfare Schemes | 5 |
| Governance and Schemes | Education and Skills | 5 |
| Governance and Schemes | Administration and e-Governance | 4 |
| Governance and Schemes | Urban Development | 1 |
| Agriculture | Crops and Commodities | 7 |
| Agriculture | Farm Inputs and Technology | 3 |
| Agriculture | Agricultural Policy and Institutions | 4 |
| Health | Diseases and Public Health | 13 |
| Health | Medicines and Therapeutics | 5 |
| Health | One Health and Food Safety | 2 |

Every question appears once. Column totals: **250**.

High: 210 · Medium: 38 · Low: 2

## Full Question Mapping

| Q | Subject | Topic | Confidence | Reason |
|---|---|---|---|---|
| 1 | Indian Polity | Laws and Rights | high | Tests TG identity-certificate law against the Registration of Births and Deaths Act. |
| 2 | Science and Technology | Space Technology | high | ISRO SpaDeX docking capability and country-rank claim. |
| 3 | History and Culture | Modern India | low | Epithet for an Indian scientist; not a standard textbook title, so classification is interpretive. |
| 4 | Economy | Indian Economy and Surveys | high | Household Consumption Expenditure Survey agency and rural/urban food share. |
| 5 | Economy | Financial Markets and Taxation | medium | Ethical-AI tools in finance; could also sit under digital technology. |
| 6 | Geography | Indian Geography | high | Kashmir Chillai Kalan seasonal geography and related observances. |
| 7 | Defence | Missile and Weapon Systems | high | Manufacturer country of the Bayraktar Akinci UCAV. |
| 8 | Environment | Biodiversity and Wildlife | high | Wetland/BHS sites in news (Vembanad, Kaas, Yaya Tso). |
| 9 | History and Culture | Culture Festivals and Sports | high | Origin of Kho-Kho / Chakravyuha sporting tradition. |
| 10 | Indian Polity | Fundamental Rights | high | Which listed Fundamental Rights are citizen-only. |
| 11 | Indian Polity | Judiciary | high | Rarest-of-rare doctrine and the RG Kar death-penalty holding. |
| 12 | Geography | Physical Geography | high | Continent–highest-peak pairs. |
| 13 | Health | Diseases and Public Health | high | Non-alcoholic steatohepatitis (NASH) facts. |
| 14 | International Relations | International Organisations | high | ILO as a tripartite UN agency and 1919 origin. |
| 15 | Environment | Climate Change | medium | Impacts of US Paris Agreement withdrawal; also an IR current-affairs item. |
| 16 | History and Culture | Culture Festivals and Sports | high | Mythological origin of Kalaripayattu. |
| 17 | History and Culture | Art Architecture and Heritage | high | Ratnagiri Buddhist excavation finds. |
| 18 | Indian Polity | Laws and Rights | high | Enemy Property Act and the Custodian of Enemy Property. |
| 19 | Indian Polity | Parliament | high | Constitutional articles for One Nation One Election. |
| 20 | Economy | Trade Industry and Infrastructure | high | Diamond Imprest Authorisation Scheme rules. |
| 21 | Science and Technology | Chemistry and Materials | high | Identifies Rhodamine B as a synthetic dye. |
| 22 | Economy | Financial Markets and Taxation | high | Definition of grey-market trading. |
| 23 | Governance and Schemes | Social Welfare Schemes | high | Beti Bachao Beti Padhao scheme type, ministry, and objective. |
| 24 | Health | Diseases and Public Health | high | Food-borne versus non-food transmission of listed pathogens. |
| 25 | History and Culture | Modern India | high | Organisations associated with Subhas Chandra Bose. |
| 26 | Health | Diseases and Public Health | high | Guillain-Barré Syndrome mechanism and triggers. |
| 27 | Health | Diseases and Public Health | high | Snakebite burden and antivenom facts for India. |
| 28 | Indian Polity | Judiciary | medium | Karnataka HC green-energy open-access ruling; also energy/environment law. |
| 29 | Environment | Biodiversity and Wildlife | high | Olive Ridley turtle biology and IUCN status. |
| 30 | Geography | Physical Geography | high | Pacific Ring of Fire seismicity and geography. |
| 31 | Defence | Military History and Operations | high | Operation Gibraltar (1965) in Jammu and Kashmir. |
| 32 | Science and Technology | Physics and Research | high | Semi-Dirac fermions versus Majorana/Dirac claims. |
| 33 | International Relations | Global Reports and Indices | high | WEF Global Risks Report 2025 authorship and rankings. |
| 34 | Geography | Physical Geography | high | Oceanic trench locations. |
| 35 | Defence | Missile and Weapon Systems | medium | Scramjet test is propulsion technology for missiles/aerospace, not a space mission. |
| 36 | Environment | Wetlands and Conservation | high | Indian cities with Ramsar Wetland City Accreditation. |
| 37 | Economy | Financial Markets and Taxation | high | Crypto exchanges and KYC in India. |
| 38 | History and Culture | Ancient and Medieval India | low | Jalankantha as a historical water-clock term; exact spelling is unverified. |
| 39 | Environment | Wetlands and Conservation | high | Ramsar eligibility criteria for wetlands. |
| 40 | Indian Polity | Laws and Rights | high | Martial law in the Constitution (Art. 34). |
| 41 | Environment | Biodiversity and Wildlife | medium | Chinar tree ecology/history; also Kashmir geography. |
| 42 | Science and Technology | Space Technology | high | NVS-02 / NavIC satellite payload and orbit. |
| 43 | Environment | Pollution and Environmental Regulation | medium | Paraquat hazard classification; also a public-health poison. |
| 44 | Indian Polity | Fundamental Rights | high | Constitutional provisions that secure liberty. |
| 45 | Environment | Biodiversity and Wildlife | high | Corpse flower biology and odour chemistry. |
| 46 | Defence | Missile and Weapon Systems | high | Identifies BrahMos from listed missile characteristics. |
| 47 | Environment | Biodiversity and Wildlife | high | Punjab state bird identification. |
| 48 | History and Culture | Culture Festivals and Sports | medium | Sthala Vriksha as sacred trees in Hindu literature. |
| 49 | Agriculture | Farm Inputs and Technology | high | Nano Urea product and producer. |
| 50 | International Relations | World Affairs and Conflicts | medium | Greenland’s strategic value to the US; also Arctic geography. |
| 51 | Economy | Indian Economy and Surveys | medium | Mixed 75-year achievements including economy, literacy, and Chandrayaan-3. |
| 52 | Health | Diseases and Public Health | high | What antibody/serology tests detect and are used for. |
| 53 | Defence | Missile and Weapon Systems | high | Pralay missile characteristics. |
| 54 | Governance and Schemes | Education and Skills | high | ASER is released by Pratham, not NCERT/NITI. |
| 55 | Indian Polity | Parliament | high | Office and origin of the parliamentary whip. |
| 56 | Geography | Rivers and Water Resources | high | Teesta origin, states, and hydropower location. |
| 57 | Governance and Schemes | Administration and e-Governance | medium | Padma awards rules; civilian honours rather than a core constitutional body. |
| 58 | Environment | Climate Change | high | India and the Paris Agreement. |
| 59 | History and Culture | Modern India | high | Freedom-fighter contribution pairs. |
| 60 | Economy | Trade Industry and Infrastructure | high | eCoO 2.0 certificates of origin platform. |
| 61 | Economy | Trade Industry and Infrastructure | high | Critical minerals listed under the National Critical Mineral Mission. |
| 62 | Economy | Trade Industry and Infrastructure | high | MMDR Act 2015 licensing and auction rules. |
| 63 | Science and Technology | Digital Technology and AI | high | DeepSeek models and energy-use claims. |
| 64 | International Relations | India's Bilateral Relations | high | India–Indonesia defence, trade, and G20 facts. |
| 65 | Economy | Trade Industry and Infrastructure | high | Mutual Credit Guarantee Scheme for MSMEs. |
| 66 | Indian Polity | Fundamental Rights | medium | Burial-rights split verdict grounded in Article 21 dignity. |
| 67 | History and Culture | Culture Festivals and Sports | high | Folk-dance and state pairs. |
| 68 | Science and Technology | Energy and Nuclear Science | high | OSOWOG / International Solar Alliance grid initiative. |
| 69 | Health | Diseases and Public Health | high | Human African trypanosomiasis (sleeping sickness). |
| 70 | Geography | Rivers and Water Resources | high | Singtam and Munshithang bridges on the Teesta. |
| 71 | Governance and Schemes | Social Welfare Schemes | high | e-Shram microsites for unorganised workers. |
| 72 | Science and Technology | Energy and Nuclear Science | high | Nuclear fusion versus fission-bomb terminology. |
| 73 | Economy | Indian Economy and Surveys | medium | Occupational Shortage Index labour-market indicators. |
| 74 | Environment | Pollution and Environmental Regulation | high | Natural versus cultural eutrophication. |
| 75 | Science and Technology | Energy and Nuclear Science | high | EAST tokamak country of origin. |
| 76 | Indian Polity | Laws and Rights | high | Prohibition of Child Marriage Act 2006. |
| 77 | International Relations | International Organisations | high | Genocide definition and the 1948 Convention. |
| 78 | Science and Technology | Energy and Nuclear Science | high | Tests CNG, sour gas, and LNG as fuel/energy facts. |
| 79 | Agriculture | Agricultural Policy and Institutions | high | Agriculture GDP, production ranks, and employment share. |
| 80 | Health | Medicines and Therapeutics | high | Suzetrigine as a non-opioid painkiller. |
| 81 | Indian Polity | Laws and Rights | medium | Himachal cannabis project versus the NDPS Act; also agriculture. |
| 82 | Geography | Indian Geography | high | Indian coastline origin and recent length change. |
| 83 | Health | Medicines and Therapeutics | high | Fentanyl origin, medical use, and potency. |
| 84 | Environment | Biodiversity and Wildlife | high | Indian squid taxonomy, genetics, and IUCN status. |
| 85 | Environment | Biodiversity and Wildlife | high | Mangrove ecosystem “link strength”. |
| 86 | Geography | World Geography | high | Land borders of the Democratic Republic of the Congo. |
| 87 | Environment | Pollution and Environmental Regulation | high | Construction and Demolition Waste Management Rules 2016. |
| 88 | Environment | Biodiversity and Wildlife | high | Biodiversity Heritage Sites definition, notifier, and Guneri inland mangrove. |
| 89 | Economy | Public Finance and Budget | high | Union Budget 2025-26 income-tax cut effects. |
| 90 | Governance and Schemes | Administration and e-Governance | high | SwaRail SuperApp services. |
| 91 | Geography | Indian Geography | high | Indian states sharing a border with Bangladesh. |
| 92 | Environment | Wetlands and Conservation | high | New Ramsar designations and state-wise counts. |
| 93 | Health | Diseases and Public Health | high | Bickerstaff encephalitis versus Guillain-Barré Syndrome. |
| 94 | Agriculture | Crops and Commodities | medium | Food-item nicknames; several pairs are non-standard. |
| 95 | International Relations | India's Bilateral Relations | medium | US H-1B visa rules affecting Indian professionals. |
| 96 | International Relations | International Organisations | high | WHO membership of listed countries. |
| 97 | Agriculture | Crops and Commodities | high | Extra-long staple cotton in India. |
| 98 | Economy | Trade Industry and Infrastructure | high | Sagarmala objectives and maritime trade shares. |
| 99 | Science and Technology | Space Technology | high | Identifies the agency that launched the Gaia spacecraft. |
| 100 | Science and Technology | Space Technology | high | Trojan asteroids sharing a planet’s orbit. |
| 101 | Economy | Public Finance and Budget | high | Fiscal deficit definition versus inflation. |
| 102 | Science and Technology | Biotechnology | high | Applications of genetic modification. |
| 103 | Governance and Schemes | Education and Skills | high | Prime Minister’s Internship Scheme design. |
| 104 | Governance and Schemes | Education and Skills | high | NAAC status, funding, and grade benefits. |
| 105 | Environment | Biodiversity and Wildlife | medium | Sacred groves by state; also cultural geography. |
| 106 | Geography | World Geography | high | Location of Mount Taranaki. |
| 107 | Health | Diseases and Public Health | high | Brucellosis cause, transmission, and symptoms. |
| 108 | Economy | Banking and Monetary Policy | high | SLR and LCR dual liquidity mandates. |
| 109 | Indian Polity | Fundamental Rights | high | Article 25 and the absence of a uniform national anti-conversion law. |
| 110 | Agriculture | Crops and Commodities | high | Pulses covered by the Pulse Mission. |
| 111 | International Relations | International Organisations | high | ICC jurisdiction and India’s non-recognition. |
| 112 | Indian Polity | Laws and Rights | high | Foreigners Tribunals procedure and burden of proof. |
| 113 | History and Culture | Art Architecture and Heritage | medium | Aga Khan restorations and Padma; also philanthropy/IR. |
| 114 | Environment | Pollution and Environmental Regulation | high | Flue-gas desulphurisation at coal plants. |
| 115 | Defence | Military History and Operations | high | Renaming Fort William to Vijay Durg. |
| 116 | Defence | Armed Forces and Platforms | high | Stryker infantry combat vehicle facts. |
| 117 | Environment | Climate Change | high | Arctic warming, albedo, and heat trapping. |
| 118 | Indian Polity | Laws and Rights | high | Parole under Indian prison practice. |
| 119 | Indian Polity | Laws and Rights | high | Bombay Prevention of Beggary Act 1959. |
| 120 | Economy | Public Finance and Budget | high | Viksit Bharat 2047 priorities in Budget 2025. |
| 121 | Science and Technology | Biotechnology | high | Human Genome Project dates, funding, and aim. |
| 122 | Science and Technology | Energy and Nuclear Science | medium | Atomic Energy Act / CLNDA Budget amendments; also public law. |
| 123 | Agriculture | Agricultural Policy and Institutions | high | PM-KISAN eligibility and instalments. |
| 124 | Health | Diseases and Public Health | high | GARBH-INi-DRISHTI maternal-health research. |
| 125 | Agriculture | Crops and Commodities | medium | Ethanol feedstocks; also energy policy. |
| 126 | Science and Technology | Energy and Nuclear Science | high | Nuclear power’s share of electricity and GHG intensity. |
| 127 | Economy | Trade Industry and Infrastructure | high | Dedicated Freight Corridor alignments. |
| 128 | Economy | Trade Industry and Infrastructure | high | Indian Railways size, electrification, and funds. |
| 129 | Governance and Schemes | Social Welfare Schemes | high | NAMASTE mechanised sanitation scheme. |
| 130 | Agriculture | Farm Inputs and Technology | high | Potash use, import dependence, and properties. |
| 131 | Governance and Schemes | Social Welfare Schemes | high | National Commission for Safai Karamcharis status. |
| 132 | Economy | Banking and Monetary Policy | high | Effects of an RBI repo-rate cut. |
| 133 | Indian Polity | Centre-State Relations | high | Governor’s options under Article 200. |
| 134 | History and Culture | Art Architecture and Heritage | high | National Mission for Manuscripts. |
| 135 | Environment | Biodiversity and Wildlife | high | NTCA and tiger-reserve boundary changes. |
| 136 | International Relations | World Affairs and Conflicts | high | Location of the Netzarim Corridor. |
| 137 | Environment | Climate Change | high | Why La Niña failed to cool January 2025. |
| 138 | Defence | Defence Cooperation | high | India–UK Aero India 2025 defence agreements. |
| 139 | Health | Diseases and Public Health | medium | ASHA workers; also a health-system scheme. |
| 140 | Environment | Biodiversity and Wildlife | high | Sambar deer IUCN status and captive breeding. |
| 141 | Economy | Indian Economy and Surveys | high | Gross Domestic Knowledge Product proposal. |
| 142 | Indian Polity | Centre-State Relations | high | President’s Rule and judicial review. |
| 143 | International Relations | India's Bilateral Relations | high | India–UK Young Professionals Scheme. |
| 144 | Economy | Banking and Monetary Policy | high | Factors depreciating the Indian rupee. |
| 145 | Environment | Climate Change | high | Marine heatwave definition and causes. |
| 146 | History and Culture | Art Architecture and Heritage | high | UNESCO World Heritage sites and dynasties. |
| 147 | Defence | Armed Forces and Platforms | high | INS Imphal / Project 15B destroyer. |
| 148 | Health | Diseases and Public Health | high | Human coronavirus HKU1 versus pandemic coronaviruses. |
| 149 | Indian Polity | Constitutional Bodies | high | CAG appointment, removal, and PSU audit. |
| 150 | Economy | Trade Industry and Infrastructure | medium | GI-tagged products and states; also agriculture. |
| 151 | History and Culture | Modern India | high | R.G. Bhandarkar associations and offices. |
| 152 | International Relations | World Affairs and Conflicts | medium | Raisina Dialogue is an India-hosted geopolitics forum, not a bilateral treaty. |
| 153 | History and Culture | Art Architecture and Heritage | high | Chhatrapati Shivaji Maharaj temple claims. |
| 154 | History and Culture | Modern India | high | Biswedari feudal tenure in Patiala. |
| 155 | History and Culture | Modern India | high | Patharughat peasant uprising. |
| 156 | International Relations | Global Reports and Indices | high | Future of Free Speech Index 2025. |
| 157 | Science and Technology | Physics and Research | medium | Audible-enclave applications of directed sound. |
| 158 | Geography | Indian Geography | high | Ana Sagar Lake origin and history. |
| 159 | Agriculture | Crops and Commodities | high | Arecanut soils and leading producing state. |
| 160 | Geography | Physical Geography | high | Physical-geography facts about the vernal equinox. |
| 161 | Geography | Physical Geography | high | Sequence of rill, gully, and badland erosion. |
| 162 | Science and Technology | Digital Technology and AI | high | Samarth incubation in telecom and IT. |
| 163 | Governance and Schemes | Urban Development | high | Smart Cities Mission SPVs and progress. |
| 164 | Economy | Public Finance and Budget | medium | BHIM-UPI merchant incentive scheme. |
| 165 | Defence | Missile and Weapon Systems | medium | Sonic weapons as non-lethal acoustic systems. |
| 166 | Science and Technology | Space Technology | high | Crew-9 ISS scientific experiments. |
| 167 | Science and Technology | Space Technology | high | ISS partner space agencies. |
| 168 | Science and Technology | Energy and Nuclear Science | medium | Indian nuclear plant–state pairs; also geography. |
| 169 | International Relations | Global Reports and Indices | high | World Happiness Report 2025 rankings. |
| 170 | Geography | World Geography | high | Countries bordering the Red Sea. |
| 171 | Science and Technology | Space Technology | high | ISRO YUVIKA student space-education programme. |
| 172 | International Relations | Global Reports and Indices | high | Global Residence Program Index publisher. |
| 173 | Agriculture | Agricultural Policy and Institutions | high | National Programme for Dairy Development. |
| 174 | Economy | Financial Markets and Taxation | high | Antitrust / competition law in India. |
| 175 | Indian Polity | Centre-State Relations | high | Inner Line Permit states. |
| 176 | History and Culture | Ancient and Medieval India | high | Pottery wares by archaeological age. |
| 177 | Environment | Climate Change | medium | World Water Day 2025 glacier theme; UN observance. |
| 178 | Environment | Biodiversity and Wildlife | medium | Challenger 150 deep-sea biodiversity expedition. |
| 179 | Environment | Climate Change | high | Which listed gases are greenhouse gases. |
| 180 | Governance and Schemes | Administration and e-Governance | high | CPGRAMS portal and nodal department. |
| 181 | Governance and Schemes | Social Welfare Schemes | high | PM Jan Vikas Karyakram (PMJVK). |
| 182 | History and Culture | Ancient and Medieval India | high | Lapis lazuli and Badakhshan / Harappan trade. |
| 183 | History and Culture | Culture Festivals and Sports | high | Shigmotsav and associated Goan folk dances. |
| 184 | Geography | World Geography | high | Location of Cook Strait as world-geography knowledge. |
| 185 | History and Culture | Modern India | high | Ram Manohar Lohia’s Sapta Kranti. |
| 186 | Indian Polity | Laws and Rights | high | IT Act section 69 content-blocking powers. |
| 187 | History and Culture | Ancient and Medieval India | high | Aurangzeb’s title, religious policy, and Sikh history claim. |
| 188 | Geography | Rivers and Water Resources | high | Himalayan rivers and source glaciers. |
| 189 | Defence | Defence Cooperation | medium | Indian Navy IOS SAGAR and AIKEYME with African partners; also IR. |
| 190 | History and Culture | Ancient and Medieval India | high | Nalanda versus Vikramshila periods and curricula. |
| 191 | Agriculture | Crops and Commodities | high | Indian cotton output, GM stagnation, and trade. |
| 192 | Economy | Financial Markets and Taxation | high | Mar-a-Lago Accord as a weak-dollar strategy. |
| 193 | History and Culture | Modern India | high | First woman legislator / medical graduate of Madras Presidency. |
| 194 | Agriculture | Crops and Commodities | medium | Anthurium cultivation in the Northeast; ornamental crop. |
| 195 | Science and Technology | Biotechnology | high | DNA fingerprinting, STRs, and PCR. |
| 196 | Economy | Public Finance and Budget | high | Equalisation Levy on digital services. |
| 197 | Health | Diseases and Public Health | high | India TB burden and NTEP strategy. |
| 198 | History and Culture | Ancient and Medieval India | high | Poompuhar, Cholas, and Pallavas. |
| 199 | Health | Medicines and Therapeutics | high | Tirzepatide as a weight-loss drug. |
| 200 | Agriculture | Agricultural Policy and Institutions | high | Bharatiya Beej Sahakari Samiti purpose and nodal ministry. |
| 201 | Indian Polity | Judiciary | high | High Court judge transfers and the Collegium. |
| 202 | Governance and Schemes | Education and Skills | high | Prime Minister’s Internship Scheme eligibility facts. |
| 203 | Health | Diseases and Public Health | medium | ICMR i-DRONE medical delivery; also technology. |
| 204 | Geography | Physical Geography | medium | Bedmap3 Antarctic under-ice mapping; also earth science. |
| 205 | Indian Polity | Laws and Rights | high | Criminal and civil defamation in India. |
| 206 | Defence | Missile and Weapon Systems | high | VL-SRSAM indigenous naval SAM. |
| 207 | Health | One Health and Food Safety | high | Pillars of the One Health approach. |
| 208 | Indian Polity | Judiciary | high | Removal of Supreme Court judges. |
| 209 | International Relations | International Organisations | medium | Tests which UN body publishes WWDR (UNESCO), not climate science itself. |
| 210 | International Relations | International Organisations | high | Commonwealth membership and Games cycle. |
| 211 | Environment | Biodiversity and Wildlife | high | Wildlife health surveillance architecture in India. |
| 212 | Economy | Trade Industry and Infrastructure | high | PRIP scheme for Pharma-MedTech innovation. |
| 213 | Science and Technology | Space Technology | high | Gaia mission orbit (Lagrange point). |
| 214 | History and Culture | Culture Festivals and Sports | high | Sangita Kalanidhi Carnatic award. |
| 215 | Science and Technology | Physics and Research | high | Gravitational waves speed and cosmology uses. |
| 216 | Indian Polity | Judiciary | high | Three Judges Cases on appointments. |
| 217 | Science and Technology | Physics and Research | high | Abel Prize founder and awarding bodies. |
| 218 | Indian Polity | Parliament | high | Leader of Opposition recognition and 10% rule. |
| 219 | Health | Medicines and Therapeutics | high | Definition of an orphan drug. |
| 220 | History and Culture | Culture Festivals and Sports | high | Sarhul New Year festival of Jharkhand. |
| 221 | Economy | Trade Industry and Infrastructure | medium | Sahkar Taxi multi-state cooperative; also urban transport. |
| 222 | Science and Technology | Physics and Research | high | AMoRE neutrinoless double-beta-decay experiment. |
| 223 | International Relations | World Affairs and Conflicts | medium | Indian humanitarian rescue operations and theatres; also defence outreach. |
| 224 | Environment | Pollution and Environmental Regulation | high | Asbestos uses, carcinogen class, and school ban. |
| 225 | Geography | Physical Geography | high | Myanmar earthquake and the Sagaing Fault. |
| 226 | Science and Technology | Digital Technology and AI | high | ChatGPT image generation and Studio Ghibli style. |
| 227 | International Relations | World Affairs and Conflicts | high | Conflict cities/regions and countries. |
| 228 | Geography | World Geography | high | Kaffeklubben Island as northernmost land. |
| 229 | History and Culture | Art Architecture and Heritage | medium | Gounsa Temple (Korea), not Bihar. |
| 230 | Health | Medicines and Therapeutics | high | SPEN tumours and the Whipple operation. |
| 231 | Health | One Health and Food Safety | high | Food adulteration types including calcium carbide ripening. |
| 232 | Geography | Indian Geography | high | Sukhatal as a feeder of Naini Lake. |
| 233 | Governance and Schemes | Education and Skills | high | Baalpan ki Kavita nodal ministry. |
| 234 | Economy | Public Finance and Budget | high | Gold Monetisation Scheme objectives and rates. |
| 235 | History and Culture | Ancient and Medieval India | high | Vijayanagara capital, insignia, and Virupaksha temple. |
| 236 | Geography | Physical Geography | high | Seismic seiches in enclosed water bodies. |
| 237 | Economy | Trade Industry and Infrastructure | medium | US tariff impacts; also international political economy. |
| 238 | Science and Technology | Space Technology | high | Fram2 polar human spaceflight. |
| 239 | History and Culture | Art Architecture and Heritage | high | Mahabodhi Temple origin, river, and UNESCO status. |
| 240 | International Relations | India's Bilateral Relations | high | Dragon-Elephant Tango as India–China diplomacy metaphor. |
| 241 | International Relations | World Affairs and Conflicts | medium | Comparative democratic-erosion concept; could also sit under Indian Polity. |
| 242 | Governance and Schemes | Administration and e-Governance | high | SAHYOG portal operated by I4C under Home Affairs. |
| 243 | International Relations | International Organisations | high | BIMSTEC membership of listed South and Southeast Asian countries. |
| 244 | Environment | Pollution and Environmental Regulation | high | Deep-sea mining and the Clarion-Clipperton Zone. |
| 245 | Science and Technology | Space Technology | high | Jupiter missions and space agencies. |
| 246 | Agriculture | Farm Inputs and Technology | high | Farm mechanisation coverage and regional pattern. |
| 247 | International Relations | International Organisations | high | UN Security Council composition and binding resolutions. |
| 248 | Environment | Pollution and Environmental Regulation | high | Green Credit Programme rules. |
| 249 | Geography | Transport Infrastructure | high | India’s first vertical-lift railway sea bridge location. |
| 250 | History and Culture | Art Architecture and Heritage | high | Indian painting styles and regions. |

## Medium Confidence

| Q | Subject | Topic | Reason |
|---|---|---|---|
| 5 | Economy | Financial Markets and Taxation | Ethical-AI tools in finance; could also sit under digital technology. |
| 15 | Environment | Climate Change | Impacts of US Paris Agreement withdrawal; also an IR current-affairs item. |
| 28 | Indian Polity | Judiciary | Karnataka HC green-energy open-access ruling; also energy/environment law. |
| 35 | Defence | Missile and Weapon Systems | Scramjet test is propulsion technology for missiles/aerospace, not a space mission. |
| 41 | Environment | Biodiversity and Wildlife | Chinar tree ecology/history; also Kashmir geography. |
| 43 | Environment | Pollution and Environmental Regulation | Paraquat hazard classification; also a public-health poison. |
| 48 | History and Culture | Culture Festivals and Sports | Sthala Vriksha as sacred trees in Hindu literature. |
| 50 | International Relations | World Affairs and Conflicts | Greenland’s strategic value to the US; also Arctic geography. |
| 51 | Economy | Indian Economy and Surveys | Mixed 75-year achievements including economy, literacy, and Chandrayaan-3. |
| 57 | Governance and Schemes | Administration and e-Governance | Padma awards rules; civilian honours rather than a core constitutional body. |
| 66 | Indian Polity | Fundamental Rights | Burial-rights split verdict grounded in Article 21 dignity. |
| 73 | Economy | Indian Economy and Surveys | Occupational Shortage Index labour-market indicators. |
| 81 | Indian Polity | Laws and Rights | Himachal cannabis project versus the NDPS Act; also agriculture. |
| 94 | Agriculture | Crops and Commodities | Food-item nicknames; several pairs are non-standard. |
| 95 | International Relations | India's Bilateral Relations | US H-1B visa rules affecting Indian professionals. |
| 105 | Environment | Biodiversity and Wildlife | Sacred groves by state; also cultural geography. |
| 113 | History and Culture | Art Architecture and Heritage | Aga Khan restorations and Padma; also philanthropy/IR. |
| 122 | Science and Technology | Energy and Nuclear Science | Atomic Energy Act / CLNDA Budget amendments; also public law. |
| 125 | Agriculture | Crops and Commodities | Ethanol feedstocks; also energy policy. |
| 139 | Health | Diseases and Public Health | ASHA workers; also a health-system scheme. |
| 150 | Economy | Trade Industry and Infrastructure | GI-tagged products and states; also agriculture. |
| 152 | International Relations | World Affairs and Conflicts | Raisina Dialogue is an India-hosted geopolitics forum, not a bilateral treaty. |
| 157 | Science and Technology | Physics and Research | Audible-enclave applications of directed sound. |
| 164 | Economy | Public Finance and Budget | BHIM-UPI merchant incentive scheme. |
| 165 | Defence | Missile and Weapon Systems | Sonic weapons as non-lethal acoustic systems. |
| 168 | Science and Technology | Energy and Nuclear Science | Indian nuclear plant–state pairs; also geography. |
| 177 | Environment | Climate Change | World Water Day 2025 glacier theme; UN observance. |
| 178 | Environment | Biodiversity and Wildlife | Challenger 150 deep-sea biodiversity expedition. |
| 189 | Defence | Defence Cooperation | Indian Navy IOS SAGAR and AIKEYME with African partners; also IR. |
| 194 | Agriculture | Crops and Commodities | Anthurium cultivation in the Northeast; ornamental crop. |
| 203 | Health | Diseases and Public Health | ICMR i-DRONE medical delivery; also technology. |
| 204 | Geography | Physical Geography | Bedmap3 Antarctic under-ice mapping; also earth science. |
| 209 | International Relations | International Organisations | Tests which UN body publishes WWDR (UNESCO), not climate science itself. |
| 221 | Economy | Trade Industry and Infrastructure | Sahkar Taxi multi-state cooperative; also urban transport. |
| 223 | International Relations | World Affairs and Conflicts | Indian humanitarian rescue operations and theatres; also defence outreach. |
| 229 | History and Culture | Art Architecture and Heritage | Gounsa Temple (Korea), not Bihar. |
| 237 | Economy | Trade Industry and Infrastructure | US tariff impacts; also international political economy. |
| 241 | International Relations | World Affairs and Conflicts | Comparative democratic-erosion concept; could also sit under Indian Polity. |

## Low Confidence

| Q | Subject | Topic | Reason |
|---|---|---|---|
| 3 | History and Culture | Modern India | Epithet for an Indian scientist; not a standard textbook title, so classification is interpretive. |
| 38 | History and Culture | Ancient and Medieval India | Jalankantha as a historical water-clock term; exact spelling is unverified. |

## Cross-Domain / Boundary Cases

| Q | Assigned | Plausible alternative |
|---|---|---|
| 5 | Economy / Financial Markets | Science and Technology / Digital Technology and AI |
| 15 | Environment / Climate Change | International Relations / World Affairs |
| 28 | Indian Polity / Judiciary | Environment / Pollution and Environmental Regulation |
| 35 | Defence / Missile and Weapon Systems | Science and Technology / Energy (scramjet propulsion) |
| 43 | Environment / Pollution | Health / Medicines (paraquat poisoning) |
| 50 | IR / World Affairs | Geography / World Geography (Greenland) |
| 51 | Economy / Surveys | Science and Technology / Space (Chandrayaan mixed in) |
| 81 | Indian Polity / Laws | Agriculture (controlled cannabis cultivation) |
| 88 | Environment / Biodiversity | Indian Polity / Laws (Biodiversity Act notifier) |
| 95 | IR / India's Bilateral Relations | Economy / labour mobility (H-1B) |
| 113 | History and Culture / Heritage | International Relations (Aga Khan network) |
| 122 | Science and Technology / Energy | Indian Polity / Laws (Atomic Energy / CLNDA) |
| 125 | Agriculture / Crops | Science and Technology / Energy (ethanol) |
| 138 | Defence / Defence Cooperation | International Relations / India's Bilateral Relations |
| 139 | Health / Public Health | Governance and Schemes / Social Welfare (ASHA) |
| 150 | Economy / Trade | Agriculture / Commodities (GI crops) |
| 152 | IR / World Affairs (Raisina Dialogue) | India's Bilateral Relations |
| 168 | Science and Technology / Energy | Geography / Indian Geography (plant locations) |
| 189 | Defence / Defence Cooperation | International Relations / India's Bilateral Relations |
| 203 | Health / Public Health | Science and Technology / Digital (i-DRONE) |
| 204 | Geography / Physical | Science and Technology / Physics (Bedmap3 methods) |
| 209 | IR / International Organisations (WWDR publisher) | Environment / Climate Change |
| 223 | IR / World Affairs | Defence / Military History (rescue operations) |
| 241 | IR / World Affairs (democratic backsliding) | Indian Polity |
| 237 | Economy / Trade | International Relations / World Affairs (US tariffs) |

Primary assignment follows the **knowledge actually tested** (court holding, mineral list, missile name), not the news hook alone.

## Taxonomy Design Rationale

Eleven subjects match SET A’s mix of GS papers without a catch-all “Current Affairs” bucket. Topics are recurring areas (Judiciary, Ramsar, Space Technology), not question titles.

The importer already resolves **exact names** (case-insensitive) or ObjectIds. After approval, these `proposedName` values can be created once and reused for later sets.

Ordering uses small integers so admin `ManageTopics` can display a stable syllabus-like list.

## Potential Future Expansion

Suggestions only — **not** in this proposal unless SET A already supports them:

- Indian Polity → Local Government; Election Commission (no SET A item required a dedicated local-government topic)
- Geography → Soils; Population
- Economy → External Sector / BoP as a split from trade
- Science and Technology → Cybersecurity
- Defence → Nuclear doctrine (distinct from civil nuclear energy)
- History and Culture → World history (only Gounsa / Korea is a thin extra-India heritage item)

## Architecture Fit

- Subject `name`: 2–100 characters, globally unique (case-insensitive).
- Topic `name`: 2–100 characters, unique per `subjectId`.
- Topic requires a subject; Question requires one `subjectId` and one `topicId`.
- `order` and `isActive` exist; proposal uses `proposedOrder` only (no IDs yet).
