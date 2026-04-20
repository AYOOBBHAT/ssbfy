import mongoose from 'mongoose';

const subjectSchema = new mongoose.Schema(
  {
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    order: { type: Number, default: 0, index: true },
    // Soft enable/disable. Default `true` so legacy docs without the field
    // behave as active. We index it because user-facing GETs always filter by it.
    isActive: { type: Boolean, default: true, index: true },
    // Audit: last admin who mutated this doc. `updatedAt` is handled by the
    // `timestamps: true` option below — Mongoose rewrites it on every save,
    // so we don't redeclare it here (that would shadow the built-in).
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

// Compound unique index using a case-insensitive collation so
// "Reasoning", "reasoning", and "REASONING" under the same post
// all collide and get rejected at the storage layer.
subjectSchema.index(
  { postId: 1, name: 1 },
  {
    unique: true,
    collation: { locale: 'en', strength: 2 },
    name: 'uniq_postId_name_ci',
  }
);

export const Subject = mongoose.model('Subject', subjectSchema);
