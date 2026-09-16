/**
 * Read-only Cloudflare Stream connectivity check.
 *
 * Authenticates the API token and lists Stream library size.
 * Does NOT mint direct-upload URLs (that creates a pending video UID).
 * Does NOT upload bytes, delete videos, or connect to MongoDB.
 *
 * Run: node scripts/verify-cloudflare-stream.mjs
 *      npm run verify:cloudflare-stream
 */
import { loadBackendEnv, moduleUrl } from './lib/db.mjs';

loadBackendEnv();

const { cloudflareStreamService } = await import(
  moduleUrl('src/services/cloudflareStreamService.js')
);

function summary(extra) {
  return {
    configured: cloudflareStreamService.isConfigured(),
    tokenVerified: false,
    streamAccessible: false,
    videoCountBefore: null,
    videoCountAfter: null,
    videoCountUnchanged: null,
    directUploadInvoked: false,
    directUploadSkippedReason:
      'POST /accounts/{account_id}/stream/direct_upload creates a pending Stream video (uid) before any bytes are uploaded. Phase 2 does not call it so the library count stays unchanged.',
    mongoConnected: false,
    ...extra,
  };
}

function printSafe(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

const accountSet = Boolean((process.env.CLOUDFLARE_ACCOUNT_ID || '').trim());
const tokenSet = Boolean((process.env.CLOUDFLARE_STREAM_API_TOKEN || '').trim());

if (!accountSet || !tokenSet) {
  const missing = [];
  if (!accountSet) missing.push('CLOUDFLARE_ACCOUNT_ID');
  if (!tokenSet) missing.push('CLOUDFLARE_STREAM_API_TOKEN');
  printSafe(
    summary({
      ok: false,
      error: `Missing ${missing.join(' and ')}. Add empty-then-filled values to backend/.env (gitignored). See backend/.env.example.`,
    })
  );
  process.exitCode = 1;
} else {
  try {
    const token = await cloudflareStreamService.verifyApiToken();
    const before = await cloudflareStreamService.listVideosSummary();
    const after = await cloudflareStreamService.listVideosSummary();
    const unchanged = before.total === after.total;
    const out = summary({
      ok: token.ok && before.ok && after.ok && unchanged,
      tokenVerified: token.ok,
      tokenStatus: token.status || null,
      streamAccessible: before.ok,
      videoCountBefore: before.total,
      videoCountAfter: after.total,
      videoCountUnchanged: unchanged,
    });
    printSafe(out);
    if (!out.ok) process.exitCode = 1;
  } catch (err) {
    printSafe(
      summary({
        ok: false,
        error: err?.message || 'Cloudflare Stream request failed',
        statusCode: err?.statusCode || null,
      })
    );
    process.exitCode = 1;
  }
}
