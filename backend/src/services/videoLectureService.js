import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import {
  VIDEO_LECTURE_ABSOLUTE_MAX_DURATION_SECONDS,
  VIDEO_LECTURE_ACCESS,
  VIDEO_LECTURE_DEFAULT_MAX_DURATION_SECONDS,
  VIDEO_LECTURE_DEFAULT_UPLOAD_EXPIRY_SECONDS,
  VIDEO_LECTURE_STATUS,
  resolvePlaybackTtlSeconds,
} from '../constants/videoLecture.js';
import { ROLES } from '../constants/roles.js';
import { isPremiumUser } from '../utils/freeTierAccess.js';
import { userRepository } from '../repositories/userRepository.js';
import { subjectRepository } from '../repositories/subjectRepository.js';
import { topicRepository } from '../repositories/topicRepository.js';
import { videoLectureRepository } from '../repositories/videoLectureRepository.js';
import { webhookEventRepository } from '../repositories/webhookEventRepository.js';
import { cloudflareStreamService } from './cloudflareStreamService.js';
import { logger } from '../utils/logger.js';
import {
  buildCloudflareStreamWebhookEventId,
  extractCloudflareStreamUid,
  extractLectureMediaMetadata,
  mapCloudflareVideoToLectureStatus,
} from '../utils/cloudflareStreamWebhook.js';

async function resolveHierarchy({ subjectId, topicId }) {
  const [subject, topic] = await Promise.all([
    subjectRepository.findById(subjectId),
    topicRepository.findById(topicId),
  ]);

  if (!subject) {
    throw new AppError('Subject not found', HTTP_STATUS.BAD_REQUEST);
  }
  if (subject.isActive === false) {
    throw new AppError(
      'Subject is inactive; cannot attach lectures to it.',
      HTTP_STATUS.BAD_REQUEST
    );
  }
  if (!topic) {
    throw new AppError('Topic not found', HTTP_STATUS.BAD_REQUEST);
  }
  if (topic.isActive === false) {
    throw new AppError(
      'Topic is inactive; cannot attach lectures to it.',
      HTTP_STATUS.BAD_REQUEST
    );
  }
  if (String(topic.subjectId) !== String(subjectId)) {
    throw new AppError(
      'Topic does not belong to the given subject.',
      HTTP_STATUS.BAD_REQUEST
    );
  }

  return { subject, topic };
}

function toAdminDto(doc) {
  if (!doc) return null;
  const id = String(doc._id);
  return {
    id,
    _id: doc._id,
    title: doc.title,
    description: doc.description || '',
    subjectId: doc.subjectId,
    topicId: doc.topicId,
    cloudflareVideoId: doc.cloudflareVideoId || null,
    thumbnailUrl: doc.thumbnailUrl || null,
    durationSeconds: doc.durationSeconds ?? null,
    access: doc.access,
    status: doc.status,
    order: doc.order ?? 0,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * Student DTO: no Cloudflare UID, no playback URL, no processing internals.
 * thumbnailUrl is omitted unless a future signed-thumbnail path exists —
 * stored Stream UID thumbnails are not anonymously fetchable with requireSignedURLs.
 */
function toStudentDto(doc, { locked, subjectName = '', topicName = '' } = {}) {
  if (!doc) return null;
  return {
    id: String(doc._id),
    title: doc.title,
    description: doc.description || '',
    subjectId: doc.subjectId,
    topicId: doc.topicId,
    subjectName,
    topicName,
    access: doc.access,
    durationSeconds: doc.durationSeconds ?? null,
    thumbnailUrl: null,
    locked: Boolean(locked),
    order: doc.order ?? 0,
  };
}

function isLectureLocked(doc, { premium, isAdmin }) {
  if (isAdmin) return false;
  if (doc.access !== VIDEO_LECTURE_ACCESS.PREMIUM) return false;
  return !premium;
}

async function resolveStudentEntitlement(actingUser) {
  const user = await userRepository.findById(actingUser?.id);
  if (!user) {
    throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
  }
  const isAdmin = actingUser.role === ROLES.ADMIN;
  return { user, isAdmin, premium: isPremiumUser(user) };
}

async function attachTaxonomyNames(rows) {
  const subjectIds = [...new Set(rows.map((row) => String(row.subjectId || '')).filter(Boolean))];
  const topicIds = [...new Set(rows.map((row) => String(row.topicId || '')).filter(Boolean))];
  const [subjects, topics] = await Promise.all([
    subjectRepository.findNamesByIds(subjectIds),
    topicRepository.findNamesByIds(topicIds),
  ]);
  const subjectNames = Object.fromEntries(subjects.map((s) => [String(s._id), s.name]));
  const topicNames = Object.fromEntries(topics.map((t) => [String(t._id), t.name]));
  return { subjectNames, topicNames };
}

function durationCapSeconds() {
  return Math.min(
    VIDEO_LECTURE_ABSOLUTE_MAX_DURATION_SECONDS,
    Math.max(
      1,
      Number(process.env.CLOUDFLARE_STREAM_MAX_DURATION_SECONDS) ||
        VIDEO_LECTURE_DEFAULT_MAX_DURATION_SECONDS
    )
  );
}

function resolveMaxDurationSeconds(raw) {
  const cap = durationCapSeconds();
  const requested = Number(raw);
  if (!Number.isInteger(requested) || requested < 1) {
    throw new AppError(
      'maxDurationSeconds must be a positive integer',
      HTTP_STATUS.BAD_REQUEST
    );
  }
  if (requested > cap) {
    throw new AppError(
      `maxDurationSeconds cannot exceed ${cap}`,
      HTTP_STATUS.BAD_REQUEST
    );
  }
  return requested;
}

function uploadExpiryIso() {
  const seconds = Math.min(
    7200,
    Math.max(
      300,
      Number(process.env.CLOUDFLARE_STREAM_UPLOAD_EXPIRY_SECONDS) ||
        VIDEO_LECTURE_DEFAULT_UPLOAD_EXPIRY_SECONDS
    )
  );
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export const videoLectureService = {
  async provisionDirectUpload({
    title,
    description = '',
    subjectId,
    topicId,
    access = VIDEO_LECTURE_ACCESS.FREE,
    maxDurationSeconds,
  }) {
    const trimmedTitle = typeof title === 'string' ? title.trim() : '';
    if (!trimmedTitle) {
      throw new AppError('title is required', HTTP_STATUS.BAD_REQUEST);
    }
    await resolveHierarchy({ subjectId, topicId });
    const duration = resolveMaxDurationSeconds(maxDurationSeconds);

    const { uid, uploadURL } = await cloudflareStreamService.createDirectUploadUrl({
      maxDurationSeconds: duration,
      requireSignedURLs: true,
      expiry: uploadExpiryIso(),
      meta: { name: trimmedTitle },
    });

    // If Mongo create fails after Cloudflare minted a UID, this phase leaves
    // the pending Stream object in place. Do not invoke deleteVideo here.
    const created = await videoLectureRepository.create({
      title: trimmedTitle,
      description: typeof description === 'string' ? description.trim() : '',
      subjectId,
      topicId,
      access,
      cloudflareVideoId: uid,
      status: VIDEO_LECTURE_STATUS.UPLOADING,
    });

    return {
      lectureId: String(created._id),
      cloudflareVideoId: uid,
      uploadURL,
      status: VIDEO_LECTURE_STATUS.UPLOADING,
    };
  },

  async getById(id) {
    const doc = await videoLectureRepository.findById(id);
    if (!doc) {
      throw new AppError('Video lecture not found', HTTP_STATUS.NOT_FOUND);
    }
    return toAdminDto(doc);
  },

  async listAdmin(query = {}) {
    const page = Math.max(Number(query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize) || 20, 1), 100);
    const skip = (page - 1) * pageSize;
    const filter = {};
    if (query.subjectId) filter.subjectId = query.subjectId;
    if (query.topicId) filter.topicId = query.topicId;
    if (query.status) filter.status = query.status;
    if (query.access) filter.access = query.access;

    const { rows, total, limit } = await videoLectureRepository.findForAdminList(
      filter,
      {
        limit: pageSize,
        skip,
        sort: { order: 1, createdAt: -1 },
      }
    );
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    return {
      lectures: rows.map(toAdminDto),
      pagination: { total, page, pageSize: limit, totalPages },
    };
  },

  async update(id, patch) {
    const existing = await videoLectureRepository.findById(id);
    if (!existing) {
      throw new AppError('Video lecture not found', HTTP_STATUS.NOT_FOUND);
    }

    const next = {};
    if (patch.title !== undefined) next.title = String(patch.title).trim();
    if (patch.description !== undefined) {
      next.description = String(patch.description).trim();
    }
    if (patch.access !== undefined) next.access = patch.access;
    if (patch.order !== undefined) next.order = patch.order;
    if (patch.subjectId !== undefined) next.subjectId = patch.subjectId;
    if (patch.topicId !== undefined) next.topicId = patch.topicId;

    if (Object.keys(next).length === 0) {
      throw new AppError('No updatable fields provided', HTTP_STATUS.BAD_REQUEST);
    }

    const subjectId = next.subjectId ?? existing.subjectId;
    const topicId = next.topicId ?? existing.topicId;
    if (next.subjectId !== undefined || next.topicId !== undefined) {
      await resolveHierarchy({ subjectId, topicId });
    }

    const updated = await videoLectureRepository.updateById(id, next);
    if (!updated) {
      throw new AppError('Video lecture not found', HTTP_STATUS.NOT_FOUND);
    }
    return toAdminDto(updated);
  },

  async archive(id) {
    const existing = await videoLectureRepository.findById(id);
    if (!existing) {
      throw new AppError('Video lecture not found', HTTP_STATUS.NOT_FOUND);
    }
    const updated = await videoLectureRepository.updateById(id, {
      status: VIDEO_LECTURE_STATUS.ARCHIVED,
    });
    return toAdminDto(updated);
  },

  async listPublished(query = {}, actingUser) {
    const { premium, isAdmin } = await resolveStudentEntitlement(actingUser);
    const page = Math.max(Number(query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize) || 20, 1), 50);
    const skip = (page - 1) * pageSize;
    const filter = { status: VIDEO_LECTURE_STATUS.PUBLISHED };
    if (query.subjectId) filter.subjectId = query.subjectId;
    if (query.topicId) filter.topicId = query.topicId;
    if (query.access) filter.access = query.access;

    const { rows, total, limit } = await videoLectureRepository.findForAdminList(filter, {
      limit: pageSize,
      skip,
      sort: { order: 1, createdAt: -1 },
      projection:
        'title description subjectId topicId access durationSeconds thumbnailUrl order',
    });
    const { subjectNames, topicNames } = await attachTaxonomyNames(rows);
    const lectures = rows.map((row) =>
      toStudentDto(row, {
        locked: isLectureLocked(row, { premium, isAdmin }),
        subjectName: subjectNames[String(row.subjectId)] || '',
        topicName: topicNames[String(row.topicId)] || '',
      })
    );
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    return {
      lectures,
      pagination: { total, page, pageSize: limit, totalPages },
    };
  },

  async getPublished(id, actingUser) {
    const { premium, isAdmin } = await resolveStudentEntitlement(actingUser);
    const doc = await videoLectureRepository.findPublishedById(id);
    if (!doc) {
      throw new AppError('Video lecture not found', HTTP_STATUS.NOT_FOUND);
    }
    const { subjectNames, topicNames } = await attachTaxonomyNames([doc]);
    return toStudentDto(doc, {
      locked: isLectureLocked(doc, { premium, isAdmin }),
      subjectName: subjectNames[String(doc.subjectId)] || '',
      topicName: topicNames[String(doc.topicId)] || '',
    });
  },

  async authorizePlayback(id, actingUser) {
    const { premium, isAdmin } = await resolveStudentEntitlement(actingUser);
    const doc = await videoLectureRepository.findPublishedById(id);
    if (!doc) {
      throw new AppError('Video lecture not found', HTTP_STATUS.NOT_FOUND);
    }
    if (isLectureLocked(doc, { premium, isAdmin })) {
      throw new AppError('Premium required', HTTP_STATUS.FORBIDDEN);
    }
    const uid = String(doc.cloudflareVideoId || '').trim();
    if (!uid) {
      throw new AppError('Video lecture is not ready for playback', HTTP_STATUS.NOT_FOUND);
    }

    // TTL is server-side from Mongo duration only — never from the request body.
    const expiresInSeconds = resolvePlaybackTtlSeconds(doc.durationSeconds);
    let signed;
    try {
      signed = await cloudflareStreamService.createSignedPlaybackToken({
        videoId: uid,
        expiresInSeconds,
      });
    } catch (err) {
      logger.warn('[VIDEO LECTURE PLAYBACK] authorization mint failed', {
        lectureId: String(doc._id),
        errorName: err?.name,
        statusCode: err?.statusCode || null,
      });
      throw new AppError(
        'Unable to start playback. Please try again.',
        HTTP_STATUS.BAD_GATEWAY
      );
    }

    logger.info('[VIDEO LECTURE PLAYBACK] authorized', {
      lectureId: String(doc._id),
      access: doc.access,
      expiresInSeconds: signed.expiresInSeconds,
    });

    return {
      lectureId: String(doc._id),
      playbackUrl: signed.playbackUrl,
      expiresAt: signed.expiresAt,
      durationSeconds: doc.durationSeconds ?? null,
      access: doc.access,
    };
  },

  /**
   * Apply a verified Cloudflare Stream video notification to an existing lecture.
   * Does not create lectures or Cloudflare videos. Idempotent status/metadata writes.
   */
  async applyCloudflareStreamNotification(payload) {
    const uid = extractCloudflareStreamUid(payload);
    if (!uid) {
      throw new AppError('Cloudflare video uid is required', HTTP_STATUS.BAD_REQUEST);
    }

    const incomingStatus = mapCloudflareVideoToLectureStatus(payload);
    if (!incomingStatus) {
      logger.info('[VIDEO LECTURE WEBHOOK] ignored unknown stream state', {
        cloudflareVideoId: uid,
        streamState: payload?.status?.state ?? null,
      });
      return { handled: false, reason: 'unknown_state', cloudflareVideoId: uid };
    }

    const existing = await videoLectureRepository.findByCloudflareVideoId(uid);
    if (!existing) {
      logger.info('[VIDEO LECTURE WEBHOOK] no lecture for uid', {
        cloudflareVideoId: uid,
        incomingStatus,
      });
      return { handled: false, reason: 'lecture_not_found', cloudflareVideoId: uid };
    }

    const lectureId = String(existing._id);
    if (existing.status === VIDEO_LECTURE_STATUS.ARCHIVED) {
      logger.info('[VIDEO LECTURE WEBHOOK] skip archived lecture', {
        lectureId,
        cloudflareVideoId: uid,
      });
      return {
        handled: false,
        reason: 'archived',
        lectureId,
        cloudflareVideoId: uid,
      };
    }

    if (
      existing.status === VIDEO_LECTURE_STATUS.PUBLISHED &&
      incomingStatus !== VIDEO_LECTURE_STATUS.PUBLISHED
    ) {
      logger.info('[VIDEO LECTURE WEBHOOK] skip status downgrade', {
        lectureId,
        cloudflareVideoId: uid,
        status: existing.status,
        incomingStatus,
      });
      return {
        handled: false,
        reason: 'no_downgrade',
        lectureId,
        cloudflareVideoId: uid,
        status: existing.status,
      };
    }

    const eventId = buildCloudflareStreamWebhookEventId(payload);
    const claimed = await webhookEventRepository.tryInsertEvent({
      eventId,
      event: `stream.${incomingStatus}`,
    });
    if (!claimed.inserted) {
      logger.info('[VIDEO LECTURE WEBHOOK] idempotent skip', {
        lectureId,
        cloudflareVideoId: uid,
        status: existing.status,
      });
      return {
        handled: true,
        reason: 'idempotent',
        lectureId,
        cloudflareVideoId: uid,
        status: existing.status,
        durationSeconds: existing.durationSeconds ?? null,
        thumbnailUrl: existing.thumbnailUrl || null,
      };
    }

    let media = extractLectureMediaMetadata(payload);
    const publishedAndComplete =
      incomingStatus === VIDEO_LECTURE_STATUS.PUBLISHED &&
      existing.status === VIDEO_LECTURE_STATUS.PUBLISHED &&
      existing.durationSeconds != null &&
      Boolean(existing.thumbnailUrl);
    const nonPublishedIdempotent =
      incomingStatus !== VIDEO_LECTURE_STATUS.PUBLISHED &&
      existing.status === incomingStatus;

    if (publishedAndComplete || nonPublishedIdempotent) {
      logger.info('[VIDEO LECTURE WEBHOOK] idempotent skip', {
        lectureId,
        cloudflareVideoId: uid,
        status: existing.status,
      });
      return {
        handled: true,
        reason: 'idempotent',
        lectureId,
        cloudflareVideoId: uid,
        status: existing.status,
        durationSeconds: existing.durationSeconds ?? null,
        thumbnailUrl: existing.thumbnailUrl || null,
      };
    }

    const patch = { status: incomingStatus };

    if (
      incomingStatus === VIDEO_LECTURE_STATUS.PUBLISHED &&
      (media.durationSeconds == null || !media.thumbnailUrl)
    ) {
      try {
        const remote = await cloudflareStreamService.getVideo(uid);
        const remoteMedia = extractLectureMediaMetadata(remote || {});
        if (media.durationSeconds == null) media.durationSeconds = remoteMedia.durationSeconds;
        if (!media.thumbnailUrl) media.thumbnailUrl = remoteMedia.thumbnailUrl;
      } catch (err) {
        logger.warn('[VIDEO LECTURE WEBHOOK] getVideo metadata refresh failed', {
          lectureId,
          cloudflareVideoId: uid,
          errorName: err?.name,
        });
      }
    }

    if (media.durationSeconds != null) patch.durationSeconds = media.durationSeconds;
    if (media.thumbnailUrl) patch.thumbnailUrl = media.thumbnailUrl;

    const updated = await videoLectureRepository.updateById(existing._id, patch);

    logger.info('[VIDEO LECTURE WEBHOOK] lecture updated', {
      lectureId,
      cloudflareVideoId: uid,
      status: updated?.status,
      durationSeconds: updated?.durationSeconds ?? null,
      hasThumbnail: Boolean(updated?.thumbnailUrl),
    });

    return {
      handled: true,
      lectureId,
      cloudflareVideoId: uid,
      status: updated?.status,
      durationSeconds: updated?.durationSeconds ?? null,
      thumbnailUrl: updated?.thumbnailUrl || null,
    };
  },
};
