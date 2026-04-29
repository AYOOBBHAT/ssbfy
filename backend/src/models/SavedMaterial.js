import mongoose from 'mongoose';

const MATERIAL_TYPES = ['pdf', 'note'];

const savedMaterialSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    materialType: {
      type: String,
      enum: MATERIAL_TYPES,
      required: true,
      index: true,
    },
    noteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Note',
      default: null,
    },
    pdfId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PdfNote',
      default: null,
    },
  },
  { timestamps: true }
);

savedMaterialSchema.pre('validate', function enforceExactlyOneMaterial(next) {
  const hasNote = !!this.noteId;
  const hasPdf = !!this.pdfId;
  if (hasNote === hasPdf) {
    return next(new Error('Exactly one of noteId or pdfId is required'));
  }
  if (this.materialType === 'note' && !hasNote) {
    return next(new Error('noteId is required for materialType=note'));
  }
  if (this.materialType === 'pdf' && !hasPdf) {
    return next(new Error('pdfId is required for materialType=pdf'));
  }
  return next();
});

savedMaterialSchema.index(
  { userId: 1, noteId: 1 },
  { unique: true, partialFilterExpression: { noteId: { $exists: true, $ne: null } } }
);
savedMaterialSchema.index(
  { userId: 1, pdfId: 1 },
  { unique: true, partialFilterExpression: { pdfId: { $exists: true, $ne: null } } }
);
savedMaterialSchema.index({ userId: 1, createdAt: -1 });

export const SavedMaterial = mongoose.model('SavedMaterial', savedMaterialSchema);
