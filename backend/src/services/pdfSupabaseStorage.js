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
 * segment, or a `fullPath` that duplicates it. `createSignedUrl` / `remove`
 * expect only the key *inside* the bucket. Normalize to avoid doubled paths.
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
 * Short-lived signed URL for a bucket-relative object key (private bucket).
 * @param {string} pathWithinBucket - Key inside the configured bucket, e.g. exam-pdfs/foo.pdf
 */
export async function getSignedPdfUrl(pathWithinBucket) {
  assertReady();
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    throw new AppError('Supabase client failed to initialize', HTTP_STATUS.SERVICE_UNAVAILABLE);
  }
  const bucket = getPdfBucket();
  const inBucket = normalizePathWithinBucket(pathWithinBucket, bucket);
  if (!inBucket) {
    throw new AppError('Missing path for signed URL', HTTP_STATUS.BAD_REQUEST);
  }
  const ttl = env.pdfSignedUrlTtlSeconds;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(inBucket, ttl);
  if (error) {
    throw new AppError(
      error.message || 'Failed to create signed PDF URL',
      HTTP_STATUS.BAD_GATEWAY
    );
  }
  const signedUrl = data?.signedUrl?.trim();
  if (!signedUrl || !/^https:\/\//i.test(signedUrl)) {
    throw new AppError('Storage did not return a signed HTTPS URL', HTTP_STATUS.BAD_GATEWAY);
  }
  return signedUrl;
}

/**
 * Upload a local temp PDF into Supabase Storage (private bucket).
 * Returns only the bucket-relative `storedName` — never a permanent public URL.
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

  return {
    /** Path within bucket — used for signing, delete/rollback, and stored in DB */
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
      logger.warn('[supabase] failed to remove PDF object', { error: error.message });
    }
  } catch (e) {
    logger.warn('[supabase] remove PDF exception', { error: e?.message });
  }
}
