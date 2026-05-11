#!/usr/bin/env node
/**
 * PdfNote audit — storage keys, posts, legacy fileUrl.
 * Usage: node scripts/audit-pdf-integrity.mjs [--verbose]
 */
import { PdfNote } from '../src/models/PdfNote.js';
import { Post } from '../src/models/Post.js';
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
  const { verbose } = parseArgs();
  const r = createReporter();
  await openDb();

  const posts = await Post.find({}, { _id: 1, isActive: 1 }).lean();
  const postMap = new Map(posts.map((p) => [String(p._id), p]));

  const pdfs = await PdfNote.find({}).lean();
  const c = {
    missingStoredName: 0,
    missingTitle: 0,
    emptyPostIdsAndPostId: 0,
    badPostRef: 0,
    inactivePostRef: 0,
    staleFileUrl: 0,
    emptyFileName: 0,
    zeroSize: 0,
  };

  for (const p of pdfs) {
    const id = String(p._id);
    if (!p.storedName || String(p.storedName).trim() === '') {
      c.missingStoredName += 1;
      r.error(`PdfNote ${id} missing storedName`);
    }
    if (!p.title || String(p.title).trim() === '') {
      c.missingTitle += 1;
      r.warn(`PdfNote ${id} missing or empty title`);
    }
    if (!p.fileName || String(p.fileName).trim() === '') {
      c.emptyFileName += 1;
      r.warn(`PdfNote ${id} missing fileName`);
    }
    const plist = Array.isArray(p.postIds) ? p.postIds : [];
    const legacyPid = p.postId ? String(p.postId) : null;
    if (plist.length === 0 && !legacyPid) {
      c.emptyPostIdsAndPostId += 1;
      r.warn(`PdfNote ${id} has no postIds and no legacy postId`);
    }
    const combined = [...plist];
    if (legacyPid) combined.push(p.postId);
    for (const pid of combined) {
      const ps = String(pid);
      if (!postMap.has(ps)) {
        c.badPostRef += 1;
        r.error(`PdfNote ${id} references missing Post ${ps}`);
      } else if (postMap.get(ps).isActive === false) {
        c.inactivePostRef += 1;
        r.warn(`PdfNote ${id} references inactive Post ${ps}`);
      }
    }

    if (typeof p.fileUrl === 'string' && p.fileUrl.trim() !== '') {
      if (!isHttpUrl(p.fileUrl)) {
        c.staleFileUrl += 1;
        r.fixable(`PdfNote ${id} fileUrl present but not valid http(s)`);
      } else if (verbose) {
        r.info(`PdfNote ${id} has legacy fileUrl (consider clearing after migration)`);
      }
    }

    if (typeof p.fileSize === 'number' && p.fileSize <= 0) {
      c.zeroSize += 1;
      r.warn(`PdfNote ${id} fileSize=${p.fileSize}`);
    }
  }

  r.summary([
    `pdf notes: ${pdfs.length}`,
    ...Object.entries(c).map(([k, v]) => `${k}: ${v}`),
  ]);

  await closeDb();
  process.exit(r.exitCode());
}

main().catch((e) => {
  console.error('[ERROR]', e);
  process.exit(2);
});
