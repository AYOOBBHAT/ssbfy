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
    /**
     * Stable semantic identity across renames/merges. Defaults to own _id on create.
     * Historical snapshots keep frozen topicName; analytics unify on this id.
     */
    canonicalTopicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Topic',
      default: null,
      index: true,
    },
    aliases: { type: [String], default: [] },
    previousNames: { type: [String], default: [] },
    deprecated: { type: Boolean, default: false, index: true },
    lineageMeta: {
      mergedIntoTopicId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Topic',
        default: null,
      },
      splitFromCanonicalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Topic',
        default: null,
      },
      mergedSourceTopicIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Topic' }],
      childTopicIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Topic' }],
    },
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

// Case-insensitive uniqueness per subject (matches Subject naming pattern).
topicSchema.index(
  { subjectId: 1, name: 1 },
  {
    unique: true,
    collation: { locale: 'en', strength: 2 },
    name: 'uniq_subjectId_name_ci',
  }
);

export const Topic = mongoose.model('Topic', topicSchema);
