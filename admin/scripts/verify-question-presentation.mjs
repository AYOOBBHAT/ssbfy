/**
 * Admin presentation form helpers (no Vite/React runtime).
 * Run from admin/: node scripts/verify-question-presentation.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PRESENTATION_KINDS,
  addNumberedItem,
  addTableColumn,
  addTableRow,
  buildPresentationPayload,
  contentDraftFromQuestion,
  emptyContentDraft,
  normalizePresentationKind,
  removeNumberedItem,
  removeTableColumn,
  removeTableRow,
  syncTableShape,
  validatePresentation,
} from '../src/utils/questionPresentationForm.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

const base = {
  questionType: 'single_correct',
  options: ['A', 'B', 'C', 'D'],
  correctAnswers: [0],
  questionText: 'What is 2 + 2?',
  presentationKind: 'plain',
  content: emptyContentDraft(),
};

function run() {
  test('1. create plain payload', () => {
    const payload = buildPresentationPayload(base, { isEdit: false });
    assert.equal(payload.presentationKind, 'plain');
    assert.equal(payload.questionText, 'What is 2 + 2?');
    assert.equal('content' in payload, false);
  });

  test('2. create two_statements payload', () => {
    const form = {
      ...base,
      presentationKind: 'two_statements',
      content: {
        ...emptyContentDraft(),
        intro: 'Consider the following statements:',
        statements: [
          { label: 'Statement – I', text: 'Sky is blue.' },
          { label: 'Statement – II', text: 'Ocean is deep.' },
        ],
        prompt: 'Which is correct?',
      },
    };
    assert.equal(validatePresentation(form), null);
    const payload = buildPresentationPayload(form, { isEdit: false });
    assert.equal(payload.presentationKind, 'two_statements');
    assert.equal(payload.content.statements.length, 2);
    assert.equal(payload.content.statements[0].label, 'Statement – I');
    assert.equal('questionText' in payload, false);
  });

  test('3. create numbered_list payload preserves n=1,2,4', () => {
    const form = {
      ...base,
      presentationKind: 'numbered_list',
      content: {
        ...emptyContentDraft(),
        items: [
          { n: 1, text: 'Wheat' },
          { n: 2, text: 'Rice' },
          { n: 4, text: 'Maize' },
        ],
      },
    };
    assert.equal(validatePresentation(form), null);
    const payload = buildPresentationPayload(form);
    assert.deepEqual(
      payload.content.items.map((i) => i.n),
      [1, 2, 4]
    );
    assert.equal('questionText' in payload, false);
  });

  test('4. create table payload', () => {
    const form = {
      ...base,
      presentationKind: 'table',
      content: {
        ...emptyContentDraft(),
        columns: ['List I', 'List II'],
        rows: [
          ['Delhi', 'India'],
          ['Paris', ''],
        ],
      },
    };
    assert.equal(validatePresentation(form), null);
    const payload = buildPresentationPayload(form);
    assert.equal(payload.presentationKind, 'table');
    assert.equal(payload.content.rows[1][1], '');
    assert.equal(payload.content.rows[0].length, payload.content.columns.length);
  });

  test('5. edit existing plain question (missing presentationKind)', () => {
    const q = { questionText: 'Legacy', options: ['A', 'B'] };
    assert.equal(normalizePresentationKind(q.presentationKind), 'plain');
    const form = {
      ...base,
      presentationKind: normalizePresentationKind(q.presentationKind),
      questionText: q.questionText,
      content: contentDraftFromQuestion(q),
    };
    const payload = buildPresentationPayload(form, { isEdit: true });
    assert.equal(payload.presentationKind, 'plain');
    assert.equal(payload.questionText, 'Legacy');
    assert.equal(payload.content, null);
  });

  test('6. edit existing structured question', () => {
    const q = {
      presentationKind: 'two_statements',
      questionText: 'flattened',
      content: {
        statements: [
          { label: 'Statement – I', text: 'Alpha' },
          { label: 'Statement – II', text: 'Beta' },
        ],
      },
    };
    const draft = contentDraftFromQuestion(q);
    assert.equal(draft.statements[0].text, 'Alpha');
    const payload = buildPresentationPayload(
      { ...base, presentationKind: 'two_statements', content: draft },
      { isEdit: true }
    );
    assert.equal(payload.presentationKind, 'two_statements');
    assert.equal('questionText' in payload, false);
    assert.equal(payload.content.statements[1].text, 'Beta');
  });

  test('7. switch structured → plain drops content from payload', () => {
    const form = {
      ...base,
      presentationKind: 'plain',
      questionText: 'Now a plain stem',
      content: {
        ...emptyContentDraft(),
        statements: [
          { label: 'Statement – I', text: 'stale' },
          { label: 'Statement – II', text: 'stale' },
        ],
      },
    };
    const payload = buildPresentationPayload(form, { isEdit: true });
    assert.equal(payload.presentationKind, 'plain');
    assert.equal(payload.content, null);
    assert.equal(payload.questionText, 'Now a plain stem');
  });

  test('8. switch plain → structured does not parse questionText', () => {
    const form = {
      ...base,
      presentationKind: 'two_statements',
      questionText: 'Do not parse this into statements',
      content: emptyContentDraft(),
    };
    const err = validatePresentation(form);
    assert.match(err, /text is required/);
    const payload = buildPresentationPayload({
      ...form,
      content: {
        ...emptyContentDraft(),
        statements: [
          { label: 'Statement – I', text: 'New I' },
          { label: 'Statement – II', text: 'New II' },
        ],
      },
    });
    assert.equal(payload.content.statements[0].text, 'New I');
    assert.notEqual(payload.content.statements[0].text, form.questionText);
  });

  test('9. add/remove numbered items without renumbering', () => {
    let content = {
      ...emptyContentDraft(),
      items: [
        { n: 1, text: 'A' },
        { n: 2, text: 'B' },
      ],
    };
    content = addNumberedItem(content);
    assert.equal(content.items.length, 3);
    assert.equal(content.items[2].n, 3);
    content.items[2] = { n: 9, text: 'C' };
    content = removeNumberedItem(content, 1);
    assert.deepEqual(
      content.items.map((i) => i.n),
      [1, 9]
    );
  });

  test('10. add/remove table rows', () => {
    let content = emptyContentDraft();
    assert.equal(content.rows.length, 1);
    content = addTableRow(content);
    assert.equal(content.rows.length, 2);
    assert.equal(content.rows[1].length, content.columns.length);
    content = removeTableRow(content, 0);
    assert.equal(content.rows.length, 1);
  });

  test('11. add/remove table columns syncs every row', () => {
    let content = {
      ...emptyContentDraft(),
      columns: ['A', 'B'],
      rows: [
        ['1', '2'],
        ['3', '4'],
      ],
    };
    content = addTableColumn(content);
    assert.equal(content.columns.length, 3);
    assert.equal(content.rows[0].length, 3);
    assert.equal(content.rows[1].length, 3);
    assert.equal(content.rows[0][2], '');
    content = removeTableColumn(content, 1);
    assert.deepEqual(content.columns, ['A', 'Column 3']);
    assert.deepEqual(content.rows[0], ['1', '']);
    assert.deepEqual(content.rows[1], ['3', '']);
  });

  test('12. table row lengths stay synchronized', () => {
    const synced = syncTableShape({
      columns: ['A', 'B', 'C'],
      rows: [['only-one'], ['x', 'y', 'z', 'extra']],
    });
    assert.equal(synced.rows[0].length, 3);
    assert.equal(synced.rows[1].length, 3);
    const payload = buildPresentationPayload({
      ...base,
      presentationKind: 'table',
      content: synced,
    });
    for (const row of payload.content.rows) {
      assert.equal(row.length, payload.content.columns.length);
    }
  });

  test('13–15. answer fields are not part of presentation payload', () => {
    const payload = buildPresentationPayload({
      ...base,
      questionType: 'multiple_correct',
      correctAnswers: [0, 2],
      presentationKind: 'plain',
    });
    assert.equal('correctAnswers' in payload, false);
    assert.equal('questionType' in payload, false);
    assert.equal(payload.presentationKind, 'plain');
  });

  test('16. image_based is independent of presentationKind', () => {
    const form = {
      ...base,
      questionType: 'image_based',
      presentationKind: 'two_statements',
      content: {
        ...emptyContentDraft(),
        statements: [
          { label: 'Statement – I', text: 'A' },
          { label: 'Statement – II', text: 'B' },
        ],
      },
    };
    assert.equal(validatePresentation(form), null);
    const payload = buildPresentationPayload(form);
    assert.equal(payload.presentationKind, 'two_statements');
    assert.equal('questionImage' in payload, false);
  });

  test('17. no stale content submitted for plain', () => {
    const createPlain = buildPresentationPayload(
      {
        ...base,
        presentationKind: 'plain',
        content: {
          ...emptyContentDraft(),
          statements: [
            { label: 'Statement – I', text: 'stale' },
            { label: 'Statement – II', text: 'stale' },
          ],
        },
      },
      { isEdit: false }
    );
    assert.equal('content' in createPlain, false);

    const editPlain = buildPresentationPayload(
      {
        ...base,
        presentationKind: PRESENTATION_KINDS.PLAIN,
        content: emptyContentDraft(),
      },
      { isEdit: true }
    );
    assert.equal(editPlain.content, null);
  });

  test('AddQuestion wires presentation selector and existing questionType', () => {
    const src = read('src/pages/AddQuestion.jsx');
    assert.match(src, /Question Type \*/);
    assert.match(src, /Presentation \*/);
    assert.match(src, /id="questionType"/);
    assert.match(src, /id="presentationKind"/);
    assert.match(src, /QuestionPresentationFields/);
    assert.match(src, /buildPresentationPayload/);
    assert.match(src, /content: null|buildPresentationPayload\(form, \{ isEdit \}\)/);
    assert.doesNotMatch(src, /flattenQuestionContentToText/);
    assert.match(src, /single_correct/);
    assert.match(src, /multiple_correct/);
    assert.match(src, /image_based/);
  });

  test('importer and mobile were not modified by this helper suite', () => {
    const importer = read('src/pages/ImportQuestions.jsx');
    assert.doesNotMatch(importer, /presentationKind/);
  });

  console.log(`verify-question-presentation: ${passed} checks passed`);
}

run();
