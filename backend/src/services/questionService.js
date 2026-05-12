import mongoose from 'mongoose';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { DIFFICULTY_VALUES } from '../constants/difficulty.js';
import { QUESTION_SORT, QUESTION_SORT_VALUES } from '../constants/questionSort.js';
import { AppError } from '../utils/AppError.js';
import { questionRepository } from '../repositories/questionRepository.js';
import { subjectRepository } from '../repositories/subjectRepository.js';
import { topicRepository } from '../repositories/topicRepository.js';
import { postRepository } from '../repositories/postRepository.js';
import { QUESTION_TYPES, QUESTION_TYPE_VALUES } from '../models/Question.js';

function isValidHttpUrl(s) {
  if (typeof s !== 'string' || s.trim() === '') return false;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Normalize the grab-bag of answer fields that may arrive in a create/update
 * payload into the canonical shape we want to hand to Mongoose.
 *
 * Accepted input shapes (all equivalent for a single-correct question):
 *   { correctAnswers: [2] }                        // new API
 *   { correctAnswerIndex: 2 }                      // legacy API
 *   { correctAnswers: [2], correctAnswerIndex: 2 } // both, must agree
 *
 * For multiple_correct, only `correctAnswers` is meaningful:
 *   { correctAnswers: [0, 2], questionType: 'multiple_correct' }
 *
 * Returns { correctAnswers, correctAnswerIndex, correctAnswerValue } with
 * the legacy fields synced off `correctAnswers[0]` so existing consumers
 * (scoring, reporting) keep working unchanged.
 */
function normalizeAnswerPayload({
  options,
  questionType = QUESTION_TYPES.SINGLE_CORRECT,
  correctAnswers,
  correctAnswerIndex,
  correctAnswerValue,
}) {
  if (!Array.isArray(options) || options.length < 2) {
    throw new AppError('At least two options are required', HTTP_STATUS.BAD_REQUEST);
  }
  if (!QUESTION_TYPE_VALUES.includes(questionType)) {
    throw new AppError(
      `questionType must be one of: ${QUESTION_TYPE_VALUES.join(', ')}`,
      HTTP_STATUS.BAD_REQUEST
    );
  }
  const n = options.length;

  // Resolve the authoritative answer list. Array form wins; if it's missing
  // or empty, fall back to the legacy scalar. This is the single place where
  // "old payload" → "new payload" translation happens.
  let answers;
  if (Array.isArray(correctAnswers) && correctAnswers.length > 0) {
    answers = correctAnswers;
  } else if (
    typeof correctAnswerIndex === 'number' &&
    Number.isInteger(correctAnswerIndex)
  ) {
    answers = [correctAnswerIndex];
  } else {
    throw new AppError(
      'Either correctAnswers (array of option indexes) or correctAnswerIndex is required',
      HTTP_STATUS.BAD_REQUEST
    );
  }

  const cleaned = [];
  for (const raw of answers) {
    const v = Number(raw);
    if (!Number.isInteger(v) || v < 0 || v >= n) {
      throw new AppError(
        `correctAnswers contains an invalid option index: ${raw}`,
        HTTP_STATUS.BAD_REQUEST
      );
    }
    cleaned.push(v);
  }
  const dedup = Array.from(new Set(cleaned));

  // If the caller sent BOTH forms, they must agree on the primary index —
  // otherwise we'd silently pick one and confuse whoever debugs the payload.
  if (
    typeof correctAnswerIndex === 'number' &&
    Number.isInteger(correctAnswerIndex) &&
    !dedup.includes(correctAnswerIndex)
  ) {
    throw new AppError(
      'correctAnswerIndex must be one of the values in correctAnswers',
      HTTP_STATUS.BAD_REQUEST
    );
  }

  if (questionType === QUESTION_TYPES.SINGLE_CORRECT) {
    if (dedup.length !== 1) {
      throw new AppError(
        'single_correct questions must have exactly one correct answer',
        HTTP_STATUS.BAD_REQUEST
      );
    }
  } else if (questionType === QUESTION_TYPES.MULTIPLE_CORRECT) {
    if (dedup.length < 2) {
      throw new AppError(
        'multiple_correct questions require at least two correct answers',
        HTTP_STATUS.BAD_REQUEST
      );
    }
  }

  const primary = dedup[0];
  const primaryValue = String(options[primary]).trim();

  if (
    correctAnswerValue !== undefined &&
    correctAnswerValue !== null &&
    correctAnswerValue !== ''
  ) {
    if (String(correctAnswerValue).trim() !== primaryValue) {
      throw new AppError(
        'correctAnswerValue must match the text at options[correctAnswers[0]]',
        HTTP_STATUS.BAD_REQUEST
      );
    }
  }

  return {
    correctAnswers: dedup,
    correctAnswerIndex: primary,
    correctAnswerValue: primaryValue,
  };
}

/**
 * Validate questionImage for a create/update payload.
 *   - `image_based` questions MUST have a URL.
 *   - Any type MAY have a URL, but if present it must be http(s).
 */
function assertImage(questionType, questionImage) {
  if (questionType === QUESTION_TYPES.IMAGE_BASED) {
    if (!questionImage || typeof questionImage !== 'string') {
      throw new AppError(
        'image_based questions require a questionImage URL',
        HTTP_STATUS.BAD_REQUEST
      );
    }
  }
  if (questionImage && !isValidHttpUrl(questionImage)) {
    throw new AppError(
      'questionImage must be a valid http(s) URL',
      HTTP_STATUS.BAD_REQUEST
    );
  }
}

/**
 * Normalize a question as returned from the repository so every response
 * carries the new canonical shape, even for documents written before the
 * multi-answer upgrade.
 *
 * Key guarantee: `correctAnswers` is ALWAYS present and non-empty on an
 * otherwise-valid question. Old docs that only have `correctAnswerIndex`
 * are projected as `correctAnswers: [correctAnswerIndex]`.
 */
function projectQuestion(q) {
  if (!q) return q;
  const hasArr = Array.isArray(q.correctAnswers) && q.correctAnswers.length > 0;
  const correctAnswers = hasArr
    ? q.correctAnswers.map((n) => Number(n))
    : typeof q.correctAnswerIndex === 'number'
    ? [q.correctAnswerIndex]
    : [];
  return {
    ...q,
    questionType: q.questionType || QUESTION_TYPES.SINGLE_CORRECT,
    questionImage: q.questionImage || '',
    correctAnswers,
  };
}

/**
 * Admin test-builder / picker rows: no answers, no explanation — smaller payloads.
 */
function projectAdminPickerRow(row, subj, top, posts) {
  const postIds = Array.isArray(row.postIds)
    ? row.postIds.map((p) => (p && typeof p === 'object' && p._id != null ? p._id : p))
    : row.postIds;
  return {
    _id: row._id,
    questionText: row.questionText,
    options: Array.isArray(row.options) ? [...row.options] : [],
    questionType: row.questionType || QUESTION_TYPES.SINGLE_CORRECT,
    questionImage: row.questionImage || '',
    subjectId: subj?._id ?? row.subjectId,
    topicId: top?._id ?? row.topicId,
    postIds,
    difficulty: row.difficulty,
    year: row.year ?? null,
    isActive: row.isActive !== false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    subject: subj ? { _id: subj._id, name: subj.name } : null,
    topic: top ? { _id: top._id, name: top.name } : null,
    posts,
  };
}

/**
 * Strip answers and explanation for student-facing / untrusted API responses.
 * Full scoring and admin flows must use {@link projectQuestion} / repo reads instead.
 */
function normalizeRef(ref) {
  if (ref == null) return ref;
  if (typeof ref === 'object' && ref !== null && ref._id != null) {
    const { _id, name } = ref;
    return name != null ? { _id, name } : _id;
  }
  return ref;
}

export function projectPublicQuestion(q) {
  if (!q) return q;
  const postIds = Array.isArray(q.postIds)
    ? q.postIds.map((p) => (p && typeof p === 'object' && p._id != null ? p._id : p))
    : q.postIds;

  return {
    _id: q._id,
    questionText: q.questionText,
    options: Array.isArray(q.options) ? [...q.options] : [],
    subjectId: normalizeRef(q.subjectId),
    topicId: normalizeRef(q.topicId),
    postIds,
    difficulty: q.difficulty,
    questionType: q.questionType || QUESTION_TYPES.SINGLE_CORRECT,
    questionImage: q.questionImage || '',
    year: q.year ?? null,
  };
}

export function projectPublicQuestions(list) {
  return Array.isArray(list) ? list.map(projectPublicQuestion) : list;
}

/**
 * Resolve Subject + Topic and return both docs.
 * (Posts are tags via `postIds[]`; `subject.postId` may exist only on legacy rows.)
 */
async function resolveHierarchy(subjectId, topicId) {
  const subject = await subjectRepository.findById(subjectId);
  if (!subject) {
    throw new AppError('Subject not found', HTTP_STATUS.NOT_FOUND);
  }
  // `isActive === false` means the admin has hidden this subject; we refuse
  // to attach new questions to it. Legacy docs without the field are treated
  // as active (schema default).
  if (subject.isActive === false) {
    throw new AppError(
      'Subject is inactive; cannot create or move questions under it.',
      HTTP_STATUS.BAD_REQUEST
    );
  }

  const topic = await topicRepository.findById(topicId);
  if (!topic) {
    throw new AppError('Topic not found', HTTP_STATUS.NOT_FOUND);
  }
  if (topic.subjectId.toString() !== subjectId.toString()) {
    throw new AppError(
      'Topic does not belong to the given subject',
      HTTP_STATUS.BAD_REQUEST
    );
  }
  if (topic.isActive === false) {
    throw new AppError(
      'Topic is inactive; cannot create or move questions under it.',
      HTTP_STATUS.BAD_REQUEST
    );
  }

  return { subject, topic };
}

async function assertPostIds(postIds) {
  const ids = Array.isArray(postIds) ? postIds : [];
  const ok = await postRepository.existsAllIds(ids);
  if (!ok) {
    throw new AppError('One or more post IDs are invalid', HTTP_STATUS.BAD_REQUEST);
  }
}

/**
 * **Compatibility-only — not part of the normalized hierarchy.**
 *
 * If a Subject still has deprecated `subject.postId`, we ensure that Post id
 * appears in `Question.postIds[]` so legacy-linked rows stay tagged consistently.
 * Canonical tagging for new work: explicit `postIds[]` from callers; global
 * subjects have `subject.postId` null/empty.
 *
 * TODO(compatibility): Safe to remove or relax after DB audit confirms no
 * subject carries `postId`, or policy explicitly drops auto-injection — high
 * risk to legacy questions until then.
 */
function reconcilePostIds(postIds, subjectPostId) {
  const provided = Array.isArray(postIds) ? postIds.map(String) : [];
  if (subjectPostId == null || subjectPostId === '') {
    if (provided.length === 0) {
      throw new AppError(
        'postIds must include at least one exam when the subject is global (no legacy post link).',
        HTTP_STATUS.BAD_REQUEST
      );
    }
    return Array.from(new Set(provided));
  }
  const parent = String(subjectPostId);
  if (provided.length === 0) {
    return [parent];
  }
  if (!provided.includes(parent)) {
    throw new AppError(
      'postIds must include the subject\'s legacy parent post',
      HTTP_STATUS.BAD_REQUEST
    );
  }
  return Array.from(new Set(provided));
}

function parsePagination(query) {
  const limit = Math.min(Number(query.limit) || 50, 100);
  const skip = Math.max(Number(query.skip) || 0, 0);
  return { limit, skip };
}

/** Admin list: page (1-based) + pageSize, or limit/skip. */
function parseAdminPagination(query) {
  const pageSize = Math.min(
    Math.max(Number(query.pageSize) || Number(query.limit) || 20, 1),
    100
  );
  if (query.page != null && String(query.page).trim() !== '') {
    const page = Math.max(Number(query.page) || 1, 1);
    const skip = (page - 1) * pageSize;
    return { limit: pageSize, skip, page, pageSize };
  }
  const limit = pageSize;
  const skip = Math.max(Number(query.skip) || 0, 0);
  const page = Math.floor(skip / limit) + 1;
  return { limit, skip, page, pageSize: limit };
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

/**
 * Reject impossible subject/topic combinations before hitting Mongo.
 *
 * `postId` on list endpoints is an optional **tag filter** (`postIds` contains),
 * not the primary hierarchy — we only verify the id exists. Topic/subject
 * alignment is still enforced when both are supplied.
 */
async function validateQuestionListFilters(query) {
  const rawSubject = query.subjectId;
  const rawTopic = query.topicId;
  const rawPost = query.postId;
  const subjectId =
    rawSubject != null && String(rawSubject).trim() !== ''
      ? String(rawSubject).trim()
      : '';
  const topicId =
    rawTopic != null && String(rawTopic).trim() !== '' ? String(rawTopic).trim() : '';
  const postId =
    rawPost != null && String(rawPost).trim() !== '' ? String(rawPost).trim() : '';

  if (topicId) {
    if (!mongoose.isValidObjectId(topicId)) {
      throw new AppError('Invalid topicId', HTTP_STATUS.BAD_REQUEST);
    }
    const topic = await topicRepository.findById(topicId);
    if (!topic) {
      throw new AppError('Topic not found', HTTP_STATUS.NOT_FOUND);
    }
    if (subjectId) {
      if (!mongoose.isValidObjectId(subjectId)) {
        throw new AppError('Invalid subjectId', HTTP_STATUS.BAD_REQUEST);
      }
      if (String(topic.subjectId) !== String(subjectId)) {
        throw new AppError(
          'topicId does not belong to the given subjectId',
          HTTP_STATUS.BAD_REQUEST
        );
      }
    }
  } else if (subjectId && !mongoose.isValidObjectId(subjectId)) {
    throw new AppError('Invalid subjectId', HTTP_STATUS.BAD_REQUEST);
  }

  if (postId) {
    if (!mongoose.isValidObjectId(postId)) {
      throw new AppError('Invalid postId', HTTP_STATUS.BAD_REQUEST);
    }
    const ok = await postRepository.existsAllIds([postId]);
    if (!ok) {
      throw new AppError('Invalid postId', HTTP_STATUS.BAD_REQUEST);
    }
  }

  const topicSearch =
    typeof query.topicSearch === 'string' ? query.topicSearch.trim() : '';
  if (topicSearch && !subjectId && !topicId) {
    throw new AppError(
      'subjectId is required when filtering by topic name (topicSearch)',
      HTTP_STATUS.BAD_REQUEST
    );
  }
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
    const questions = projectPublicQuestions(
      await questionRepository.findActiveByIds(idTokens)
    );
    return { questions, total: questions.length, limit: questions.length, skip: 0 };
  },

  async list(query) {
    await validateQuestionListFilters(query);

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

    const topicSearch =
      typeof query.topicSearch === 'string' ? query.topicSearch.trim() : '';
    if (topicSearch && query.subjectId && !query.topicId) {
      const tids = await topicRepository.findIdsBySubjectAndTopicSearch(
        query.subjectId,
        topicSearch
      );
      if (tids.length === 0) {
        const { limit, skip } = parsePagination(query);
        return { questions: [], total: 0, limit, skip };
      }
      filter.topicId = { $in: tids };
    }

    const search = typeof query.search === 'string' ? query.search.trim() : '';
    if (search) {
      filter.questionText = { $regex: escapeRegex(search), $options: 'i' };
    }

    const { limit, skip } = parsePagination(query);
    const sort = parseSort(query);

    const [total, questions] = await Promise.all([
      questionRepository.countDocuments(filter),
      questionRepository.findAll(filter, { limit, skip, sort }),
    ]);

    return { questions: projectPublicQuestions(questions), total, limit, skip };
  },

  /**
   * Admin-only: list questions with search, filters, optional inactive rows,
   * populated subject/topic/posts, pagination.
   */
  async adminList(query) {
    await validateQuestionListFilters(query);

    const filter = {};

    const includeInactive = String(query.includeInactive || '').toLowerCase() === 'true';
    const isActiveQ = query.isActive;
    if (isActiveQ === 'true' || isActiveQ === true) {
      filter.isActive = true;
    } else if (isActiveQ === 'false' || isActiveQ === false) {
      filter.isActive = false;
    } else if (!includeInactive) {
      filter.isActive = true;
    }

    if (query.subjectId) {
      if (!mongoose.isValidObjectId(String(query.subjectId))) {
        throw new AppError('Invalid subjectId', HTTP_STATUS.BAD_REQUEST);
      }
      filter.subjectId = new mongoose.Types.ObjectId(String(query.subjectId));
    }
    if (query.topicId) {
      if (!mongoose.isValidObjectId(String(query.topicId))) {
        throw new AppError('Invalid topicId', HTTP_STATUS.BAD_REQUEST);
      }
      filter.topicId = new mongoose.Types.ObjectId(String(query.topicId));
    }
    if (query.postId) {
      if (!mongoose.isValidObjectId(String(query.postId))) {
        throw new AppError('Invalid postId', HTTP_STATUS.BAD_REQUEST);
      }
      filter.postIds = new mongoose.Types.ObjectId(String(query.postId));
    }

    const topicSearch =
      typeof query.topicSearch === 'string' ? query.topicSearch.trim() : '';
    if (topicSearch && query.subjectId && !query.topicId) {
      const tids = await topicRepository.findIdsBySubjectAndTopicSearch(
        query.subjectId,
        topicSearch
      );
      if (tids.length === 0) {
        const { limit, skip, page, pageSize } = parseAdminPagination(query);
        const totalPages = 0;
        return {
          questions: [],
          pagination: {
            total: 0,
            page,
            pageSize,
            totalPages,
            skip,
            limit,
          },
        };
      }
      filter.topicId = { $in: tids };
    }
    if (query.difficulty !== undefined && query.difficulty !== '') {
      if (!DIFFICULTY_VALUES.includes(query.difficulty)) {
        throw new AppError('Invalid difficulty filter', HTTP_STATUS.BAD_REQUEST);
      }
      filter.difficulty = query.difficulty;
    }
    if (query.questionType !== undefined && query.questionType !== '') {
      if (!QUESTION_TYPE_VALUES.includes(query.questionType)) {
        throw new AppError('Invalid questionType filter', HTTP_STATUS.BAD_REQUEST);
      }
      filter.questionType = query.questionType;
    }
    if (query.year !== undefined && query.year !== '') {
      const y = Number(query.year);
      if (!Number.isFinite(y)) {
        throw new AppError('Invalid year filter', HTTP_STATUS.BAD_REQUEST);
      }
      filter.year = y;
    }

    const search = typeof query.search === 'string' ? query.search.trim() : '';
    if (search) {
      filter.questionText = { $regex: escapeRegex(search), $options: 'i' };
    }

    const { limit, skip, page, pageSize } = parseAdminPagination(query);

    const projection =
      String(query.projection || '').toLowerCase() === 'picker' ? 'picker' : undefined;
    const usePicker = projection === 'picker';

    const [total, raw] = await Promise.all([
      questionRepository.countDocuments(filter),
      questionRepository.findForAdminList(filter, { limit, skip, projection }),
    ]);

    const questions = (raw || []).map((row) => {
      const subj = row.subjectId && typeof row.subjectId === 'object' ? row.subjectId : null;
      const top = row.topicId && typeof row.topicId === 'object' ? row.topicId : null;
      const rowForProject = {
        ...row,
        subjectId: subj?._id ?? row.subjectId,
        topicId: top?._id ?? row.topicId,
        postIds: Array.isArray(row.postIds)
          ? row.postIds.map((p) => (p && typeof p === 'object' ? p._id : p))
          : row.postIds,
      };
      const posts = Array.isArray(row.postIds)
        ? row.postIds
            .map((p) =>
              p && typeof p === 'object' && p._id
                ? { _id: p._id, name: p.name, slug: p.slug }
                : null
            )
            .filter(Boolean)
        : [];
      if (usePicker) {
        return projectAdminPickerRow(rowForProject, subj, top, posts);
      }
      const proj = projectQuestion(rowForProject);
      return {
        ...proj,
        subject: subj ? { _id: subj._id, name: subj.name } : null,
        topic: top ? { _id: top._id, name: top.name } : null,
        posts,
      };
    });

    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

    return {
      questions,
      pagination: {
        total,
        page,
        pageSize,
        totalPages,
        skip,
        limit,
      },
    };
  },

  /**
   * Admin fetch: question may be inactive (for edit form).
   */
  async getByIdForAdmin(id) {
    const q = await questionRepository.findById(id);
    if (!q) {
      throw new AppError('Question not found', HTTP_STATUS.NOT_FOUND);
    }
    return projectQuestion(q);
  },

  /**
   * Pull N random active questions scoped to a user's weak topics.
   *
   * The validator layer has already:
   *   - exploded a comma-separated / repeated `topicIds` query into a
   *     deduped string[] on `req.query.topicIdList`
   *   - verified every id is a valid ObjectId
   *   - clamped limit into [1, 50] (default 10)
   *
   * So here we only have to guard the "empty list" case (defense-in-depth
   * in case a caller invokes this directly) and delegate.
   */
  async weakPractice({ topicIds, limit = 10 } = {}) {
    if (!Array.isArray(topicIds) || topicIds.length === 0) {
      throw new AppError('topicIds is required', HTTP_STATUS.BAD_REQUEST);
    }
    const questions = projectPublicQuestions(
      await questionRepository.findRandomByTopics(topicIds, limit)
    );
    // A caller with only sparse / brand-new topics might legitimately get
    // back fewer than `limit` (or zero) questions. That's not an error —
    // the mobile UI renders an "empty" state — so we return what we have.
    return { questions };
  },

  /**
   * Topic-wise (or broader) custom mock generation: random active questions
   * matching optional post / subject / topic / difficulty. At least one of
   * postId, subjectId, topicId must be present (validated upstream).
   * `difficulty: 'all'` or omit → no difficulty filter.
   */
  async smartPractice({ postId, subjectId, topicId, difficulty, limit = 10 } = {}) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 50));
    const match = { isActive: true };

    if (postId) {
      match.postIds = new mongoose.Types.ObjectId(String(postId));
    }
    if (subjectId) {
      match.subjectId = new mongoose.Types.ObjectId(String(subjectId));
    }
    if (topicId) {
      match.topicId = new mongoose.Types.ObjectId(String(topicId));
    }

    const d = difficulty != null ? String(difficulty).trim().toLowerCase() : '';
    if (d && d !== 'all') {
      if (!DIFFICULTY_VALUES.includes(d)) {
        throw new AppError('Invalid difficulty', HTTP_STATUS.BAD_REQUEST);
      }
      match.difficulty = d;
    }

    const raw = await questionRepository.findRandomSmartPractice(match, safeLimit);
    return { questions: projectPublicQuestions(raw) };
  },

  async getById(id) {
    const q = await questionRepository.findById(id);
    if (!q || !q.isActive) {
      throw new AppError('Question not found', HTTP_STATUS.NOT_FOUND);
    }
    return projectPublicQuestion(q);
  },

  async create(body) {
    const {
      questionText,
      options,
      questionType = QUESTION_TYPES.SINGLE_CORRECT,
      questionImage = '',
      correctAnswers,
      correctAnswerIndex,
      correctAnswerValue,
      explanation = '',
      subjectId,
      topicId,
      postIds = [],
      year = null,
      difficulty,
    } = body;

    assertImage(questionType, questionImage);
    const answerFields = normalizeAnswerPayload({
      options,
      questionType,
      correctAnswers,
      correctAnswerIndex,
      correctAnswerValue,
    });

    const { subject } = await resolveHierarchy(subjectId, topicId);
    const reconciledPostIds = reconcilePostIds(postIds, subject.postId);
    await assertPostIds(reconciledPostIds);

    const payload = {
      questionText,
      options,
      questionType,
      questionImage: questionImage || '',
      ...answerFields,
      explanation,
      subjectId,
      topicId,
      postIds: reconciledPostIds,
      year,
      isActive: true,
    };
    if (difficulty !== undefined) {
      payload.difficulty = difficulty;
    }

    const created = await questionRepository.create(payload);
    return projectQuestion(created);
  },

  async update(id, rawPatch) {
    const doc = await questionRepository.findByIdForUpdate(id);
    if (!doc) {
      throw new AppError('Question not found', HTTP_STATUS.NOT_FOUND);
    }

    const patch = { ...rawPatch };
    if (rawPatch?.postId !== undefined && rawPatch?.postIds === undefined) {
      patch.postIds = [rawPatch.postId];
    }

    if (patch.questionText !== undefined) {
      doc.questionText = patch.questionText;
    }
    if (patch.options !== undefined) {
      doc.options = patch.options;
    }
    if (patch.questionType !== undefined) {
      doc.questionType = patch.questionType;
    }
    if (patch.questionImage !== undefined) {
      doc.questionImage = patch.questionImage;
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
    if (patch.isActive !== undefined) {
      doc.isActive = Boolean(patch.isActive);
    }

    // Recompute answer fields from whatever combination of options/type/
    // correctAnswers/correctAnswerIndex is now effective on the document.
    // If the caller didn't touch any answer field, we re-feed the doc's own
    // current values so the pipeline stays idempotent (and repairs any
    // legacy doc that previously had only `correctAnswerIndex`).
    const effectiveType = doc.questionType || QUESTION_TYPES.SINGLE_CORRECT;
    assertImage(effectiveType, doc.questionImage);

    const incomingAnswers =
      rawPatch.correctAnswers !== undefined
        ? rawPatch.correctAnswers
        : Array.isArray(doc.correctAnswers) && doc.correctAnswers.length > 0
        ? doc.correctAnswers.map((n) => Number(n))
        : undefined;
    const incomingIndex =
      rawPatch.correctAnswerIndex !== undefined
        ? rawPatch.correctAnswerIndex
        : typeof doc.correctAnswerIndex === 'number'
        ? doc.correctAnswerIndex
        : undefined;
    const incomingValue =
      rawPatch.correctAnswerValue !== undefined
        ? rawPatch.correctAnswerValue
        : undefined;

    const fields = normalizeAnswerPayload({
      options: doc.options,
      questionType: effectiveType,
      correctAnswers: incomingAnswers,
      correctAnswerIndex: incomingIndex,
      correctAnswerValue: incomingValue,
    });
    doc.correctAnswers = fields.correctAnswers;
    doc.correctAnswerIndex = fields.correctAnswerIndex;
    doc.correctAnswerValue = fields.correctAnswerValue;

    // If subject/topic/postIds are touched, re-check Subject/Topic, then
    // reconcile postIds for legacy subject-linked rows (subject.postId).
    const hierarchyTouched =
      patch.subjectId !== undefined ||
      patch.topicId !== undefined ||
      patch.postIds !== undefined ||
      rawPatch?.postId !== undefined;
    if (hierarchyTouched) {
      const { subject } = await resolveHierarchy(doc.subjectId, doc.topicId);
      doc.postIds = reconcilePostIds(doc.postIds, subject.postId);
      await assertPostIds(doc.postIds);
    }

    const saved = await questionRepository.saveDocument(doc);
    return projectQuestion(saved);
  },

  /**
   * Bulk enable/disable. Validates ids, deduplicates, and reports actual
   * matched/modified counts (so the UI can warn on missing ids).
   *
   * Why no per-id "would this break N tests" interlock: tests already filter
   * inactive questions at serve time (`testService.classifyQuestions`), and
   * scoring already throws for inactive questions in an in-progress attempt.
   * Disable behavior on the bulk path is identical to single disable; only
   * the operation surface is collapsed for admin throughput.
   */
  async bulkSetStatus({ ids, isActive }) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new AppError('ids must be a non-empty array', HTTP_STATUS.BAD_REQUEST);
    }
    const cleanIds = [...new Set(ids.map(String))];
    for (const id of cleanIds) {
      if (!mongoose.isValidObjectId(id)) {
        throw new AppError(`Invalid question id: ${id}`, HTTP_STATUS.BAD_REQUEST);
      }
    }
    const { matchedCount, modifiedCount } = await questionRepository.bulkSetActive(
      cleanIds,
      isActive
    );
    return {
      requested: cleanIds.length,
      matched: matchedCount,
      modified: modifiedCount,
      isActive: Boolean(isActive),
    };
  },

  /**
   * Bulk-append exam Post tags (`postIds`). Tags only — no hierarchy changes.
   */
  async bulkAddPostTags({ questionIds, postIds }) {
    const qIds = [...new Set(questionIds.map(String))].filter((id) =>
      mongoose.isValidObjectId(id)
    );
    const pIds = [...new Set(postIds.map(String))].filter((id) =>
      mongoose.isValidObjectId(id)
    );
    if (!qIds.length) {
      throw new AppError('questionIds must contain valid ids', HTTP_STATUS.BAD_REQUEST);
    }
    if (!pIds.length) {
      throw new AppError('postIds must contain valid ids', HTTP_STATUS.BAD_REQUEST);
    }
    const postsOk = await postRepository.existsAllIds(
      pIds.map((id) => new mongoose.Types.ObjectId(id))
    );
    if (!postsOk) {
      throw new AppError(
        'One or more post ids are invalid',
        HTTP_STATUS.BAD_REQUEST
      );
    }
    const { matchedCount, modifiedCount } = await questionRepository.bulkAddPostTags(
      qIds,
      pIds
    );
    return {
      requestedQuestions: qIds.length,
      requestedPosts: pIds.length,
      matchedQuestions: matchedCount,
      modifiedQuestions: modifiedCount,
      skippedQuestions: Math.max(0, qIds.length - matchedCount),
    };
  },

  /**
   * Bulk-remove exam Post tags from `postIds`. Removing absent tags is safe (no error).
   */
  async bulkRemovePostTags({ questionIds, postIds }) {
    const qIds = [...new Set(questionIds.map(String))].filter((id) =>
      mongoose.isValidObjectId(id)
    );
    const pIds = [...new Set(postIds.map(String))].filter((id) =>
      mongoose.isValidObjectId(id)
    );
    if (!qIds.length) {
      throw new AppError('questionIds must contain valid ids', HTTP_STATUS.BAD_REQUEST);
    }
    if (!pIds.length) {
      throw new AppError('postIds must contain valid ids', HTTP_STATUS.BAD_REQUEST);
    }
    const postsOk = await postRepository.existsAllIds(
      pIds.map((id) => new mongoose.Types.ObjectId(id))
    );
    if (!postsOk) {
      throw new AppError(
        'One or more post ids are invalid',
        HTTP_STATUS.BAD_REQUEST
      );
    }
    const { matchedCount, modifiedCount } = await questionRepository.bulkRemovePostTags(
      qIds,
      pIds
    );
    return {
      requestedQuestions: qIds.length,
      requestedPosts: pIds.length,
      matchedQuestions: matchedCount,
      modifiedQuestions: modifiedCount,
      skippedQuestions: Math.max(0, qIds.length - matchedCount),
    };
  },

  /**
   * Soft "Possible duplicate?" lookup for the AddQuestion form. We do not
   * block submission on this — the admin can still save (some near-duplicates
   * are legitimate, e.g. retypes from different exam papers). We just expose
   * the candidates so they can deliberately confirm or cancel.
   *
   * Returns up to 5 same-subject candidates, plus a hard `exactDuplicateId`
   * when the normalized text matches exactly (handy for the form to render
   * a stronger warning).
   */
  async findSimilar({ questionText, subjectId, excludeId }) {
    const text = String(questionText || '').trim();
    if (!text) return { exactDuplicateId: null, similar: [] };
    if (!subjectId || !mongoose.isValidObjectId(String(subjectId))) {
      return { exactDuplicateId: null, similar: [] };
    }
    const [exact, similar] = await Promise.all([
      questionRepository.findExactDuplicate({
        questionText: text,
        subjectId,
        excludeId,
      }),
      questionRepository.findSimilar({
        questionText: text,
        subjectId,
        excludeId,
        limit: 5,
      }),
    ]);
    return {
      exactDuplicateId: exact ? String(exact._id) : null,
      similar: similar.map((s) => ({
        _id: String(s._id),
        questionText: s.questionText,
        isActive: s.isActive !== false,
        difficulty: s.difficulty,
        topicId: s.topicId ? String(s.topicId) : null,
      })),
    };
  },

  /**
   * Usage info for a single question — how many tests reference it and how
   * many test attempts have hit it. Cheap counts; admin UI fetches lazily.
   */
  async getUsage(id) {
    if (!mongoose.isValidObjectId(String(id))) {
      throw new AppError('Invalid question id', HTTP_STATUS.BAD_REQUEST);
    }
    const exists = await questionRepository.findById(id);
    if (!exists) {
      throw new AppError('Question not found', HTTP_STATUS.NOT_FOUND);
    }
    return questionRepository.getUsageCounts(id);
  },
};
