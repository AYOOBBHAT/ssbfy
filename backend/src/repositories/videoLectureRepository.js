import { VideoLecture } from '../models/VideoLecture.js';

export const videoLectureRepository = {
  async findById(id) {
    return VideoLecture.findById(id).lean().exec();
  },

  async findByCloudflareVideoId(uid) {
    const id = String(uid || '').trim();
    if (!id) return null;
    return VideoLecture.findOne({ cloudflareVideoId: id }).lean().exec();
  },

  async create(data) {
    const doc = await VideoLecture.create(data);
    return doc.toObject();
  },

  async updateById(id, patch) {
    return VideoLecture.findByIdAndUpdate(
      id,
      { $set: patch },
      { new: true, runValidators: true }
    )
      .lean()
      .exec();
  },

  async findForAdminList(filter, { limit, skip, sort }) {
    const [rows, total] = await Promise.all([
      VideoLecture.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      VideoLecture.countDocuments(filter).exec(),
    ]);
    return { rows, total, limit };
  },
};
