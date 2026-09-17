import { body, param, query } from 'express-validator';
import {
  VIDEO_LECTURE_ABSOLUTE_MAX_DURATION_SECONDS,
  VIDEO_LECTURE_ACCESS_VALUES,
  VIDEO_LECTURE_DESCRIPTION_MAX,
  VIDEO_LECTURE_STATUS_VALUES,
  VIDEO_LECTURE_TITLE_MAX,
  VIDEO_LECTURE_TITLE_MIN,
} from '../constants/videoLecture.js';

export const lectureIdParam = [
  param('id').isMongoId().withMessage('id must be a valid Mongo id'),
];

export const provisionUploadValidators = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('title is required')
    .isLength({ min: VIDEO_LECTURE_TITLE_MIN, max: VIDEO_LECTURE_TITLE_MAX })
    .withMessage(
      `title must be ${VIDEO_LECTURE_TITLE_MIN}-${VIDEO_LECTURE_TITLE_MAX} characters`
    ),
  body('description')
    .optional({ nullable: true })
    .isString()
    .withMessage('description must be a string')
    .isLength({ max: VIDEO_LECTURE_DESCRIPTION_MAX })
    .withMessage(`description must be at most ${VIDEO_LECTURE_DESCRIPTION_MAX} characters`),
  body('subjectId')
    .exists({ checkNull: true, checkFalsy: true })
    .withMessage('subjectId is required')
    .bail()
    .isMongoId()
    .withMessage('subjectId must be a valid id'),
  body('topicId')
    .exists({ checkNull: true, checkFalsy: true })
    .withMessage('topicId is required')
    .bail()
    .isMongoId()
    .withMessage('topicId must be a valid id'),
  body('access')
    .optional()
    .isIn(VIDEO_LECTURE_ACCESS_VALUES)
    .withMessage(`access must be one of: ${VIDEO_LECTURE_ACCESS_VALUES.join(', ')}`),
  body('maxDurationSeconds')
    .exists({ checkNull: true })
    .withMessage('maxDurationSeconds is required')
    .bail()
    .isInt({ min: 1, max: VIDEO_LECTURE_ABSOLUTE_MAX_DURATION_SECONDS })
    .withMessage(
      `maxDurationSeconds must be an integer from 1 to ${VIDEO_LECTURE_ABSOLUTE_MAX_DURATION_SECONDS}`
    )
    .toInt(),
  body('cloudflareVideoId')
    .not()
    .exists()
    .withMessage('cloudflareVideoId must not be sent by the client'),
];

export const listLecturesValidators = [
  query('subjectId').optional().isMongoId().withMessage('subjectId must be a valid id'),
  query('topicId').optional().isMongoId().withMessage('topicId must be a valid id'),
  query('status')
    .optional()
    .isIn(VIDEO_LECTURE_STATUS_VALUES)
    .withMessage(`status must be one of: ${VIDEO_LECTURE_STATUS_VALUES.join(', ')}`),
  query('access')
    .optional()
    .isIn(VIDEO_LECTURE_ACCESS_VALUES)
    .withMessage(`access must be one of: ${VIDEO_LECTURE_ACCESS_VALUES.join(', ')}`),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer')
    .toInt(),
  query('pageSize')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('pageSize must be from 1 to 100')
    .toInt(),
];

export const listStudentLecturesValidators = [
  query('subjectId').optional().isMongoId().withMessage('subjectId must be a valid id'),
  query('topicId').optional().isMongoId().withMessage('topicId must be a valid id'),
  query('access')
    .optional()
    .isIn(VIDEO_LECTURE_ACCESS_VALUES)
    .withMessage(`access must be one of: ${VIDEO_LECTURE_ACCESS_VALUES.join(', ')}`),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer')
    .toInt(),
  query('pageSize')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('pageSize must be from 1 to 50')
    .toInt(),
];

export const updateLectureValidators = [
  ...lectureIdParam,
  body('title')
    .optional()
    .trim()
    .isLength({ min: VIDEO_LECTURE_TITLE_MIN, max: VIDEO_LECTURE_TITLE_MAX })
    .withMessage(
      `title must be ${VIDEO_LECTURE_TITLE_MIN}-${VIDEO_LECTURE_TITLE_MAX} characters`
    ),
  body('description')
    .optional({ nullable: true })
    .isString()
    .isLength({ max: VIDEO_LECTURE_DESCRIPTION_MAX })
    .withMessage(`description must be at most ${VIDEO_LECTURE_DESCRIPTION_MAX} characters`),
  body('subjectId').optional().isMongoId().withMessage('subjectId must be a valid id'),
  body('topicId').optional().isMongoId().withMessage('topicId must be a valid id'),
  body('access')
    .optional()
    .isIn(VIDEO_LECTURE_ACCESS_VALUES)
    .withMessage(`access must be one of: ${VIDEO_LECTURE_ACCESS_VALUES.join(', ')}`),
  body('order')
    .optional()
    .isInt({ min: 0 })
    .withMessage('order must be a non-negative integer')
    .toInt(),
  body('cloudflareVideoId')
    .not()
    .exists()
    .withMessage('cloudflareVideoId cannot be updated'),
  body('status')
    .not()
    .exists()
    .withMessage('status cannot be changed through this endpoint'),
];
