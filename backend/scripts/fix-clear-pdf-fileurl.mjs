#!/usr/bin/env node
/**
 * Clear PdfNote.fileUrl when it is non-empty but not a valid http(s) URL (legacy garbage).
 * Valid URLs are left untouched. Default dry-run; use --apply to write.
 *
 * Usage:
 *   node scripts/fix-clear-pdf-fileurl.mjs
 *   node scripts/fix-clear-pdf-fileurl.mjs --apply
 */
import { PdfNote } from '../src/models/PdfNote.js';
import { openDb, closeDb } from './lib/db.mjs';
import { createReporter, parseArgs } from './lib/reporter.mjs';

function isHttpUrl(s) {
  if (typeof s !== 'string' || !s.trim()) return false;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

async function main() {
  const { dryRun, apply, verbose } = parseArgs();
  const r = createReporter();
  const doWrite = apply && !dryRun;

  await openDb();

  const docs = await PdfNote.find({
    fileUrl: { $exists: true, $nin: ['', null] },
  }).lean();

  let touch = 0;
  for (const p of docs) {
    const fu = p.fileUrl;
    if (typeof fu === 'string' && fu.trim() !== '' && !isHttpUrl(fu)) {
      touch += 1;
      r.fixable(`PdfNote ${p._id} clear invalid fileUrl (${fu.slice(0, 40)}…)`);
      if (doWrite) {
        await PdfNote.updateOne({ _id: p._id }, { $set: { fileUrl: '' } });
      }
    } else if (verbose && typeof fu === 'string' && fu.trim() !== '') {
      r.info(`PdfNote ${p._id} keeps valid fileUrl`);
    }
  }

  r.summary([
    `candidates (invalid URL): ${touch}`,
    `writes: ${doWrite ? 'yes' : 'no'}`,
  ]);

  await closeDb();
  process.exit(0);
}

main().catch((e) => {
  console.error('[ERROR]', e);
  process.exit(2);
});
