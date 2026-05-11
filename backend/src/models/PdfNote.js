import mongoose from 'mongoose';

/**
 * PDF-style study note.
 *
 * Deliberately kept separate from `Note` because the two have different
 * invariants: a text `Note` requires subject + topic + content, while a
 * PDF note is a top-level resource attached to one or more Posts (e.g. the
 * same "Reasoning Notes" PDF for JKSSB, Banking, and SSC). The canonical
 * field is `postIds[]` (exam tags, not hierarchy). `postId` is compatibility-only
 * for legacy documents; mirrored into `postIds` on reads/writes where applicable.
 * TODO(compatibility): Remove `postId` from schema after DB backfill — see pdfNoteService.
 */
const pdfNoteSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },

    /** @deprecated Use `postIds`. Kept for legacy rows and as a quick alias for `postIds[0]`. */
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: false,
      index: true,
    },

    postIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post',
      },
    ],

    /**
     * Legacy absolute URL for older rows (e.g. public Supabase / Cloudinary).
     * New uploads keep this empty; clients must use short-lived `signedUrl`
     * from the API. Do not expose this field in HTTP responses.
     */
    fileUrl: { type: String, default: '' },

    // Original name the uploader picked — shown in the UI so students
    // see "Syllabus.pdf" instead of the random storage id.
    fileName: { type: String, required: true, trim: true },

    // The on-disk / in-bucket key. Kept separately from fileUrl because
    // deletion and re-signing flows need the raw key, not the URL.
    storedName: { type: String, required: true },

    fileSize: { type: Number, required: true, min: 0 },
    mimeType: { type: String, required: true, default: 'application/pdf' },

    isActive: { type: Boolean, default: true, index: true },

    // Audit: which admin uploaded it.
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

// Common listing: "active PDFs for this post" (array membership or legacy postId).
pdfNoteSchema.index({ postIds: 1, isActive: 1, createdAt: -1 });
pdfNoteSchema.index({ postId: 1, isActive: 1, createdAt: -1 });

export const PdfNote = mongoose.model('PdfNote', pdfNoteSchema);
