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
import { prepareQuestionPresentation } from '../utils/questionPresentation.js';

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
  const raw = body.tagPostIds;
  const tokens = [];
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (entry == null || entry === '') continue;
      for (const t of String(entry).split(/[,;\s]+/)) {
        const s = t.trim();
        if (s) tokens.push(s);
      }
    }
  } else if (raw != null && String(raw).trim() !== '') {
    for (const t of String(raw).split(/[,;\s]+/)) {
      const s = t.trim();
      if (s) tokens.push(s);
    }
  }
  for (const s of tokens) {
    if (!mongoose.isValidObjectId(s)) {
      throw new AppError(`invalid post id in tagPostIds: ${s}`, HTTP_STATUS.BAD_REQUEST);
    }
    out.push(s);
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

function fileExtension(filename) {
  const s = String(filename || '');
  const i = s.lastIndexOf('.');
  return i >= 0 ? s.slice(i).toLowerCase() : '';
}

function bufferToUtf8(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new AppError('Import file is empty', HTTP_STATUS.BAD_REQUEST);
  }
  if (buffer.length === 0) {
    throw new AppError('Import file is empty', HTTP_STATUS.BAD_REQUEST);
  }
  return buffer.toString('utf8');
}

/**
 * Detect CSV vs JSONL vs JSON. Extension wins; otherwise sniff the buffer.
 * Unknown/empty sniff defaults to CSV so the existing importer stays unchanged.
 */
export function detectImportFormat(buffer, filename = '') {
  const ext = fileExtension(filename);
  if (ext === '.csv' || ext === '.txt') return 'csv';
  if (ext === '.jsonl' || ext === '.ndjson') return 'jsonl';
  if (ext === '.json') return 'json';
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return 'csv';
  const trimmed = buffer.toString('utf8').replace(/^\uFEFF/, '').trim();
  if (!trimmed) return 'csv';
  if (trimmed.startsWith('[')) return 'json';
  if (trimmed.startsWith('{')) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      return 'jsonl';
    }
  }
  return 'csv';
}

function asJsonObjectRecord(value, line) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return {
      line,
      raw: {},
      format: 'json',
      parseError: 'record must be a JSON object',
    };
  }
  return { line, raw: value, format: 'json' };
}

/**
 * One JSON object per line. Blank lines are skipped. A malformed line is
 * kept as an invalid row (does not abort the rest of the file).
 */
export function parseJsonlBuffer(buffer) {
  const text = bufferToUtf8(buffer).replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    try {
      const value = JSON.parse(trimmed);
      out.push(asJsonObjectRecord(value, lineNo));
    } catch (err) {
      out.push({
        line: lineNo,
        raw: {},
        format: 'json',
        parseError: `invalid JSON: ${err.message || 'parse error'}`,
      });
    }
  }
  if (!out.length) {
    throw new AppError(
      'JSONL file has no records. Each non-empty line must be one JSON object.',
      HTTP_STATUS.BAD_REQUEST
    );
  }
  return out;
}

/**
 * JSON array of questions, or a single question object.
 * File-level parse failure aborts (same as a corrupt CSV header).
 */
export function parseJsonBuffer(buffer) {
  const text = bufferToUtf8(buffer).replace(/^\uFEFF/, '').trim();
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new AppError(
      `JSON parse error: ${err.message || 'invalid format'}`,
      HTTP_STATUS.BAD_REQUEST
    );
  }
  if (Array.isArray(data)) {
    if (!data.length) {
      throw new AppError('JSON array has no records', HTTP_STATUS.BAD_REQUEST);
    }
    return data.map((item, i) => asJsonObjectRecord(item, i + 1));
  }
  if (data && typeof data === 'object') {
    return [asJsonObjectRecord(data, 1)];
  }
  throw new AppError(
    'JSON import must be an object or an array of objects',
    HTTP_STATUS.BAD_REQUEST
  );
}

export function parseImportBuffer(buffer, filename = '') {
  const kind = detectImportFormat(buffer, filename);
  if (kind === 'jsonl') return parseJsonlBuffer(buffer);
  if (kind === 'json') return parseJsonBuffer(buffer);
  return parseCsvBuffer(buffer);
}

function parseJsonPostIds(raw) {
  const reasons = [];
  const ids = [];
  const value = raw?.postIds;
  const tokens = [];
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (entry == null || entry === '') continue;
      tokens.push(String(entry).trim());
    }
  } else if (value != null && String(value).trim() !== '') {
    for (const tok of String(value).split(/[,;]+/)) {
      const t = tok.trim();
      if (t) tokens.push(t);
    }
  }
  for (const t of tokens) {
    if (!mongoose.isValidObjectId(t)) {
      reasons.push(`invalid post id in postIds: ${t}`);
    } else {
      ids.push(t);
    }
  }
  return { reasons, csvPostIds: [...new Set(ids)] };
}

function parseJsonOptions(raw) {
  if (Array.isArray(raw?.options)) {
    return raw.options.map((o) => (o == null ? '' : String(o).trim()));
  }
  return ['optionA', 'optionB', 'optionC', 'optionD'].map((k) =>
    String(raw?.[k] ?? '').trim()
  );
}

function parseJsonCorrectIndexes(raw, optionsLen) {
  if (Object.prototype.hasOwnProperty.call(raw || {}, 'correctAnswers')
    && raw.correctAnswers != null
    && raw.correctAnswers !== '') {
    if (!Array.isArray(raw.correctAnswers)) {
      return {
        indexes: null,
        reason: 'correctAnswers must be an array of option indexes',
      };
    }
    if (raw.correctAnswers.length === 0) {
      return { indexes: [], reason: null };
    }
    const indexes = [];
    for (const tok of raw.correctAnswers) {
      const num = Number(tok);
      if (!Number.isInteger(num) || num < 0 || num >= optionsLen) {
        return {
          indexes: null,
          reason: `correctAnswers contains an invalid option index: ${tok}`,
        };
      }
      indexes.push(num);
    }
    return { indexes: Array.from(new Set(indexes)).sort((a, b) => a - b), reason: null };
  }
  const fromLegacy = parseCorrectAnswer(raw?.correctAnswer, optionsLen);
  if (fromLegacy === null) {
    return {
      indexes: null,
      reason:
        'correctAnswer must be one or more of A,B,C,D (or 0-based indexes) — got: ' +
        String(raw?.correctAnswer ?? ''),
    };
  }
  return { indexes: fromLegacy, reason: null };
}

/**
 * Shape + presentation validation for one JSON/JSONL record.
 * Reuses Phase 1 `prepareQuestionPresentation` (single flatten implementation).
 * Does not derive questionType from presentationKind.
 */
export function validateJsonRecordShape(raw) {
  const reasons = [];
  let presentationKind = 'plain';
  let questionText = '';
  let content;

  try {
    const prepared = prepareQuestionPresentation({
      presentationKind: raw?.presentationKind,
      content: raw?.content,
      questionText: raw?.questionText,
    });
    presentationKind = prepared.presentationKind;
    questionText = prepared.questionText;
    content = prepared.content;
  } catch (err) {
    reasons.push(err.message || 'invalid presentation');
    presentationKind = String(raw?.presentationKind || '').trim() || 'plain';
    questionText = String(raw?.questionText || '').trim();
    content = undefined;
  }

  const options = parseJsonOptions(raw);
  if (options.length < 2) {
    reasons.push('options must contain at least two entries');
  }
  if (options.some((o) => !o)) {
    reasons.push('each option must be a non-empty string');
  }
  const optionSet = new Set(options.filter(Boolean).map((o) => o.toLowerCase()));
  if (optionSet.size > 0 && optionSet.size !== options.filter(Boolean).length) {
    reasons.push('options must be unique within a question');
  }

  const { indexes: correctIndexes, reason: correctReason } = parseJsonCorrectIndexes(
    raw,
    options.length
  );
  if (correctReason) reasons.push(correctReason);
  else if (!correctIndexes || correctIndexes.length === 0) {
    reasons.push('correctAnswers or correctAnswer is required');
  }

  const difficulty = raw?.difficulty
    ? String(raw.difficulty).trim().toLowerCase()
    : DIFFICULTY.MEDIUM;
  if (!DIFFICULTY_VALUES.includes(difficulty)) {
    reasons.push(`difficulty must be one of: ${DIFFICULTY_VALUES.join(', ')}`);
  }

  const yearRaw = raw?.year;
  let year = null;
  if (yearRaw != null && String(yearRaw).trim() !== '') {
    const y = Number(yearRaw);
    if (!Number.isInteger(y) || y < 1900 || y > 2100) {
      reasons.push('year must be an integer 1900..2100');
    } else {
      year = y;
    }
  }

  const questionImage = String(raw?.questionImage || '').trim();
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

  const rawType = String(raw?.questionType || '').trim().toLowerCase();
  if (rawType && !QUESTION_TYPE_VALUES.includes(rawType)) {
    reasons.push(`questionType must be one of: ${QUESTION_TYPE_VALUES.join(', ')}`);
  }

  const questionType = inferQuestionType(
    raw?.questionType,
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
      'correctAnswers must contain exactly one index for single_correct'
    );
  }
  if (
    correctIndexes &&
    questionType === QUESTION_TYPES.MULTIPLE_CORRECT &&
    correctIndexes.length < 2
  ) {
    reasons.push('multiple_correct questions need at least two correct answers');
  }
  if (questionType === QUESTION_TYPES.IMAGE_BASED && !questionImage) {
    reasons.push('image_based questions require a questionImage URL');
  }

  const postParsed = parseJsonPostIds(raw);
  reasons.push(...postParsed.reasons);

  return {
    reasons,
    parsed: {
      questionText: questionText || '',
      options,
      correctIndexes: correctIndexes || [],
      difficulty,
      year,
      questionImage,
      questionType,
      explanation: String(raw?.explanation || '').trim(),
      csvPostIds: postParsed.csvPostIds,
      presentationKind,
      content,
    },
  };
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

  for (const { line, raw, format, parseError } of parsedRows) {
    if (parseError) {
      rowsOut.push({
        line,
        status: 'invalid',
        questionText: '',
        subject: null,
        topic: null,
        difficulty: null,
        reasons: [parseError],
      });
      invalid += 1;
      continue;
    }

    const { reasons: shapeReasons, parsed } =
      format === 'json' ? validateJsonRecordShape(raw) : validateRowShape(raw);

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
  const payload = {
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
  // CSV rows omit these fields so inserts stay identical to the existing importer.
  // JSONL/JSON rows set presentationKind (and content for structured kinds).
  if (parsed.presentationKind) {
    payload.presentationKind = parsed.presentationKind;
  }
  if (parsed.content != null) {
    payload.content = parsed.content;
  }
  return payload;
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
