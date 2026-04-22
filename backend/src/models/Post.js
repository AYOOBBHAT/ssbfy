import mongoose from 'mongoose';

const postSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: '', trim: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

// Case-insensitive unique index on name so "JE" and "je" cannot coexist.
// The collation on the index itself means we don't have to lowercase the
// value on write — Mongo handles the comparison.
postSchema.index(
  { name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } }
);

export const Post = mongoose.model('Post', postSchema);
