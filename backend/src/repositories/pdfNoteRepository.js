import { PdfNote } from '../models/PdfNote.js';

/** Fields needed to build client list rows + signed URLs (no uploadedBy / fileUrl bulk). */
const CLIENT_LIST_FIELDS =
  'title fileName storedName postIds postId isActive createdAt updatedAt fileSize mimeType';

export const pdfNoteRepository = {
  async findAll(filter = {}, options = {}) {
    let q = PdfNote.find(filter).sort({ createdAt: -1 });
    if (options.clientListProjection) {
      q = q.select(CLIENT_LIST_FIELDS);
    }
    return q.lean().exec();
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
