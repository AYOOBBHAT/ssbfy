import mongoose from 'mongoose';
import { questionService } from '../services/questionService.js';
import {
  parseCsvBuffer,
  analyzeRows,
  commitValidRows,
  CSV_TEMPLATE,
  parseImportTagPostIds,
} from '../services/questionImportService.js';
import { postRepository } from '../repositories/postRepository.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../utils/response.js';

async function validateImportTagPostsExist(tagPostIds) {
  if (!tagPostIds?.length) return;
  const ok = await postRepository.existsAllIds(
    tagPostIds.map((id) => new mongoose.Types.ObjectId(id))
  );
  if (!ok) {
    throw new AppError(
      'One or more tag post ids were not found',
      HTTP_STATUS.BAD_REQUEST
    );
  }
}

export const questionController = {
  adminList: asyncHandler(async (req, res) => {
    const payload = await questionService.adminList(req.query);
    return sendSuccess(res, payload, 'Questions');
  }),

  getByIdForAdmin: asyncHandler(async (req, res) => {
    const question = await questionService.getByIdForAdmin(req.params.id);
    return sendSuccess(res, { question }, 'Question');
  }),

  list: asyncHandler(async (req, res) => {
    const rawIds = req.query.ids;
    if (rawIds !== undefined && rawIds !== null && String(rawIds).trim() !== '') {
      const idTokens = String(rawIds)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const { questions, total, limit, skip } = await questionService.listByIds(idTokens);
      return sendSuccess(res, { questions, total, limit, skip }, 'Questions');
    }

    const { questions, total, limit, skip } = await questionService.list(req.query);
    return sendSuccess(res, { questions, total, limit, skip }, 'Questions');
  }),

  getById: asyncHandler(async (req, res) => {
    const question = await questionService.getById(req.params.id);
    return sendSuccess(res, { question }, 'Question');
  }),

  weakPractice: asyncHandler(async (req, res) => {
    // `topicIdList` was normalised by the validator from either a
    // comma-separated string or a repeated query param.
    const topicIds = req.query.topicIdList || [];
    const limit = req.query.limit ?? 10;
    const { questions } = await questionService.weakPractice({ topicIds, limit });
    return sendSuccess(res, { questions }, 'Weak-topic practice questions');
  }),

  smartPractice: asyncHandler(async (req, res) => {
    const { postId, subjectId, topicId, difficulty, limit } = req.body || {};
    const { questions } = await questionService.smartPractice({
      postId,
      subjectId,
      topicId,
      difficulty,
      limit: limit ?? 10,
    });
    return sendSuccess(res, { questions }, 'Smart practice questions');
  }),

  create: asyncHandler(async (req, res) => {
    const question = await questionService.create(req.body);
    return sendCreated(res, { question }, 'Question created');
  }),

  update: asyncHandler(async (req, res) => {
    const question = await questionService.update(req.params.id, req.body);
    return sendSuccess(res, { question }, 'Question updated');
  }),

  bulkSetStatus: asyncHandler(async (req, res) => {
    const { ids, isActive } = req.body || {};
    const result = await questionService.bulkSetStatus({ ids, isActive });
    return sendSuccess(res, result, 'Bulk status updated');
  }),

  findSimilar: asyncHandler(async (req, res) => {
    const { questionText, subjectId, excludeId } = req.query || {};
    const result = await questionService.findSimilar({
      questionText,
      subjectId,
      excludeId: excludeId || null,
    });
    return sendSuccess(res, result, 'Similar questions');
  }),

  getUsage: asyncHandler(async (req, res) => {
    const usage = await questionService.getUsage(req.params.id);
    return sendSuccess(res, { usage }, 'Question usage');
  }),

  /** GET /questions/admin/import/template — downloadable CSV template. */
  importTemplate: asyncHandler(async (_req, res) => {
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${CSV_TEMPLATE.filename}"`
    );
    res.setHeader('Content-Type', CSV_TEMPLATE.contentType);
    return res.status(HTTP_STATUS.OK).send(CSV_TEMPLATE.body);
  }),

  /**
   * POST /questions/admin/import/dry-run — multipart CSV, no writes.
   * Returns row-by-row analysis the admin can review before committing.
   */
  importDryRun: asyncHandler(async (req, res) => {
    if (!req.file?.buffer) {
      throw new AppError('CSV file is required', HTTP_STATUS.BAD_REQUEST);
    }
    const parsed = parseCsvBuffer(req.file.buffer);
    const tagPostIds = parseImportTagPostIds(req.body);
    await validateImportTagPostsExist(tagPostIds);
    const analysis = await analyzeRows(parsed, { tagPostIds });
    // Strip per-row insert payloads from the wire response — the client doesn't
    // need them and they balloon the JSON for big imports. The commit endpoint
    // re-derives payloads from the same CSV.
    const rowsForWire = analysis.rows.map(({ payload, ...rest }) => rest);
    return sendSuccess(
      res,
      { summary: analysis.summary, rows: rowsForWire },
      'Import preview'
    );
  }),

  /**
   * POST /questions/admin/import/commit — multipart CSV, writes valid rows.
   * Re-runs the same analysis server-side so we never trust client-supplied
   * payloads.
   */
  importCommit: asyncHandler(async (req, res) => {
    if (!req.file?.buffer) {
      throw new AppError('CSV file is required', HTTP_STATUS.BAD_REQUEST);
    }
    const force =
      String(req.body?.forceImportDuplicates || '').toLowerCase() === 'true';
    const parsed = parseCsvBuffer(req.file.buffer);
    const tagPostIds = parseImportTagPostIds(req.body);
    await validateImportTagPostsExist(tagPostIds);
    const analysis = await analyzeRows(parsed, { tagPostIds });

    let rowsForCommit = analysis.rows;
    if (force) {
      // Promote DB-side duplicates back to `valid`. We never promote in-batch
      // duplicates because the same import file claiming the same question
      // twice is always a mistake — admin has no way to "force" two rows
      // with literally identical text into one questionId.
      rowsForCommit = analysis.rows.map((r) => {
        if (r.status === 'duplicate' && r.duplicateOfId) {
          // Reconstruct the payload from the row we already validated.
          // We need topic/subject ids back; they're embedded in the row.
          return promoteDuplicateToValid(r);
        }
        return r;
      });
    }

    const { inserted, errors } = await commitValidRows(rowsForCommit);
    const summary = {
      ...analysis.summary,
      forceImportDuplicates: force,
      inserted,
      insertErrors: errors.length,
    };
    const rowsForWire = analysis.rows.map(({ payload, ...rest }) => rest);
    return sendSuccess(
      res,
      { summary, rows: rowsForWire, insertErrors: errors },
      'Import committed'
    );
  }),
};

/**
 * When the admin opts into `forceImportDuplicates`, take a DB-duplicate row
 * (which still has `payload` because `analyzeRows` ran the full validation
 * before the duplicate check) and re-tag it `valid` so it flows into
 * `commitValidRows`. The `payload` itself isn't on the wire row, but the
 * controller has access to the in-memory analysis object — see `importCommit`.
 *
 * Implementation note: we attach `payload` on every row in `analyzeRows`,
 * regardless of status, *only on the in-memory pass*. The wire trimming
 * happens in the controller after this promotion runs.
 */
function promoteDuplicateToValid(row) {
  if (!row || row.status !== 'duplicate') return row;
  if (!row.payload) return row; // safety: nothing to insert
  return { ...row, status: 'valid' };
}
