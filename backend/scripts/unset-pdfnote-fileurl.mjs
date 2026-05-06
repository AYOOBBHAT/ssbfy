/**
 * One-off: remove legacy `fileUrl` from all PdfNote documents.
 *
 * Public URLs must not remain in MongoDB (defense in depth alongside a
 * private bucket + signed URLs only).
 *
 * Usage (from `backend/`):
 *   node scripts/unset-pdfnote-fileurl.mjs
 */

import 'dotenv/config';
import { connectDb, disconnectDb } from '../src/config/db.js';
import { PdfNote } from '../src/models/PdfNote.js';

async function main() {
  await connectDb();
  const res = await PdfNote.updateMany({}, { $unset: { fileUrl: '' } });
  console.log(
    `[cleanup] PdfNote fileUrl unset — matched: ${res.matchedCount}, modified: ${res.modifiedCount}`
  );
  await disconnectDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
