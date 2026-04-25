/**
 * One-off: rewrite PdfNote.fileUrl to the canonical URL from
 * supabase.storage.from(bucket).getPublicUrl(storedName).publicUrl
 * so it matches "Copy public URL" in the Supabase dashboard
 * (/storage/v1/object/public/... not .../s3/...).
 *
 * Usage (from `backend/`):
 *   node scripts/fix-pdf-public-urls.mjs
 *
 * Only updates rows where fileUrl already points at Supabase (so local
 * relative paths are untouched). Logs the first before/after pair as an
 * example; run on staging first.
 */

import 'dotenv/config';
import { connectDb, disconnectDb } from '../src/config/db.js';
import { PdfNote } from '../src/models/PdfNote.js';
import { isSupabasePdfStorageConfigured } from '../src/config/supabase.js';
import { getPdfNotesPublicUrl, normalizePathWithinBucket } from '../src/services/pdfSupabaseStorage.js';
import { env } from '../src/config/env.js';

const bucket = (env.supabaseStorageBucket && String(env.supabaseStorageBucket).trim()) || 'pdf-notes';

function looksLikeSupabaseHost(url) {
  if (!url || typeof url !== 'string') return false;
  const s = url.toLowerCase();
  return s.includes('supabase');
}

async function main() {
  if (!isSupabasePdfStorageConfigured()) {
    console.error('Supabase not configured. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET.');
    process.exit(1);
  }
  await connectDb();
  const all = await PdfNote.find({}).lean();
  let updated = 0;
  let loggedExample = false;

  for (const doc of all) {
    if (!doc.storedName) continue;
    if (!looksLikeSupabaseHost(doc.fileUrl)) continue;

    const inBucket = normalizePathWithinBucket(String(doc.storedName), bucket);
    if (!inBucket) continue;

    let correct;
    try {
      const out = getPdfNotesPublicUrl(inBucket);
      correct = out.publicUrl;
    } catch (e) {
      console.warn(`[fix-pdf] skip ${doc._id}:`, e?.message || e);
      continue;
    }

    if (doc.fileUrl === correct) continue;

    if (!loggedExample) {
      console.log('[fix-pdf] example — broken stored fileUrl (MongoDB):', doc.fileUrl);
      console.log('[fix-pdf] example — correct public URL:              ', correct);
      loggedExample = true;
    }

    await PdfNote.updateOne({ _id: doc._id }, { $set: { fileUrl: correct } });
    updated += 1;
  }

  console.log(`[fix-pdf] done. Updated ${updated} document(s).`);
  await disconnectDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
