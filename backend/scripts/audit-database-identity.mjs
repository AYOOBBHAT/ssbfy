/**
 * Phase 5E-0.1: READ-ONLY MongoDB identity audit.
 * Direct MongoDB driver. Never calls connectDb() / mongoose.connect().
 *
 * Run: node scripts/audit-database-identity.mjs
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';
import { loadBackendEnv } from './lib/db.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'set-a');
const OUT_MD = path.join(FIXTURE_DIR, 'SET_A_database_identity_audit.md');

const JSONL_PATH = path.join(FIXTURE_DIR, 'SET_A_structured.jsonl');
const IMPORT_PATH = path.join(FIXTURE_DIR, 'SET_A_import_ready.jsonl');
const ORIGINAL_KEY_PATH = path.join(FIXTURE_DIR, 'SET_A_answer_key.json');

const EXPECTED_IMPORT_SHA256 =
  '7aad2b3b0a772c1807dce9c326d599e204a99293fae2cd10e1248e4b4db03f40';
const EXPECTED_JSONL_SHA256 =
  '8025d729630c783c6c3b0d3ae33e3fc3322faa34356c8a9b263e94b8926e0fb4';
const EXPECTED_ORIGINAL_KEY_SHA256 =
  '07f77efbc334ca63e8c13b44c36adcf45c12fa86f7f839cf87351d4ee206b259';

/**
 * Mongoose default pluralization (no model sets `collection:`).
 * Confirmed from backend/src/models/*.js.
 */
const EXPECTED_COLLECTIONS = [
  'users',
  'posts',
  'subjects',
  'topics',
  'questions',
  'tests',
  'testattempts',
  'results',
  'learningsessions',
  'userlearninganalytics',
  'topiccanonicalmaps',
  'topiclineageevents',
  'notes',
  'pdfnotes',
  'savedmaterials',
  'payments',
  'webhookevents',
  'subscriptionplans',
  'deviceusages',
  'passwordresetthrottles',
  'practiceissuances',
  'battlesessions',
  'battleusages',
];

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
];

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

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

function assertReadOnlySource() {
  const src = stripComments(fs.readFileSync(__filename, 'utf8'));
  const hits = FORBIDDEN.filter((token) => {
    const re = new RegExp(`\\b${token}\\s*\\(`, 'g');
    return re.test(src);
  });
  if (hits.length) {
    console.error(
      `STOP: audit script is not read-only; forbidden call(s): ${hits.join(', ')}`,
    );
    process.exit(1);
  }
}

function countOf(rows, name) {
  const row = rows.find((r) => r.collection === name);
  if (!row?.exists) return 0;
  return Number(row.count) || 0;
}

function assess(rows) {
  const users = countOf(rows, 'users');
  const questions = countOf(rows, 'questions');
  const tests = countOf(rows, 'tests');
  const posts = countOf(rows, 'posts');
  const payments = countOf(rows, 'payments');
  const subjects = countOf(rows, 'subjects');
  const topics = countOf(rows, 'topics');
  const existing = rows.filter((r) => r.exists);
  const appSignal =
    users + questions + tests + posts + payments +
    countOf(rows, 'notes') +
    countOf(rows, 'pdfnotes') +
    countOf(rows, 'results') +
    countOf(rows, 'testattempts') +
    countOf(rows, 'learningsessions') +
    countOf(rows, 'battlesessions');

  if (existing.length === 0) {
    return {
      code: 'EMPTY_OR_POSSIBLY_WRONG_DATABASE',
      why: 'listCollections returned no user collections. This is not a populated SSBFY catalog.',
    };
  }

  if (appSignal > 0 && subjects === 0 && topics === 0) {
    return {
      code: 'EXPECTED_DATABASE_WITH_EMPTY_TAXONOMY',
      why: 'Application collections exist and contain documents (users/questions/tests/posts/payments/related), but subjects and topics are empty. Taxonomy was not seeded; the rest of the app data is present.',
    };
  }

  if (appSignal === 0 && subjects === 0 && topics === 0) {
    const anyDocs = existing.reduce((n, r) => n + (Number(r.count) || 0), 0);
    if (anyDocs === 0) {
      return {
        code: 'EMPTY_OR_POSSIBLY_WRONG_DATABASE',
        why: 'Collections may exist, but application document counts are zero (including users, questions, tests, posts, subjects, and topics). This looks like an empty or unused database, not a populated SSBFY catalog.',
      };
    }
    return {
      code: 'UNABLE_TO_DETERMINE',
      why: 'Some documents exist, but not in the usual application collections used to identify SSBFY (users, questions, tests, posts, payments). Subjects and topics are also empty.',
    };
  }

  if (subjects > 0 || topics > 0) {
    return {
      code: 'UNABLE_TO_DETERMINE',
      why: 'Subjects and/or topics are not both empty, which does not match the Phase 5E-0 dump of 0/0. Re-check the dump vs this audit.',
    };
  }

  return {
    code: 'UNABLE_TO_DETERMINE',
    why: 'Collection mix does not clearly match a populated SSBFY app database with empty taxonomy, nor a fully empty database.',
  };
}

function renderMarkdown({ dbName, generatedAt, rows, assessment }) {
  const table = rows
    .map(
      (r) =>
        `| ${r.collection} | ${r.exists ? 'yes' : 'no'} | ${
          r.exists ? r.count : '—'
        } |`,
    )
    .join('\n');

  const summaryLines = [
    ['Users', 'users'],
    ['Posts', 'posts'],
    ['Questions', 'questions'],
    ['Tests', 'tests'],
    ['Test attempts', 'testattempts'],
    ['Results', 'results'],
    ['Payments', 'payments'],
    ['Notes', 'notes'],
    ['PDF notes', 'pdfnotes'],
    ['Learning sessions', 'learningsessions'],
    ['Battle sessions', 'battlesessions'],
    ['Subjects', 'subjects'],
    ['Topics', 'topics'],
  ]
    .map(([label, name]) => `${label}: ${countOf(rows, name)}`)
    .join('\n');

  return `# SSBFY Database Identity Audit

Generated: ${generatedAt}
Read-only: YES

## Connection

MongoDB connection: SUCCESS
Database name: ${dbName || '(unavailable)'}

## Collections

| Collection | Exists | Document Count |
|---|---|---:|
${table}

## Subjects / Topics

Subjects: ${countOf(rows, 'subjects')}
Topics: ${countOf(rows, 'topics')}

## Application Data Summary

${summaryLines}

## Assessment

${assessment.code}

${assessment.why}

ZERO database writes. No collections were created. No indexes were created.
`;
}

async function main() {
  console.log('SET A database identity audit: READ-ONLY mode');
  assertReadOnlySource();
  assertSourceHashes('before audit');

  loadBackendEnv();
  const uri = String(process.env.MONGODB_URI || '').trim();
  if (!uri) {
    console.error('Live identity audit blocked: MONGODB_URI is unavailable.');
    assertSourceHashes('after blocked audit');
    process.exit(1);
  }

  let client;
  try {
    client = new MongoClient(uri, { readPreference: 'primary' });
    await client.connect();
    console.log('MongoDB connection established — READ-ONLY queries only');

    const db = client.db();
    const dbName = db.databaseName;
    console.log(`Database name: ${dbName}`);

    console.log('Reading collection list (listCollections)');
    const listed = await db.listCollections({}, { nameOnly: true }).toArray();
    const existingNames = listed
      .map((c) => c.name)
      .filter((name) => !String(name).startsWith('system.'))
      .sort((a, b) => a.localeCompare(b));

    const extra = existingNames.filter((n) => !EXPECTED_COLLECTIONS.includes(n));
    const orderedNames = [...EXPECTED_COLLECTIONS, ...extra];

    const rows = [];
    for (const name of orderedNames) {
      const exists = existingNames.includes(name);
      if (!exists) {
        rows.push({ collection: name, exists: false, count: null });
        continue;
      }
      console.log(`Counting collection: ${name}`);
      const count = await db.collection(name).countDocuments({});
      rows.push({ collection: name, exists: true, count });
    }

    const assessment = assess(rows);
    const generatedAt = new Date().toISOString();
    const md = renderMarkdown({ dbName, generatedAt, rows, assessment });
    fs.writeFileSync(OUT_MD, md, 'utf8');

    console.log(`Wrote ${OUT_MD}`);
    console.log(`Assessment: ${assessment.code}`);
    console.log('Identity audit completed — NO DATABASE WRITES');
  } finally {
    if (client) await client.close();
  }

  assertSourceHashes('after audit');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
