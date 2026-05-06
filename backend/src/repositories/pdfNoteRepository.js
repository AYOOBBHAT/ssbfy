import { PdfNote } from '../models/PdfNote.js';

export const pdfNoteRepository = {
  async findAll(filter = {}) {
    return PdfNote.find(filter).sort({ createdAt: -1 }).lean().exec();
  },

  async findById(id) {
    return PdfNote.findById(id).lean().exec();
  },

  async create(data) {
    const doc = await PdfNote.create({
      title: data.title,
      postIds: data.postIds,
      postId: data.postId,
      fileUrl: data.fileUrl ?? '',
      fileName: data.fileName,
      storedName: data.storedName,
      fileSize: data.fileSize,
      mimeType: data.mimeType,
      uploadedBy: data.uploadedBy || null,
    });
    return doc.toObject();
  },

  async updateById(id, patch) {
    return PdfNote.findByIdAndUpdate(id, patch, {
      new: true,
      runValidators: true,
    })
      .lean()
      .exec();
  },
};
