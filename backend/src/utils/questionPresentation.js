/**
 * Presentation (how the stem is structured) is separate from questionType
 * (how answers are scored). Existing questions without these fields are `plain`.
 */
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from './AppError.js';

export const PRESENTATION_KINDS = Object.freeze({
  PLAIN: 'plain',
  TWO_STATEMENTS: 'two_statements',
  NUMBERED_LIST: 'numbered_list',
  TABLE: 'table',
});

export const PRESENTATION_KIND_VALUES = Object.values(PRESENTATION_KINDS);

const MAX_INTRO = 4000;
const MAX_PROMPT = 4000;
const MAX_LABEL = 120;
const MAX_CELL = 4000;
const MAX_STATEMENTS = 2;
const MIN_STATEMENTS = 2;
const MAX_ITEMS = 20;
const MIN_ITEMS = 2;
const MAX_COLUMNS = 8;
const MIN_COLUMNS = 1;
const MAX_ROWS = 20;
const MIN_ROWS = 1;

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizePresentationKind(raw) {
  const kind = typeof raw === 'string' ? raw.trim() : '';
  if (!kind) return PRESENTATION_KINDS.PLAIN;
  if (!PRESENTATION_KIND_VALUES.includes(kind)) {
    throw new AppError(
      `presentationKind must be one of: ${PRESENTATION_KIND_VALUES.join(', ')}`,
      HTTP_STATUS.BAD_REQUEST
    );
  }
  return kind;
}

function requireString(name, value, { max, required = true } = {}) {
  if (value == null || value === '') {
    if (!required) return '';
    throw new AppError(`${name} is required`, HTTP_STATUS.BAD_REQUEST);
  }
  if (typeof value !== 'string') {
    throw new AppError(`${name} must be a string`, HTTP_STATUS.BAD_REQUEST);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    if (!required) return '';
    throw new AppError(`${name} is required`, HTTP_STATUS.BAD_REQUEST);
  }
  if (max && trimmed.length > max) {
    throw new AppError(`${name} is too long (max ${max} characters)`, HTTP_STATUS.BAD_REQUEST);
  }
  return trimmed;
}

function optionalString(name, value, max) {
  if (value == null || value === '') return '';
  return requireString(name, value, { max, required: true });
}

function cloneJson(value) {
  if (value == null) return null;
  return JSON.parse(JSON.stringify(value));
}

function sanitizeTwoStatements(content) {
  const statementsRaw = content?.statements;
  if (!Array.isArray(statementsRaw) || statementsRaw.length !== MAX_STATEMENTS) {
    throw new AppError(
      `two_statements content.statements must contain exactly ${MIN_STATEMENTS} items`,
      HTTP_STATUS.BAD_REQUEST
    );
  }
  const statements = statementsRaw.map((row, i) => {
    if (!row || typeof row !== 'object') {
      throw new AppError(`statements[${i}] must be an object`, HTTP_STATUS.BAD_REQUEST);
    }
    return {
      label: requireString(`statements[${i}].label`, row.label, { max: MAX_LABEL }),
      text: requireString(`statements[${i}].text`, row.text, { max: MAX_CELL }),
    };
  });
  const out = { statements };
  const intro = optionalString('content.intro', content.intro, MAX_INTRO);
  const prompt = optionalString('content.prompt', content.prompt, MAX_PROMPT);
  if (intro) out.intro = intro;
  if (prompt) out.prompt = prompt;
  return out;
}

function sanitizeNumberedList(content) {
  const itemsRaw = content?.items;
  if (!Array.isArray(itemsRaw) || itemsRaw.length < MIN_ITEMS || itemsRaw.length > MAX_ITEMS) {
    throw new AppError(
      `numbered_list content.items must contain ${MIN_ITEMS}–${MAX_ITEMS} items`,
      HTTP_STATUS.BAD_REQUEST
    );
  }
  const items = itemsRaw.map((row, i) => {
    if (!row || typeof row !== 'object') {
      throw new AppError(`items[${i}] must be an object`, HTTP_STATUS.BAD_REQUEST);
    }
    const n = Number(row.n);
    if (!Number.isInteger(n) || n < 1) {
      throw new AppError(`items[${i}].n must be a positive integer`, HTTP_STATUS.BAD_REQUEST);
    }
    return {
      n,
      text: requireString(`items[${i}].text`, row.text, { max: MAX_CELL }),
    };
  });
  const out = { items };
  const intro = optionalString('content.intro', content.intro, MAX_INTRO);
  const prompt = optionalString('content.prompt', content.prompt, MAX_PROMPT);
  if (intro) out.intro = intro;
  if (prompt) out.prompt = prompt;
  return out;
}

function sanitizeTable(content) {
  const columnsRaw = content?.columns;
  if (
    !Array.isArray(columnsRaw) ||
    columnsRaw.length < MIN_COLUMNS ||
    columnsRaw.length > MAX_COLUMNS
  ) {
    throw new AppError(
      `table content.columns must contain ${MIN_COLUMNS}–${MAX_COLUMNS} strings`,
      HTTP_STATUS.BAD_REQUEST
    );
  }
  const columns = columnsRaw.map((col, i) =>
    requireString(`columns[${i}]`, col, { max: MAX_LABEL })
  );
  const rowsRaw = content?.rows;
  if (!Array.isArray(rowsRaw) || rowsRaw.length < MIN_ROWS || rowsRaw.length > MAX_ROWS) {
    throw new AppError(
      `table content.rows must contain ${MIN_ROWS}–${MAX_ROWS} rows`,
      HTTP_STATUS.BAD_REQUEST
    );
  }
  const rows = rowsRaw.map((row, i) => {
    if (!Array.isArray(row) || row.length !== columns.length) {
      throw new AppError(
        `rows[${i}] must be an array of ${columns.length} cells`,
        HTTP_STATUS.BAD_REQUEST
      );
    }
    return row.map((cell, j) => {
      if (cell == null) return '';
      if (typeof cell !== 'string') {
        throw new AppError(`rows[${i}][${j}] must be a string`, HTTP_STATUS.BAD_REQUEST);
      }
      const trimmed = cell.trim();
      if (trimmed.length > MAX_CELL) {
        throw new AppError(
          `rows[${i}][${j}] is too long (max ${MAX_CELL} characters)`,
          HTTP_STATUS.BAD_REQUEST
        );
      }
      return trimmed;
    });
  });
  const out = { columns, rows };
  const intro = optionalString('content.intro', content.intro, MAX_INTRO);
  const prompt = optionalString('content.prompt', content.prompt, MAX_PROMPT);
  if (intro) out.intro = intro;
  if (prompt) out.prompt = prompt;
  return out;
}

function isEmptyContent(content) {
  if (content == null) return true;
  if (typeof content !== 'object' || Array.isArray(content)) return false;
  return Object.keys(content).length === 0;
}

/**
 * Validate + sanitize presentation for write. Returns fields to persist.
 * Plain questions keep caller `questionText` and omit `content`.
 */
export function prepareQuestionPresentation({
  presentationKind: rawKind,
  content: rawContent,
  questionText: rawText,
} = {}) {
  const presentationKind = normalizePresentationKind(rawKind);

  if (presentationKind === PRESENTATION_KINDS.PLAIN) {
    if (!isEmptyContent(rawContent)) {
      throw new AppError(
        'content is only allowed when presentationKind is a structured kind',
        HTTP_STATUS.BAD_REQUEST
      );
    }
    const questionText = requireString('questionText', rawText, { max: 20000 });
    return { presentationKind, content: undefined, questionText };
  }

  if (rawContent == null || typeof rawContent !== 'object' || Array.isArray(rawContent)) {
    throw new AppError('content is required for structured presentations', HTTP_STATUS.BAD_REQUEST);
  }

  let content;
  if (presentationKind === PRESENTATION_KINDS.TWO_STATEMENTS) {
    content = sanitizeTwoStatements(rawContent);
  } else if (presentationKind === PRESENTATION_KINDS.NUMBERED_LIST) {
    content = sanitizeNumberedList(rawContent);
  } else if (presentationKind === PRESENTATION_KINDS.TABLE) {
    content = sanitizeTable(rawContent);
  } else {
    throw new AppError(
      `presentationKind must be one of: ${PRESENTATION_KIND_VALUES.join(', ')}`,
      HTTP_STATUS.BAD_REQUEST
    );
  }

  const questionText = flattenQuestionContentToText(presentationKind, content);
  if (!questionText) {
    throw new AppError('Structured content produced empty questionText', HTTP_STATUS.BAD_REQUEST);
  }
  return { presentationKind, content, questionText };
}

/**
 * Canonical stem used by soft duplicate detection (same text the write path stores).
 * Plain → trimmed questionText. Structured → flatten after prepare, or '' if invalid.
 * Unknown/missing kind is treated as plain. Does not affect scoring.
 */
export function canonicalDuplicateStem({
  presentationKind: rawKind,
  content,
  questionText,
} = {}) {
  let kind = PRESENTATION_KINDS.PLAIN;
  try {
    kind = normalizePresentationKind(rawKind);
  } catch {
    kind = PRESENTATION_KINDS.PLAIN;
  }
  if (kind === PRESENTATION_KINDS.PLAIN) {
    return asTrimmedString(questionText);
  }
  try {
    return prepareQuestionPresentation({
      presentationKind: kind,
      content,
      questionText,
    }).questionText;
  } catch {
    return '';
  }
}

/**
 * Flatten structured content into readable questionText for old clients.
 * Preserves statement labels from source (e.g. "Statement – I").
 */
export function flattenQuestionContentToText(presentationKind, content) {
  const kind = typeof presentationKind === 'string' ? presentationKind.trim() : '';
  if (!kind || kind === PRESENTATION_KINDS.PLAIN || !content || typeof content !== 'object') {
    return '';
  }

  const intro = asTrimmedString(content.intro);
  const body = [];

  if (kind === PRESENTATION_KINDS.TWO_STATEMENTS && Array.isArray(content.statements)) {
    for (const row of content.statements) {
      const label = asTrimmedString(row?.label);
      const text = asTrimmedString(row?.text);
      if (label && text) body.push(`${label}: ${text}`);
      else if (text) body.push(text);
    }
  } else if (kind === PRESENTATION_KINDS.NUMBERED_LIST && Array.isArray(content.items)) {
    for (const row of content.items) {
      const text = asTrimmedString(row?.text);
      if (!text) continue;
      const n = Number(row?.n);
      body.push(Number.isInteger(n) ? `${n}. ${text}` : text);
    }
  } else if (kind === PRESENTATION_KINDS.TABLE) {
    const columns = Array.isArray(content.columns)
      ? content.columns.map((c) => asTrimmedString(c))
      : [];
    if (columns.some(Boolean)) body.push(columns.join(' | '));
    if (Array.isArray(content.rows)) {
      for (const row of content.rows) {
        const cells = Array.isArray(row) ? row.map((c) => asTrimmedString(c)) : [];
        if (cells.length) body.push(cells.join(' | '));
      }
    }
  }

  const prompt = asTrimmedString(content.prompt);
  const sections = [];
  if (intro) sections.push(intro);
  if (body.length) sections.push(body.join('\n'));
  if (prompt) sections.push(prompt);
  return sections.join('\n\n');
}

/** Fields to copy onto snapshots / public-ish review docs. */
export function presentationFieldsFromQuestion(q) {
  let presentationKind = PRESENTATION_KINDS.PLAIN;
  try {
    presentationKind = normalizePresentationKind(q?.presentationKind);
  } catch {
    presentationKind = PRESENTATION_KINDS.PLAIN;
  }
  const content =
    presentationKind === PRESENTATION_KINDS.PLAIN ? null : cloneJson(q?.content);
  return { presentationKind, content };
}
