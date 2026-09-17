import { VideoLecture } from '../models/VideoLecture.js';
import { VIDEO_LECTURE_STATUS } from '../constants/videoLecture.js';

export const videoLectureRepository = {
  async findById(id) {
    return VideoLecture.findById(id).lean().exec();
  },

  async findByCloudflareVideoId(uid) {
    const id = String(uid || '').trim();
    if (!id) return null;
    return VideoLecture.findOne({ cloudflareVideoId: id }).lean().exec();
  },

  async findPublishedById(id) {
    return VideoLecture.findOne({
      _id: id,
      status: VIDEO_LECTURE_STATUS.PUBLISHED,
    })
      .lean()
      .exec();
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

  async findForAdminList(filter, { limit, skip, sort, projection } = {}) {
    let query = VideoLecture.find(filter).sort(sort).skip(skip).limit(limit);
    if (projection) query = query.select(projection);
    const [rows, total] = await Promise.all([
      query.lean().exec(),
      VideoLecture.countDocuments(filter).exec(),
    ]);
    return { rows, total, limit };
  },
};
