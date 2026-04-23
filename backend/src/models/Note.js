import mongoose from 'mongoose';

const noteSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    // `content` is Markdown/plain text — can be long (>16KB), so no enum
    // or length cap at the schema layer. Callers do length validation.
    content: { type: String, required: true },

    // Hierarchy fields — a note is always pinned to exactly one topic,
    // which transitively pins it to a subject and a post. We store all
    // three explicitly so listing/filtering by any level is a direct
    // indexed query rather than a nested join.
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: true,
      index: true,
    },
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

export const Note = mongoose.model('Note', noteSchema);
