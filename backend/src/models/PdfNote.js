import mongoose from 'mongoose';

/**
 * PDF-style study note.
 *
 * Deliberately kept separate from `Note` because the two have different
 * invariants: a text `Note` requires subject + topic + content, while a
 * PDF note is a top-level resource scoped only to a Post (e.g. "Patwari
 * Syllabus.pdf"). Forcing both shapes into one model would either loosen
 * Note's required fields or require a discriminator that every read path
 * would have to branch on.
 */
const pdfNoteSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },

    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: true,
      index: true,
    },

    // Public URL the clients actually fetch. For local disk storage this
    // is something like "/uploads/pdfs/abc123.pdf"; for a future S3 or
    // Cloudinary migration this becomes the absolute CDN URL. The model
    // is storage-agnostic — only the service/middleware knows how it was
    // produced.
    fileUrl: { type: String, required: true },

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

// Common listing: "active PDFs under this post, newest first".
pdfNoteSchema.index({ postId: 1, isActive: 1, createdAt: -1 });

export const PdfNote = mongoose.model('PdfNote', pdfNoteSchema);
