/**
 * Client-side presentation resolver for question stems.
 * Does not parse questionText and does not affect scoring.
 *
 * Missing/unknown presentationKind, or invalid content, always falls back to
 * plain questionText so legacy questions keep working.
 */

export const PRESENTATION_KINDS = Object.freeze({
  PLAIN: 'plain',
  TWO_STATEMENTS: 'two_statements',
  NUMBERED_LIST: 'numbered_list',
  TABLE: 'table',
});

const STRUCTURED_KINDS = new Set([
  PRESENTATION_KINDS.TWO_STATEMENTS,
  PRESENTATION_KINDS.NUMBERED_LIST,
  PRESENTATION_KINDS.TABLE,
]);

const MAX_TABLE_COLUMNS = 8;
const MAX_TABLE_ROWS = 20;

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function plainFallbackText(question, { fallbackLabel, emptyAsFallback }) {
  const raw = question?.questionText;
  if (emptyAsFallback) {
    return raw || fallbackLabel;
  }
  if (raw == null) return fallbackLabel;
  return raw;
}

function parseTwoStatements(content) {
  if (!isPlainObject(content)) return null;
  const statementsRaw = content.statements;
  if (!Array.isArray(statementsRaw) || statementsRaw.length !== 2) return null;
  const statements = [];
  for (const row of statementsRaw) {
    if (!isPlainObject(row)) return null;
    if (typeof row.label !== 'string') return null;
    const label = row.label.trim();
    if (!label) return null;
    if (typeof row.text !== 'string') return null;
    statements.push({ label, text: row.text.trim() });
  }
  return {
    intro: asTrimmedString(content.intro),
    statements,
    prompt: asTrimmedString(content.prompt),
  };
}

function parseNumberedList(content) {
  if (!isPlainObject(content)) return null;
  const itemsRaw = content.items;
  if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) return null;
  const items = [];
  for (const row of itemsRaw) {
    if (!isPlainObject(row)) return null;
    const n = Number(row.n);
    if (!Number.isInteger(n)) return null;
    if (typeof row.text !== 'string') return null;
    items.push({ n, text: row.text.trim() });
  }
  return {
    intro: asTrimmedString(content.intro),
    items,
    prompt: asTrimmedString(content.prompt),
  };
}

function parseTableCell(cell) {
  if (cell == null) return '';
  if (typeof cell === 'string') return cell.trim();
  if (typeof cell === 'number' && Number.isFinite(cell)) return String(cell);
  return null;
}

function parseTable(content) {
  if (!isPlainObject(content)) return null;
  const columnsRaw = content.columns;
  if (
    !Array.isArray(columnsRaw) ||
    columnsRaw.length < 1 ||
    columnsRaw.length > MAX_TABLE_COLUMNS
  ) {
    return null;
  }
  const columns = [];
  for (const col of columnsRaw) {
    if (typeof col !== 'string') return null;
    columns.push(col.trim());
  }
  const rowsRaw = content.rows;
  if (!Array.isArray(rowsRaw) || rowsRaw.length < 1 || rowsRaw.length > MAX_TABLE_ROWS) {
    return null;
  }
  const rows = [];
  for (const row of rowsRaw) {
    if (!Array.isArray(row) || row.length !== columns.length) return null;
    const cells = [];
    for (const cell of row) {
      const parsed = parseTableCell(cell);
      if (parsed == null) return null;
      cells.push(parsed);
    }
    rows.push(cells);
  }
  return {
    intro: asTrimmedString(content.intro),
    columns,
    rows,
    prompt: asTrimmedString(content.prompt),
  };
}

/**
 * @param {object|null|undefined} question
 * @param {{ fallbackLabel?: string, emptyAsFallback?: boolean }} [options]
 * @returns {{
 *   kind: string,
 *   text?: string,
 *   intro?: string,
 *   prompt?: string,
 *   statements?: { label: string, text: string }[],
 *   items?: { n: number, text: string }[],
 *   columns?: string[],
 *   rows?: string[][],
 * }}
 */
export function resolveQuestionPresentation(question, options = {}) {
  const fallbackLabel =
    typeof options.fallbackLabel === 'string' && options.fallbackLabel
      ? options.fallbackLabel
      : '(question unavailable)';
  const emptyAsFallback = options.emptyAsFallback === true;
  const fallback = {
    kind: PRESENTATION_KINDS.PLAIN,
    text: plainFallbackText(question, { fallbackLabel, emptyAsFallback }),
  };

  const rawKind =
    typeof question?.presentationKind === 'string' ? question.presentationKind.trim() : '';
  const kind = rawKind || PRESENTATION_KINDS.PLAIN;

  if (!STRUCTURED_KINDS.has(kind)) {
    return fallback;
  }

  if (kind === PRESENTATION_KINDS.TWO_STATEMENTS) {
    const parsed = parseTwoStatements(question.content);
    if (!parsed) {
      return {
        kind: PRESENTATION_KINDS.PLAIN,
        text: fallback.text || fallbackLabel,
      };
    }
    return { kind, ...parsed };
  }

  if (kind === PRESENTATION_KINDS.NUMBERED_LIST) {
    const parsed = parseNumberedList(question.content);
    if (!parsed) {
      return {
        kind: PRESENTATION_KINDS.PLAIN,
        text: fallback.text || fallbackLabel,
      };
    }
    return { kind, ...parsed };
  }

  if (kind === PRESENTATION_KINDS.TABLE) {
    const parsed = parseTable(question.content);
    if (!parsed) {
      return {
        kind: PRESENTATION_KINDS.PLAIN,
        text: fallback.text || fallbackLabel,
      };
    }
    return { kind, ...parsed };
  }

  return fallback;
}
