import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { getSupabaseServiceClient, isSupabasePdfStorageConfigured } from '../config/supabase.js';
import { env } from '../config/env.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';

/** Object key prefix inside the bucket: exam-pdfs/<file>.pdf */
const EXAM_PDFS_PREFIX = 'exam-pdfs';

function assertReady() {
  if (!isSupabasePdfStorageConfigured()) {
    throw new AppError(
      'PDF storage is not configured. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_STORAGE_BUCKET.',
      HTTP_STATUS.SERVICE_UNAVAILABLE
    );
  }
}

/**
 * Upload a local temp PDF into Supabase Storage. Returns a stable public HTTPS
 * `fileUrl` and `storedName` = object path within the bucket (for remove).
 */
export async function uploadTempPdfToSupabase(localFilePath) {
  assertReady();
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    throw new AppError('Supabase client failed to initialize', HTTP_STATUS.SERVICE_UNAVAILABLE);
  }

  const bucket = env.supabaseStorageBucket;
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
  const resolvedPath = data?.path ?? data?.fullPath ?? objectPath;
  if (!resolvedPath) {
    throw new AppError('Storage upload returned no path', HTTP_STATUS.BAD_GATEWAY);
  }

  const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(resolvedPath);
  const fileUrl = publicData?.publicUrl;
  if (!fileUrl || !/^https:\/\//i.test(String(fileUrl))) {
    throw new AppError(
      'Storage did not return a public HTTPS URL. Ensure the bucket is public (or use signed URLs later).',
      HTTP_STATUS.BAD_GATEWAY
    );
  }

  return {
    fileUrl: String(fileUrl).trim(),
    /** Path within bucket — used for delete/rollback and stored in DB */
    storedName: resolvedPath,
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
  const bucket = env.supabaseStorageBucket;
  try {
    const { error } = await supabase.storage.from(bucket).remove([String(storedName)]);
    if (error) {
      console.warn('[supabase] failed to remove PDF object', { storedName, error: error.message });
    }
  } catch (e) {
    console.warn('[supabase] remove PDF exception', { storedName, error: e?.message });
  }
}
