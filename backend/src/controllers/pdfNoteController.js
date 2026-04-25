import { pdfNoteService } from '../services/pdfNoteService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { uploadTempPdfToSupabase, removePdfObjectFromSupabase } from '../services/pdfSupabaseStorage.js';
import { unlinkTempFile } from '../middlewares/upload.js';
import { ROLES } from '../constants/roles.js';

/**
 * Admin-only bypass: an authenticated admin may pass `includeInactive=true`
 * on the GET to see disabled PDFs in the management UI. Anyone else
 * (anonymous or authenticated non-admin) always gets the active-only
 * list, even if they try to sneak the flag.
 */
function shouldIncludeInactive(req) {
  const wanted = String(req.query.includeInactive || '').toLowerCase() === 'true';
  return wanted && req.user?.role === ROLES.ADMIN;
}

export const pdfNoteController = {
  /** GET /api/notes/pdfs?postId=&includeInactive= */
  list: asyncHandler(async (req, res) => {
    const { postId } = req.query;
    const pdfs = await pdfNoteService.list({
      postId,
      includeInactive: shouldIncludeInactive(req),
    });
    return sendSuccess(res, { pdfs }, 'PDF notes');
  }),

  /** PATCH /api/notes/pdfs/:id — admin only. Partial update. */
  update: asyncHandler(async (req, res) => {
    const { isActive, postIds } = req.body;
    const pdf = await pdfNoteService.update(
      req.params.id,
      { isActive, postIds },
      req.user
    );
    if (!pdf) {
      throw new AppError('PDF note not found', HTTP_STATUS.NOT_FOUND);
    }
    return sendSuccess(res, { pdf }, 'PDF note updated');
  }),

  /**
   * POST /api/notes/upload-pdf — multipart/form-data with fields:
   *   - file   (required, PDF) — written to a temp file by multer
   *   - title  (required)
   *   - postIds (JSON) and/or postId (legacy)
   *
   * Flow: temp file → Supabase Storage (public URL) → MongoDB metadata →
   * delete temp file. If DB write fails, remove the Storage object and temp file.
   */
  upload: asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) {
      throw new AppError(
        'No file uploaded. Send the PDF under field "file".',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const localPath = file.path;
    let supabaseObjectPath = null;

    try {
      const { fileUrl, storedName } = await uploadTempPdfToSupabase(localPath);
      supabaseObjectPath = storedName;

      const { title, postId, postIds } = req.body;

      const note = await pdfNoteService.create({
        title,
        postId,
        postIds,
        fileUrl,
        fileName: file.originalname,
        storedName,
        fileSize: Number(file.size) || 0,
        mimeType: file.mimetype || 'application/pdf',
        uploadedBy: req.user?.id || null,
      });

      return sendCreated(res, { pdf: note }, 'PDF uploaded');
    } catch (err) {
      await removePdfObjectFromSupabase(supabaseObjectPath);
      throw err;
    } finally {
      unlinkTempFile(localPath);
    }
  }),
};
