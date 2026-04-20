import mongoose from 'mongoose';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { DIFFICULTY_VALUES } from '../constants/difficulty.js';
import { QUESTION_SORT, QUESTION_SORT_VALUES } from '../constants/questionSort.js';
import { AppError } from '../utils/AppError.js';
import { questionRepository } from '../repositories/questionRepository.js';
import { subjectRepository } from '../repositories/subjectRepository.js';
import { topicRepository } from '../repositories/topicRepository.js';
import { postRepository } from '../repositories/postRepository.js';

function assertOptionsAndIndex(options, correctAnswerIndex) {
  if (!Array.isArray(options) || options.length < 2) {
    throw new AppError('At least two options are required', HTTP_STATUS.BAD_REQUEST);
  }
  if (
    typeof correctAnswerIndex !== 'number' ||
    !Number.isInteger(correctAnswerIndex) ||
    correctAnswerIndex < 0 ||
    correctAnswerIndex >= options.length
  ) {
    throw new AppError('correctAnswerIndex must be a valid index into options', HTTP_STATUS.BAD_REQUEST);
  }
}

function deriveAnswerFields(options, correctAnswerIndex, correctAnswerValue) {
  assertOptionsAndIndex(options, correctAnswerIndex);
  const derived = String(options[correctAnswerIndex]).trim();
  if (correctAnswerValue !== undefined && correctAnswerValue !== null && correctAnswerValue !== '') {
    if (String(correctAnswerValue).trim() !== derived) {
      throw new AppError(
        'correctAnswerValue must match the text at options[correctAnswerIndex]',
        HTTP_STATUS.BAD_REQUEST
      );
    }
  }
  return {
    correctAnswerIndex,
    correctAnswerValue: derived,
  };
}

async function assertSubjectAndTopic(subjectId, topicId) {
  const subject = await subjectRepository.findById(subjectId);
  if (!subject) {
    throw new AppError('Subject not found', HTTP_STATUS.NOT_FOUND);
  }
  const topic = await topicRepository.findById(topicId);
  if (!topic) {
    throw new AppError('Topic not found', HTTP_STATUS.NOT_FOUND);
  }
  if (topic.subjectId.toString() !== subjectId.toString()) {
    throw new AppError('Topic does not belong to the given subject', HTTP_STATUS.BAD_REQUEST);
  }
}

async function assertPostIds(postIds) {
  const ids = Array.isArray(postIds) ? postIds : [];
  const ok = await postRepository.existsAllIds(ids);
  if (!ok) {
    throw new AppError('One or more post IDs are invalid', HTTP_STATUS.BAD_REQUEST);
  }
}

function parsePagination(query) {
  const limit = Math.min(Number(query.limit) || 50, 100);
  const skip = Math.max(Number(query.skip) || 0, 0);
  return { limit, skip };
}

function parseSort(query) {
  const raw = query.sort;
  if (raw === undefined || raw === '') {
    return QUESTION_SORT.LATEST;
  }
  if (!QUESTION_SORT_VALUES.includes(raw)) {
    throw new AppError('Invalid sort parameter', HTTP_STATUS.BAD_REQUEST);
  }
  return raw;
}

export const questionService = {
  /**
   * Fetch active questions by id list; order matches `idTokens`.
   * Call only when `ids` query is present (controller skips other filters for this path).
   */
  async listByIds(idTokens) {
    if (!idTokens?.length) {
      return { questions: [], total: 0, limit: 0, skip: 0 };
    }
    for (const id of idTokens) {
      if (!mongoose.isValidObjectId(id)) {
        throw new AppError(`Invalid question id in ids: ${id}`, HTTP_STATUS.BAD_REQUEST);
      }
    }
    const questions = await questionRepository.findActiveByIds(idTokens);
    return { questions, total: questions.length, limit: questions.length, skip: 0 };
  },

  async list(query) {
    const filter = { isActive: true };

    if (query.subjectId) {
      filter.subjectId = query.subjectId;
    }
    if (query.topicId) {
      filter.topicId = query.topicId;
    }
    if (query.postId) {
      filter.postIds = query.postId;
    }
    if (query.difficulty !== undefined && query.difficulty !== '') {
      if (!DIFFICULTY_VALUES.includes(query.difficulty)) {
        throw new AppError('Invalid difficulty filter', HTTP_STATUS.BAD_REQUEST);
      }
      filter.difficulty = query.difficulty;
    }
    if (query.year !== undefined && query.year !== '') {
      const y = Number(query.year);
      if (!Number.isFinite(y)) {
        throw new AppError('Invalid year filter', HTTP_STATUS.BAD_REQUEST);
      }
      filter.year = y;
    }

    const { limit, skip } = parsePagination(query);
    const sort = parseSort(query);

    const [total, questions] = await Promise.all([
      questionRepository.countDocuments(filter),
      questionRepository.findAll(filter, { limit, skip, sort }),
    ]);

    return { questions, total, limit, skip };
  },

  async getById(id) {
    const q = await questionRepository.findById(id);
    if (!q || !q.isActive) {
      throw new AppError('Question not found', HTTP_STATUS.NOT_FOUND);
    }
    return q;
  },

  async create(body) {
    const {
      questionText,
      options,
      correctAnswerIndex,
      correctAnswerValue,
      explanation = '',
      subjectId,
      topicId,
      postIds = [],
      year = null,
      difficulty,
    } = body;

    const answerFields = deriveAnswerFields(options, correctAnswerIndex, correctAnswerValue);
    await assertSubjectAndTopic(subjectId, topicId);
    await assertPostIds(postIds);

    const payload = {
      questionText,
      options,
      ...answerFields,
      explanation,
      subjectId,
      topicId,
      postIds,
      year,
      isActive: true,
    };
    if (difficulty !== undefined) {
      payload.difficulty = difficulty;
    }

    return questionRepository.create(payload);
  },

  async update(id, patch) {
    const doc = await questionRepository.findByIdForUpdate(id);
    if (!doc) {
      throw new AppError('Question not found', HTTP_STATUS.NOT_FOUND);
    }

    if (patch.questionText !== undefined) {
      doc.questionText = patch.questionText;
    }
    if (patch.options !== undefined) {
      doc.options = patch.options;
    }
    if (patch.correctAnswerIndex !== undefined) {
      doc.correctAnswerIndex = patch.correctAnswerIndex;
    }
    if (patch.correctAnswerValue !== undefined) {
      doc.correctAnswerValue = patch.correctAnswerValue;
    }
    if (patch.explanation !== undefined) {
      doc.explanation = patch.explanation;
    }
    if (patch.subjectId !== undefined) {
      doc.subjectId = patch.subjectId;
    }
    if (patch.topicId !== undefined) {
      doc.topicId = patch.topicId;
    }
    if (patch.postIds !== undefined) {
      doc.postIds = patch.postIds;
    }
    if (patch.year !== undefined) {
      doc.year = patch.year;
    }
    if (patch.difficulty !== undefined) {
      doc.difficulty = patch.difficulty;
    }

    const fields = deriveAnswerFields(
      doc.options,
      doc.correctAnswerIndex,
      patch.correctAnswerValue !== undefined ? patch.correctAnswerValue : undefined
    );
    doc.correctAnswerIndex = fields.correctAnswerIndex;
    doc.correctAnswerValue = fields.correctAnswerValue;

    if (patch.subjectId !== undefined || patch.topicId !== undefined) {
      await assertSubjectAndTopic(doc.subjectId, doc.topicId);
    }
    if (patch.postIds !== undefined) {
      await assertPostIds(doc.postIds);
    }

    return questionRepository.saveDocument(doc);
  },

  async softDelete(id) {
    const existing = await questionRepository.findById(id);
    if (!existing) {
      throw new AppError('Question not found', HTTP_STATUS.NOT_FOUND);
    }
    const updated = await questionRepository.softDeleteById(id);
    return updated;
  },
};
