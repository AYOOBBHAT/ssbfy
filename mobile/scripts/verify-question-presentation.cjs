/**
 * Phase 2 question presentation resolver + screen wiring (no React Native runtime).
 * Run from mobile/: node scripts/verify-question-presentation.cjs
 */
const assert = require('assert/strict');
const fs = require('fs');
const Module = require('module');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function loadModule(rel, exportNames) {
  const filename = path.join(SRC, rel);
  const source = fs.readFileSync(filename, 'utf8');
  const cjs = `
${source
    .replace(/import\s+\{[\s\S]*?\}\s+from\s+['"][^'"]+['"];?/g, '')
    .replace(/\bexport\s+function\s+/g, 'function ')
    .replace(/\bexport\s+const\s+/g, 'const ')
    .replace(/\bexport\s+\{[\s\S]*?\};?/g, '')}

module.exports = { ${exportNames.join(', ')} };
`;
  const m = new Module(filename);
  m.filename = filename;
  m.paths = Module._nodeModulePaths(path.dirname(filename));
  m._compile(cjs, filename);
  return m.exports;
}

const { resolveQuestionPresentation, PRESENTATION_KINDS } = loadModule(
  'utils/questionPresentation.js',
  ['resolveQuestionPresentation', 'PRESENTATION_KINDS']
);

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

const TWO = {
  intro: 'Consider the following:',
  statements: [
    { label: 'Statement – I', text: 'The sky is blue.' },
    { label: 'Statement – II', text: 'The ocean is deep.' },
  ],
  prompt: 'Which of the above statements is/are correct?',
};

const LIST = {
  intro: 'Consider the following:',
  items: [
    { n: 3, text: 'Maize is a cereal.' },
    { n: 1, text: 'Wheat is a cereal.' },
    { n: 2, text: 'Rice is a cereal.' },
  ],
  prompt: 'How many of the above are cereals?',
};

const TABLE = {
  intro: 'Match the following:',
  columns: ['List I', 'List II', 'List III'],
  rows: [
    ['A. Delhi', '1. India', ''],
    ['B. Paris', '2. France', 'Capital'],
  ],
  prompt: 'Select the correct pair.',
};

function run() {
  test('1. existing plain question', () => {
    const r = resolveQuestionPresentation(
      { questionText: 'What is 2 + 2?', options: ['3', '4'], questionType: 'single_correct' },
      { fallbackLabel: '(question unavailable)', emptyAsFallback: true }
    );
    assert.equal(r.kind, PRESENTATION_KINDS.PLAIN);
    assert.equal(r.text, 'What is 2 + 2?');
  });

  test('2. two_statements example uses content labels, not questionText', () => {
    const r = resolveQuestionPresentation({
      questionText: 'flattened should not be parsed',
      presentationKind: 'two_statements',
      content: TWO,
    });
    assert.equal(r.kind, 'two_statements');
    assert.equal(r.intro, 'Consider the following:');
    assert.equal(r.statements[0].label, 'Statement – I');
    assert.equal(r.statements[1].label, 'Statement – II');
    assert.equal(r.statements[0].text, 'The sky is blue.');
    assert.equal(r.prompt, 'Which of the above statements is/are correct?');
    assert.equal(r.text, undefined);
  });

  test('3. numbered_list preserves supplied n and backend order', () => {
    const r = resolveQuestionPresentation({
      questionText: 'do not parse me',
      presentationKind: 'numbered_list',
      content: LIST,
    });
    assert.equal(r.kind, 'numbered_list');
    assert.deepEqual(
      r.items.map((i) => i.n),
      [3, 1, 2]
    );
    assert.equal(r.items[0].text, 'Maize is a cereal.');
  });

  test('4. table example including empty cells', () => {
    const r = resolveQuestionPresentation({
      questionText: 'do not parse me',
      presentationKind: 'table',
      content: TABLE,
    });
    assert.equal(r.kind, 'table');
    assert.equal(r.columns.length, 3);
    assert.equal(r.rows[0][2], '');
    assert.equal(r.rows[1][2], 'Capital');
  });

  test('5. missing presentationKind behaves as plain', () => {
    const r = resolveQuestionPresentation({
      questionText: 'Legacy stem',
      options: ['A', 'B'],
      questionType: 'single_correct',
    });
    assert.equal(r.kind, 'plain');
    assert.equal(r.text, 'Legacy stem');
  });

  test('6. malformed/missing content falls back to questionText', () => {
    const missing = resolveQuestionPresentation({
      questionText: 'Fallback stem',
      presentationKind: 'two_statements',
      content: null,
    });
    assert.equal(missing.kind, 'plain');
    assert.equal(missing.text, 'Fallback stem');

    const badList = resolveQuestionPresentation({
      questionText: 'List fallback',
      presentationKind: 'numbered_list',
      content: { items: [{ n: 'x', text: 'bad' }] },
    });
    assert.equal(badList.kind, 'plain');
    assert.equal(badList.text, 'List fallback');

    const badTable = resolveQuestionPresentation({
      questionText: 'Table fallback',
      presentationKind: 'table',
      content: { columns: ['A', 'B'], rows: [['only-one']] },
    });
    assert.equal(badTable.kind, 'plain');
    assert.equal(badTable.text, 'Table fallback');

    const unknown = resolveQuestionPresentation({
      questionText: 'Unknown kind',
      presentationKind: 'assertion_reason',
      content: TWO,
    });
    assert.equal(unknown.kind, 'plain');
    assert.equal(unknown.text, 'Unknown kind');

    const oneItem = resolveQuestionPresentation({
      questionText: 'Need two items',
      presentationKind: 'numbered_list',
      content: { items: [{ n: 1, text: 'Only one' }] },
    });
    assert.equal(oneItem.kind, 'plain');
    assert.equal(oneItem.text, 'Need two items');

    const badN = resolveQuestionPresentation({
      questionText: 'Bad n',
      presentationKind: 'numbered_list',
      content: {
        items: [
          { n: 0, text: 'Zero' },
          { n: 1, text: 'One' },
        ],
      },
    });
    assert.equal(badN.kind, 'plain');
    assert.equal(badN.text, 'Bad n');

    const emptyItem = resolveQuestionPresentation({
      questionText: 'Empty item',
      presentationKind: 'numbered_list',
      content: {
        items: [
          { n: 1, text: '  ' },
          { n: 2, text: 'Two' },
        ],
      },
    });
    assert.equal(emptyItem.kind, 'plain');
    assert.equal(emptyItem.text, 'Empty item');
  });

  test('7. long statement text is kept intact', () => {
    const long = `${'Long clause. '.repeat(40)}End.`;
    const r = resolveQuestionPresentation({
      questionText: 'flat',
      presentationKind: 'two_statements',
      content: {
        statements: [
          { label: 'Statement – I', text: long },
          { label: 'Statement – II', text: 'Short' },
        ],
      },
    });
    assert.equal(r.statements[0].text, long);
  });

  test('8. long numbered item is kept intact', () => {
    const long = `${'Item clause. '.repeat(30)}End.`;
    const r = resolveQuestionPresentation({
      questionText: 'flat',
      presentationKind: 'numbered_list',
      content: {
        items: [
          { n: 1, text: long },
          { n: 2, text: 'Two' },
        ],
      },
    });
    assert.equal(r.items[0].text, long);
  });

  test('9. multi-column table (3+ columns)', () => {
    const r = resolveQuestionPresentation({
      questionText: 'flat',
      presentationKind: 'table',
      content: TABLE,
    });
    assert.equal(r.columns.length, 3);
    assert.equal(r.rows.length, 2);
  });

  test('10. table empty cells are empty strings, not null', () => {
    const r = resolveQuestionPresentation({
      questionText: 'flat',
      presentationKind: 'table',
      content: {
        columns: ['A', 'B'],
        rows: [['', 'kept']],
      },
    });
    assert.equal(r.rows[0][0], '');
    assert.equal(r.rows[0][1], 'kept');
  });

  test('11. ReviewAnswers structured snapshot shape resolves', () => {
    const snapshotQuestion = {
      _id: 'q1',
      questionText: 'flattened stem',
      options: ['A', 'B', 'C', 'D'],
      questionType: 'single_correct',
      presentationKind: 'two_statements',
      content: TWO,
      explanation: 'because',
    };
    const r = resolveQuestionPresentation(snapshotQuestion, {
      fallbackLabel: '(missing question)',
    });
    assert.equal(r.kind, 'two_statements');
    assert.equal(r.statements[1].label, 'Statement – II');
  });

  test('12. ReviewAnswers old/plain snapshot + explicit plain/null content', () => {
    const oldSnap = resolveQuestionPresentation(
      {
        questionText: 'Old snapshot stem',
        options: ['A', 'B'],
        questionType: 'single_correct',
      },
      { fallbackLabel: '(missing question)' }
    );
    assert.equal(oldSnap.kind, 'plain');
    assert.equal(oldSnap.text, 'Old snapshot stem');

    const explicitPlain = resolveQuestionPresentation(
      {
        questionText: 'Plain with null content',
        options: ['A', 'B'],
        questionType: 'single_correct',
        presentationKind: 'plain',
        content: null,
      },
      { fallbackLabel: '(missing question)' }
    );
    assert.equal(explicitPlain.kind, 'plain');
    assert.equal(explicitPlain.text, 'Plain with null content');
  });

  test('empty structured content does not render a blank stem', () => {
    const r = resolveQuestionPresentation(
      { presentationKind: 'table', content: {}, questionText: '' },
      { fallbackLabel: '(question unavailable)', emptyAsFallback: true }
    );
    assert.equal(r.kind, 'plain');
    assert.equal(r.text, '(question unavailable)');
  });

  test('TestScreen and ReviewAnswersScreen share QuestionPresentation', () => {
    const testSrc = read('src/screens/TestScreen.js');
    const reviewSrc = read('src/screens/ReviewAnswersScreen.js');
    const compSrc = read('src/components/QuestionPresentation.js');

    assert.match(testSrc, /import QuestionPresentation from '\.\.\/components\/QuestionPresentation'/);
    assert.match(reviewSrc, /import QuestionPresentation from '\.\.\/components\/QuestionPresentation'/);
    assert.match(testSrc, /<QuestionPresentation/);
    assert.match(reviewSrc, /<QuestionPresentation/);

    assert.doesNotMatch(testSrc, /styles\.question[\s\S]*questionText/);
    assert.doesNotMatch(reviewSrc, /styles\.qText[\s\S]*questionText/);
    assert.match(testSrc, /variant="test"/);
    assert.match(reviewSrc, /variant="review"/);

    assert.match(compSrc, /resolveQuestionPresentation/);
    assert.doesNotMatch(compSrc, /questionText\.split/);
    assert.doesNotMatch(compSrc, /JSON\.parse\(question/);
    assert.doesNotMatch(compSrc, /selectedOptionIndexes/);
    assert.doesNotMatch(compSrc, /correctAnswers/);
  });

  test('component does not parse questionText and screens keep option UI', () => {
    const testSrc = read('src/screens/TestScreen.js');
    const reviewSrc = read('src/screens/ReviewAnswersScreen.js');
    assert.match(testSrc, /selectOption/);
    assert.match(testSrc, /selectedSet\.includes/);
    assert.match(reviewSrc, /getOptionStyle/);
    assert.match(reviewSrc, /Explanation:/);
  });

  console.log(`verify-question-presentation: ${passed} checks passed`);
}

run();
