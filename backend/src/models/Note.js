import mongoose from 'mongoose';

const noteSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    // `content` is Markdown/plain text — can be long (>16KB), so no enum
    // or length cap at the schema layer. Callers do length validation.
    content: { type: String, required: true },

    // Hierarchy fields — a note is pinned to exactly one topic (and thus
    // exactly one subject). Posts are NOT a hierarchy owner anymore; they
    // are optional tags/filtering (same as Questions' `postIds`).
    //
    // Back-compat: legacy notes stored a single `postId`. We keep that field
    // readable for now and migrate gradually to `postIds`.
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
        required: false,
        index: true,
      },
    ],
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true,
      index: true,
    },
    topicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Topic',
      required: true,
      index: true,
    },

    // Soft enable/disable, consistent with Subject/Topic/Question.
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

// Common listing paths: "all notes under this topic", "…this subject",
// "…this post". The single-field indexes above cover those; this compound
// index accelerates the common "active notes under a topic, newest first"
// query used by the mobile app.
noteSchema.index({ isActive: 1, topicId: 1, createdAt: -1 });
noteSchema.index({ isActive: 1, subjectId: 1, createdAt: -1 });
noteSchema.index({ isActive: 1, postIds: 1, createdAt: -1 });

// Normalize postIds to a unique list. (Prevents accidental duplicates like
// [a,a] from UI checkbox toggles or import scripts.)
noteSchema.pre('validate', function normalizePostIds(next) {
  try {
    if (!Array.isArray(this.postIds)) {
      this.postIds = [];
      return next();
    }
    const uniq = [];
    const seen = new Set();
    for (const id of this.postIds) {
      if (!id) continue;
      const key = String(id);
      if (seen.has(key)) continue;
      seen.add(key);
      uniq.push(id);
    }
    this.postIds = uniq;
    return next();
  } catch (e) {
    return next(e);
  }
});

export const Note = mongoose.model('Note', noteSchema);
