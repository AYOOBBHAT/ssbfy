# SET A conversion review (Phase 5A)

Source: `SET A - (1-250) Questions.pdf` (School of UPSC, 57 pages).

**Correct answers:** the PDF is a question booklet only. There is no answer key, no highlighted option colour, and no solutions section. `correctAnswers` is therefore **omitted** from every JSONL record. Do not import these records for scoring until a key is supplied.

**Metadata:** subject, topic, difficulty, year, explanation, questionImage, and postIds were not in the source and are omitted.

## Counts

- Total records: 250
- plain: 49
- two_statements: 8
- numbered_list: 179
- table: 14
- multiple_correct: 0
- Missing question numbers: none
- Presentation validation failures: 0

## Manual review (extraction / layout)

These questions need a human look before any later import (in addition to the missing answer key, which applies to **all 250**):

| Q | Why |
|---|---|
| 8 | 3-column “information” table reconstructed from wrapped PDF text |
| 34 | Pair rows were not bulleted in the extracted text |
| 94 | Prompt sat on the following PDF page |
| 146, 168, 176, 223, 227, 245, 250 | Table headers/cells wrapped across lines |
| 222 | Source option letters were e–h; stored as A–D option text |
| 250 | Source spelling “Odissa” preserved |

## Question table

| Q | Presentation | Options | Structured | Potential issue |
|---|---|---|---|---|
| 1 | two_statements | 4 | yes | answer key absent (all Qs) |
| 2 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 3 | plain | 4 | no | answer key absent (all Qs) |
| 4 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 5 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 6 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 7 | plain | 4 | no | answer key absent (all Qs) |
| 8 | table | 4 | yes | table_three_column_layout_reconstructed_from_wrapped_text; table_reconstructed_from_pdf_text |
| 9 | plain | 4 | no | answer key absent (all Qs) |
| 10 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 11 | two_statements | 4 | yes | answer key absent (all Qs) |
| 12 | table | 4 | yes | table_reconstructed_from_pdf_text |
| 13 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 14 | two_statements | 4 | yes | answer key absent (all Qs) |
| 15 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 16 | plain | 4 | no | answer key absent (all Qs) |
| 17 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 18 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 19 | plain | 4 | no | answer key absent (all Qs) |
| 20 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 21 | plain | 4 | no | answer key absent (all Qs) |
| 22 | plain | 4 | no | answer key absent (all Qs) |
| 23 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 24 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 25 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 26 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 27 | plain | 4 | no | answer key absent (all Qs) |
| 28 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 29 | plain | 4 | no | answer key absent (all Qs) |
| 30 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 31 | plain | 4 | no | answer key absent (all Qs) |
| 32 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 33 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 34 | table | 4 | yes | table_rows_not_bulleted_in_source_text; table_reconstructed_from_pdf_text |
| 35 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 36 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 37 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 38 | plain | 4 | no | answer key absent (all Qs) |
| 39 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 40 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 41 | plain | 4 | no | answer key absent (all Qs) |
| 42 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 43 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 44 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 45 | plain | 4 | no | answer key absent (all Qs) |
| 46 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 47 | plain | 4 | no | answer key absent (all Qs) |
| 48 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 49 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 50 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 51 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 52 | plain | 4 | no | answer key absent (all Qs) |
| 53 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 54 | plain | 4 | no | answer key absent (all Qs) |
| 55 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 56 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 57 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 58 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 59 | plain | 4 | no | answer key absent (all Qs) |
| 60 | plain | 4 | no | answer key absent (all Qs) |
| 61 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 62 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 63 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 64 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 65 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 66 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 67 | plain | 4 | no | answer key absent (all Qs) |
| 68 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 69 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 70 | plain | 4 | no | answer key absent (all Qs) |
| 71 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 72 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 73 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 74 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 75 | plain | 4 | no | answer key absent (all Qs) |
| 76 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 77 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 78 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 79 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 80 | plain | 4 | no | answer key absent (all Qs) |
| 81 | two_statements | 4 | yes | answer key absent (all Qs) |
| 82 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 83 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 84 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 85 | plain | 4 | no | answer key absent (all Qs) |
| 86 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 87 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 88 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 89 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 90 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 91 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 92 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 93 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 94 | table | 4 | yes | prompt_crossed_page_boundary; table_reconstructed_from_pdf_text |
| 95 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 96 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 97 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 98 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 99 | plain | 4 | no | answer key absent (all Qs) |
| 100 | plain | 4 | no | answer key absent (all Qs) |
| 101 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 102 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 103 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 104 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 105 | table | 4 | yes | table_reconstructed_from_pdf_text |
| 106 | plain | 4 | no | answer key absent (all Qs) |
| 107 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 108 | plain | 4 | no | answer key absent (all Qs) |
| 109 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 110 | plain | 4 | no | answer key absent (all Qs) |
| 111 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 112 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 113 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 114 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 115 | two_statements | 4 | yes | answer key absent (all Qs) |
| 116 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 117 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 118 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 119 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 120 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 121 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 122 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 123 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 124 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 125 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 126 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 127 | plain | 4 | no | answer key absent (all Qs) |
| 128 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 129 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 130 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 131 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 132 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 133 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 134 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 135 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 136 | plain | 4 | no | answer key absent (all Qs) |
| 137 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 138 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 139 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 140 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 141 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 142 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 143 | plain | 4 | no | answer key absent (all Qs) |
| 144 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 145 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 146 | table | 4 | yes | table_labels_wrapped_across_lines; table_reconstructed_from_pdf_text |
| 147 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 148 | two_statements | 4 | yes | answer key absent (all Qs) |
| 149 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 150 | table | 4 | yes | table_reconstructed_from_pdf_text |
| 151 | plain | 4 | no | answer key absent (all Qs) |
| 152 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 153 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 154 | plain | 4 | no | answer key absent (all Qs) |
| 155 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 156 | two_statements | 4 | yes | answer key absent (all Qs) |
| 157 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 158 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 159 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 160 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 161 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 162 | plain | 4 | no | answer key absent (all Qs) |
| 163 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 164 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 165 | plain | 4 | no | answer key absent (all Qs) |
| 166 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 167 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 168 | table | 4 | yes | table_labels_wrapped_across_lines; table_reconstructed_from_pdf_text |
| 169 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 170 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 171 | plain | 4 | no | answer key absent (all Qs) |
| 172 | plain | 4 | no | answer key absent (all Qs) |
| 173 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 174 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 175 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 176 | table | 4 | yes | table_labels_wrapped_across_lines; table_reconstructed_from_pdf_text |
| 177 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 178 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 179 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 180 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 181 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 182 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 183 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 184 | plain | 4 | no | answer key absent (all Qs) |
| 185 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 186 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 187 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 188 | table | 4 | yes | table_reconstructed_from_pdf_text |
| 189 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 190 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 191 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 192 | plain | 4 | no | answer key absent (all Qs) |
| 193 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 194 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 195 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 196 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 197 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 198 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 199 | plain | 4 | no | answer key absent (all Qs) |
| 200 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 201 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 202 | plain | 4 | no | answer key absent (all Qs) |
| 203 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 204 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 205 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 206 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 207 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 208 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 209 | plain | 4 | no | answer key absent (all Qs) |
| 210 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 211 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 212 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 213 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 214 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 215 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 216 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 217 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 218 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 219 | plain | 4 | no | answer key absent (all Qs) |
| 220 | plain | 4 | no | answer key absent (all Qs) |
| 221 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 222 | numbered_list | 4 | yes | source_option_letters_e_h_treated_as_a_d |
| 223 | table | 4 | yes | table_labels_wrapped_across_lines; table_reconstructed_from_pdf_text |
| 224 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 225 | two_statements | 4 | yes | answer key absent (all Qs) |
| 226 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 227 | table | 4 | yes | table_labels_wrapped_across_lines; table_reconstructed_from_pdf_text |
| 228 | plain | 4 | no | answer key absent (all Qs) |
| 229 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 230 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 231 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 232 | plain | 4 | no | answer key absent (all Qs) |
| 233 | plain | 4 | no | answer key absent (all Qs) |
| 234 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 235 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 236 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 237 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 238 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 239 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 240 | plain | 4 | no | answer key absent (all Qs) |
| 241 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 242 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 243 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 244 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 245 | table | 4 | yes | table_labels_wrapped_across_lines; table_reconstructed_from_pdf_text |
| 246 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 247 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 248 | numbered_list | 4 | yes | answer key absent (all Qs) |
| 249 | plain | 4 | no | answer key absent (all Qs) |
| 250 | table | 4 | yes | table_labels_wrapped_across_lines; source_spelling_odissa_preserved; table_reconstructed_from_pdf_text |

## Notes

- Q222 options are lettered e–h in the extracted PDF text; stored as A–D indexes 0–3 equivalent option text.
- Table column/row reconstruction used source wording; wrapped headers were joined. Uncertain 3-column layout: Q8.
- Source spelling such as “Odissa” in Q250 is preserved.
- No Assertion/Reason, passage, or match-mapping-code formats were found.
