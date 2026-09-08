/**
 * Phase 9G: READ-ONLY smoke-test cleanup audit.
 * Native MongoDB driver only. Does not insert, update, or delete anything.
 *
 * Writes:
 *   scripts/fixtures/set-a/SET_A_phase9g_cleanup_audit.md
 *   scripts/fixtures/set-a/SET_A_phase9g_cleanup_audit.json
 *
 * Run: node scripts/verify-phase9g-cleanup-audit.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient, ObjectId } from 'mongodb';
import { BACKEND_ROOT, loadBackendEnv } from './lib/db.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'set-a');
const OUT_MD = path.join(FIXTURE_DIR, 'SET_A_phase9g_cleanup_audit.md');
const OUT_JSON = path.join(FIXTURE_DIR, 'SET_A_phase9g_cleanup_audit.json');
const IMPORT_READY = path.join(FIXTURE_DIR, 'SET_A_import_ready.jsonl');
const METADATA_READY = path.join(FIXTURE_DIR, 'SET_A_metadata_import_ready.jsonl');
const SMOKE_IDS_PATH = path.join(FIXTURE_DIR, 'PHASE9_smoke_test_ids.json');

const EXPECTED_DB = 'ssbfy';
const MARKER = 'PHASE9_SMOKE_TEST_2026';
const POST_ID = '6a9fe271a6683cc1b21ccded';
const TEST_ID = '6aa01e61f2afe2eb763a4bda';
const OLD_ATTEMPT_ID = '6aa01e727a012eb44cc636c7';
const Q_SPECS = [
  { key: 'Q1', id: '6aa01e60f2afe2eb763a4bc1', expectedKind: 'plain' },
  { key: 'Q2', id: '6aa01e60f2afe2eb763a4bc7', expectedKind: 'two_statements' },
  { key: 'Q3', id: '6aa01e61f2afe2eb763a4bcd', expectedKind: 'numbered_list' },
  { key: 'Q4', id: '6aa01e61f2afe2eb763a4bd3', expectedKind: 'table' },
];
const Q_IDS = Q_SPECS.map((s) => s.id);
const SET_A_COUNT = 250;

const FORBIDDEN = [
  'insertOne',
  'insertMany',
  'updateOne',
  'updateMany',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'bulkWrite',
  'createIndex',
  'dropIndex',
  'syncIndexes',
  'createCollection',
  'dropCollection',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findOneAndReplace',
];

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function assertReadOnlySource() {
  const src = stripComments(fs.readFileSync(__filename, 'utf8'));
  const hits = FORBIDDEN.filter((token) => new RegExp(`\\b${token}\\s*\\(`, 'g').test(src));
  if (hits.length) {
    throw new Error(`Phase 9G audit script is not read-only: ${hits.join(', ')}`);
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
    if (!t || t.startsWith('#')) continue;
    if (t.startsWith('MONGODB_URI=')) return t.slice('MONGODB_URI='.length).trim();
    if (t.startsWith('mongodb://') || t.startsWith('mongodb+srv://')) return t;
  }
  return '';
}

function clusterHostFromUri(uri) {
  const raw = String(uri || '').trim();
  const noProto = raw.replace(/^mongodb(\+srv)?:\/\//i, '');
  const afterCreds = noProto.includes('@') ? noProto.slice(noProto.lastIndexOf('@') + 1) : noProto;
  const host = afterCreds.split('/')[0].split('?')[0];
  const srv = /^mongodb\+srv:/i.test(raw);
  return { protocol: srv ? 'mongodb+srv' : 'mongodb', host: host || '(unknown)' };
}

function oid(id) {
  return new ObjectId(id);
}

function sid(value) {
  if (value == null) return null;
  if (typeof value === 'object' && value._id != null) return String(value._id);
  return String(value);
}

function maskUserId(id) {
  const s = sid(id) || '';
  if (s.length < 8) return '(masked)';
  return `…${s.slice(-6)}`;
}

function iso(d) {
  if (!d) return null;
  try {
    return new Date(d).toISOString();
  } catch {
    return null;
  }
}

function hasMarker(doc) {
  return JSON.stringify(doc).includes(MARKER);
}

function contentStructureType(content) {
  if (content == null) return 'none';
  if (typeof content !== 'object') return typeof content;
  const keys = Object.keys(content).sort();
  if (Array.isArray(content.statements)) return 'two_statements';
  if (Array.isArray(content.items)) return 'numbered_list';
  if (Array.isArray(content.columns) || Array.isArray(content.rows)) return 'table';
  return keys.length ? `object:${keys.join(',')}` : 'empty_object';
}

function contentShape(content) {
  if (content == null || typeof content !== 'object') {
    return { present: false, type: contentStructureType(content), keys: [] };
  }
  return {
    present: true,
    type: contentStructureType(content),
    keys: Object.keys(content).sort(),
    statementCount: Array.isArray(content.statements) ? content.statements.length : undefined,
    itemCount: Array.isArray(content.items) ? content.items.length : undefined,
    columnCount: Array.isArray(content.columns) ? content.columns.length : undefined,
    rowCount: Array.isArray(content.rows) ? content.rows.length : undefined,
    hasIntro: typeof content.intro === 'string',
    hasPrompt: typeof content.prompt === 'string',
  };
}

function walkObjectIds(value, acc) {
  if (value == null) return;
  if (value instanceof ObjectId) {
    acc.add(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkObjectIds(item, acc);
    return;
  }
  if (typeof value === 'object') {
    if (typeof value._bsontype === 'string' && value._bsontype === 'ObjectId') {
      acc.add(String(value));
      return;
    }
    for (const v of Object.values(value)) walkObjectIds(v, acc);
  }
}

function idsInDoc(doc, wanted) {
  const found = new Set();
  walkObjectIds(doc, found);
  const hits = [];
  for (const id of found) {
    if (wanted.has(id)) hits.push(id);
  }
  const text = JSON.stringify(doc);
  for (const id of wanted) {
    if (text.includes(id) && !hits.includes(id)) hits.push(id);
  }
  return hits;
}

function loadJsonlIdsAbsent(filePath, hexIds) {
  if (!fs.existsSync(filePath)) {
    return { exists: false, lineCount: 0, hits: hexIds.slice() };
  }
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const hits = hexIds.filter((id) => text.includes(id));
  return { exists: true, lineCount: lines.length, hits };
}

function collectRepoArtifacts() {
  const needles = [
    MARKER,
    'phase9-smoke-test-2026-jkssb-structured-question-test',
    POST_ID,
    ...Q_IDS,
    TEST_ID,
    OLD_ATTEMPT_ID,
  ];
  const roots = [
    path.join(BACKEND_ROOT, 'scripts'),
    path.join(BACKEND_ROOT, 'src'),
    path.resolve(BACKEND_ROOT, '..', 'admin', 'src'),
    path.resolve(BACKEND_ROOT, '..', 'mobile', 'src'),
  ];
  const files = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === 'node_modules' || ent.name === '.git') continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (/\.(js|jsx|mjs|cjs|json|md|jsonl)$/i.test(ent.name)) files.push(full);
    }
  }
  for (const root of roots) walk(root);
  const hits = [];
  for (const file of files) {
    let text = '';
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const matched = needles.filter((n) => text.includes(n));
    if (matched.length) {
      hits.push({
        path: path.relative(path.resolve(BACKEND_ROOT, '..'), file).replace(/\\/g, '/'),
        matched,
      });
    }
  }
  return hits.sort((a, b) => a.path.localeCompare(b.path));
}

async function collect(db) {
  const qOids = Q_IDS.map(oid);
  const postOid = oid(POST_ID);
  const testOid = oid(TEST_ID);
  const wanted = new Set([POST_ID, TEST_ID, OLD_ATTEMPT_ID, ...Q_IDS]);

  const counts = {
    users: await db.collection('users').countDocuments(),
    questions: await db.collection('questions').countDocuments(),
    tests: await db.collection('tests').countDocuments(),
    posts: await db.collection('posts').countDocuments(),
    testAttempts: await db.collection('testattempts').countDocuments(),
    results: await db.collection('results').countDocuments(),
  };

  const allQuestions = await db
    .collection('questions')
    .find({})
    .project({
      questionText: 1,
      questionType: 1,
      presentationKind: 1,
      subjectId: 1,
      topicId: 1,
      postIds: 1,
      createdAt: 1,
      updatedAt: 1,
      content: 1,
    })
    .toArray();
  const phase9QuestionsLive = allQuestions.filter(hasMarker);
  const setAQuestions = allQuestions.filter((q) => !hasMarker(q));
  const byId = new Map(allQuestions.map((q) => [String(q._id), q]));

  const questions = Q_SPECS.map((spec) => {
    const q = byId.get(spec.id);
    return {
      key: spec.key,
      _id: spec.id,
      exists: Boolean(q),
      questionText: q?.questionText ?? null,
      questionType: q?.questionType || 'single_correct',
      presentationKind: q?.presentationKind || null,
      expectedKind: spec.expectedKind,
      kindMatches: (q?.presentationKind || 'plain') === spec.expectedKind,
      subjectId: sid(q?.subjectId),
      topicId: sid(q?.topicId),
      postIds: Array.isArray(q?.postIds) ? q.postIds.map(sid) : [],
      createdAt: iso(q?.createdAt),
      updatedAt: iso(q?.updatedAt),
      markerPresent: q ? hasMarker(q) : false,
      content: contentShape(q?.content),
    };
  });

  const post = await db.collection('posts').findOne({ _id: postOid });
  const test = await db.collection('tests').findOne({ _id: testOid });

  const attempts = await db
    .collection('testattempts')
    .find({ testId: testOid })
    .sort({ startTime: 1 })
    .toArray();

  const results = await db
    .collection('results')
    .find({ testId: testOid })
    .sort({ createdAt: 1 })
    .toArray();

  const testsWithPhase9Questions = await db
    .collection('tests')
    .find({ questionIds: { $in: qOids } })
    .project({ _id: 1, title: 1, questionIds: 1, kind: 1, status: 1, postId: 1 })
    .toArray();

  const testsWithPhase9Post = await db
    .collection('tests')
    .find({ postId: postOid })
    .project({ _id: 1, title: 1 })
    .toArray();

  const questionsWithPhase9Post = await db
    .collection('questions')
    .find({ postIds: postOid })
    .project({ _id: 1, questionText: 1, presentationKind: 1 })
    .toArray();

  const notesWithPost = await db
    .collection('notes')
    .find({ $or: [{ postIds: postOid }, { postId: postOid }] })
    .project({ _id: 1 })
    .toArray();
  const pdfsWithPost = await db
    .collection('pdfnotes')
    .find({ $or: [{ postIds: postOid }, { postId: postOid }] })
    .project({ _id: 1 })
    .toArray();
  const subjectsWithPost = await db
    .collection('subjects')
    .find({ postId: postOid })
    .project({ _id: 1, name: 1 })
    .toArray();

  const attemptsWithQ = await db
    .collection('testattempts')
    .find({
      $or: [
        { questionIds: { $in: qOids } },
        { 'answers.questionId': { $in: qOids } },
        { 'resultSnapshot.items.questionId': { $in: qOids } },
        { 'resultSnapshot.wrongQuestionIds': { $in: qOids } },
      ],
    })
    .project({ _id: 1, testId: 1 })
    .toArray();

  const attemptsWithTest = await db
    .collection('testattempts')
    .find({ testId: testOid })
    .project({ _id: 1 })
    .toArray();

  const learningByQ = await db
    .collection('learningsessions')
    .find({ 'snapshot.questions.questionId': { $in: qOids } })
    .project({ _id: 1, userId: 1 })
    .toArray();
  const attemptOids = attempts.map((a) => a._id);
  const learningByAttempt =
    attemptOids.length === 0
      ? []
      : await db
          .collection('learningsessions')
          .find({
            $or: [
              { 'snapshot.sourceAttemptId': { $in: attemptOids } },
              { 'snapshot.sourceTestAttemptId': { $in: attemptOids } },
            ],
          })
          .project({ _id: 1 })
          .toArray();

  const battlesByQ = await db
    .collection('battlesessions')
    .find({
      $or: [
        { questionIds: { $in: qOids } },
        { 'questionSnapshots.questionId': { $in: qOids } },
        { 'questionSnapshots.postIds': postOid },
      ],
    })
    .project({ _id: 1 })
    .toArray();

  const practiceByQ = await db
    .collection('practiceissuances')
    .find({
      $or: [
        { questionIds: { $in: qOids } },
        ...(attemptOids.length ? [{ sourceAttemptId: { $in: attemptOids } }] : []),
      ],
    })
    .project({ _id: 1, practiceType: 1 })
    .toArray();

  const analyticsDocs = await db.collection('userlearninganalytics').find({}).toArray();
  const analyticsHits = analyticsDocs
    .map((doc) => ({
      _id: String(doc._id),
      userIdMasked: maskUserId(doc.userId),
      ids: idsInDoc(doc, wanted),
    }))
    .filter((row) => row.ids.length);

  const listed = await db.listCollections({}, { nameOnly: true }).toArray();
  const collectionNames = listed.map((c) => c.name).filter((n) => !String(n).startsWith('system.'));

  const extraScans = [];
  const alreadyCovered = new Set([
    'questions',
    'tests',
    'posts',
    'testattempts',
    'results',
    'learningsessions',
    'battlesessions',
    'practiceissuances',
    'userlearninganalytics',
    'notes',
    'pdfnotes',
    'subjects',
  ]);
  for (const name of collectionNames) {
    if (alreadyCovered.has(name)) continue;
    const col = db.collection(name);
    const n = await col.countDocuments();
    if (n === 0) continue;
    if (n > 5000) {
      extraScans.push({ collection: name, skipped: true, reason: `count ${n} exceeds scan cap` });
      continue;
    }
    const docs = await col.find({}).toArray();
    for (const doc of docs) {
      const ids = idsInDoc(doc, wanted);
      if (ids.length) {
        extraScans.push({
          collection: name,
          documentId: String(doc._id),
          ids,
        });
      }
    }
  }

  return {
    counts,
    collectionNames,
    allQuestionCount: allQuestions.length,
    phase9QuestionCount: phase9QuestionsLive.length,
    setAQuestionCount: setAQuestions.length,
    setALiveIds: setAQuestions.map((q) => String(q._id)),
    questions,
    post: post
      ? {
          _id: String(post._id),
          name: post.name,
          slug: post.slug,
          isActive: post.isActive !== false,
          createdAt: iso(post.createdAt),
          updatedAt: iso(post.updatedAt),
          markerPresent: hasMarker(post),
        }
      : null,
    test: test
      ? {
          _id: String(test._id),
          title: test.title,
          kind: test.kind || 'mock',
          status: test.status || 'active',
          type: test.type,
          postId: sid(test.postId),
          questionIds: (test.questionIds || []).map(sid),
          createdAt: iso(test.createdAt),
          updatedAt: iso(test.updatedAt),
          markerPresent: hasMarker(test),
        }
      : null,
    attempts,
    results,
    testsWithPhase9Questions,
    testsWithPhase9Post,
    questionsWithPhase9Post,
    notesWithPost,
    pdfsWithPost,
    subjectsWithPost,
    attemptsWithQ,
    attemptsWithTest,
    learningByQ,
    learningByAttempt,
    battlesByQ,
    practiceByQ,
    analyticsHits,
    extraScans,
  };
}

function pairResults(attempts, results) {
  const used = new Set();
  return attempts.map((attempt) => {
    const uid = sid(attempt.userId);
    const tid = sid(attempt.testId);
    const candidates = results.filter((r) => {
      if (used.has(String(r._id))) return false;
      return sid(r.userId) === uid && sid(r.testId) === tid;
    });
    let best = null;
    let bestDelta = Infinity;
    const endMs = attempt.endTime ? new Date(attempt.endTime).getTime() : NaN;
    for (const r of candidates) {
      const scoreOk = attempt.score == null || r.score === attempt.score;
      const timeOk = attempt.timeTaken == null || r.timeTaken === attempt.timeTaken;
      const createdMs = new Date(r.createdAt).getTime();
      const delta = Number.isFinite(endMs) ? Math.abs(createdMs - endMs) : 0;
      if (scoreOk && timeOk && delta < bestDelta) {
        best = r;
        bestDelta = delta;
      }
    }
    if (!best && candidates.length === 1) best = candidates[0];
    if (best) used.add(String(best._id));
    return { attemptId: String(attempt._id), result: best || null, matchDeltaMs: best ? bestDelta : null };
  });
}

function snapshotRows(attempt) {
  const items = Array.isArray(attempt?.resultSnapshot?.items) ? attempt.resultSnapshot.items : [];
  return Q_SPECS.map((spec) => {
    const item = items.find((it) => sid(it.questionId) === spec.id);
    const kind = item?.presentationKind ?? null;
    const shape = contentShape(item?.content);
    return {
      key: spec.key,
      questionId: spec.id,
      present: Boolean(item),
      presentationKind: kind,
      expectedKind: spec.expectedKind,
      kindMatches: kind === spec.expectedKind,
      contentExists: shape.present,
      contentStructureType: shape.type,
      contentShape: shape,
      questionTextPresent: Boolean(String(item?.questionText || '').trim()),
      optionCount: Array.isArray(item?.options) ? item.options.length : 0,
    };
  });
}

function buildReferences(raw) {
  const refs = [];
  const add = (collection, documentId, field, referencedId) => {
    refs.push({ collection, documentId, field, referencedId });
  };

  for (const t of raw.testsWithPhase9Questions) {
    for (const qid of (t.questionIds || []).map(sid)) {
      if (Q_IDS.includes(qid)) add('tests', String(t._id), 'questionIds', qid);
    }
  }
  if (raw.test?.postId === POST_ID) add('tests', raw.test._id, 'postId', POST_ID);

  for (const a of raw.attempts) {
    add('testattempts', String(a._id), 'testId', TEST_ID);
    for (const qid of (a.questionIds || []).map(sid)) {
      if (Q_IDS.includes(qid)) add('testattempts', String(a._id), 'questionIds', qid);
    }
    for (const ans of a.answers || []) {
      const qid = sid(ans.questionId);
      if (Q_IDS.includes(qid)) add('testattempts', String(a._id), 'answers.questionId', qid);
    }
    for (const item of a.resultSnapshot?.items || []) {
      const qid = sid(item.questionId);
      if (Q_IDS.includes(qid)) add('testattempts', String(a._id), 'resultSnapshot.items.questionId', qid);
      for (const pid of item.postIds || []) {
        if (sid(pid) === POST_ID) add('testattempts', String(a._id), 'resultSnapshot.items.postIds', POST_ID);
      }
    }
    for (const qid of a.resultSnapshot?.wrongQuestionIds || []) {
      if (Q_IDS.includes(sid(qid))) {
        add('testattempts', String(a._id), 'resultSnapshot.wrongQuestionIds', sid(qid));
      }
    }
  }

  for (const r of raw.results) {
    add('results', String(r._id), 'testId', TEST_ID);
  }

  for (const q of raw.questionsWithPhase9Post) {
    add('questions', String(q._id), 'postIds', POST_ID);
  }

  for (const n of raw.notesWithPost) add('notes', String(n._id), 'postIds/postId', POST_ID);
  for (const n of raw.pdfsWithPost) add('pdfnotes', String(n._id), 'postIds/postId', POST_ID);
  for (const n of raw.subjectsWithPost) add('subjects', String(n._id), 'postId', POST_ID);

  for (const row of raw.learningByQ) add('learningsessions', String(row._id), 'snapshot.questions.questionId', '(phase9 question)');
  for (const row of raw.learningByAttempt) add('learningsessions', String(row._id), 'snapshot.sourceAttemptId', '(phase9 attempt)');
  for (const row of raw.battlesByQ) add('battlesessions', String(row._id), 'questionIds/questionSnapshots', '(phase9 question)');
  for (const row of raw.practiceByQ) add('practiceissuances', String(row._id), 'questionIds/sourceAttemptId', '(phase9)');
  for (const row of raw.analyticsHits) {
    for (const id of row.ids) add('userlearninganalytics', row._id, 'state (mixed)', id);
  }
  for (const row of raw.extraScans) {
    if (row.skipped) continue;
    for (const id of row.ids) add(row.collection, row.documentId, '(scanned document)', id);
  }

  return refs;
}

function unexpectedFrom(raw, refs) {
  const unexpected = [];
  const otherTests = raw.testsWithPhase9Questions.filter((t) => String(t._id) !== TEST_ID);
  if (otherTests.length) {
    unexpected.push({
      code: 'OTHER_TEST_REFERENCES_PHASE9_QUESTIONS',
      tests: otherTests.map((t) => String(t._id)),
    });
  }
  const otherQuestionsOnPost = raw.questionsWithPhase9Post.filter((q) => !Q_IDS.includes(String(q._id)));
  if (otherQuestionsOnPost.length) {
    unexpected.push({
      code: 'OTHER_QUESTIONS_REFERENCE_PHASE9_POST',
      questionIds: otherQuestionsOnPost.map((q) => String(q._id)),
    });
  }
  if (raw.testsWithPhase9Post.length) {
    unexpected.push({
      code: 'TEST_POSTID_IS_PHASE9_POST',
      tests: raw.testsWithPhase9Post.map((t) => String(t._id)),
    });
  }
  if (raw.notesWithPost.length) unexpected.push({ code: 'NOTES_REFERENCE_PHASE9_POST', count: raw.notesWithPost.length });
  if (raw.pdfsWithPost.length) unexpected.push({ code: 'PDFNOTES_REFERENCE_PHASE9_POST', count: raw.pdfsWithPost.length });
  if (raw.subjectsWithPost.length) unexpected.push({ code: 'SUBJECTS_REFERENCE_PHASE9_POST', count: raw.subjectsWithPost.length });
  if (raw.learningByQ.length || raw.learningByAttempt.length) {
    unexpected.push({
      code: 'LEARNING_SESSIONS_REFERENCE_PHASE9',
      byQuestion: raw.learningByQ.length,
      byAttempt: raw.learningByAttempt.length,
    });
  }
  if (raw.battlesByQ.length) unexpected.push({ code: 'BATTLE_SESSIONS_REFERENCE_PHASE9', count: raw.battlesByQ.length });
  if (raw.practiceByQ.length) unexpected.push({ code: 'PRACTICE_ISSUANCES_REFERENCE_PHASE9', count: raw.practiceByQ.length });
  if (raw.analyticsHits.length) unexpected.push({ code: 'LEARNING_ANALYTICS_REFERENCE_PHASE9', count: raw.analyticsHits.length });
  const extraHits = raw.extraScans.filter((r) => !r.skipped);
  if (extraHits.length) unexpected.push({ code: 'EXTRA_COLLECTION_HITS', rows: extraHits });
  const extraAttemptRefs = raw.attemptsWithQ.filter((a) => sid(a.testId) !== TEST_ID);
  if (extraAttemptRefs.length) {
    unexpected.push({
      code: 'ATTEMPTS_FOR_OTHER_TESTS_REFERENCE_PHASE9_QUESTIONS',
      attemptIds: extraAttemptRefs.map((a) => String(a._id)),
    });
  }
  void refs;
  return unexpected;
}

function renderMarkdown(audit) {
  const qRows = audit.questions
    .map((q) => {
      const refNote = audit.questionReferenceSummary[q._id] || '';
      return `| ${q.key} | \`${q._id}\` | ${q.presentationKind || 'missing'} | ${refNote} |`;
    })
    .join('\n');
  const attemptRows = audit.attempts
    .map((a) => {
      return `| ${a.label || 'attempt'} | \`${a._id}\` | ${a.userIdMasked} | ${a.completed ? 'completed' : 'open'} | ${a.score} | ${a.accuracy} | ${a.attemptNumber} | ${a.pairedResultId ? '`' + a.pairedResultId + '`' : 'unpaired'} |`;
    })
    .join('\n');
  const snapRows = (audit.newAttemptSnapshot || [])
    .map(
      (r) =>
        `| ${r.key} | \`${r.questionId}\` | ${r.presentationKind ?? 'null'} | ${r.contentExists ? 'yes' : 'no'} | ${r.contentStructureType} | ${r.questionTextPresent ? 'yes' : 'no'} | ${r.optionCount} |`,
    )
    .join('\n');
  const resultRows = audit.results
    .map(
      (r) =>
        `| \`${r._id}\` | ${r.pairedAttemptId ? '`' + r.pairedAttemptId + '`' : '(none on schema; paired: none)'} | \`${r.testId}\` | ${r.userIdMasked} | ${r.score} | ${r.createdAt} |`,
    )
    .join('\n');
  const refRows = audit.references
    .slice(0, 80)
    .map((r) => `| ${r.collection} | \`${r.documentId}\` | ${r.field} | \`${r.referencedId}\` |`)
    .join('\n');
  const extraRefNote =
    audit.references.length > 80 ? `\n… ${audit.references.length - 80} additional reference rows in JSON.\n` : '';
  const repoRows = audit.repoArtifacts
    .map((f) => `- \`${f.path}\``)
    .join('\n');
  const unexpected = audit.unexpectedReferences.length
    ? audit.unexpectedReferences.map((u) => `- ${u.code}: ${JSON.stringify(u)}`).join('\n')
    : 'None.';
  const order = audit.proposedDeletionOrder.map((s, i) => `${i + 1}. ${s.collection}: ${s.ids.map((id) => '`' + id + '`').join(', ')} — ${s.reason}`).join('\n');

  return `# Phase 9G — Smoke-Test Cleanup Audit

## Status

READ-ONLY

Generated: ${audit.generatedAt}

MongoDB writes performed by this audit: **0**

## Database Identity

- database name: \`${audit.database.name}\`
- cluster host: \`${audit.database.host}\`
- protocol: \`${audit.database.protocol}\`
- local NODE_ENV: \`${audit.database.nodeEnv}\`
- identity: **${audit.database.identity}**

Credentials, JWT secrets, and the full MongoDB URI are not included.

## Baseline Counts

| Collection | Count |
|---|---:|
| users | ${audit.baseline.users} |
| questions | ${audit.baseline.questions} |
| tests | ${audit.baseline.tests} |
| posts | ${audit.baseline.posts} |
| testAttempts | ${audit.baseline.testAttempts} |
| results | ${audit.baseline.results} |

SET A questions (no \`${MARKER}\` marker): **${audit.setA.count}** (expected 250)  
Phase 9 smoke questions (marker / known IDs): **${audit.phase9QuestionCount}** (expected 4)

## Phase 9 Questions

| Question | ID | Format | References |
|---|---|---|---|
${qRows}

Known IDs match live documents: **${audit.questions.every((q) => q.exists && q.kindMatches && q.markerPresent) ? 'yes' : 'no'}**

Q1–Q4 live fields (no answers):

${audit.questions
  .map(
    (q) =>
      `- ${q.key} \`${q._id}\`: type=${q.questionType}, kind=${q.presentationKind}, subjectId=\`${q.subjectId}\`, topicId=\`${q.topicId}\`, postIds=[${(q.postIds || []).map((p) => '`' + p + '`').join(', ')}], createdAt=${q.createdAt}, updatedAt=${q.updatedAt}`,
  )
  .join('\n')}

Question stems are the smoke-test stems (marker in title/body). Correct answers are not listed.

## Phase 9 Test

- _id: \`${audit.test?._id || 'MISSING'}\`
- title: ${audit.test?.title || '(missing)'}
- kind: \`${audit.test?.kind || ''}\`
- status: \`${audit.test?.status || ''}\`
- questionIds: ${(audit.test?.questionIds || []).map((id) => '`' + id + '`').join(', ')}
- createdAt: ${audit.test?.createdAt}
- updatedAt: ${audit.test?.updatedAt}
- postId on Test: ${audit.test?.postId == null ? 'null (expected for mock)' : '`' + audit.test.postId + '`'}

Contains exactly the four Phase 9 question IDs in order: **${audit.testQuestionOrderOk ? 'yes' : 'no'}**

## Phase 9 Post

- _id: \`${audit.post?._id || 'MISSING'}\`
- name: ${audit.post?.name || '(missing)'}
- slug: \`${audit.post?.slug || ''}\`
- isActive: ${audit.post?.isActive}
- createdAt: ${audit.post?.createdAt}
- updatedAt: ${audit.post?.updatedAt}

Question documents with this postIds tag: **${audit.questionsWithPhase9PostCount}** (expected 4)

## Phase 9 Attempts

Attempt count for Test \`${TEST_ID}\`: **${audit.attempts.length}** (expected 2)

| Label | Attempt ID | userId (masked) | status | score | accuracy | attemptNumber | paired Result |
|---|---|---|---|---:|---:|---:|---|
${attemptRows}

Schema has no \`status\` field. Completed means \`endTime != null\`.

Old attempt \`${OLD_ATTEMPT_ID}\` present: **${audit.oldAttemptPresent ? 'yes' : 'no'}**  
New attempt: ${audit.newAttemptId ? '`' + audit.newAttemptId + '`' : 'NOT IDENTIFIED'}

## Phase 9 Results

Result model: \`userId\` + \`testId\` + score/accuracy/timeTaken/weakTopics. **No \`attemptId\` field.**

Paired to attempts by same userId + testId + score + timeTaken, nearest \`createdAt\` to attempt \`endTime\`.

| Result ID | Paired attempt | testId | userId (masked) | score | createdAt |
|---|---|---|---|---:|---|
${resultRows}

## New attempt snapshot

${
  audit.newAttemptId
    ? `Attempt \`${audit.newAttemptId}\` \`resultSnapshot\` (answers omitted):

| Q | Question ID | presentationKind | content | structure | questionText | options |
|---|---|---|---|---|---|---:|
${snapRows}

Structured snapshot confirmed: **${audit.newSnapshotOk ? 'yes' : 'no'}**

${audit.extraAttemptNote || ''}`
    : 'New attempt not identified; snapshot not inspected.'
}

## Secondary References

Schema paths inspected: Test.questionIds / Test.postId, TestAttempt.questionIds / answers / resultSnapshot, Result.testId, Question.postIds, LearningSession.snapshot.questions.questionId / sourceAttemptId, BattleSession.questionIds / questionSnapshots, PracticeIssuance.questionIds / sourceAttemptId, Note/PdfNote/Subject post fields, UserLearningAnalytics.state (mixed walk), plus a capped scan of other non-empty collections.

| Collection | Document ID | Field | Referenced ID |
|---|---|---|---|
${refRows || '| (none) | | | |'}
${extraRefNote}

## SET A Protection

SET A questions: **${audit.setA.count}**  
SET A questions proposed for deletion: **0**

- Live SET A membership = questions **without** marker \`${MARKER}\` (live docs have no \`sourceQuestionNumber\`).
- Fixture \`SET_A_import_ready.jsonl\` lines: ${audit.setA.importReadyLines}. Phase 9 Mongo IDs in that file: **${audit.setA.importReadyHits.length}**
- Fixture \`SET_A_metadata_import_ready.jsonl\` lines: ${audit.setA.metadataReadyLines}. Phase 9 Mongo IDs in that file: **${audit.setA.metadataReadyHits.length}**
- Phase 9 IDs present in recorded SET A live ID list (\`PHASE9_smoke_test_ids.json\`): **${audit.setA.phase9IdsInSetASnapshot.length}**
- Phase 9 Test.questionIds ∩ SET A live IDs: **${audit.setA.testIntersection.length}**
- Phase 9 attempt questionIds ∩ SET A live IDs: **${audit.setA.attemptIntersection.length}**

## Other Tests Using Phase 9 Questions

${audit.otherTestsUsingPhase9Questions.length ? audit.otherTestsUsingPhase9Questions.map((id) => `- \`${id}\``).join('\n') : 'None. Only the Phase 9 Mock Test.'}

## Other Content Using Phase 9 Post

${audit.otherContentUsingPhase9Post}

## Test User

No user deletion/modification proposed.

Test user cleanup: **NOT PROPOSED**

## Proposed Cleanup Order

READ-ONLY — NOT EXECUTED

${order}

Do not run this order without a later explicit cleanup phase.

## Unexpected References

${unexpected}

## Repo / code artifacts (not deleted)

Phase 9 leftover **code and reports** (this phase does not delete them):

${repoRows || '(none found in scanned trees)'}

Temporary product configuration was not added to \`backend/src\` for the smoke IDs. Creation/verify scripts and fixture reports exist under \`backend/scripts\`.

## Final database counts (unchanged)

| Item | Actual | Expected |
|---|---:|---:|
| Questions | ${audit.finalCounts.questions} | 254 |
| Tests | ${audit.finalCounts.tests} | 1 |
| Posts | ${audit.finalCounts.posts} | 1 |
| Phase 9 Attempts | ${audit.finalCounts.phase9Attempts} | 2 |
| Phase 9 Results | ${audit.finalCounts.phase9Results} | 2 |
| SET A | ${audit.setA.count} | 250 |

## Writes performed

MongoDB writes = 0  
Questions modified = 0  
Questions deleted = 0  
Tests modified = 0  
Tests deleted = 0  
Posts modified = 0  
Posts deleted = 0  
Attempts modified = 0  
Attempts deleted = 0  
Results modified = 0  
Results deleted = 0  

## Final Recommendation

**${audit.cleanupStatus}**
`;
}

async function main() {
  assertReadOnlySource();
  const uri = loadMongoUri();
  if (!uri) throw new Error('MONGODB_URI unavailable');

  const { protocol, host } = clusterHostFromUri(uri);
  const nodeEnv = process.env.NODE_ENV || '(not set in local env)';

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 15_000,
    readPreference: 'primary',
  });
  await client.connect();

  const failures = [];
  const notes = [];
  try {
    const db = client.db();
    if (db.databaseName !== EXPECTED_DB) {
      failures.push(`database is ${db.databaseName}, expected ${EXPECTED_DB}`);
    }

    const raw = await collect(db);
    const identity =
      db.databaseName === EXPECTED_DB && raw.setAQuestionCount === SET_A_COUNT
        ? 'intended SSBFY database (name ssbfy, SET A 250 present)'
        : 'NOT CONFIRMED';
    if (identity.startsWith('NOT')) {
      failures.push('database identity could not be confirmed');
    }

    const smokeSnapshot = fs.existsSync(SMOKE_IDS_PATH)
      ? JSON.parse(fs.readFileSync(SMOKE_IDS_PATH, 'utf8'))
      : { setAIds: [] };
    const setASnapshotIds = new Set((smokeSnapshot.setAIds || []).map(String));

    const importReady = loadJsonlIdsAbsent(IMPORT_READY, [POST_ID, TEST_ID, ...Q_IDS]);
    const metadataReady = loadJsonlIdsAbsent(METADATA_READY, [POST_ID, TEST_ID, ...Q_IDS]);

    const testQids = raw.test?.questionIds || [];
    const testQuestionOrderOk =
      testQids.length === 4 && Q_IDS.every((id, i) => testQids[i] === id);

    if (raw.attempts.length > 2) {
      failures.push(`Phase 9 attempts=${raw.attempts.length}, expected at most 2 — STOP`);
    }
    if (raw.attempts.length !== 2) {
      failures.push(`Phase 9 attempts=${raw.attempts.length}, expected 2`);
    }

    const oldAttemptPresent = raw.attempts.some((a) => String(a._id) === OLD_ATTEMPT_ID);
    if (!oldAttemptPresent) failures.push(`old attempt ${OLD_ATTEMPT_ID} not found`);

    const completedNonOld = raw.attempts.filter(
      (a) => String(a._id) !== OLD_ATTEMPT_ID && a.endTime != null,
    );
    const openNonOld = raw.attempts.filter(
      (a) => String(a._id) !== OLD_ATTEMPT_ID && a.endTime == null,
    );
    const newAttempt = completedNonOld[0] || raw.attempts.find((a) => String(a._id) !== OLD_ATTEMPT_ID) || null;
    const newAttemptSnapshot = newAttempt ? snapshotRows(newAttempt) : [];
    const newSnapshotOk =
      Boolean(newAttempt) &&
      newAttemptSnapshot.length === 4 &&
      newAttemptSnapshot[0].kindMatches &&
      !newAttemptSnapshot[0].contentExists &&
      newAttemptSnapshot[1].kindMatches &&
      newAttemptSnapshot[1].contentExists &&
      newAttemptSnapshot[1].contentStructureType === 'two_statements' &&
      newAttemptSnapshot[2].kindMatches &&
      newAttemptSnapshot[2].contentExists &&
      newAttemptSnapshot[2].contentStructureType === 'numbered_list' &&
      newAttemptSnapshot[3].kindMatches &&
      newAttemptSnapshot[3].contentExists &&
      newAttemptSnapshot[3].contentStructureType === 'table';
    if (newAttempt && !newSnapshotOk) {
      failures.push('new attempt snapshot does not preserve structured presentation');
    }
    if (!newAttempt) failures.push('new Phase 9 attempt not identified');

    for (const q of raw.questions) {
      if (!q.exists) failures.push(`missing question ${q._id}`);
      if (q.exists && !q.kindMatches) failures.push(`${q.key} kind ${q.presentationKind}, expected ${q.expectedKind}`);
      if (q.exists && !q.markerPresent) failures.push(`${q.key} missing smoke marker`);
    }
    if (raw.phase9QuestionCount !== 4) {
      failures.push(`Phase 9 marker questions=${raw.phase9QuestionCount}, expected 4`);
    }
    if (!raw.test) failures.push('Phase 9 Test missing');
    if (raw.test && (raw.test.kind || 'mock') !== 'mock') failures.push(`Test kind=${raw.test.kind}`);
    if (!testQuestionOrderOk) failures.push('Phase 9 Test questionIds are not the four smoke IDs in order');
    if (!raw.post) failures.push('Phase 9 Post missing');

    const markerPosts = (await db.collection('posts').find({}).toArray()).filter(hasMarker);
    const markerTests = (await db.collection('tests').find({}).toArray()).filter(hasMarker);
    if (markerPosts.length !== 1) failures.push(`Phase 9 Posts=${markerPosts.length}, expected 1`);
    if (markerTests.length !== 1) failures.push(`Phase 9 Tests=${markerTests.length}, expected 1`);

    if (raw.setAQuestionCount !== SET_A_COUNT) {
      failures.push(`SET A count ${raw.setAQuestionCount}, expected ${SET_A_COUNT}`);
    }

    const setALive = new Set(raw.setALiveIds);
    const phase9InSetA = Q_IDS.filter((id) => setALive.has(id) || setASnapshotIds.has(id));
    const testIntersection = testQids.filter((id) => setALive.has(id));
    const attemptIntersection = [];
    for (const a of raw.attempts) {
      for (const id of (a.questionIds || []).map(sid)) {
        if (setALive.has(id) && !attemptIntersection.includes(id)) attemptIntersection.push(id);
      }
    }
    if (phase9InSetA.length) failures.push('Phase 9 question IDs overlap SET A');
    if (testIntersection.length) failures.push('Phase 9 Test includes SET A question IDs');
    if (attemptIntersection.length) failures.push('Phase 9 attempts include SET A question IDs');
    if (importReady.hits.length) failures.push('Phase 9 IDs found in SET_A_import_ready.jsonl');
    if (metadataReady.hits.length) failures.push('Phase 9 IDs found in SET_A_metadata_import_ready.jsonl');

    const pairs = pairResults(raw.attempts, raw.results);
    const attemptsOut = raw.attempts.map((a) => {
      const pair = pairs.find((p) => p.attemptId === String(a._id));
      const id = String(a._id);
      let label = 'other';
      if (id === OLD_ATTEMPT_ID) label = 'old';
      else if (newAttempt && id === String(newAttempt._id)) label = 'completed-new';
      else if (a.endTime == null) label = 'extra-open';
      else label = 'extra-completed';
      return {
        _id: id,
        label,
        userIdMasked: maskUserId(a.userId),
        testId: sid(a.testId),
        completed: a.endTime != null,
        startTime: iso(a.startTime),
        endTime: iso(a.endTime),
        score: a.score ?? null,
        accuracy: a.accuracy ?? null,
        attemptNumber: a.attemptNumber ?? null,
        timeTaken: a.timeTaken ?? null,
        hasResultSnapshot: Boolean(a.resultSnapshot && Array.isArray(a.resultSnapshot.items)),
        pairedResultId: pair?.result ? String(pair.result._id) : null,
      };
    });
    const resultsOut = raw.results.map((r) => {
      const pair = pairs.find((p) => p.result && String(p.result._id) === String(r._id));
      return {
        _id: String(r._id),
        testId: sid(r.testId),
        userIdMasked: maskUserId(r.userId),
        score: r.score,
        accuracy: r.accuracy,
        timeTaken: r.timeTaken,
        createdAt: iso(r.createdAt),
        pairedAttemptId: pair?.attemptId || null,
        attemptIdOnSchema: null,
      };
    });
    if (raw.results.length !== raw.attempts.length) {
      notes.push(`results for Phase 9 Test=${raw.results.length}, attempts=${raw.attempts.length}`);
    }
    if (raw.attempts.length === 2 && raw.results.length !== 2) {
      failures.push(`Phase 9 Results=${raw.results.length}, expected 2`);
    }

    const refs = buildReferences(raw);
    const unexpected = unexpectedFrom(raw, refs);
    if (raw.attempts.length !== 2) {
      unexpected.push({
        code: 'EXTRA_OR_MISSING_PHASE9_ATTEMPTS',
        expected: 2,
        actual: raw.attempts.length,
        extraOpenIds: openNonOld.map((a) => String(a._id)),
        extraCompletedIds: completedNonOld.slice(1).map((a) => String(a._id)),
        note: 'Expected the known old submitted attempt plus exactly one new submitted phone-test attempt. Additional in-progress or extra submitted attempts block cleanup until they are accounted for.',
      });
    }
    const extraAttemptNote =
      openNonOld.length || completedNonOld.length > 1
        ? `Additional non-old attempts (cleanup blocker): open=${openNonOld.map((a) => String(a._id)).join(', ') || 'none'}; extra completed=${completedNonOld.slice(1).map((a) => String(a._id)).join(', ') || 'none'}. The open attempt has no Result (Result is created only on submit).`
        : '';
    const otherTests = raw.testsWithPhase9Questions.filter((t) => String(t._id) !== TEST_ID).map((t) => String(t._id));
    if (otherTests.length) failures.push('another Test references Phase 9 questions — CLEANUP BLOCKED');

    const otherPostQs = raw.questionsWithPhase9Post.filter((q) => !Q_IDS.includes(String(q._id)));
    if (otherPostQs.length) failures.push('non-smoke questions reference Phase 9 Post — CLEANUP BLOCKED');

    const questionReferenceSummary = {};
    for (const spec of Q_SPECS) {
      const bits = [];
      bits.push('Phase 9 Test.questionIds');
      bits.push(`${raw.attempts.length} TestAttempt.questionIds + snapshots`);
      questionReferenceSummary[spec.id] = bits.join('; ');
    }

    const proposedDeletionOrder = [
      {
        collection: 'results',
        ids: raw.results.map((r) => String(r._id)),
        reason: 'Result documents reference testId only (no attemptId). Remove score rows for the smoke Test first.',
      },
      {
        collection: 'testattempts',
        ids: raw.attempts.map((a) => String(a._id)),
        reason: 'Attempts reference the Test and embed the four question IDs plus resultSnapshot copies.',
      },
      {
        collection: 'tests',
        ids: raw.test ? [raw.test._id] : [],
        reason: 'After attempts/results are gone, no remaining TestAttempt/Result should point at this Test.',
      },
      {
        collection: 'questions',
        ids: Q_IDS.slice(),
        reason: 'Only this Test referenced these IDs. Snapshots live on attempts, which would already be removed.',
      },
      {
        collection: 'posts',
        ids: raw.post ? [raw.post._id] : [],
        reason: 'Only the four smoke questions tag this Post via postIds. No Test.postId, notes, PDFs, or subjects.',
      },
    ];

    const blocked = unexpected.length > 0 || otherTests.length > 0 || otherPostQs.length > 0 || raw.attempts.length !== 2 || !newSnapshotOk;
    const cleanupStatus = blocked
      ? 'CLEANUP BLOCKED — UNEXPECTED REFERENCES FOUND'
      : 'SAFE TO CLEANUP — PENDING EXPLICIT APPROVAL';
    if (blocked && unexpected.length === 0 && raw.attempts.length !== 2) {
      notes.push('Blocked because attempt/snapshot counts are not the expected 2 + structured new snapshot.');
    }

    const repoArtifacts = collectRepoArtifacts();

    const audit = {
      generatedAt: new Date().toISOString(),
      readOnly: true,
      mongoWrites: 0,
      database: {
        name: db.databaseName,
        host,
        protocol,
        nodeEnv,
        identity,
      },
      baseline: raw.counts,
      finalCounts: {
        questions: raw.counts.questions,
        tests: raw.counts.tests,
        posts: raw.counts.posts,
        phase9Attempts: raw.attempts.length,
        phase9Results: raw.results.length,
      },
      phase9QuestionCount: raw.phase9QuestionCount,
      questions: raw.questions,
      questionReferenceSummary,
      post: raw.post,
      test: raw.test,
      testQuestionOrderOk,
      attempts: attemptsOut,
      results: resultsOut,
      oldAttemptPresent,
      newAttemptId: newAttempt ? String(newAttempt._id) : null,
      newAttemptSnapshot,
      newSnapshotOk,
      extraAttemptNote,
      questionsWithPhase9PostCount: raw.questionsWithPhase9Post.length,
      otherTestsUsingPhase9Questions: otherTests,
      otherContentUsingPhase9Post:
        otherPostQs.length ||
        raw.testsWithPhase9Post.length ||
        raw.notesWithPost.length ||
        raw.pdfsWithPost.length ||
        raw.subjectsWithPost.length
          ? `Unexpected extra references: otherQuestions=${otherPostQs.length}, tests.postId=${raw.testsWithPhase9Post.length}, notes=${raw.notesWithPost.length}, pdfs=${raw.pdfsWithPost.length}, subjects=${raw.subjectsWithPost.length}`
          : 'Only the four Phase 9 questions. Test.postId is null. No notes/PDFs/subjects.',
      setA: {
        count: raw.setAQuestionCount,
        proposedForDeletion: 0,
        importReadyLines: importReady.lineCount,
        importReadyHits: importReady.hits,
        metadataReadyLines: metadataReady.lineCount,
        metadataReadyHits: metadataReady.hits,
        phase9IdsInSetASnapshot: phase9InSetA,
        testIntersection,
        attemptIntersection,
      },
      references: refs,
      unexpectedReferences: unexpected,
      proposedDeletionOrder,
      cleanupStatus,
      repoArtifacts,
      testUserCleanup: 'NOT PROPOSED',
      notes,
      failures,
    };

    const jsonOut = {
      phase9PostId: POST_ID,
      phase9QuestionIds: Q_IDS.slice(),
      phase9TestId: TEST_ID,
      phase9AttemptIds: attemptsOut.map((a) => a._id),
      phase9ResultIds: resultsOut.map((r) => r._id),
      oldAttemptId: OLD_ATTEMPT_ID,
      newAttemptId: audit.newAttemptId,
      extraOpenAttemptIds: openNonOld.map((a) => String(a._id)),
      newSnapshotOk,
      references: refs,
      unexpectedReferences: unexpected,
      setACount: raw.setAQuestionCount,
      setAQuestionIdsAffected: [],
      proposedDeletionOrder,
      cleanupStatus,
      database: audit.database,
      baseline: raw.counts,
      finalCounts: audit.finalCounts,
      mongoWrites: 0,
      testUserCleanup: 'NOT PROPOSED',
      failures,
      notes,
    };

    fs.writeFileSync(OUT_JSON, `${JSON.stringify(jsonOut, null, 2)}\n`);
    fs.writeFileSync(OUT_MD, renderMarkdown(audit));

    const out = {
      ok: failures.length === 0,
      database: db.databaseName,
      cleanupStatus,
      newAttemptId: audit.newAttemptId,
      newSnapshotOk,
      attemptCount: raw.attempts.length,
      resultCount: raw.results.length,
      setACount: raw.setAQuestionCount,
      unexpectedReferenceCount: unexpected.length,
      mongoWrites: 0,
      reports: {
        md: path.relative(BACKEND_ROOT, OUT_MD).replace(/\\/g, '/'),
        json: path.relative(BACKEND_ROOT, OUT_JSON).replace(/\\/g, '/'),
      },
      passes: failures.length
        ? []
        : [
            'exactly 4 Phase 9 questions',
            'exactly 1 Phase 9 Test',
            'exactly 1 Phase 9 Post',
            'exactly 2 Phase 9 attempts',
            'old attempt present',
            'new attempt present with structured snapshot',
            'SET A 250 and not in deletion list',
            'no unexpected Test/Post references',
            'audit performed zero Mongo writes',
          ],
      failures,
      notes,
    };
    console.log(JSON.stringify(out, null, 2));
    if (failures.length) process.exitCode = 1;
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
