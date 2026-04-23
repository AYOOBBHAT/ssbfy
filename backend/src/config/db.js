import mongoose from 'mongoose';
import { env, isProd } from './env.js';

export async function connectDb() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri, {
    autoIndex: !isProd,
    serverSelectionTimeoutMS: 10_000,
  });

  // One-time production index sync.
  // Triggered explicitly via SYNC_INDEXES=true so that normal production
  // startups are NOT slowed down by index rebuilds. After a successful
  // sync run, unset SYNC_INDEXES (or set it to false) and redeploy.
  if (isProd && process.env.SYNC_INDEXES === 'true') {
    try {
      await Promise.all(
        mongoose.modelNames().map((name) => mongoose.model(name).syncIndexes())
      );
      console.log('[DB] Production indexes synced successfully');
    } catch (err) {
      console.error('[DB] Production index sync failed', err);
    }
  }
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
