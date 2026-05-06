import mongoose from 'mongoose';
import { SavedMaterial } from '../models/SavedMaterial.js';

function toObjectId(id) {
  return new mongoose.Types.ObjectId(String(id));
}

export const savedMaterialRepository = {
  async findByUserAndMaterial({ userId, materialType, noteId = null, pdfId = null }) {
    const filter = { userId: toObjectId(userId), materialType };
    if (materialType === 'note') {
      filter.noteId = toObjectId(noteId);
    } else {
      filter.pdfId = toObjectId(pdfId);
    }
    return SavedMaterial.findOne(filter).lean().exec();
  },

  async create(data) {
    const doc = await SavedMaterial.create(data);
    return doc.toObject();
  },

  async deleteById(id) {
    return SavedMaterial.deleteOne({ _id: id }).exec();
  },

  async listSavedPdfs(userId) {
    return SavedMaterial.aggregate([
      {
        $match: {
          userId: toObjectId(userId),
          materialType: 'pdf',
          pdfId: { $ne: null },
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: 'pdfnotes',
          localField: 'pdfId',
          foreignField: '_id',
          as: 'pdf',
        },
      },
      { $unwind: '$pdf' },
      { $match: { 'pdf.isActive': true } },
      {
        $lookup: {
          from: 'posts',
          localField: 'pdf.postId',
          foreignField: '_id',
          as: 'post',
        },
      },
      { $unwind: { path: '$post', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          savedId: '$_id',
          materialType: 1,
          pdfId: '$pdf._id',
          title: '$pdf.title',
          storedName: '$pdf.storedName',
          postTitle: '$post.name',
          postName: '$post.name',
          createdAt: '$createdAt',
        },
      },
    ]).exec();
  },

  async listSavedNotes(userId) {
    return SavedMaterial.aggregate([
      {
        $match: {
          userId: toObjectId(userId),
          materialType: 'note',
          noteId: { $ne: null },
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: 'notes',
          localField: 'noteId',
          foreignField: '_id',
          as: 'note',
        },
      },
      { $unwind: '$note' },
      { $match: { 'note.isActive': true } },
      {
        $lookup: {
          from: 'subjects',
          localField: 'note.subjectId',
          foreignField: '_id',
          as: 'subject',
        },
      },
      {
        $lookup: {
          from: 'topics',
          localField: 'note.topicId',
          foreignField: '_id',
          as: 'topic',
        },
      },
      {
        $lookup: {
          from: 'posts',
          localField: 'note.postId',
          foreignField: '_id',
          as: 'post',
        },
      },
      { $unwind: { path: '$subject', preserveNullAndEmptyArrays: true } },
      { $unwind: { path: '$topic', preserveNullAndEmptyArrays: true } },
      { $unwind: { path: '$post', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          savedId: '$_id',
          materialType: 1,
          noteId: '$note._id',
          title: '$note.title',
          content: '$note.content',
          subject: '$subject.name',
          topic: '$topic.name',
          post: '$post.name',
          createdAt: '$createdAt',
        },
      },
    ]).exec();
  },
};
