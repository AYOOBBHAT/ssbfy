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
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

subjectSchema.index({ postId: 1, name: 1 });

export const Subject = mongoose.model('Subject', subjectSchema);
