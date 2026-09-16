import mongoose from 'mongoose';
import {
  VIDEO_LECTURE_ACCESS,
  VIDEO_LECTURE_ACCESS_VALUES,
  VIDEO_LECTURE_STATUS,
  VIDEO_LECTURE_STATUS_VALUES,
  VIDEO_LECTURE_TITLE_MIN,
  VIDEO_LECTURE_TITLE_MAX,
  VIDEO_LECTURE_DESCRIPTION_MAX,
} from '../constants/videoLecture.js';

const videoLectureSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: VIDEO_LECTURE_TITLE_MIN,
      maxlength: VIDEO_LECTURE_TITLE_MAX,
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: VIDEO_LECTURE_DESCRIPTION_MAX,
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true,
    },
    topicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Topic',
      required: true,
    },
    /**
     * Cloudflare Stream UID. Absent until a direct-upload URL is provisioned.
     * Not required at draft time.
     */
    cloudflareVideoId: {
      type: String,
      default: null,
      trim: true,
    },
    thumbnailUrl: { type: String, default: null, trim: true },
    durationSeconds: { type: Number, default: null, min: 0 },
    access: {
      type: String,
      enum: VIDEO_LECTURE_ACCESS_VALUES,
      default: VIDEO_LECTURE_ACCESS.FREE,
    },
    status: {
      type: String,
      enum: VIDEO_LECTURE_STATUS_VALUES,
      default: VIDEO_LECTURE_STATUS.DRAFT,
    },
    order: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

videoLectureSchema.pre('validate', function normalizeCloudflareVideoId(next) {
  if (this.cloudflareVideoId === '') {
    this.cloudflareVideoId = null;
  }
  next();
});

videoLectureSchema.index(
  { subjectId: 1, topicId: 1, status: 1, order: 1 },
  { name: 'idx_vl_subject_topic_status_order' }
);

videoLectureSchema.index(
  { status: 1, createdAt: -1 },
  { name: 'idx_vl_status_created' }
);

videoLectureSchema.index(
  { cloudflareVideoId: 1 },
  {
    unique: true,
    name: 'uniq_videolecture_cf_uid',
    partialFilterExpression: {
      cloudflareVideoId: { $type: 'string', $gt: '' },
    },
  }
);

export const VideoLecture = mongoose.model('VideoLecture', videoLectureSchema);
