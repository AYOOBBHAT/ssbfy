/**
 * Phase 5E-3 Gate 1: create the approved Subject/Topic catalog, then build
 * SET_A_metadata_import_ready.jsonl. Does NOT import questions (Gate 2).
 *
 * Uses existing subjectService / topicService. Connects mongoose with
 * autoIndex:false (does not call connectDb(), syncIndexes(), or build:indexes).
 *
 * Run: node scripts/apply-set-a-catalog.mjs --gate-1-approved
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';
import mongoose from 'mongoose';
import { BACKEND_ROOT, loadBackendEnv, moduleUrl } from './lib/db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'set-a');
const PLAN_PATH = path.join(FIXTURE_DIR, 'SET_A_catalog_creation_plan.json');
const PROPOSAL_PATH = path.join(FIXTURE_DIR, 'SET_A_taxonomy_proposal.json');
const IMPORT_PATH = path.join(FIXTURE_DIR, 'SET_A_import_ready.jsonl');
const JSONL_PATH = path.join(FIXTURE_DIR, 'SET_A_structured.jsonl');
const ORIGINAL_KEY_PATH = path.join(FIXTURE_DIR, 'SET_A_answer_key.json');
const RESULT_MD_PATH = path.join(FIXTURE_DIR, 'SET_A_catalog_creation_result.md');
const RESULT_JSON_PATH = path.join(FIXTURE_DIR, 'SET_A_catalog_creation_result.json');
const METADATA_PATH = path.join(FIXTURE_DIR, 'SET_A_metadata_import_ready.jsonl');

const EXPECTED_IMPORT_SHA256 =
  '7aad2b3b0a772c1807dce9c326d599e204a99293fae2cd10e1248e4b4db03f40';
const EXPECTED_JSONL_SHA256 =
  '8025d729630c783c6c3b0d3ae33e3fc3322faa34356c8a9b263e94b8926e0fb4';
const EXPECTED_ORIGINAL_KEY_SHA256 =
  '07f77efbc334ca63e8c13b44c36adcf45c12fa86f7f839cf87351d4ee206b259';
const EXPECTED_DB = 'ssbfy';

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function assertSourceHashes(when) {
  const checks = [
    [IMPORT_PATH, EXPECTED_IMPORT_SHA256, 'SET_A_import_ready.jsonl'],
    [JSONL_PATH, EXPECTED_JSONL_SHA256, 'SET_A_structured.jsonl'],
    [ORIGINAL_KEY_PATH, EXPECTED_ORIGINAL_KEY_SHA256, 'SET_A_answer_key.json'],
  ];
  for (const [filePath, expected, label] of checks) {
    const actual = sha256File(filePath);
    if (actual !== expected) {
      console.error(`STOP: ${label} hash changed ${when}.`);
      console.error(`  expected ${expected}`);
      console.error(`  actual   ${actual}`);
      process.exit(1);
    }
  }
}

function loadJsonl(filePath) {
  return fs
    .readFileSync(filePath, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((line) => JSON.parse(line));
}

function idString(value) {
  return String(value);
}

async function preflightEmptyCatalog(uri) {
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 10_000,
    readPreference: 'primary',
  });
  try {
    await client.connect();
    const db = client.db();
    const dbName = db.databaseName;
    if (dbName !== EXPECTED_DB) {
      console.error(`STOP: connected database is "${dbName}", expected "${EXPECTED_DB}".`);
      process.exit(1);
    }
    const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
    const subjectCount = names.includes('subjects')
      ? await db.collection('subjects').countDocuments({})
      : 0;
    const topicCount = names.includes('topics')
      ? await db.collection('topics').countDocuments({})
      : 0;
    if (subjectCount !== 0 || topicCount !== 0) {
      console.error('Gate 1 blocked: live taxonomy changed since the previous audit.');
      console.error(`  subjects=${subjectCount} topics=${topicCount}`);
      process.exit(1);
    }
    return { dbName, subjectCount, topicCount };
  } finally {
    await client.close();
  }
}

async function main() {
  if (!process.argv.includes('--gate-1-approved')) {
    console.error('Refusing to write: pass --gate-1-approved after explicit APPROVE GATE 1.');
    process.exit(1);
  }

  assertSourceHashes('before Gate 1');

  const plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'));
  const proposal = JSON.parse(fs.readFileSync(PROPOSAL_PATH, 'utf8'));
  assert.equal(plan.database, EXPECTED_DB);
  assert.equal(plan.subjects.length, 11);
  const plannedTopics = plan.subjects.reduce((n, s) => n + s.topics.length, 0);
  assert.equal(plannedTopics, 48);
  assert.equal(proposal.questionMappings.length, 250);

  loadBackendEnv();
  const uri = String(process.env.MONGODB_URI || '').trim();
  if (!uri) {
    console.error('Gate 1 blocked: MONGODB_URI is unavailable (backend/.env missing or unset).');
    console.error('No MongoDB writes were performed.');
    process.exit(1);
  }

  console.log('Gate 1 preflight: verifying empty taxonomy on ssbfy (native driver, counts only)');
  const preflight = await preflightEmptyCatalog(uri);
  console.log(`Database: ${preflight.dbName}; subjects=${preflight.subjectCount}; topics=${preflight.topicCount}`);

  mongoose.set('strictQuery', true);
  mongoose.set('autoIndex', false);
  await mongoose.connect(uri, {
    autoIndex: false,
    serverSelectionTimeoutMS: 10_000,
  });
  if (mongoose.connection.name !== EXPECTED_DB) {
    await mongoose.disconnect();
    console.error(`STOP: mongoose database is "${mongoose.connection.name}", expected "${EXPECTED_DB}".`);
    process.exit(1);
  }

  const { subjectService } = await import(moduleUrl('src/services/subjectService.js'));
  const { topicService } = await import(moduleUrl('src/services/topicService.js'));
  const { Subject } = await import(moduleUrl('src/models/Subject.js'));
  const { Topic } = await import(moduleUrl('src/models/Topic.js'));

  const createdSubjects = [];
  try {
    console.log('Creating 11 subjects via subjectService.create({ name, order })');
    for (const subjectPlan of plan.subjects) {
      const created = await subjectService.create({
        name: subjectPlan.name,
        order: subjectPlan.order,
      });
      createdSubjects.push({
        name: created.name,
        order: created.order,
        isActive: created.isActive !== false,
        id: idString(created._id),
        topics: [],
      });
    }

    console.log('Creating 48 topics via topicService.create({ name, subjectId, order })');
    for (let i = 0; i < plan.subjects.length; i += 1) {
      const subjectPlan = plan.subjects[i];
      const subjectRow = createdSubjects[i];
      for (const topicPlan of subjectPlan.topics) {
        const created = await topicService.create({
          name: topicPlan.name,
          subjectId: subjectRow.id,
          order: topicPlan.order,
        });
        subjectRow.topics.push({
          name: created.name,
          order: created.order,
          isActive: created.isActive !== false,
          id: idString(created._id),
          subjectId: idString(created.subjectId),
        });
      }
    }

    const liveSubjects = await Subject.find({}).sort({ order: 1, createdAt: 1 }).lean().exec();
    const liveTopics = await Topic.find({}).sort({ order: 1, createdAt: 1 }).lean().exec();
    assert.equal(liveSubjects.length, 11, `subject count ${liveSubjects.length}`);
    assert.equal(liveTopics.length, 48, `topic count ${liveTopics.length}`);

    const subjectByName = new Map(liveSubjects.map((s) => [s.name, s]));
    const topicBySubjectAndName = new Map(
      liveTopics.map((t) => [`${String(t.subjectId)}::${t.name}`, t]),
    );
    const subjectIds = new Set(liveSubjects.map((s) => String(s._id)));
    const subjectNameCi = new Set();
    for (const s of liveSubjects) {
      const key = String(s.name).trim().toLowerCase();
      assert.equal(subjectNameCi.has(key), false, `duplicate subject ${s.name}`);
      subjectNameCi.add(key);
    }
    for (const s of plan.subjects) {
      const live = subjectByName.get(s.name);
      assert.ok(live, `missing subject ${s.name}`);
      const tCi = new Set();
      for (const t of s.topics) {
        const tk = t.name.trim().toLowerCase();
        assert.equal(tCi.has(tk), false, `duplicate topic ${s.name}/${t.name}`);
        tCi.add(tk);
        const liveTopic = topicBySubjectAndName.get(`${String(live._id)}::${t.name}`);
        assert.ok(liveTopic, `missing topic ${s.name}/${t.name}`);
        assert.equal(subjectIds.has(String(liveTopic.subjectId)), true);
      }
    }
    for (const t of liveTopics) {
      assert.equal(subjectIds.has(String(t.subjectId)), true, `orphan topic ${t.name}`);
    }

    const result = {
      status: 'GATE_1_COMPLETED',
      database: EXPECTED_DB,
      subjectsCreated: createdSubjects.length,
      topicsCreated: createdSubjects.reduce((n, s) => n + s.topics.length, 0),
      subjects: createdSubjects,
      questionsImported: 0,
    };
    fs.writeFileSync(RESULT_JSON_PATH, `${JSON.stringify(result, null, 2)}\n`);

    const subjectTable = [
      '| Subject | Subject ID | Topics |',
      '|---|---|---:|',
      ...createdSubjects.map(
        (s) => `| ${s.name} | \`${s.id}\` | ${s.topics.length} |`,
      ),
    ].join('\n');
    const topicTable = [
      '| Subject | Topic | Topic ID |',
      '|---|---|---|',
      ...createdSubjects.flatMap((s) =>
        s.topics.map((t) => `| ${s.name} | ${t.name} | \`${t.id}\` |`),
      ),
    ].join('\n');
    const md = `# SET A — Catalog Creation Result

Status: GATE 1 COMPLETED

Database: \`${EXPECTED_DB}\`

Subjects created: **${result.subjectsCreated}**
Topics created: **${result.topicsCreated}**

Questions imported: **0** (Gate 2 not approved)

Creation used existing \`subjectService.create\` / \`topicService.create\`.
\`postId\` was omitted. \`connectDb()\`, \`syncIndexes()\`, and \`build:indexes\` were not used.
Mongoose connected with \`autoIndex: false\`.

Topic creation also ran the existing canonical-topic hook (\`onTopicCreated\` / flattened map rebuild). That is catalog bookkeeping, not question import.

${subjectTable}

${topicTable}
`;
    fs.writeFileSync(RESULT_MD_PATH, md);

    const subjectIdByName = new Map(createdSubjects.map((s) => [s.name, s.id]));
    const topicIdByKey = new Map();
    for (const s of createdSubjects) {
      for (const t of s.topics) {
        topicIdByKey.set(`${s.name}|||${t.name}`, t.id);
      }
    }

    const importRecs = loadJsonl(IMPORT_PATH);
    assert.equal(importRecs.length, 250);
    const lines = [];
    for (const mapping of proposal.questionMappings) {
      const source = importRecs[mapping.questionNumber - 1];
      assert.equal(source.sourceQuestionNumber, mapping.questionNumber);
      const subjectId = subjectIdByName.get(mapping.subject);
      const topicId = topicIdByKey.get(`${mapping.subject}|||${mapping.topic}`);
      assert.ok(subjectId, `no subject id for ${mapping.subject}`);
      assert.ok(topicId, `no topic id for ${mapping.subject}/${mapping.topic}`);
      lines.push(
        JSON.stringify({
          ...source,
          subject: subjectId,
          topic: topicId,
        }),
      );
    }
    fs.writeFileSync(METADATA_PATH, `${lines.join('\n')}\n`);

    plan.status = 'GATE_1_COMPLETED';
    fs.writeFileSync(PLAN_PATH, `${JSON.stringify(plan, null, 2)}\n`);

    assertSourceHashes('after Gate 1');
    console.log(`Wrote ${RESULT_MD_PATH}`);
    console.log(`Wrote ${METADATA_PATH}`);
    console.log('Gate 1 catalog write completed. Question import was NOT run.');
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
