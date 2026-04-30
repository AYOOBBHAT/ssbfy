import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { getSupabaseServiceClient, isSupabasePdfStorageConfigured } from '../config/supabase.js';
import { env } from '../config/env.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

/** Must match the Storage bucket name in Supabase Dashboard (default: pdf-notes). */
const DEFAULT_PDF_BUCKET = 'pdf-notes';

/** Object key prefix inside the bucket: exam-pdfs/<file>.pdf */
const EXAM_PDFS_PREFIX = 'exam-pdfs';

/**
 * The Storage API sometimes returns a path that already includes the bucket
 * segment, or a `fullPath` that duplicates it. `getPublicUrl` expects only
 * the key *inside* the bucket — otherwise the URL can point at
 * `/storage/v1/s3/...` or a broken doubled path. Normalize so we only ever
 * pass a bucket-relative key to `getPublicUrl`.
 */
export function normalizePathWithinBucket(rawPath, bucket) {
  if (typeof rawPath !== 'string' || !rawPath.trim()) {
    return rawPath;
  }
  const b = String(bucket || DEFAULT_PDF_BUCKET).trim();
  let p = rawPath.trim().replace(/\\/g, '/');
  // Strip a leading "bucketName/" if present (e.g. from fullPath).
  if (b && p.startsWith(`${b}/`)) {
    p = p.slice(b.length + 1);
  }
  return p;
}

function getPdfBucket() {
  return (env.supabaseStorageBucket && String(env.supabaseStorageBucket).trim()) || DEFAULT_PDF_BUCKET;
}

function assertReady() {
  if (!isSupabasePdfStorageConfigured()) {
    throw new AppError(
      'PDF storage is not configured. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_STORAGE_BUCKET.',
      HTTP_STATUS.SERVICE_UNAVAILABLE
    );
  }
}

/**
 * Build the canonical public URL for an object in `pdf-notes` using ONLY
 * supabase.storage.from(bucket).getPublicUrl(path) → data.publicUrl.
 * No string concatenation.
 */
export function getPdfNotesPublicUrl(pathWithinBucket) {
  assertReady();
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    throw new AppError('Supabase client failed to initialize', HTTP_STATUS.SERVICE_UNAVAILABLE);
  }
  const bucket = getPdfBucket();
  const inBucket = normalizePathWithinBucket(pathWithinBucket, bucket);
  if (!inBucket) {
    throw new AppError('Missing path for public URL', HTTP_STATUS.BAD_REQUEST);
  }
  const { data } = supabase.storage.from(bucket).getPublicUrl(inBucket);
  const publicUrl = data?.publicUrl;
  if (!publicUrl || !/^https:\/\//i.test(String(publicUrl))) {
    throw new AppError('Storage did not return a public HTTPS URL', HTTP_STATUS.BAD_GATEWAY);
  }
  const u = String(publicUrl).trim();
  if (u.includes('/storage/v1/s3')) {
    throw new AppError(
      'Refusing invalid Storage URL shape (/storage/v1/s3). Check object path and bucket name.',
      HTTP_STATUS.BAD_GATEWAY
    );
  }
  if (!u.includes('/storage/v1/object/public/')) {
    throw new AppError(
      'Public URL must use /storage/v1/object/public/ (Supabase). Check SUPABASE_URL and bucket.',
      HTTP_STATUS.BAD_GATEWAY
    );
  }
  return { publicUrl: u, inBucket, bucket };
}

/**
 * Upload a local temp PDF into Supabase Storage. Persists `data.publicUrl`
 * from getPublicUrl only. `storedName` = bucket-relative key (for remove).
 */
export async function uploadTempPdfToSupabase(localFilePath) {
  assertReady();
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    throw new AppError('Supabase client failed to initialize', HTTP_STATUS.SERVICE_UNAVAILABLE);
  }

  const bucket = getPdfBucket();
  const fileName = `pdf-${Date.now()}-${crypto.randomBytes(8).toString('hex')}.pdf`;
  const objectPath = path.posix.join(EXAM_PDFS_PREFIX, fileName);

  const fileBuffer = await fs.readFile(localFilePath);
  const { data, error } = await supabase.storage.from(bucket).upload(objectPath, fileBuffer, {
    contentType: 'application/pdf',
    upsert: false,
  });

  if (error) {
    throw new AppError(
      error.message || 'Failed to upload PDF to storage',
      HTTP_STATUS.BAD_GATEWAY
    );
  }

  // Prefer the key we uploaded to; if the API returns a normalized path, use
  // that (still bucket-relative) after normalization.
  const fromApi = data?.path != null && String(data.path).trim() !== '' ? String(data.path).trim() : objectPath;
  const inBucket = normalizePathWithinBucket(fromApi, bucket);
  if (!inBucket) {
    throw new AppError('Storage upload returned no usable path', HTTP_STATUS.BAD_GATEWAY);
  }

  const { publicUrl: fileUrl } = getPdfNotesPublicUrl(inBucket);

  // Exact URL written to MongoDB (must match Supabase Dashboard → Copy public URL shape).
  logger.info('[pdf-storage] fileUrl persisted to MongoDB (Supabase getPublicUrl):', fileUrl);
  logger.info('[pdf-storage] object path in bucket (storedName):', inBucket, 'bucket:', bucket);

  return {
    fileUrl,
    /** Path within bucket — used for delete/rollback and stored in DB */
    storedName: inBucket,
  };
}

/**
 * Best-effort delete of an object. Used when DB write fails after upload.
 * Never throws to callers.
 */
export async function removePdfObjectFromSupabase(storedName) {
  if (!storedName || !isSupabasePdfStorageConfigured()) return;
  const supabase = getSupabaseServiceClient();
  if (!supabase) return;
  const bucket = getPdfBucket();
  const inBucket = normalizePathWithinBucket(String(storedName), bucket);
  try {
    const { error } = await supabase.storage.from(bucket).remove([inBucket]);
    if (error) {
      logger.warn('[supabase] failed to remove PDF object', { inBucket, error: error.message });
    }
  } catch (e) {
    logger.warn('[supabase] remove PDF exception', { inBucket, error: e?.message });
  }
}
