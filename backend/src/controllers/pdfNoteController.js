import { pdfNoteService } from '../services/pdfNoteService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { destroyPdfAsset } from '../config/cloudinary.js';

export const pdfNoteController = {
  /** GET /api/notes/pdfs?postId= */
  list: asyncHandler(async (req, res) => {
    const { postId } = req.query;
    const pdfs = await pdfNoteService.list({ postId });
    return sendSuccess(res, { pdfs }, 'PDF notes');
  }),

  /**
   * POST /api/notes/upload-pdf — multipart/form-data with fields:
   *   - file   (required, PDF, <= PDF_MAX_SIZE_MB)
   *   - title  (required)
   *   - postId (required, must ref an active Post)
   *
   * multer-storage-cloudinary populates:
   *   - file.path     → Cloudinary `secure_url` (HTTPS CDN URL)
   *   - file.filename → the `public_id` we generated
   *   - file.size     → byte size (may be missing for some streams,
   *                     so we fall back to 0)
   *
   * If the DB write fails AFTER the asset was already uploaded to
   * Cloudinary, we destroy it so we don't accumulate orphans in the
   * `ssbfy/pdf-notes/` folder.
   */
  upload: asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) {
      throw new AppError(
        'No file uploaded. Send the PDF under field "file".',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    try {
      const { title, postId } = req.body;

      const note = await pdfNoteService.create({
        title,
        postId,
        fileUrl: file.path,
        fileName: file.originalname,
        // Cloudinary public_id — persisted so we can delete or re-sign
        // the asset later without parsing URLs.
        storedName: file.filename,
        fileSize: Number(file.size) || 0,
        mimeType: file.mimetype || 'application/pdf',
        uploadedBy: req.user?.id || null,
      });

      return sendCreated(res, { pdf: note }, 'PDF uploaded');
    } catch (err) {
      // Tear down the already-uploaded Cloudinary asset so a rejected
      // request doesn't leave a dangling blob in our account. This is
      // best-effort — `destroyPdfAsset` never throws.
      await destroyPdfAsset(file.filename);
      throw err;
    }
  }),
};
