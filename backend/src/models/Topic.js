import mongoose from 'mongoose';

const topicSchema = new mongoose.Schema(
  {
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    order: { type: Number, default: 0, index: true },
    // Soft enable/disable. Default `true` so legacy docs without the field
    // behave as active. User-facing GETs always filter by it.
    isActive: { type: Boolean, default: true, index: true },
    // Audit: last admin who mutated this doc. `updatedAt` is provided by the
    // `timestamps: true` option below, so it's not redeclared here.
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

topicSchema.index({ subjectId: 1, name: 1 });

export const Topic = mongoose.model('Topic', topicSchema);
