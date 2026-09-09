/**
 * Admin presentation form helpers.
 * Structured creates still omit questionText (backend generates it).
 * Flattening here is only for duplicate-detection lookup against stored stems.
 */

export const PRESENTATION_KINDS = Object.freeze({
  PLAIN: 'plain',
  TWO_STATEMENTS: 'two_statements',
  NUMBERED_LIST: 'numbered_list',
  TABLE: 'table',
});

export const PRESENTATION_OPTIONS = [
  { value: PRESENTATION_KINDS.PLAIN, label: 'Plain' },
  { value: PRESENTATION_KINDS.TWO_STATEMENTS, label: 'Two Statements' },
  { value: PRESENTATION_KINDS.NUMBERED_LIST, label: 'Numbered List' },
  { value: PRESENTATION_KINDS.TABLE, label: 'Table' },
];

export const MIN_NUMBERED_ITEMS = 2;
export const MAX_NUMBERED_ITEMS = 20;
export const MIN_TABLE_COLUMNS = 1;
export const MAX_TABLE_COLUMNS = 8;
export const MIN_TABLE_ROWS = 1;
export const MAX_TABLE_ROWS = 20;

export function emptyContentDraft() {
  return {
    intro: '',
    prompt: '',
    statements: [
      { label: 'Statement – I', text: '' },
      { label: 'Statement – II', text: '' },
    ],
    items: [
      { n: 1, text: '' },
      { n: 2, text: '' },
    ],
    columns: ['Column 1', 'Column 2'],
    rows: [
      ['', ''],
    ],
  };
}

export function normalizePresentationKind(raw) {
  const kind = typeof raw === 'string' ? raw.trim() : '';
  if (
    kind === PRESENTATION_KINDS.TWO_STATEMENTS ||
    kind === PRESENTATION_KINDS.NUMBERED_LIST ||
    kind === PRESENTATION_KINDS.TABLE
  ) {
    return kind;
  }
  return PRESENTATION_KINDS.PLAIN;
}

export function isStructuredPresentation(kind) {
  return normalizePresentationKind(kind) !== PRESENTATION_KINDS.PLAIN;
}

export const PRESENTATION_KIND_LABELS = Object.freeze({
  [PRESENTATION_KINDS.PLAIN]: 'Plain',
  [PRESENTATION_KINDS.TWO_STATEMENTS]: 'Two Statements',
  [PRESENTATION_KINDS.NUMBERED_LIST]: 'Numbered List',
  [PRESENTATION_KINDS.TABLE]: 'Table',
});

/** Missing/unknown kinds follow the same fallback as rendering: Plain. */
export function presentationKindLabel(kind) {
  return PRESENTATION_KIND_LABELS[normalizePresentationKind(kind)];
}

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Same flatten as backend `flattenQuestionContentToText` so duplicate lookup
 * matches the questionText stored on write. Admin still does not send this
 * as a stored field for structured creates.
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

/**
 * Stem sent to GET /questions/admin/similar. Empty until the form is valid
 * enough to flatten the same way the backend stores questionText.
 */
export function duplicateStemFromForm(form) {
  if (validatePresentation(form)) return '';
  const kind = normalizePresentationKind(form?.presentationKind);
  if (kind === PRESENTATION_KINDS.PLAIN) {
    return asString(form?.questionText).trim();
  }
  const payload = buildPresentationPayload(form);
  return flattenQuestionContentToText(kind, payload.content);
}

function asString(value) {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function parsePositiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

export function syncTableShape(content) {
  const columns = Array.isArray(content?.columns)
    ? content.columns.map((c) => asString(c))
    : ['Column 1'];
  const colCount = Math.max(MIN_TABLE_COLUMNS, Math.min(MAX_TABLE_COLUMNS, columns.length || 1));
  const nextCols = columns.slice(0, colCount);
  while (nextCols.length < colCount) nextCols.push(`Column ${nextCols.length + 1}`);
  const rowsRaw = Array.isArray(content?.rows) ? content.rows : [['']];
  const rows = rowsRaw.map((row) => {
    const cells = Array.isArray(row) ? row.map((c) => asString(c)) : [];
    while (cells.length < nextCols.length) cells.push('');
    return cells.slice(0, nextCols.length);
  });
  const safeRows = rows.length ? rows : [nextCols.map(() => '')];
  return { ...content, columns: nextCols, rows: safeRows };
}

export function contentDraftFromQuestion(q) {
  const draft = emptyContentDraft();
  const c = q?.content && typeof q.content === 'object' && !Array.isArray(q.content) ? q.content : {};
  if (typeof c.intro === 'string') draft.intro = c.intro;
  if (typeof c.prompt === 'string') draft.prompt = c.prompt;

  if (Array.isArray(c.statements) && c.statements.length === 2) {
    draft.statements = c.statements.map((row, i) => ({
      label: asString(row?.label) || draft.statements[i].label,
      text: asString(row?.text),
    }));
  }

  if (Array.isArray(c.items) && c.items.length >= MIN_NUMBERED_ITEMS) {
    draft.items = c.items.slice(0, MAX_NUMBERED_ITEMS).map((row, i) => ({
      n: parsePositiveInt(row?.n) ?? i + 1,
      text: asString(row?.text),
    }));
  }

  if (Array.isArray(c.columns) && c.columns.length >= MIN_TABLE_COLUMNS) {
    draft.columns = c.columns.slice(0, MAX_TABLE_COLUMNS).map((col) => asString(col));
    draft.rows = Array.isArray(c.rows) ? c.rows : draft.rows;
    Object.assign(draft, syncTableShape(draft));
  }

  return draft;
}

export function addNumberedItem(content) {
  const items = Array.isArray(content.items) ? [...content.items] : [];
  if (items.length >= MAX_NUMBERED_ITEMS) return content;
  const lastN = parsePositiveInt(items[items.length - 1]?.n);
  const n = lastN != null ? lastN + 1 : items.length + 1;
  return { ...content, items: [...items, { n, text: '' }] };
}

export function removeNumberedItem(content, index) {
  const items = Array.isArray(content.items) ? content.items.filter((_, i) => i !== index) : [];
  if (items.length < MIN_NUMBERED_ITEMS) return content;
  return { ...content, items };
}

export function addTableColumn(content) {
  const synced = syncTableShape(content);
  if (synced.columns.length >= MAX_TABLE_COLUMNS) return synced;
  return {
    ...synced,
    columns: [...synced.columns, `Column ${synced.columns.length + 1}`],
    rows: synced.rows.map((row) => [...row, '']),
  };
}

export function removeTableColumn(content, index) {
  const synced = syncTableShape(content);
  if (synced.columns.length <= MIN_TABLE_COLUMNS) return synced;
  if (index < 0 || index >= synced.columns.length) return synced;
  return {
    ...synced,
    columns: synced.columns.filter((_, i) => i !== index),
    rows: synced.rows.map((row) => row.filter((_, i) => i !== index)),
  };
}

export function addTableRow(content) {
  const synced = syncTableShape(content);
  if (synced.rows.length >= MAX_TABLE_ROWS) return synced;
  return {
    ...synced,
    rows: [...synced.rows, synced.columns.map(() => '')],
  };
}

export function removeTableRow(content, index) {
  const synced = syncTableShape(content);
  if (synced.rows.length <= MIN_TABLE_ROWS) return synced;
  if (index < 0 || index >= synced.rows.length) return synced;
  return {
    ...synced,
    rows: synced.rows.filter((_, i) => i !== index),
  };
}

function optionalTrimmed(value) {
  const s = asString(value).trim();
  return s || undefined;
}

export function validatePresentation(form) {
  const kind = normalizePresentationKind(form?.presentationKind);
  if (kind === PRESENTATION_KINDS.PLAIN) {
    if (!asString(form?.questionText).trim()) return 'Question text is required.';
    return null;
  }

  const content = form?.content || {};
  if (kind === PRESENTATION_KINDS.TWO_STATEMENTS) {
    const statements = Array.isArray(content.statements) ? content.statements : [];
    if (statements.length !== 2) return 'Two statements are required.';
    for (let i = 0; i < 2; i += 1) {
      if (!asString(statements[i]?.label).trim()) {
        return `Statement ${i + 1} label is required.`;
      }
      if (!asString(statements[i]?.text).trim()) {
        return `Statement ${i + 1} text is required.`;
      }
    }
    return null;
  }

  if (kind === PRESENTATION_KINDS.NUMBERED_LIST) {
    const items = Array.isArray(content.items) ? content.items : [];
    if (items.length < MIN_NUMBERED_ITEMS || items.length > MAX_NUMBERED_ITEMS) {
      return `Numbered list needs ${MIN_NUMBERED_ITEMS}–${MAX_NUMBERED_ITEMS} items.`;
    }
    for (let i = 0; i < items.length; i += 1) {
      if (parsePositiveInt(items[i]?.n) == null) {
        return `Item ${i + 1} number must be a positive integer.`;
      }
      if (!asString(items[i]?.text).trim()) {
        return `Item ${i + 1} text is required.`;
      }
    }
    return null;
  }

  if (kind === PRESENTATION_KINDS.TABLE) {
    const synced = syncTableShape(content);
    if (
      synced.columns.length < MIN_TABLE_COLUMNS ||
      synced.columns.length > MAX_TABLE_COLUMNS
    ) {
      return `Table needs ${MIN_TABLE_COLUMNS}–${MAX_TABLE_COLUMNS} columns.`;
    }
    if (synced.rows.length < MIN_TABLE_ROWS || synced.rows.length > MAX_TABLE_ROWS) {
      return `Table needs ${MIN_TABLE_ROWS}–${MAX_TABLE_ROWS} rows.`;
    }
    for (let i = 0; i < synced.columns.length; i += 1) {
      if (!asString(synced.columns[i]).trim()) {
        return `Column ${i + 1} name is required.`;
      }
    }
    for (let r = 0; r < synced.rows.length; r += 1) {
      if (!Array.isArray(synced.rows[r]) || synced.rows[r].length !== synced.columns.length) {
        return `Row ${r + 1} must have ${synced.columns.length} cells.`;
      }
    }
    return null;
  }

  return null;
}

/**
 * Fields to send for presentation. Plain never includes structured content.
 * Structured omits questionText so the backend remains the source of flattened text.
 */
export function buildPresentationPayload(form, { isEdit = false } = {}) {
  const kind = normalizePresentationKind(form?.presentationKind);
  if (kind === PRESENTATION_KINDS.PLAIN) {
    const payload = {
      presentationKind: PRESENTATION_KINDS.PLAIN,
      questionText: asString(form?.questionText).trim(),
    };
    if (isEdit) payload.content = null;
    return payload;
  }

  const content = form?.content || {};
  const intro = optionalTrimmed(content.intro);
  const prompt = optionalTrimmed(content.prompt);

  if (kind === PRESENTATION_KINDS.TWO_STATEMENTS) {
    const statements = (Array.isArray(content.statements) ? content.statements : [])
      .slice(0, 2)
      .map((row) => ({
        label: asString(row?.label).trim(),
        text: asString(row?.text).trim(),
      }));
    const body = { statements };
    if (intro) body.intro = intro;
    if (prompt) body.prompt = prompt;
    return { presentationKind: kind, content: body };
  }

  if (kind === PRESENTATION_KINDS.NUMBERED_LIST) {
    const items = (Array.isArray(content.items) ? content.items : []).map((row) => ({
      n: parsePositiveInt(row?.n),
      text: asString(row?.text).trim(),
    }));
    const body = { items };
    if (intro) body.intro = intro;
    if (prompt) body.prompt = prompt;
    return { presentationKind: kind, content: body };
  }

  const synced = syncTableShape(content);
  const body = {
    columns: synced.columns.map((c) => asString(c).trim()),
    rows: synced.rows.map((row) => row.map((cell) => asString(cell).trim())),
  };
  if (intro) body.intro = intro;
  if (prompt) body.prompt = prompt;
  return { presentationKind: kind, content: body };
}
