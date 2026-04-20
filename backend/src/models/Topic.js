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
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

topicSchema.index({ subjectId: 1, name: 1 });

export const Topic = mongoose.model('Topic', topicSchema);
