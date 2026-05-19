/**
 * Topic-specific helpers built on {@link ./mongoId.js}.
 * Public questions may return topicId as a string or as { _id, name }.
 */

import {
  filterValidMongoIds as filterValidMongoIdsCore,
  isValidMongoObjectId,
  resolveMongoId,
  sanitizeSmartPracticeBody,
} from './mongoId.js';
import logger from './logger.js';
import { formatTaxonomyLabel } from './formatTaxonomyLabel.js';

function devWarn(message, meta) {
  if (__DEV__) {
    logger.debug(message, meta ?? {});
  }
}

function devLabelDiag(message, meta) {
  if (__DEV__) {
    logger.debug(`[topicRef] ${message}`, meta ?? {});
  }
}

/** Labels that must never appear in focus-area UI. */
const SUPPRESSED_LABELS = new Set([
  'unknown topic',
  '[object object]',
  'undefined',
  'null',
  'topic',
]);

/** DEV diagnostics: which fallback tier produced a label. */
export const TOPIC_LABEL_SOURCES = {
  ROW_TOPIC_NAME: 'row.topicName',
  EMBEDDED_TOPIC_ID: 'embedded.topicId',
  CATALOG: 'catalog',
  QUESTIONS: 'questions',
  HISTORICAL_QUESTIONS: 'historicalQuestions',
  WEAK_PAYLOAD: 'weakPayload',
  CACHED_CATALOG: 'cachedCatalog',
};

export { isValidMongoObjectId };

/** @param {unknown} ref */
export function resolveTopicId(ref) {
  return resolveMongoId(ref, 'topicId');
}

/**
 * @param {unknown} ref
 * @returns {string | null}
 */
export function resolveTopicName(ref) {
  if (ref == null || typeof ref !== 'object') return null;
  const name = ref.name;
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  return trimmed || null;
}

/**
 * @param {unknown} label
 * @returns {boolean}
 */
export function isMeaningfulTopicLabel(label) {
  if (typeof label !== 'string') return false;
  const trimmed = label.trim();
  if (trimmed.length < 2) return false;
  const lower = trimmed.toLowerCase();
  if (SUPPRESSED_LABELS.has(lower)) return false;
  if (isValidMongoObjectId(trimmed)) return false;
  if (/^\[object object\]$/i.test(trimmed)) return false;
  return true;
}

/**
 * @param {Record<string, unknown>} map
 * @returns {Record<string, string>}
 */
function sanitizeLabelMap(map) {
  const out = {};
  if (!map || typeof map !== 'object') return out;
  for (const [id, label] of Object.entries(map)) {
    const tid = resolveTopicId(id);
    if (!tid) continue;
    if (typeof label === 'string' && isMeaningfulTopicLabel(label)) out[tid] = label.trim();
  }
  return out;
}

/**
 * @param {Record<string, string>[]} maps
 * @returns {Record<string, string>}
 */
export function mergeTopicLabelMaps(...maps) {
  const out = {};
  for (const map of maps) {
    if (!map || typeof map !== 'object') continue;
    for (const [id, label] of Object.entries(map)) {
      const tid = resolveTopicId(id);
      if (!tid || out[tid]) continue;
      if (typeof label === 'string' && isMeaningfulTopicLabel(label)) out[tid] = label.trim();
    }
  }
  return out;
}

/**
 * @param {unknown} item
 * @returns {{ topicId: string, mistakeCount: number, topicName?: string, sourceTopicRef?: object } | null}
 */
export function normalizeWeakTopicRow(item) {
  if (!item || typeof item !== 'object') return null;
  const topicId = resolveTopicId(item.topicId);
  if (!topicId) {
    if (item.topicId != null) {
      devWarn('[topicRef] dropped weak-topic row (invalid topicId)', {
        topicId: item.topicId,
      });
    }
    return null;
  }

  const explicit =
    typeof item.topicName === 'string' && item.topicName.trim()
      ? item.topicName.trim()
      : null;
  const embedded = resolveTopicName(item.topicId);
  const topicName = explicit || embedded || undefined;
  const normalizedName =
    topicName && isMeaningfulTopicLabel(topicName) ? topicName : undefined;

  const sourceTopicRef =
    item.topicId != null && typeof item.topicId === 'object' ? item.topicId : undefined;

  const rawCount = Number(item.mistakeCount);
  const mistakeCount =
    Number.isFinite(rawCount) && rawCount > 0 ? Math.min(Math.floor(rawCount), 999) : 1;

  return {
    topicId,
    mistakeCount,
    ...(normalizedName ? { topicName: normalizedName } : {}),
    ...(sourceTopicRef ? { sourceTopicRef } : {}),
  };
}

/**
 * @param {unknown[]} weakTopics
 * @returns {Array<{ topicId: string, mistakeCount: number, topicName?: string, sourceTopicRef?: object }>}
 */
export function normalizeWeakTopicsList(weakTopics) {
  if (!Array.isArray(weakTopics)) return [];
  const byKey = new Map();
  for (const raw of weakTopics) {
    const row = normalizeWeakTopicRow(raw);
    if (!row) continue;
    const canonicalKey =
      raw?.canonicalTopicId != null && String(raw.canonicalTopicId).trim()
        ? `canonical:${String(raw.canonicalTopicId)}`
        : row.topicId;
    const prev = byKey.get(canonicalKey);
    if (!prev) {
      byKey.set(canonicalKey, {
        ...row,
        ...(raw?.canonicalTopicId ? { canonicalTopicId: String(raw.canonicalTopicId) } : {}),
      });
      continue;
    }
    prev.mistakeCount += row.mistakeCount;
    if (!prev.topicName && row.topicName) prev.topicName = row.topicName;
    if (!prev.sourceTopicRef && row.sourceTopicRef) prev.sourceTopicRef = row.sourceTopicRef;
    if (!prev.canonicalTopicId && raw?.canonicalTopicId) {
      prev.canonicalTopicId = String(raw.canonicalTopicId);
    }
  }
  return Array.from(byKey.values()).sort((a, b) => b.mistakeCount - a.mistakeCount);
}

/**
 * Labels embedded in raw weak-topic payloads (before normalization strips refs).
 * @param {unknown[]} weakTopics
 */
export function buildTopicLabelsFromWeakTopicPayloads(weakTopics) {
  const map = {};
  if (!Array.isArray(weakTopics)) return map;
  for (const w of weakTopics) {
    const id = resolveTopicId(w?.topicId);
    const embedded = resolveTopicName(w?.topicId);
    const explicit =
      typeof w?.topicName === 'string' && w.topicName.trim() ? w.topicName.trim() : null;
    const name = explicit || embedded;
    if (id && name && isMeaningfulTopicLabel(name) && !map[id]) map[id] = name;
  }
  return map;
}

/** @param {unknown[]} topics */
export function buildTopicLabelMapFromCatalog(topics) {
  const map = {};
  if (!Array.isArray(topics)) return map;
  for (const t of topics) {
    const id = resolveTopicId(t?._id ?? t);
    if (!id) continue;
    const name =
      (typeof t?.name === 'string' && t.name.trim()) || resolveTopicName(t) || '';
    if (name && isMeaningfulTopicLabel(name)) map[id] = name;
  }
  return map;
}

/** @param {unknown[]} questions */
export function buildTopicLabelsFromQuestions(questions) {
  const map = {};
  const list = Array.isArray(questions) ? questions : [];
  for (const q of list) {
    const id = resolveTopicId(q?.topicId);
    const fromRef = resolveTopicName(q?.topicId);
    const topLevel =
      typeof q?.topicName === 'string' && q.topicName.trim() ? q.topicName.trim() : null;
    const name = fromRef || topLevel;
    if (id && name && isMeaningfulTopicLabel(name) && !map[id]) map[id] = name;
  }
  return map;
}

/**
 * Unified label sources for focus areas, recommendations, and practice CTAs.
 *
 * @param {{
 *   catalogMap?: Record<string, string>,
 *   questions?: unknown[],
 *   historicalQuestions?: unknown[],
 *   supplementalQuestions?: unknown[],
 *   rawWeakTopics?: unknown[],
 *   cachedCatalogMap?: Record<string, string>,
 * }} options
 */
export function createTopicLabelContext(options = {}) {
  const {
    catalogMap = {},
    questions = [],
    historicalQuestions = [],
    supplementalQuestions = [],
    rawWeakTopics = [],
    cachedCatalogMap = {},
  } = options;

  const questionMap = buildTopicLabelsFromQuestions(questions);
  const historicalQuestionMap = mergeTopicLabelMaps(
    buildTopicLabelsFromQuestions(historicalQuestions),
    buildTopicLabelsFromQuestions(supplementalQuestions)
  );

  return {
    catalogMap: sanitizeLabelMap(catalogMap),
    questionMap,
    historicalQuestionMap,
    weakPayloadMap: buildTopicLabelsFromWeakTopicPayloads(rawWeakTopics),
    cachedCatalogMap: sanitizeLabelMap(cachedCatalogMap),
  };
}

function isTopicLabelContext(value) {
  return (
    value &&
    typeof value === 'object' &&
    ('catalogMap' in value ||
      'questionMap' in value ||
      'historicalQuestionMap' in value ||
      'weakPayloadMap' in value ||
      'cachedCatalogMap' in value)
  );
}

function pickFromContextMap(ctx, topicId, mapKey, source) {
  const label = ctx?.[mapKey]?.[topicId];
  if (typeof label === 'string' && isMeaningfulTopicLabel(label)) {
    return { label: label.trim(), source };
  }
  return null;
}

/**
 * Resolve the best safe human-readable topic label using a fixed fallback hierarchy.
 * Returns null when no meaningful label can be recovered (caller should suppress the row).
 *
 * Priority:
 * 1. row.topicName
 * 2. embedded topicId.name (sourceTopicRef)
 * 3. current topic catalog
 * 4. current session question payloads
 * 5. historical / supplemental question payloads
 * 6. raw weak-topic payload embedded names
 * 7. cached catalog map (last known good)
 *
 * @param {{ topicId: string, topicName?: string, sourceTopicRef?: unknown }} row
 * @param {ReturnType<typeof createTopicLabelContext>} ctx
 * @returns {{ label: string | null, source: string | null }}
 */
export function resolveRenderableTopicLabel(row, ctx) {
  if (!row?.topicId || !isValidMongoObjectId(row.topicId)) {
    return { label: null, source: null };
  }

  const id = row.topicId;

  const tryLabel = (label, source) => {
    if (typeof label === 'string' && isMeaningfulTopicLabel(label)) {
      return { label: label.trim(), source };
    }
    return null;
  };

  let hit = tryLabel(row.topicName, TOPIC_LABEL_SOURCES.ROW_TOPIC_NAME);
  if (hit) {
    devLabelDiag('label resolved', { topicId: id, source: hit.source });
    return hit;
  }

  hit = tryLabel(resolveTopicName(row.sourceTopicRef), TOPIC_LABEL_SOURCES.EMBEDDED_TOPIC_ID);
  if (hit) {
    devLabelDiag('label resolved', { topicId: id, source: hit.source });
    return hit;
  }

  hit = pickFromContextMap(ctx, id, 'catalogMap', TOPIC_LABEL_SOURCES.CATALOG);
  if (hit) {
    devLabelDiag('label resolved', { topicId: id, source: hit.source });
    return hit;
  }

  hit = pickFromContextMap(ctx, id, 'questionMap', TOPIC_LABEL_SOURCES.QUESTIONS);
  if (hit) {
    devLabelDiag('label resolved', { topicId: id, source: hit.source });
    return hit;
  }

  hit = pickFromContextMap(
    ctx,
    id,
    'historicalQuestionMap',
    TOPIC_LABEL_SOURCES.HISTORICAL_QUESTIONS
  );
  if (hit) {
    devLabelDiag('label resolved (historical)', { topicId: id, source: hit.source });
    return hit;
  }

  hit = pickFromContextMap(ctx, id, 'weakPayloadMap', TOPIC_LABEL_SOURCES.WEAK_PAYLOAD);
  if (hit) {
    devLabelDiag('label resolved (weak payload)', { topicId: id, source: hit.source });
    return hit;
  }

  hit = pickFromContextMap(ctx, id, 'cachedCatalogMap', TOPIC_LABEL_SOURCES.CACHED_CATALOG);
  if (hit) {
    devLabelDiag('label resolved (cached catalog)', { topicId: id, source: hit.source });
    return hit;
  }

  devLabelDiag('label unresolved — row will be suppressed', { topicId: id });
  return { label: null, source: null };
}

/**
 * Rows safe to render: valid id, meaningful label, usable mistake count.
 * @param {Array<{ topicId: string, mistakeCount: number, topicName?: string, sourceTopicRef?: object }>} normalizedRows
 * @param {ReturnType<typeof createTopicLabelContext> | Record<string, string>} labelMapOrContext
 * @returns {Array<{ topicId: string, mistakeCount: number, topicName?: string, displayLabel: string, labelSource?: string }>}
 */
export function buildRenderableWeakTopics(normalizedRows, labelMapOrContext = {}) {
  if (!Array.isArray(normalizedRows)) return [];

  const ctx = isTopicLabelContext(labelMapOrContext)
    ? labelMapOrContext
    : createTopicLabelContext({ catalogMap: labelMapOrContext });

  const out = [];
  for (const row of normalizedRows) {
    if (!row?.topicId || !isValidMongoObjectId(row.topicId)) {
      devWarn('[topicRef] suppressed row (invalid topicId after normalize)', { row });
      continue;
    }
    const mistakeCount = Number(row.mistakeCount);
    if (!Number.isFinite(mistakeCount) || mistakeCount < 1) {
      devWarn('[topicRef] suppressed row (invalid mistakeCount)', {
        topicId: row.topicId,
        mistakeCount: row.mistakeCount,
      });
      continue;
    }

    const { label: displayLabel, source: labelSource } = resolveRenderableTopicLabel(row, ctx);
    if (!isMeaningfulTopicLabel(displayLabel)) {
      devWarn('[topicRef] suppressed row (no meaningful label)', {
        topicId: row.topicId,
        topicName: row.topicName ?? null,
        resolved: displayLabel,
      });
      continue;
    }

    out.push({
      topicId: row.topicId,
      mistakeCount,
      ...(row.topicName ? { topicName: row.topicName } : {}),
      displayLabel: formatTaxonomyLabel(displayLabel),
      ...(__DEV__ && labelSource ? { labelSource } : {}),
    });
  }
  return out;
}

/** @param {unknown[]} topicIds */
export function filterValidTopicIds(topicIds) {
  return filterValidMongoIdsCore(topicIds, 'topicIds');
}

/** @param {Record<string, unknown>} body */
export function normalizeSmartPracticeBody(body = {}) {
  return sanitizeSmartPracticeBody(body);
}

/**
 * @deprecated Prefer {@link resolveRenderableTopicLabel} with {@link createTopicLabelContext}.
 * @param {{ topicId?: string, topicName?: string, sourceTopicRef?: unknown }} item
 * @param {Record<string, string>} labelMap
 * @returns {string | null}
 */
export function resolveWeakTopicDisplayLabel(item, labelMap = {}) {
  const ctx = createTopicLabelContext({ catalogMap: labelMap });
  return resolveRenderableTopicLabel(item, ctx).label;
}
