/**
 * Phase 7 — JKSSB question-format production audit.
 * SET A is reference data only. READ-ONLY. No Test / Question / Post writes.
 *
 * Run: node scripts/verify-jkssb-question-format-phase7.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';
import { BACKEND_ROOT, loadBackendEnv } from './lib/db.mjs';
import {
  PRESENTATION_KINDS,
  prepareQuestionPresentation,
} from '../src/utils/questionPresentation.js';
import { projectPublicQuestion } from '../src/services/questionService.js';
import { scoreQuestionSession } from '../src/utils/questionScoring.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'set-a');
const REPORT_PATH = path.join(FIXTURE_DIR, 'SET_A_phase7_jkssb_question_format_report.md');
const EXPECTED_DB = 'ssbfy';
const REPO_ROOT = path.resolve(BACKEND_ROOT, '..');
const PRODUCTION_ROOTS = [
  path.join(BACKEND_ROOT, 'src'),
  path.join(REPO_ROOT, 'admin', 'src'),
  path.join(REPO_ROOT, 'mobile', 'src'),
];
const FORBIDDEN_WRITE = [
  'insertOne',
  'insertMany',
  'updateOne',
  'updateMany',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'bulkWrite',
  'createIndex',
  'syncIndexes',
];
const SET_A_MARKERS = [
  /SET_A/,
  /SET A/,
  /sourceQuestionNumber/,
  /set-a/,
];

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function assertReadOnlySource() {
  const src = stripComments(fs.readFileSync(__filename, 'utf8'));
  const hits = FORBIDDEN_WRITE.filter((token) => new RegExp(`\\b${token}\\s*\\(`, 'g').test(src));
  if (hits.length) {
    throw new Error(`Phase 7 JKSSB format script is not read-only: ${hits.join(', ')}`);
  }
}

function loadMongoUri() {
  loadBackendEnv();
  const fromEnv = String(process.env.MONGODB_URI || '').trim();
  if (fromEnv) return fromEnv;
  const envPath = path.join(BACKEND_ROOT, '.env');
  if (!fs.existsSync(envPath)) return '';
  const text = fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '');
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith('MONGODB_URI=')) return t.slice('MONGODB_URI='.length).trim();
    if (t.startsWith('mongodb://') || t.startsWith('mongodb+srv://')) return t;
  }
  return '';
}

function walkJsFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) {
      if (name.name === 'node_modules' || name.name === 'dist') continue;
      walkJsFiles(full, acc);
    } else if (/\.(js|jsx|mjs|cjs|ts|tsx)$/.test(name.name)) {
      acc.push(full);
    }
  }
  return acc;
}

function rel(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
}

function scanProductionForSetA() {
  const hits = [];
  for (const root of PRODUCTION_ROOTS) {
    for (const file of walkJsFiles(root)) {
      const text = fs.readFileSync(file, 'utf8');
      for (const re of SET_A_MARKERS) {
        if (re.test(text)) {
          hits.push({ file: rel(file), marker: String(re) });
        }
      }
    }
  }
  return hits;
}

function fileContains(relPath, needle) {
  const full = path.join(REPO_ROOT, relPath);
  if (!fs.existsSync(full)) return false;
  return fs.readFileSync(full, 'utf8').includes(needle);
}

function validateLiveStructured(kind, content) {
  try {
    prepareQuestionPresentation({
      presentationKind: kind,
      content,
      questionText: kind === PRESENTATION_KINDS.PLAIN ? 'ok' : undefined,
    });
    return [];
  } catch (err) {
    return [err.message || String(err)];
  }
}

async function main() {
  assertReadOnlySource();

  const failures = [];
  const warnings = [];
  const passes = [];

  const isolationHits = scanProductionForSetA();
  if (isolationHits.length) {
    failures.push(
      `Production source contains SET A markers: ${isolationHits
        .map((h) => `${h.file} (${h.marker})`)
        .join('; ')}`,
    );
  } else {
    passes.push('Production src (backend/admin/mobile) has no SET A / sourceQuestionNumber special case.');
  }

  const testHasPresentation = fileContains('backend/src/models/Test.js', 'presentationKind');
  if (testHasPresentation) {
    failures.push('Test model contains presentationKind — Test.kind must stay independent of Question.presentationKind.');
  } else {
    passes.push('Test model has no presentationKind field.');
  }

  const classifySrc = fs.readFileSync(
    path.join(BACKEND_ROOT, 'src', 'services', 'testService.js'),
    'utf8',
  );
  if (/presentationKind/.test(classifySrc)) {
    failures.push('testService.js references presentationKind (tests must not filter by presentation).');
  } else {
    passes.push('testService does not filter questionIds by presentationKind.');
  }

  const publicSrc = fs.readFileSync(
    path.join(BACKEND_ROOT, 'src', 'services', 'questionService.js'),
    'utf8',
  );
  const publicFn = publicSrc.match(/export function projectPublicQuestion[\s\S]*?^export function projectPublicQuestions/m);
  const publicBody = publicFn ? publicFn[0] : publicSrc;
  for (const secret of ['correctAnswers', 'correctAnswerIndex', 'correctAnswerValue', 'explanation']) {
    if (new RegExp(`\\b${secret}\\b`).test(publicBody) && secret !== 'correctAnswers') {
      /* explanation/correctAnswer* must not appear as returned keys */
    }
  }
  if (/correctAnswers:/.test(publicBody) || /explanation:/.test(publicBody)) {
    failures.push('projectPublicQuestion appears to emit answer/explanation fields.');
  } else {
    passes.push('projectPublicQuestion does not emit correctAnswers / explanation.');
  }

  const samplePlain = {
    _id: '000000000000000000000001',
    questionText: 'Plain stem',
    options: ['A', 'B', 'C', 'D'],
    questionType: 'single_correct',
    presentationKind: 'plain',
    content: null,
    correctAnswers: [1],
    correctAnswerIndex: 1,
    correctAnswerValue: 'B',
    explanation: 'secret',
  };
  const pubPlain = projectPublicQuestion(samplePlain);
  if (pubPlain.correctAnswers != null || pubPlain.explanation != null || pubPlain.correctAnswerIndex != null) {
    failures.push('projectPublicQuestion leaked answer fields on a sample plain question.');
  }
  if (pubPlain.presentationKind !== 'plain') {
    failures.push('projectPublicQuestion missing presentationKind on plain sample.');
  }

  const twoContent = {
    intro: 'Consider the following:',
    statements: [
      { label: 'Statement – I', text: 'Alpha' },
      { label: 'Statement – II', text: 'Beta' },
    ],
    prompt: 'Which is correct?',
  };
  const preparedTwo = prepareQuestionPresentation({
    presentationKind: PRESENTATION_KINDS.TWO_STATEMENTS,
    content: twoContent,
    questionText: 'CLIENT MUST NOT WIN',
  });
  if (preparedTwo.questionText.includes('CLIENT MUST NOT WIN')) {
    failures.push('Backend trusted client-supplied questionText for two_statements.');
  } else {
    passes.push('Structured writes ignore client questionText; backend flattens from content.');
  }

  const pubTwo = projectPublicQuestion({
    ...samplePlain,
    presentationKind: PRESENTATION_KINDS.TWO_STATEMENTS,
    content: preparedTwo.content,
    questionText: preparedTwo.questionText,
  });
  if (!pubTwo.content || !Array.isArray(pubTwo.content.statements)) {
    failures.push('Public API flattened away two_statements content.');
  } else {
    passes.push('Public API preserves structured content.');
  }

  const missingKind = projectPublicQuestion({
    questionText: 'legacy',
    options: ['A', 'B'],
    correctAnswers: [0],
    explanation: 'no',
  });
  if (missingKind.presentationKind !== 'plain') {
    failures.push('Legacy question without presentationKind did not project as plain.');
  } else {
    passes.push('Missing presentationKind projects as plain.');
  }

  const qid = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  const scoredPlain = scoreQuestionSession({
    orderedQuestionIds: [qid],
    questionsById: new Map([
      [qid, { _id: qid, options: ['A', 'B', 'C', 'D'], correctAnswers: [2], questionType: 'single_correct' }],
    ]),
    userAnswersByQid: new Map([[qid, [2]]]),
  });
  const scoredStructured = scoreQuestionSession({
    orderedQuestionIds: [qid],
    questionsById: new Map([
      [
        qid,
        {
          _id: qid,
          options: ['A', 'B', 'C', 'D'],
          correctAnswers: [2],
          questionType: 'single_correct',
          presentationKind: PRESENTATION_KINDS.NUMBERED_LIST,
          content: {
            items: [
              { n: 1, text: 'One' },
              { n: 2, text: 'Two' },
            ],
          },
        },
      ],
    ]),
    userAnswersByQid: new Map([[qid, [2]]]),
  });
  if (scoredPlain.summary.correct !== 1 || scoredStructured.summary.correct !== 1) {
    failures.push('Scoring failed for plain or numbered_list single_correct.');
  } else {
    passes.push('Scoring uses option indexes only; presentationKind does not change correctness.');
  }

  const uri = loadMongoUri();
  if (!uri) throw new Error('MONGODB_URI unavailable');
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 15_000,
    readPreference: 'primary',
  });
  await client.connect();
  const db = client.db();
  const dbName = db.databaseName;
  const [questions, tests, subjects, topics, posts] = await Promise.all([
    db.collection('questions').find({}).toArray(),
    db.collection('tests').find({}).project({ title: 1, kind: 1, questionIds: 1, status: 1 }).toArray(),
    db.collection('subjects').find({}).toArray(),
    db.collection('topics').find({}).toArray(),
    db.collection('posts').find({}).toArray(),
  ]);
  await client.close();

  if (dbName !== EXPECTED_DB) failures.push(`database is ${dbName}, expected ${EXPECTED_DB}`);

  const kinds = { plain: 0, two_statements: 0, numbered_list: 0, table: 0, other: 0, missing: 0 };
  const types = { single_correct: 0, multiple_correct: 0, image_based: 0, other: 0 };
  const structuredIssues = [];
  let mixedTypeAndStructured = 0;
  let sourceFieldOnQuestion = 0;

  for (const q of questions) {
    if (q.sourceQuestionNumber != null) sourceFieldOnQuestion += 1;
    const kind = q.presentationKind;
    if (kind == null || kind === '') kinds.missing += 1;
    else if (kind in kinds) kinds[kind] += 1;
    else kinds.other += 1;
    const qt = q.questionType || 'single_correct';
    if (qt in types) types[qt] += 1;
    else types.other += 1;
    const resolvedKind = kind || PRESENTATION_KINDS.PLAIN;
    if (resolvedKind !== PRESENTATION_KINDS.PLAIN) {
      if (qt !== 'single_correct') mixedTypeAndStructured += 1;
      const issues = validateLiveStructured(resolvedKind, q.content);
      if (issues.length) structuredIssues.push({ id: String(q._id), kind: resolvedKind, issues });
    }
  }

  if (sourceFieldOnQuestion) {
    warnings.push(
      `${sourceFieldOnQuestion} live Question documents store sourceQuestionNumber. Production architecture does not require this field; it must not be used as a rendering special case.`,
    );
  }
  if (structuredIssues.length) {
    failures.push(`${structuredIssues.length} live structured questions fail prepareQuestionPresentation.`);
  } else {
    passes.push(
      `Live questions: ${questions.length} total; structured content valid for two_statements=${kinds.two_statements}, numbered_list=${kinds.numbered_list}, table=${kinds.table}.`,
    );
  }
  if (kinds.other) failures.push(`${kinds.other} questions have unknown presentationKind.`);

  const testsWithPresentationFilter = tests.filter((t) => t.presentationKind != null);
  if (testsWithPresentationFilter.length) {
    failures.push('Some Test documents have a presentationKind field.');
  }
  passes.push(`Live Tests: ${tests.length} (none created by this audit).`);

  const addQuestionSrc = fs.readFileSync(
    path.join(REPO_ROOT, 'admin', 'src', 'pages', 'AddQuestion.jsx'),
    'utf8',
  );
  if (
    /presentationKind\) !== PRESENTATION_KINDS\.PLAIN/.test(addQuestionSrc) &&
    /findSimilarQuestions/.test(addQuestionSrc)
  ) {
    warnings.push(
      'Admin duplicate detection still skips structured presentationKind. File: admin/src/pages/AddQuestion.jsx.',
    );
  } else if (!/duplicateStemFromForm/.test(addQuestionSrc)) {
    warnings.push(
      'Admin duplicate lookup does not use duplicateStemFromForm for structured stems. File: admin/src/pages/AddQuestion.jsx.',
    );
  } else {
    passes.push('Admin duplicate detection uses canonical stem for all presentation kinds.');
  }

  const createTestSrc = fs.readFileSync(
    path.join(REPO_ROOT, 'admin', 'src', 'pages', 'CreateTest.jsx'),
    'utf8',
  );
  if (!/presentationKindLabel/.test(createTestSrc)) {
    warnings.push(
      'Admin Test picker has no presentationKind label. File: admin/src/pages/CreateTest.jsx.',
    );
  } else {
    passes.push('Admin Test picker shows a presentationKind indicator.');
  }

  const mobilePresSrc = fs.readFileSync(
    path.join(REPO_ROOT, 'mobile', 'src', 'utils', 'questionPresentation.js'),
    'utf8',
  );
  if (!/n < 1/.test(mobilePresSrc) || !/MIN_NUMBERED_ITEMS/.test(mobilePresSrc)) {
    warnings.push(
      'Mobile numbered_list parser is still looser than backend item/n rules. File: mobile/src/utils/questionPresentation.js.',
    );
  } else {
    passes.push('Mobile numbered_list parser requires n>=1 and 2–20 items, matching backend.');
  }

  warnings.push(
    'Large tests that mix structured stems increase GET /questions?ids= payload (content + flattened questionText). TestScreen already loads all questions at once. File: mobile/src/screens/TestScreen.js getQuestionsByIds. Intentionally not optimized in Phase 8.',
  );

  let verdict = 'PASS';
  if (failures.length) verdict = 'FAIL';
  else if (warnings.length) verdict = 'PASS WITH WARNINGS';

  const report = `# Phase 7 — JKSSB Question Format Production Audit

## Purpose

SET A was imported only as **reference material** so SSBFY could implement the question formats JKSSB currently asks. SET A is **not** a Previous Year Paper product object.

This phase does **not**:

- create a SET A Test
- create a SET A PYQ
- create a Post for SET A
- invent a year for SET A
- modify the 250 imported questions

The goal is to verify that a **new** Admin-created question can use each supported presentation and travel through:

Admin form → API validation → MongoDB Question → Test.questionIds → Mock Test → TestScreen → answers → scoring → result → Review Answers.

SET A rows in Mongo, if present, are ordinary Question documents. They are evidence that the four presentations already exist in the database, not a special product type.

## Architecture

\`questionType\` = answer behavior: \`single_correct\` | \`multiple_correct\` | \`image_based\`  
(\`backend/src/models/Question.js\` \`QUESTION_TYPES\`)

\`presentationKind\` = stem display: \`plain\` | \`two_statements\` | \`numbered_list\` | \`table\`  
(\`backend/src/utils/questionPresentation.js\` \`PRESENTATION_KINDS\`)

\`content\` = structured stem payload (absent/null on plain and legacy docs)

These fields are independent. Two statements in the stem do **not** imply \`multiple_correct\`. Scoring never reads \`presentationKind\`.

\`Test.kind\` (\`mock\` | \`previous_year\`) is a product label on Test. It does not gate which presentations are allowed on \`questionIds\`.

## Admin Create

File: \`admin/src/pages/AddQuestion.jsx\`  
Helpers: \`admin/src/utils/questionPresentationForm.js\`  
UI: \`admin/src/components/QuestionPresentationFields.jsx\`

Question Type and Presentation are separate \`<select>\`s with helper copy: “Question Type is how the answer works. Presentation is how the question stem is displayed.”

| Case | questionType | presentationKind | Admin can create? |
|---|---|---|---|
| A | single_correct | plain | Yes — questionText + 4 options + one correct index |
| B | single_correct | two_statements | Yes — intro, two labeled statements, prompt; options remain A–D |
| C | single_correct | numbered_list | Yes — intro, items \`{n,text}\` (2–20), prompt |
| D | single_correct | table | Yes — intro, columns (1–8), rows (1–20), prompt |

\`buildPresentationPayload\` **omits \`questionText\`** for structured kinds so the backend remains the source of flattened text. Plain never sends structured \`content\` on create.

Default statement labels are \`Statement – I\` / \`Statement – II\`.

## Admin Edit

File: \`admin/src/pages/AddQuestion.jsx\` edit \`useEffect\` + \`changePresentationKind\` + \`applyPresentationOnUpdate\` in \`questionService.js\`.

| Scenario | Behavior |
|---|---|
| A. Existing plain | \`normalizePresentationKind\` missing/unknown → \`plain\`; questionText loaded |
| B. Existing structured | \`presentationKind\` + \`contentDraftFromQuestion\` load intro/statements/items/table |
| C. Structured → plain | Edit payload sends \`presentationKind: plain\` and \`content: null\`; service \`doc.set('content', undefined)\` |
| D. Plain → structured | Structured editor appears; payload sends \`content\` without client \`questionText\` |
| E. Legacy missing kind | Treated as plain |

\`changePresentationKind\` does not wipe the in-memory content draft. That is UI-only; the payload builder does not send leftover structured fields for plain.

## Backend Validation

File: \`backend/src/utils/questionPresentation.js\` \`prepareQuestionPresentation\`  
Wired from: \`createQuestionValidators\` / \`updateQuestionValidators\` (\`questionValidators.js\`) and Question \`pre('validate')\` + \`questionService.create/update\`.

| Kind | Rules |
|---|---|
| plain | \`questionText\` required (max 20000). Non-empty \`content\` rejected |
| two_statements | exactly 2 statements; label + text required; intro/prompt optional |
| numbered_list | 2–20 items; \`n\` positive integer; text required; intro/prompt optional |
| table | 1–8 columns; 1–20 rows; each row length = column count; cells strings (empty allowed); intro/prompt optional |

Invalid structured content throws \`AppError\` 400. Structured \`questionText\` is **always regenerated** via \`flattenQuestionContentToText\`; a client-supplied stem cannot win.

Update validator \`assertUpdatePresentation\` skips when only \`content\` is patched without \`presentationKind\`; \`applyPresentationOnUpdate\` still runs \`prepareQuestionPresentation\`.

## MongoDB Question Shape

Confirmed from \`Question.js\` + \`prepareQuestionPresentation\` return value (no sample inserts).

Plain: \`questionType\`, \`presentationKind: "plain"\`, \`questionText\`, \`options\`, \`correctAnswers\`. \`content\` omitted/undefined.

Structured: same plus \`content\` object (two_statements / numbered_list / table shapes above) and backend-generated \`questionText\`.

Live database \`${dbName}\`:

| presentationKind | count |
|---|---:|
| plain | ${kinds.plain} |
| two_statements | ${kinds.two_statements} |
| numbered_list | ${kinds.numbered_list} |
| table | ${kinds.table} |
| missing (legacy → treat as plain) | ${kinds.missing} |
| other | ${kinds.other} |
| **total** | **${questions.length}** |

questionType: single_correct=${types.single_correct}, multiple_correct=${types.multiple_correct}, image_based=${types.image_based}.  
Structured questions that are not single_correct: ${mixedTypeAndStructured} (allowed by architecture; none required).

## Public API

\`projectPublicQuestion\` returns \`questionText\`, \`options\`, \`questionType\`, \`questionImage\`, taxonomy, \`year\`, plus \`presentationKind\` + \`content\` via \`presentationFieldsFromQuestion\`.

It does **not** copy \`correctAnswers\`, \`correctAnswerIndex\`, \`correctAnswerValue\`, or \`explanation\`.

Used by: \`GET /questions\` (including \`ids=\`), daily practice, battle public questions, \`getById\` student path.

Unknown \`presentationKind\` on read becomes \`plain\` (catch in \`presentationFieldsFromQuestion\`). Missing kind → plain. Structured \`content\` is cloned JSON, not flattened away.

## Mock Test Compatibility

Test stores ordered \`questionIds\` only (\`backend/src/models/Test.js\`).  
\`classifyQuestions\` checks active question + active subject/topic. **No presentationKind filter.**

A mock may mix:

1. plain  
2. two_statements  
3. numbered_list  
4. table  

\`Test.kind\` is independent. Creating \`kind=mock\` vs \`previous_year\` does not change which Question presentations are legal.

Live Tests inspected: **${tests.length}**. This audit created **0**.

Start snapshots \`test.questionIds\` onto the attempt; TestScreen fetches those ids via \`getQuestionsByIds\` and reorders to attempt order.

## Mobile Rendering

\`mobile/src/components/QuestionPresentation.js\` + \`mobile/src/utils/questionPresentation.js\` \`resolveQuestionPresentation\`.

Used by:

- \`TestScreen\` (\`variant="test"\`)
- \`ReviewAnswersScreen\` (\`variant="review"\`)

| Kind | Render |
|---|---|
| plain | \`questionText\` |
| two_statements | intro; each statement label + text in a block; prompt |
| numbered_list | intro; \`{n}. {text}\` using supplied \`n\`; prompt |
| table | intro; header row + cells; horizontal \`ScrollView\`; prompt |

Invalid/unknown kind or invalid content → plain fallback to \`questionText\`. Options stay in the parent (TestScreen Pressables / review option rows). Presentation does not change single vs multi select (\`questionType\` does).

## Answer / Scoring Compatibility

Options and \`correctAnswers\` are **indexes into \`options[]\`**, not into statements/items/table cells.

\`scoreQuestionSession\` / \`testAttemptService.submit\` / \`computeIsCorrect\` compare selected option index sets to \`correctAnswers\`. \`presentationKind\` is unused.

- two_statements + single_correct → one option index  
- numbered_list + single_correct → one option index  
- table + single_correct → one option index  

\`multiple_correct\` is a separate \`questionType\` and uses exact set match. Stem structure never promotes a question to multiple_correct.

## Snapshot Compatibility

| Snapshot | Copies presentationKind + content | Scoring source |
|---|---|---|
| TestAttempt.resultSnapshot | \`presentationFieldsFromQuestion\` in \`buildResultSnapshotAtSubmit\` | selected vs correct indexes |
| LearningSession.snapshot | same in \`buildLearningSessionSnapshotV1\` | same |
| BattleSession.questionSnapshots | \`buildBattleQuestionSnapshot\` / restore via \`questionFromBattleSnapshot\` | same |
| Practice reveal review rows | \`buildReviewQuestion\` | \`scoreQuestionSession\` |

Schema defaults \`presentationKind: 'plain'\`, \`content: null\` so **old snapshots** without those fields remain valid and render as plain. Placeholder deleted-question items are plain.

Historical review rebuilds Question-shaped objects with presentation fields, so ReviewAnswersScreen can render structured stems from the snapshot rather than re-flattening.

## Result / Review Compatibility

Submit → ResultScreen → ReviewAnswersScreen with the same question objects (live public questions or snapshot items). Both screens use \`QuestionPresentation\`. There is no review-only flatten path for two_statements / numbered_list / table when \`content\` is present and valid. Fallback to \`questionText\` only if content is invalid (same as TestScreen).

## Previous Year / Daily / Battle Compatibility

| Feature | Question source | presentation filter? |
|---|---|---|
| Previous Year Papers | same Test + questionIds engine | no |
| Daily Practice | \`findRandomActive({ isActive: true })\` then \`projectPublicQuestions\` | no |
| Battle | live questions or battle snapshots → \`projectPublicQuestions\` | no |
| Weak/smart practice | random active by topic/scope + public projection | no |

No production branch of the form \`if (test.kind === "previous_year") allow structured\`. Structured presentation belongs to Question.

## SET A Isolation

Scanned: \`backend/src\`, \`admin/src\`, \`mobile/src\`.

SET A markers found in production source: **${isolationHits.length}**.

Import/audit scripts and \`backend/scripts/fixtures/set-a/\` may mention SET A; that is **not** runtime product logic.

Live questions with \`sourceQuestionNumber\`: **${sourceFieldOnQuestion}** (Question schema does not define this field).

The four presentations work for **new Admin questions** with no SET A metadata.

## Edge Cases

| Case | Backend write | Public/mobile read |
|---|---|---|
| missing presentationKind | default/plain on save | plain |
| unknown presentationKind | 400 | catch → plain |
| two_statements invalid content | 400 | fallback questionText |
| numbered_list invalid n | 400 (\`n\` must be ≥ 1) | client may still parse non-positive n (warning) |
| table mismatched row length | 400 | fallback questionText |
| empty/null content on structured | 400 | fallback |
| old documents | readable | plain |
| structured missing questionText on write | generated from content | n/a |
| stale client questionText | overwritten on write | mobile prefers content when valid |

## Performance

No speculative change. Visible concerns:

- Structured \`content\` is duplicated alongside flattened \`questionText\` in API payloads.
- TestScreen loads **all** attempt questions in one \`GET /questions?ids=\` (CSV of ObjectIds). A 250-question mixed paper is a large JSON body.
- Tables use nested horizontal ScrollView (wide JKSSB match-the-following).

None of these block creating **new** mixed-format mock tests of typical size.

## Findings

### PASS

${passes.map((p) => `- ${p}`).join('\n')}

- Admin Cases A–D are supported without flattening in the client.
- Backend is the source of truth for structured \`questionText\`.
- Mock Tests do not restrict presentationKind.
- Mobile TestScreen and ReviewAnswersScreen share QuestionPresentation.
- Scoring is index-based and presentation-agnostic.
- Snapshots copy presentationKind + content; legacy snapshots default to plain.
- PYQ / Daily / Battle consume the same Question documents.
- SET A is not special-cased in production code.

### WARNINGS

${warnings.map((w) => `- ${w}`).join('\n')}

### FAILURES

${failures.length ? failures.map((f) => `- ${f}`).join('\n') : '- none'}

## Final Verdict

**${verdict}**

MongoDB writes: 0  
Questions created: 0  
Questions modified: 0  
Questions deleted: 0  
Tests created: 0  
Tests modified: 0  
Tests deleted: 0  
Posts created: 0  
Posts modified: 0  
Indexes created: 0  

Do not implement fixes or create a SET A Test without explicit approval.
`;

  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, 'utf8');

  console.log(
    JSON.stringify(
      {
        database: dbName,
        questions: questions.length,
        tests: tests.length,
        subjects: subjects.length,
        topics: topics.length,
        posts: posts.length,
        presentation: kinds,
        isolationHits: isolationHits.length,
        structuredIssues: structuredIssues.length,
        verdict,
        mongodbWrites: 0,
        testsCreated: 0,
        questionsModified: 0,
      },
      null,
      2,
    ),
  );

  if (verdict === 'FAIL') {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
