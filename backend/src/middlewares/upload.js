import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import multer from 'multer';
import { env } from '../config/env.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';

// ---- Storage: temp disk only; Supabase upload happens in the controller. ----

const pdfDiskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, os.tmpdir());
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.pdf';
    const base = `pdf-temp-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    cb(null, `${base}${ext === '.pdf' ? ext : '.pdf'}`);
  },
});

/**
 * Reject anything that isn't a PDF at the multer layer so we never write
 * non-PDFs to the temp file. (Extension / MIME, same as before.)
 */
function pdfFileFilter(_req, file, cb) {
  const okMime = file.mimetype === 'application/pdf';
  const fileExt = path.extname(file.originalname || '').toLowerCase();
  const okExt = fileExt === '.pdf';
  if (okMime || okExt) {
    cb(null, true);
    return;
  }
  cb(new AppError('Only PDF files are allowed', HTTP_STATUS.BAD_REQUEST));
}

/** Single file under field `file` → `req.file.path` is a temp path on disk. */
export const uploadPdfSingle = multer({
  storage: pdfDiskStorage,
  fileFilter: pdfFileFilter,
  limits: {
    fileSize: env.pdfMaxSizeMb * 1024 * 1024,
    files: 1,
  },
}).single('file');

export function handlePdfUpload(req, res, next) {
  uploadPdfSingle(req, res, (err) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      const mapped =
        err.code === 'LIMIT_FILE_SIZE'
          ? new AppError(
              `File too large. Max ${env.pdfMaxSizeMb} MB allowed.`,
              HTTP_STATUS.BAD_REQUEST
            )
          : new AppError(
              `Upload error: ${err.message}`,
              HTTP_STATUS.BAD_REQUEST
            );
      next(mapped);
      return;
    }
    next(err);
  });
}

/**
 * Unlink a temp file best-effort (controller calls after Supabase upload or on error).
 */
export function unlinkTempFile(filePath) {
  if (!filePath || typeof filePath !== 'string') return;
  try {
    fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
}
