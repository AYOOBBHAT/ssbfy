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

// ---- CSV upload (memory storage; file lives on `req.file.buffer`). ----
//
// Question imports are bounded (we cap to ~5MB which is roughly 50k rows)
// and processed synchronously, so memory storage avoids the disk cleanup
// dance the PDF flow needs. We never persist this file — the parsed rows
// fan out to MongoDB directly.

const CSV_MAX_BYTES = 5 * 1024 * 1024;

function csvFileFilter(_req, file, cb) {
  const okMime =
    file.mimetype === 'text/csv' ||
    file.mimetype === 'application/vnd.ms-excel' || // some browsers tag CSVs this way
    file.mimetype === 'application/csv' ||
    file.mimetype === 'text/plain';
  const fileExt = path.extname(file.originalname || '').toLowerCase();
  const okExt = fileExt === '.csv' || fileExt === '.txt';
  if (okMime || okExt) {
    cb(null, true);
    return;
  }
  cb(
    new AppError(
      'Only CSV files are allowed. Save as CSV from Excel/Sheets and re-upload.',
      HTTP_STATUS.BAD_REQUEST
    )
  );
}

const csvUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: csvFileFilter,
  limits: { fileSize: CSV_MAX_BYTES, files: 1 },
}).single('file');

export function handleCsvUpload(req, res, next) {
  csvUpload(req, res, (err) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      const mapped =
        err.code === 'LIMIT_FILE_SIZE'
          ? new AppError(
              `CSV too large. Max ${(CSV_MAX_BYTES / (1024 * 1024)).toFixed(0)} MB allowed.`,
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
