import mongoose from 'mongoose';

/**
 * Subject is **global** (unique name, case-insensitive). `postId` is optional
 * and **deprecated** (compatibility-only on the document — not a runtime
 * hierarchy rule). New rows should leave `postId` null. Exam tagging is
 * `Question.postIds[]` / `Note.postIds[]`.
 *
 * TODO(compatibility): Safe to drop `postId` from schema only after data audit
 * + migration — see SUBJECT_GLOBALIZATION.md "Legacy compatibility layer".
 */
const subjectSchema = new mongoose.Schema(
  {
    /**
     * @deprecated Optional legacy link to a single Post. Prefer global subjects
     * (`postId` null) and tag exams on questions via `postIds`.
     */
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: false,
      default: null,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    order: { type: Number, default: 0, index: true },
    isActive: { type: Boolean, default: true, index: true },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

/** Legacy compound index (non-unique) — supports old admin filters during transition. */
subjectSchema.index({ postId: 1, name: 1 }, { name: 'idx_subject_post_name' });

/** Global uniqueness on normalized name (case-insensitive). */
subjectSchema.index(
  { name: 1 },
  {
    unique: true,
    collation: { locale: 'en', strength: 2 },
    name: 'uniq_subject_name_ci_global',
  }
);

export const Subject = mongoose.model('Subject', subjectSchema);
