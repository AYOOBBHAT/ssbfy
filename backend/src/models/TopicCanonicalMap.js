import mongoose from 'mongoose';

/**
 * Flattened O(1) lookup: any topicId → canonical lineage + current display label.
 * Rebuilt on taxonomy mutations; never mutates LearningSession snapshots.
 */
const topicCanonicalMapSchema = new mongoose.Schema(
  {
    topicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Topic',
      required: true,
      unique: true,
      index: true,
    },
    canonicalTopicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Topic',
      required: true,
      index: true,
    },
    displayName: { type: String, default: '' },
    previousNames: { type: [String], default: [] },
    deprecated: { type: Boolean, default: false },
  },
  { timestamps: true }
);

topicCanonicalMapSchema.index({ canonicalTopicId: 1, deprecated: 1 });

export const TopicCanonicalMap = mongoose.model('TopicCanonicalMap', topicCanonicalMapSchema);
