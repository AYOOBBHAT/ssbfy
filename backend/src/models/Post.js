import mongoose from 'mongoose';

const postSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

postSchema.index({ slug: 1 });

export const Post = mongoose.model('Post', postSchema);
