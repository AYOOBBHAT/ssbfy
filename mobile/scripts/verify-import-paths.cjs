const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['src', 'plugins'];
const ROOT_FILES = ['App.js', 'index.js'];
const FILE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);
const RESOLVE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.json'];

function readDirSafe(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function collectSourceFiles(startPath, out = []) {
  const stats = fs.statSync(startPath);
  if (stats.isFile()) {
    if (FILE_EXTENSIONS.has(path.extname(startPath))) out.push(startPath);
    return out;
  }

  for (const entry of readDirSafe(startPath)) {
    if (entry.name === 'node_modules' || entry.name === '.expo' || entry.name === 'dist') continue;
    const abs = path.join(startPath, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(abs, out);
    } else if (FILE_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(abs);
    }
  }

  return out;
}

function collectImportSpecifiers(source) {
  const specs = [];
  const patterns = [
    /\bimport\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) {
      specs.push(match[1]);
    }
  }

  return specs.filter((spec) => spec.startsWith('.'));
}

function resolveImport(filePath, specifier) {
  const importerDir = path.dirname(filePath);
  const absBase = path.resolve(importerDir, specifier);
  const hasExtension = path.extname(absBase) !== '';

  if (hasExtension) {
    return fs.existsSync(absBase) ? absBase : null;
  }

  for (const ext of RESOLVE_EXTENSIONS) {
    const candidate = `${absBase}${ext}`;
    if (fs.existsSync(candidate)) return candidate;
  }

  for (const ext of RESOLVE_EXTENSIONS) {
    const candidate = path.join(absBase, `index${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

function normalizeImportPath(specifier) {
  let normalized = path.posix.normalize(specifier.replace(/\\/g, '/'));
  normalized = normalized.replace(/\.[^.\/]+$/, '');
  if (normalized.endsWith('/index')) {
    normalized = normalized.slice(0, -'/index'.length);
  }
  normalized = normalized.replace(/^\.\//, '');
  return normalized;
}

function normalizeResolvedPath(filePath, resolvedPath) {
  let relative = path.relative(path.dirname(filePath), resolvedPath).replace(/\\/g, '/');
  relative = relative.replace(/\.[^.\/]+$/, '');
  if (relative.endsWith('/index')) {
    relative = relative.slice(0, -'/index'.length);
  }
  return path.posix.normalize(relative.replace(/^\.\//, ''));
}

function getActualCasePath(targetPath) {
  const resolved = path.resolve(targetPath);
  const { root } = path.parse(resolved);
  const segments = resolved.slice(root.length).split(path.sep).filter(Boolean);
  let current = root;
  const actualSegments = [];

  for (const segment of segments) {
    const entries = readDirSafe(current);
    const exact = entries.find((entry) => entry.name === segment);
    if (exact) {
      actualSegments.push(exact.name);
      current = path.join(current, exact.name);
      continue;
    }
    const insensitive = entries.find(
      (entry) => entry.name.toLowerCase() === segment.toLowerCase()
    );
    if (!insensitive) return null;
    actualSegments.push(insensitive.name);
    current = path.join(current, insensitive.name);
  }

  return path.join(root, ...actualSegments);
}

function toWorkspacePath(absPath) {
  return path.relative(ROOT, absPath).replace(/\\/g, '/');
}

const files = [];
for (const dir of SCAN_DIRS) {
  const abs = path.join(ROOT, dir);
  if (fs.existsSync(abs)) collectSourceFiles(abs, files);
}
for (const file of ROOT_FILES) {
  const abs = path.join(ROOT, file);
  if (fs.existsSync(abs)) files.push(abs);
}

const unresolved = [];
const caseMismatches = [];

for (const filePath of files) {
  const source = fs.readFileSync(filePath, 'utf8');
  const specs = collectImportSpecifiers(source);

  for (const specifier of specs) {
    const resolved = resolveImport(filePath, specifier);
    if (!resolved) {
      unresolved.push({
        file: toWorkspacePath(filePath),
        specifier,
      });
      continue;
    }

    const actualCasePath = getActualCasePath(resolved);
    if (!actualCasePath) {
      unresolved.push({
        file: toWorkspacePath(filePath),
        specifier,
      });
      continue;
    }

    const expected = normalizeImportPath(specifier);
    const actual = normalizeResolvedPath(filePath, actualCasePath);
    if (expected.toLowerCase() === actual.toLowerCase() && expected !== actual) {
      caseMismatches.push({
        file: toWorkspacePath(filePath),
        specifier: expected,
        actual,
      });
    }
  }
}

const duplicateCaseMap = new Map();
for (const filePath of files) {
  const rel = toWorkspacePath(filePath);
  const key = rel.toLowerCase();
  const existing = duplicateCaseMap.get(key) || [];
  existing.push(rel);
  duplicateCaseMap.set(key, existing);
}

const duplicateByCase = [...duplicateCaseMap.values()].filter((group) => group.length > 1);

if (
  unresolved.length === 0 &&
  caseMismatches.length === 0 &&
  duplicateByCase.length === 0
) {
  console.log('Import path verification passed.');
  process.exit(0);
}

if (unresolved.length > 0) {
  console.error('Unresolved relative imports:');
  for (const issue of unresolved) {
    console.error(`- ${issue.file}: ${issue.specifier}`);
  }
}

if (caseMismatches.length > 0) {
  console.error('Case-sensitive path mismatches:');
  for (const issue of caseMismatches) {
    console.error(`- ${issue.file}: imported ${issue.specifier} but actual path is ${issue.actual}`);
  }
}

if (duplicateByCase.length > 0) {
  console.error('Duplicate files differing only by case:');
  for (const group of duplicateByCase) {
    console.error(`- ${group.join(' | ')}`);
  }
}

process.exit(1);
