/**
 * Phase 1 Video Lecture architecture audit verifier (read-only).
 *
 * Checks fixture files, required sections/keys, that application source was
 * not modified, and that audit files do not contain secrets. Does not connect
 * to MongoDB or Cloudflare.
 *
 * Run: node scripts/verify-phase1-video-lecture-audit.mjs
 *      npm run verify:phase1-video-lecture-audit
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(here, '..');
const repoRoot = path.join(backendRoot, '..');

const MD_REL = 'scripts/fixtures/video-lectures/PHASE1_VIDEO_LECTURE_ARCHITECTURE_AUDIT.md';
const JSON_REL = 'scripts/fixtures/video-lectures/PHASE1_VIDEO_LECTURE_ARCHITECTURE_AUDIT.json';
const VERIFIER_REL = 'scripts/verify-phase1-video-lecture-audit.mjs';

const REQUIRED_MD_HEADINGS = [
  '# Phase 1 — Video Lecture Architecture Audit',
  '## Current Stack',
  '## Current Upload Architecture',
  '## Authentication',
  '## Subject/Topic Architecture',
  '## Existing Content Architecture',
  '## Existing Exam/Test Architecture',
  '## Current Premium System',
  '## Mobile Video Player',
  '## Cloudflare Stream Integration',
  '## Proposed VideoLecture Architecture',
  '## Proposed Playlist Architecture',
  '## Dynamic Playlist Behavior',
  '## Curated Playlist Behavior',
  '## Proposed API',
  '## Proposed Admin Workflow',
  '## Proposed Mobile Workflow',
  '## Security',
  '## Environment Variables',
  '## Database Index Considerations',
  '## Cost Considerations',
  '## Code Reuse',
  '## Risks / Open Questions',
  '## Recommended Implementation Phases',
  '## Final Recommendation',
];

const REQUIRED_JSON_KEYS = [
  'backend',
  'admin',
  'mobile',
  'existingStorage',
  'taxonomy',
  'authentication',
  'premiumAccess',
  'currentVideoPlayer',
  'cloudflareIntegration',
  'videoLectureSchemaProposal',
  'playlistSchemaProposal',
  'apiProposal',
  'security',
  'environmentProposal',
  'indexProposal',
  'implementationPhases',
  'risks',
  'openQuestions',
];

const ALLOWED_GIT_PATHS = new Set([
  'backend/package.json',
  'backend/scripts/verify-phase1-video-lecture-audit.mjs',
  'backend/scripts/fixtures/video-lectures',
  'backend/scripts/fixtures/video-lectures/',
  'backend/scripts/fixtures/video-lectures/PHASE1_VIDEO_LECTURE_ARCHITECTURE_AUDIT.md',
  'backend/scripts/fixtures/video-lectures/PHASE1_VIDEO_LECTURE_ARCHITECTURE_AUDIT.json',
  'mobile/app.json',
]);

function isAllowedGitPath(norm) {
  if (ALLOWED_GIT_PATHS.has(norm)) return true;
  return norm.startsWith('backend/scripts/fixtures/video-lectures/');
}

const FORBIDDEN_GIT_PREFIXES = [
  'backend/src/',
  'admin/',
  'mobile/src/',
  'mobile/App.js',
];

const FORBIDDEN_ENV_NAMES = [
  '.env',
  '.env.local',
  '.env.production',
  'backend/.env',
  'admin/.env',
  'mobile/.env',
];

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

function readBackend(rel) {
  return fs.readFileSync(path.join(backendRoot, rel), 'utf8');
}

function gitPorcelain() {
  try {
    return execFileSync('git', ['status', '--porcelain'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
  } catch (err) {
    throw new Error(`git status failed: ${err?.message || err}`);
  }
}

function parseGitPaths(porcelain) {
  const paths = [];
  for (const line of porcelain.split('\n')) {
    if (!line.trim()) continue;
    const rest = line.slice(3);
    if (rest.includes(' -> ')) {
      const [from, to] = rest.split(' -> ');
      paths.push(from.replace(/\\/g, '/'), to.replace(/\\/g, '/'));
    } else {
      paths.push(rest.replace(/\\/g, '/').replace(/^"/, '').replace(/"$/, ''));
    }
  }
  return paths;
}

test('audit markdown exists', () => {
  assert.equal(fs.existsSync(path.join(backendRoot, MD_REL)), true);
});

test('audit json exists', () => {
  assert.equal(fs.existsSync(path.join(backendRoot, JSON_REL)), true);
});

test('verifier exists and is this file', () => {
  assert.equal(fs.existsSync(path.join(backendRoot, VERIFIER_REL)), true);
});

const md = readBackend(MD_REL);
const jsonText = readBackend(JSON_REL);
const pkg = JSON.parse(readBackend('package.json'));
const audit = JSON.parse(jsonText);

test('package.json has verify:phase1-video-lecture-audit', () => {
  assert.equal(
    pkg.scripts['verify:phase1-video-lecture-audit'],
    'node scripts/verify-phase1-video-lecture-audit.mjs'
  );
});

test('markdown required sections exist', () => {
  for (const heading of REQUIRED_MD_HEADINGS) {
    assert.equal(md.includes(heading), true, `missing heading: ${heading}`);
  }
});

test('markdown distinguishes current vs proposed Cloudflare', () => {
  assert.match(md, /CURRENT SSBFY CODE/);
  assert.match(md, /PROPOSED CLOUDFLARE INTEGRATION/);
});

test('json required keys exist', () => {
  for (const key of REQUIRED_JSON_KEYS) {
    assert.ok(audit[key] != null, `missing json key: ${key}`);
  }
});

test('safety flags record zero writes', () => {
  assert.equal(audit.safety.mongoWrites, 0);
  assert.equal(audit.safety.mongoCollectionsCreated, 0);
  assert.equal(audit.safety.mongoIndexesCreated, 0);
  assert.equal(audit.safety.cloudflareResourcesCreated, 0);
  assert.equal(audit.safety.cloudflareVideosCreated, 0);
  assert.equal(audit.safety.cloudflareTokensCreated, 0);
  assert.equal(audit.safety.backendSrcModified, 0);
  assert.equal(audit.safety.adminModified, 0);
  assert.equal(audit.safety.mobileModified, 0);
  assert.equal(audit.safety.environmentFilesModified, 0);
  assert.equal(audit.safety.productionDeployed, false);
});

test('no VideoLecture model in application source', () => {
  assert.equal(fs.existsSync(path.join(backendRoot, 'src/models/VideoLecture.js')), false);
  assert.equal(fs.existsSync(path.join(backendRoot, 'src/models/Playlist.js')), false);
  const modelsIndex = readBackend('src/models/index.js');
  assert.doesNotMatch(modelsIndex, /VideoLecture|Playlist/);
});

test('verifier does not connect to Mongo or Cloudflare', () => {
  const self = fs.readFileSync(path.join(backendRoot, VERIFIER_REL), 'utf8');
  assert.doesNotMatch(self, /mongoose\.connect\(/);
  assert.doesNotMatch(self, /\bopenDb\s*\(/);
  assert.doesNotMatch(self, /\bconnectDb\s*\(/);
  assert.doesNotMatch(self, /api\.cloudflare\.com|videodelivery\.net/);
  assert.doesNotMatch(self, /from ['"]dotenv['"]/);
});

test('audit files do not contain secrets', () => {
  const combined = `${md}\n${jsonText}`;
  const forbidden = [
    /mongodb\+srv:\/\/[^:]+:[^@]+@/i,
    /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\./,
    /sk_live_[A-Za-z0-9]+/,
    /rzp_live_[A-Za-z0-9]+/,
    /-----BEGIN (RSA |EC )?PRIVATE KEY-----/,
    /CLOUDFLARE_STREAM_API_TOKEN\s*[:=]\s*['"]?[A-Za-z0-9_-]{20,}/,
    /JWT_SECRET\s*[:=]\s*['"](?!change_this)[^'"]{8,}/,
    /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*['"][^'"]+/,
    /RAZORPAY_KEY_SECRET\s*[:=]\s*['"][^'"]+/,
  ];
  for (const re of forbidden) {
    assert.equal(re.test(combined), false, `secret-like pattern ${re}`);
  }
});

test('git working tree has no production application modifications', () => {
  const porcelain = gitPorcelain();
  const paths = parseGitPaths(porcelain);
  for (const p of paths) {
    const norm = p.replace(/\\/g, '/');
    if (isAllowedGitPath(norm)) continue;
    if (FORBIDDEN_ENV_NAMES.includes(norm) || /(^|\/)\.env(\.|$)/.test(norm)) {
      assert.fail(`environment file changed: ${norm}`);
    }
    for (const prefix of FORBIDDEN_GIT_PREFIXES) {
      if (norm.startsWith(prefix) || norm === prefix.replace(/\/$/, '')) {
        assert.fail(`production application file changed: ${norm}`);
      }
    }
    if (norm.startsWith('backend/src/')) {
      assert.fail(`backend src changed: ${norm}`);
    }
  }
});

test('multer remains PDF/CSV only in current upload middleware', () => {
  const upload = readBackend('src/middlewares/upload.js');
  assert.match(upload, /uploadPdfSingle/);
  assert.match(upload, /handleCsvUpload/);
  assert.doesNotMatch(upload, /video\/mp4|cloudflare/i);
});

console.log(`\n${passed} checks passed`);
console.log('PHASE 1 VIDEO LECTURE AUDIT VERIFIER: PASS');
