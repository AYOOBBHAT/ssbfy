import crypto from 'crypto';
import path from 'path';
import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { cloudinary, PDF_CLOUDINARY_FOLDER } from '../config/cloudinary.js';
import { env } from '../config/env.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';

// ---- Storage ---------------------------------------------------------------

/**
 * Stream uploads straight to Cloudinary under `ssbfy/pdf-notes/`.
 *
 * - `resource_type: 'raw'` is REQUIRED for PDFs. The default ('image')
 *   would reject the file silently.
 * - `public_id` is `pdf-<timestamp>-<random>`: the timestamp prefix
 *   keeps Cloudinary's dashboard chronologically sorted while the
 *   random suffix prevents collisions when two admins upload within
 *   the same millisecond. No user-controlled string ever lands in the
 *   public URL.
 * - `format: 'pdf'` keeps the file extension in the delivered URL,
 *   which some mobile viewers need to pick the right handler.
 */
const pdfStorage = new CloudinaryStorage({
  cloudinary,
  params: (_req, _file) => ({
    folder: PDF_CLOUDINARY_FOLDER,
    resource_type: 'raw',
    public_id: `pdf-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`,
    format: 'pdf',
  }),
});

// ---- File filter -----------------------------------------------------------

/**
 * Reject anything that isn't a PDF at the multer layer so no bytes are
 * ever streamed to Cloudinary. Checks both MIME and extension because
 * some clients (curl with `-F`) default to `application/octet-stream`.
 */
function pdfFileFilter(_req, file, cb) {
  const okMime = file.mimetype === 'application/pdf';
  const ext = path.extname(file.originalname || '').toLowerCase();
  const okExt = ext === '.pdf';
  if (okMime || okExt) {
    cb(null, true);
    return;
  }
  cb(new AppError('Only PDF files are allowed', HTTP_STATUS.BAD_REQUEST));
}

// ---- Exported middleware ---------------------------------------------------

/** Single-file upload under the form field `file` (size cap from env). */
export const uploadPdfSingle = multer({
  storage: pdfStorage,
  fileFilter: pdfFileFilter,
  limits: {
    fileSize: env.pdfMaxSizeMb * 1024 * 1024,
    files: 1,
  },
}).single('file');

/**
 * Wraps `uploadPdfSingle` so thrown `AppError`s and multer's own errors
 * (e.g. `LIMIT_FILE_SIZE`) are converted into consistent JSON responses
 * via our global error handler instead of a raw HTML stack trace.
 */
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
