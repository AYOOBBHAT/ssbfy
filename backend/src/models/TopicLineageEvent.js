import mongoose from 'mongoose';

const topicLineageEventSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ['rename', 'alias', 'merge', 'split', 'backfill', 'deprecate'],
      required: true,
    },
    canonicalTopicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Topic',
      required: true,
      index: true,
    },
    sourceTopicIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Topic' }],
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true }
);

export const TopicLineageEvent = mongoose.model('TopicLineageEvent', topicLineageEventSchema);
