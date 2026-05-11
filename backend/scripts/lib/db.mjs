/**
 * Shared DB bootstrap for maintenance scripts (loads .env before config/env).
 *
 * Dynamic `import()` must receive a file URL on Windows — bare paths like `C:\...`
 * trigger ERR_UNSUPPORTED_ESM_URL_SCHEME ("Received protocol 'c:'").
 */
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** backend/scripts/lib → backend root */
export const BACKEND_ROOT = path.resolve(__dirname, '..', '..');

/** Resolve a path under BACKEND_ROOT to a `file:` URL string for `import()`. */
export function moduleUrl(...segments) {
  return pathToFileURL(path.join(BACKEND_ROOT, ...segments)).href;
}

export function loadBackendEnv() {
  dotenv.config({ path: path.join(BACKEND_ROOT, '.env') });
}

export async function openDb() {
  loadBackendEnv();
  await import(moduleUrl('src/models/index.js'));
  const { connectDb } = await import(moduleUrl('src/config/db.js'));
  await connectDb();
}

export async function closeDb() {
  const { disconnectDb } = await import(moduleUrl('src/config/db.js'));
  await disconnectDb();
}
