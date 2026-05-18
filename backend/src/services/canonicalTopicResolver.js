import { topicCanonicalMapRepository } from '../repositories/topicCanonicalMapRepository.js';

const CACHE_TTL_MS = 60_000;

let cache = {
  loadedAt: 0,
  byTopicId: new Map(),
  byCanonicalId: new Map(),
};

function rowFromLean(r) {
  return {
    topicId: String(r.topicId),
    canonicalTopicId: String(r.canonicalTopicId),
    displayName: r.displayName || '',
    previousNames: Array.isArray(r.previousNames) ? r.previousNames : [],
    deprecated: !!r.deprecated,
  };
}

export function invalidateCanonicalTopicCache() {
  cache = { loadedAt: 0, byTopicId: new Map(), byCanonicalId: new Map() };
}

async function loadCache() {
  if (Date.now() - cache.loadedAt < CACHE_TTL_MS && cache.byTopicId.size > 0) {
    return cache;
  }
  const rows = await topicCanonicalMapRepository.listAllLean();
  const byTopicId = new Map();

  for (const raw of rows) {
    const row = rowFromLean(raw);
    byTopicId.set(row.topicId, row);
  }

  cache = { loadedAt: Date.now(), byTopicId, byCanonicalId: new Map() };
  return cache;
}

/**
 * Resolver passed into analytics engine (sync after cache warm).
 */
export class CanonicalTopicResolver {
  constructor(byTopicId) {
    this.byTopicId = byTopicId;
  }

  /**
   * @param {string | null | undefined} topicId
   * @returns {string | null}
   */
  resolveCanonicalId(topicId) {
    if (topicId == null || !String(topicId).trim()) return null;
    const sid = String(topicId);
    const row = this.byTopicId.get(sid);
    if (row) return row.canonicalTopicId;
    return sid;
  }

  /**
   * @param {string} topicId
   */
  getEntry(topicId) {
    return this.byTopicId.get(String(topicId)) || null;
  }

  /**
   * Active practice topic for recommendations (same canonical, non-deprecated).
   * @param {string} topicId
   */
  resolvePracticeTopicId(topicId) {
    const sid = String(topicId);
    const row = this.byTopicId.get(sid);
    if (!row) return sid;
    const canonical = row.canonicalTopicId;
    if (!row.deprecated) return sid;

    for (const [tid, entry] of this.byTopicId) {
      if (entry.canonicalTopicId === canonical && !entry.deprecated) {
        return tid;
      }
    }
    return sid;
  }

  /**
   * @param {string} canonicalId
   */
  getDisplayName(canonicalId) {
    const cid = String(canonicalId);
    const primary = this.byTopicId.get(cid);
    if (primary && !primary.deprecated && primary.displayName) {
      return primary.displayName;
    }
    for (const row of this.byTopicId.values()) {
      if (row.canonicalTopicId === cid && !row.deprecated && row.displayName) {
        return row.displayName;
      }
    }
    return primary?.displayName || '';
  }
}

export async function getCanonicalTopicResolver() {
  const loaded = await loadCache();
  return new CanonicalTopicResolver(loaded.byTopicId);
}

export async function resolveCanonicalTopicIdAsync(topicId) {
  const resolver = await getCanonicalTopicResolver();
  return resolver.resolveCanonicalId(topicId);
}
