import { v2 as cloudinary } from 'cloudinary';
import { env } from './env.js';

/**
 * Singleton Cloudinary configuration.
 *
 * We call `.config()` once at module load so every downstream import
 * (multer storage engine, destroy-on-failure helper, any future
 * signed-URL logic) shares the same credentials without re-reading
 * process.env on every call.
 *
 * Credentials come exclusively from env — we never hard-code them and
 * never log them. If any of the three is missing we log a warning
 * instead of throwing so a local dev without a Cloudinary account can
 * still boot the rest of the app; the upload route itself will fail
 * loudly with a 500 when actually exercised.
 */
if (
  !env.cloudinaryCloudName ||
  !env.cloudinaryApiKey ||
  !env.cloudinaryApiSecret
) {
  console.warn(
    '[cloudinary] missing CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET ' +
      '— PDF uploads will fail until these are set.'
  );
}

cloudinary.config({
  cloud_name: env.cloudinaryCloudName,
  api_key: env.cloudinaryApiKey,
  api_secret: env.cloudinaryApiSecret,
  secure: true,
});

export { cloudinary };
// Default export as well so `import cloudinary from '.../cloudinary.js'`
// works alongside the named form. Both refer to the same singleton.
export default cloudinary;

/** Folder used for every PDF note upload. */
export const PDF_CLOUDINARY_FOLDER = 'ssbfy/pdf-notes';

/**
 * Best-effort deletion of a previously uploaded asset. Never throws —
 * callers use it for cleanup after a DB write fails, and a failure
 * here is not a reason to propagate a 500 back to the client.
 *
 * PDFs are uploaded as `resource_type: 'raw'`, so deletion must pass
 * the same type or Cloudinary returns "not found".
 */
export async function destroyPdfAsset(publicId) {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: 'raw',
      invalidate: true,
    });
  } catch (err) {
    console.warn('[cloudinary] failed to destroy orphan asset', {
      publicId,
      error: err?.message,
    });
  }
}

/**
 * `multer-storage-cloudinary` sets `file.filename` to the upload response
 * `public_id`. Cloudinary may return either the full id (`ssbfy/pdf-notes/pdf-…`)
 * or the bare id we asked for (`pdf-…`). The delivery URL and destroy API
 * need the same full path. Never treat `originalname` (e.g. "notes.pdf") as
 * public_id.
 */
export function ensureCanonicalRawPublicId(multerPublicId) {
  if (multerPublicId == null) return null;
  const s = String(multerPublicId).trim();
  if (!s) return null;
  if (s.includes('/')) {
    return s;
  }
  // Our uploads use public_id: `pdf-${Date.now()}-<12 hex>` under PDF_CLOUDINARY_FOLDER
  if (/^pdf-\d+-[a-f0-9]+$/i.test(s)) {
    return `${PDF_CLOUDINARY_FOLDER}/${s}`;
  }
  return s;
}

/**
 * Public HTTPS delivery URL for a `resource_type: 'raw'` PDF asset.
 *
 * Prefer the official `cloudinary.url(canonical public_id, …)` so the link
 * always matches the stored asset. Fallback to the upload `secure_url` only
 * when we have no public_id to rebuild (legacy rows).
 */
export function rawAssetDeliveryUrl(secureUrlFromUpload, publicId) {
  const fromApi = typeof secureUrlFromUpload === 'string' ? secureUrlFromUpload.trim() : '';
  const canonical = ensureCanonicalRawPublicId(publicId);

  if (canonical) {
    try {
      return cloudinary.url(canonical, {
        resource_type: 'raw',
        secure: true,
      });
    } catch {
      // e.g. missing cloud_name in local dev — fall back below
    }
  }
  if (
    fromApi &&
    /^https:\/\//i.test(fromApi) &&
    fromApi.includes('res.cloudinary.com')
  ) {
    return fromApi;
  }
  return fromApi;
}
