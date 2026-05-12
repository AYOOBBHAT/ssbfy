import mongoose from 'mongoose';
import { parse as parseCsv } from 'csv-parse/sync';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { DIFFICULTY, DIFFICULTY_VALUES } from '../constants/difficulty.js';
import { AppError } from '../utils/AppError.js';
import {
  questionRepository,
  normalizeForDuplicate,
} from '../repositories/questionRepository.js';
import { subjectRepository } from '../repositories/subjectRepository.js';
import { topicRepository } from '../repositories/topicRepository.js';
import { Subject } from '../models/Subject.js';
import { Topic } from '../models/Topic.js';
import { postRepository } from '../repositories/postRepository.js';
import {
  QUESTION_TYPES,
  QUESTION_TYPE_VALUES,
} from '../models/Question.js';

/**
 * CSV columns. The header row is REQUIRED — admins copy this from the
 * downloadable template and fill it in. Column order does not matter; we
 * key by header name so admins can reorder without breaking the import.
 *
 * `subject` and `topic` accept either a name (case-insensitive) OR a Mongo
 * ObjectId. Names are convenient when filling 200 rows by hand; ids are
 * convenient when re-importing a CSV exported by another tool.
 *
 * Optional `postIds` column: comma-separated Post ObjectIds (exam tags only).
 */
const REQUIRED_HEADERS = [
  'questionText',
  'optionA',
  'optionB',
  'optionC',
  'optionD',
  'correctAnswer',
  'subject',
  'topic',
];
const OPTIONAL_HEADERS = [
  'difficulty',
  'explanation',
  'year',
  'questionType',
  'questionImage',
  'postIds',
];
const ALL_HEADERS = [...REQUIRED_HEADERS, ...OPTIONAL_HEADERS];

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

/** Static template payload returned by `GET /questions/admin/import/template`. */
export const CSV_TEMPLATE = {
  filename: 'question-import-template.csv',
  contentType: 'text/csv; charset=utf-8',
  body:
    `${ALL_HEADERS.join(',')}\n` +
    [
      'What is the capital of J&K?',
      'Jammu',
      'Srinagar',
      'Leh',
      'Anantnag',
      'B',
      'Geography',
      'States and Capitals',
      'medium',
      'Srinagar is the summer capital; Jammu the winter.',
      '2024',
      'single_correct',
      '',
      '',
    ]
      .map((cell) => csvEscape(cell))
      .join(',') +
    '\n',
};

function csvEscape(s) {
  if (s == null) return '';
  const str = String(s);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Optional multipart fields: tag every row from this upload with the same Post id(s).
 * Exam tags only — not hierarchy ownership.
 */
export function parseImportTagPostIds(body) {
  const out = [];
  if (!body || typeof body !== 'object') return out;
  const single = body.tagPostId;
  if (single != null && String(single).trim() !== '') {
    const s = String(single).trim();
    if (!mongoose.isValidObjectId(s)) {
      throw new AppError('tagPostId must be a valid post id', HTTP_STATUS.BAD_REQUEST);
    }
    out.push(s);
  }
  const multi = String(body.tagPostIds ?? '').trim();
  if (multi) {
    for (const t of multi.split(/[,;\s]+/)) {
      const s = t.trim();
      if (!s) continue;
      if (!mongoose.isValidObjectId(s)) {
        throw new AppError(`invalid post id in tagPostIds: ${s}`, HTTP_STATUS.BAD_REQUEST);
      }
      out.push(s);
    }
  }
  return [...new Set(out)];
}

/** Dedupe. Legacy `subject.postId` is optional tagging tolerance only. */
function mergeQuestionImportPostIds({ csvPostIds = [], tagPostIds = [], legacySubjectPostId }) {
  const out = [];
  const push = (id) => {
    if (id == null || id === '') return;
    const s = String(id).trim();
    if (!s || !mongoose.isValidObjectId(s)) return;
    out.push(s);
  };
  for (const id of csvPostIds) push(id);
  for (const id of tagPostIds) push(id);
  push(legacySubjectPostId);
  return [...new Set(out)];
}

function parseCorrectAnswer(raw, optionsLen) {
  if (raw == null) return [];
  const tokens = String(raw)
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return [];
  const indexes = [];
  for (const tok of tokens) {
    const upper = tok.toUpperCase();
    const letterIdx = OPTION_LETTERS.indexOf(upper);
    if (letterIdx !== -1) {
      indexes.push(letterIdx);
      continue;
    }
    const num = Number(tok);
    if (Number.isInteger(num) && num >= 0 && num < optionsLen) {
      indexes.push(num);
      continue;
    }
    return null;
  }
  return Array.from(new Set(indexes)).sort((a, b) => a - b);
}

function inferQuestionType(rawType, correctIndexes, hasImage) {
  const t = String(rawType || '').trim().toLowerCase();
  if (t && QUESTION_TYPE_VALUES.includes(t)) return t;
  if (hasImage) return QUESTION_TYPES.IMAGE_BASED;
  if (correctIndexes.length >= 2) return QUESTION_TYPES.MULTIPLE_CORRECT;
  return QUESTION_TYPES.SINGLE_CORRECT;
}

/**
 * Parse the uploaded CSV buffer into raw row objects, preserving 1-based
 * line numbers for clear error reporting. Throws AppError for header-level
 * problems (missing required column, empty file).
 */
export function parseCsvBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new AppError('CSV file is empty', HTTP_STATUS.BAD_REQUEST);
  }
  let rows;
  try {
    rows = parseCsv(buffer, {
      bom: true,
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });
  } catch (err) {
    throw new AppError(
      `CSV parse error: ${err.message || 'invalid format'}`,
      HTTP_STATUS.BAD_REQUEST
    );
  }
  if (!rows.length) {
    throw new AppError(
      'CSV has no data rows. The first row must be headers.',
      HTTP_STATUS.BAD_REQUEST
    );
  }
  const headers = Object.keys(rows[0] || {}).map((h) => h.trim());
  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length) {
    throw new AppError(
      `CSV is missing required columns: ${missing.join(', ')}`,
      HTTP_STATUS.BAD_REQUEST
    );
  }
  return rows.map((row, i) => {
    // Row 1 is the header in the file, so user-facing line is i + 2.
    const userLine = i + 2;
    const cleaned = {};
    for (const key of Object.keys(row)) {
      cleaned[key.trim()] = typeof row[key] === 'string' ? row[key].trim() : row[key];
    }
    return { line: userLine, raw: cleaned };
  });
}

/**
 * Resolve subject + topic for an import row.
 *   - accepts ObjectId-shaped ids OR human names
 *   - rejects inactive subject/topic (matches the existing service rule)
 *   - rejects topic that doesn't belong to the resolved subject
 *
 * Heavy callers should pre-warm caches; the dryRun/commit pipeline below does.
 */
async function resolveSubjectAndTopic({ subjectRaw, topicRaw, caches }) {
  const reasons = [];
  let subject = null;
  let topic = null;

  const sRaw = String(subjectRaw || '').trim();
  if (!sRaw) {
    reasons.push('subject is required');
  } else if (mongoose.isValidObjectId(sRaw)) {
    subject = caches.subjectById.get(sRaw) || null;
    if (!subject) reasons.push(`subject not found: ${sRaw}`);
  } else {
    const key = sRaw.toLowerCase();
    subject = caches.subjectByName.get(key) || null;
    if (!subject) reasons.push(`subject not found: ${sRaw}`);
  }
  if (subject && subject.isActive === false) {
    reasons.push(`subject is inactive: ${subject.name || subject._id}`);
  }

  const tRaw = String(topicRaw || '').trim();
  if (!tRaw) {
    reasons.push('topic is required');
  } else if (mongoose.isValidObjectId(tRaw)) {
    topic = caches.topicById.get(tRaw) || null;
    if (!topic) reasons.push(`topic not found: ${tRaw}`);
  } else if (subject) {
    const key = `${String(subject._id)}::${tRaw.toLowerCase()}`;
    topic = caches.topicBySubjectAndName.get(key) || null;
    if (!topic) reasons.push(`topic not found in subject: ${tRaw}`);
  } else {
    reasons.push('topic name needs a valid subject to resolve');
  }
  if (topic && topic.isActive === false) {
    reasons.push(`topic is inactive: ${topic.name || topic._id}`);
  }
  if (
    topic &&
    subject &&
    String(topic.subjectId) !== String(subject._id)
  ) {
    reasons.push(`topic does not belong to subject: ${topic.name || topic._id}`);
  }

  return { subject, topic, reasons };
}

/**
 * Pre-fetch subject + topic catalogs so dry-run / commit don't hit Mongo
 * once per row. Indexed by `_id` and lowercase subject name (global name
 * uniqueness) and by `${subjectId}::topicName` for topics.
 */
async function buildLookupCaches() {
  const [subjects, topics] = await Promise.all([
    Subject.find({}, {
      _id: 1,
      name: 1,
      isActive: 1,
      postId: 1,
    })
      .lean()
      .exec(),
    Topic.find({}, {
      _id: 1,
      name: 1,
      isActive: 1,
      subjectId: 1,
    })
      .lean()
      .exec(),
  ]);
  const subjectById = new Map();
  const subjectByName = new Map();
  for (const s of subjects) {
    subjectById.set(String(s._id), s);
    subjectByName.set(String(s.name || '').toLowerCase(), s);
  }
  const topicById = new Map();
  const topicBySubjectAndName = new Map();
  for (const t of topics) {
    topicById.set(String(t._id), t);
    topicBySubjectAndName.set(
      `${String(t.subjectId)}::${String(t.name || '').toLowerCase()}`,
      t
    );
  }
  return { subjectById, subjectByName, topicById, topicBySubjectAndName };
}

function validateRowShape(raw) {
  const reasons = [];

  const questionText = String(raw.questionText || '').trim();
  if (!questionText) reasons.push('questionText is required');
  if (questionText.length > 5000) {
    reasons.push('questionText is too long (max 5000 chars)');
  }

  const options = ['optionA', 'optionB', 'optionC', 'optionD'].map((k) =>
    String(raw[k] ?? '').trim()
  );
  if (options.some((o) => !o)) {
    reasons.push('all four options (optionA..optionD) are required');
  }
  // Forbid duplicate option text — confuses students and breaks "tap A vs C".
  const optionSet = new Set(options.filter(Boolean).map((o) => o.toLowerCase()));
  if (
    optionSet.size > 0 &&
    optionSet.size !== options.filter(Boolean).length
  ) {
    reasons.push('options must be unique within a question');
  }

  const correctIndexes = parseCorrectAnswer(raw.correctAnswer, options.length);
  if (correctIndexes === null) {
    reasons.push(
      'correctAnswer must be one or more of A,B,C,D (or 0..3) — got: ' +
        String(raw.correctAnswer ?? '')
    );
  } else if (correctIndexes.length === 0) {
    reasons.push('correctAnswer is required');
  }

  const difficulty = raw.difficulty
    ? String(raw.difficulty).trim().toLowerCase()
    : DIFFICULTY.MEDIUM;
  if (!DIFFICULTY_VALUES.includes(difficulty)) {
    reasons.push(
      `difficulty must be one of: ${DIFFICULTY_VALUES.join(', ')}`
    );
  }

  const yearRaw = String(raw.year ?? '').trim();
  let year = null;
  if (yearRaw) {
    const y = Number(yearRaw);
    if (!Number.isInteger(y) || y < 1900 || y > 2100) {
      reasons.push('year must be an integer 1900..2100');
    } else {
      year = y;
    }
  }

  const questionImage = String(raw.questionImage || '').trim();
  if (questionImage) {
    try {
      const u = new URL(questionImage);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        reasons.push('questionImage must be a valid http(s) URL');
      }
    } catch {
      reasons.push('questionImage must be a valid http(s) URL');
    }
  }

  const questionType = inferQuestionType(
    raw.questionType,
    correctIndexes || [],
    Boolean(questionImage)
  );

  if (
    correctIndexes &&
    correctIndexes.length > 0 &&
    questionType === QUESTION_TYPES.SINGLE_CORRECT &&
    correctIndexes.length !== 1
  ) {
    reasons.push(
      'single_correct rows must have exactly one correctAnswer (got ' +
        correctIndexes.length +
        ')'
    );
  }
  if (
    correctIndexes &&
    questionType === QUESTION_TYPES.MULTIPLE_CORRECT &&
    correctIndexes.length < 2
  ) {
    reasons.push('multiple_correct rows need at least two correctAnswer entries');
  }
  if (questionType === QUESTION_TYPES.IMAGE_BASED && !questionImage) {
    reasons.push('image_based rows require a questionImage URL');
  }

  const csvPostIds = [];
  const postIdsColumn = String(raw.postIds ?? '').trim();
  if (postIdsColumn) {
    for (const tok of postIdsColumn.split(/[,;]+/)) {
      const t = tok.trim();
      if (!t) continue;
      if (!mongoose.isValidObjectId(t)) {
        reasons.push(`invalid post id in postIds column: ${t}`);
      } else {
        csvPostIds.push(t);
      }
    }
  }

  return {
    reasons,
    parsed: {
      questionText,
      options,
      correctIndexes: correctIndexes || [],
      difficulty,
      year,
      questionImage,
      questionType,
      explanation: String(raw.explanation || '').trim(),
      csvPostIds: [...new Set(csvPostIds)],
    },
  };
}

/**
 * Dry-run + commit share most of the work. Returns:
 *   {
 *     summary: { total, valid, invalid, duplicates },
 *     rows: [
 *       { line, status: 'valid' | 'invalid' | 'duplicate',
 *         questionText, subject, topic, difficulty,
 *         reasons?: string[],         // when invalid
 *         duplicateOfId?: string,     // when duplicate
 *         payload?: object,           // present iff `status === 'valid'`
 *       }
 *     ]
 *   }
 *
 * For commit we feed the `valid` rows' payloads into bulkInsertMany.
 */
export async function analyzeRows(parsedRows, { tagPostIds = [] } = {}) {
  const caches = await buildLookupCaches();
  const subjectIdsTouched = new Set();
  const seenInBatch = new Map(); // normalized text + subjectId → first row line

  const rowsOut = [];
  let valid = 0;
  let invalid = 0;
  let duplicates = 0;

  for (const { line, raw } of parsedRows) {
    const { reasons: shapeReasons, parsed } = validateRowShape(raw);

    let subject = null;
    let topic = null;
    let resolveReasons = [];
    if (parsed.questionText && parsed.options.every((o) => !!o)) {
      const r = await resolveSubjectAndTopic({
        subjectRaw: raw.subject,
        topicRaw: raw.topic,
        caches,
      });
      subject = r.subject;
      topic = r.topic;
      resolveReasons = r.reasons;
    } else if (raw.subject || raw.topic) {
      // Still resolve so admins see the full set of issues, not one at a time.
      const r = await resolveSubjectAndTopic({
        subjectRaw: raw.subject,
        topicRaw: raw.topic,
        caches,
      });
      subject = r.subject;
      topic = r.topic;
      resolveReasons = r.reasons;
    }

    let reasons = [...shapeReasons, ...resolveReasons];

    let mergedPostIdStrings = [];
    if (!reasons.length && subject && topic) {
      mergedPostIdStrings = mergeQuestionImportPostIds({
        csvPostIds: parsed.csvPostIds || [],
        tagPostIds,
        legacySubjectPostId: subject.postId,
      });
      if (mergedPostIdStrings.length > 0) {
        const ok = await postRepository.existsAllIds(
          mergedPostIdStrings.map((id) => new mongoose.Types.ObjectId(id))
        );
        if (!ok) {
          reasons = [...reasons, 'one or more post ids are invalid'];
        }
      }
    }

    if (reasons.length) {
      rowsOut.push({
        line,
        status: 'invalid',
        questionText: parsed.questionText,
        subject: subject ? { _id: String(subject._id), name: subject.name } : null,
        topic: topic ? { _id: String(topic._id), name: topic.name } : null,
        difficulty: parsed.difficulty,
        reasons,
      });
      invalid += 1;
      continue;
    }

    // Duplicate detection (within-batch first, then DB).
    const dedupKey = `${String(subject._id)}::${normalizeForDuplicate(parsed.questionText)}`;
    if (seenInBatch.has(dedupKey)) {
      rowsOut.push({
        line,
        status: 'duplicate',
        questionText: parsed.questionText,
        subject: { _id: String(subject._id), name: subject.name },
        topic: { _id: String(topic._id), name: topic.name },
        difficulty: parsed.difficulty,
        duplicateOfLine: seenInBatch.get(dedupKey),
        duplicateOfId: null,
      });
      duplicates += 1;
      continue;
    }

    const dbDup = await questionRepository.findExactDuplicate({
      questionText: parsed.questionText,
      subjectId: subject._id,
    });
    if (dbDup) {
      // Attach payload here too so a `forceImportDuplicates` commit can
      // promote this row back to `valid` without re-running analysis.
      // The controller strips `payload` from the wire response.
      const payload = buildInsertPayload({
        parsed,
        subject,
        topic,
        mergedPostIdStrings,
      });
      rowsOut.push({
        line,
        status: 'duplicate',
        questionText: parsed.questionText,
        subject: { _id: String(subject._id), name: subject.name },
        topic: { _id: String(topic._id), name: topic.name },
        difficulty: parsed.difficulty,
        duplicateOfId: String(dbDup._id),
        payload,
      });
      duplicates += 1;
      seenInBatch.set(dedupKey, line);
      continue;
    }

    seenInBatch.set(dedupKey, line);
    subjectIdsTouched.add(String(subject._id));

    const payload = buildInsertPayload({
      parsed,
      subject,
      topic,
      mergedPostIdStrings,
    });
    rowsOut.push({
      line,
      status: 'valid',
      questionText: parsed.questionText,
      subject: { _id: String(subject._id), name: subject.name },
      topic: { _id: String(topic._id), name: topic.name },
      difficulty: parsed.difficulty,
      payload,
    });
    valid += 1;
  }

  return {
    summary: {
      total: rowsOut.length,
      valid,
      invalid,
      duplicates,
    },
    rows: rowsOut,
  };
}

function buildInsertPayload({ parsed, subject, topic, mergedPostIdStrings }) {
  const correctAnswers = parsed.correctIndexes;
  const primary = correctAnswers[0];
  const postIds = (mergedPostIdStrings || []).map(
    (id) => new mongoose.Types.ObjectId(id)
  );
  return {
    questionText: parsed.questionText,
    options: parsed.options,
    questionType: parsed.questionType,
    questionImage: parsed.questionImage || '',
    correctAnswers,
    correctAnswerIndex: primary,
    correctAnswerValue: parsed.options[primary] || '',
    explanation: parsed.explanation || '',
    subjectId: subject._id,
    topicId: topic._id,
    postIds,
    year: parsed.year,
    difficulty: parsed.difficulty,
    isActive: true,
  };
}

/**
 * Insert the `valid` rows from `analyzeRows` in chunks. We chunk so a single
 * 5MB CSV doesn't ship one giant operation that times out on Render's
 * default network limits.
 */
export async function commitValidRows(rows, { chunkSize = 200 } = {}) {
  const validRows = rows.filter((r) => r.status === 'valid');
  if (validRows.length === 0) {
    return { inserted: 0, errors: [] };
  }
  let inserted = 0;
  const errors = [];
  for (let i = 0; i < validRows.length; i += chunkSize) {
    const chunk = validRows.slice(i, i + chunkSize);
    const payloads = chunk.map((r) => r.payload);
    const { insertedDocs, errors: chunkErrs } =
      await questionRepository.bulkInsertMany(payloads);
    inserted += insertedDocs.length;
    for (const err of chunkErrs) {
      const localIdx = typeof err.index === 'number' ? err.index : null;
      const row = localIdx != null ? chunk[localIdx] : null;
      errors.push({
        line: row?.line ?? null,
        message: err.message,
      });
    }
  }
  return { inserted, errors };
}
