/**
 * Backfill canonicalTopicId and rebuild flattened lineage map.
 * Usage: node scripts/backfill-canonical-topics.mjs
 */
import '../src/config/env.js';
import { connectDb, disconnectDb } from '../src/config/db.js';
import { canonicalTopicService } from '../src/services/canonicalTopicService.js';

await connectDb();
try {
  const result = await canonicalTopicService.backfillAll();
  console.log('backfill-canonical-topics:', result);
} finally {
  await disconnectDb();
}
