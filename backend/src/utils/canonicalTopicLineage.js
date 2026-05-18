import mongoose from 'mongoose';

/**
 * Walk merge chain to root canonical id (acyclic guard).
 * @param {Map<string, object>} topicById
 * @param {string} topicId
 * @param {Set<string>} [visited]
 */
export function resolveRootCanonicalId(topicById, topicId, visited = new Set()) {
  const sid = String(topicId);
  if (!mongoose.Types.ObjectId.isValid(sid)) return null;
  if (visited.has(sid)) return sid;
  visited.add(sid);

  const row = topicById.get(sid);
  if (!row) return sid;

  const mergedInto = row.lineageMeta?.mergedIntoTopicId;
  if (mergedInto) {
    const target = String(mergedInto);
    if (visited.has(target)) return sid;
    return resolveRootCanonicalId(topicById, target, visited);
  }

  const canonical = row.canonicalTopicId ? String(row.canonicalTopicId) : sid;
  if (canonical !== sid) {
    return resolveRootCanonicalId(topicById, canonical, visited);
  }
  return canonical;
}

/**
 * Pick human-readable display name for a canonical lineage.
 * @param {Map<string, object>} topicById
 * @param {string} canonicalId
 */
export function resolveCanonicalDisplayName(topicById, canonicalId) {
  const cid = String(canonicalId);
  let primary = null;
  for (const t of topicById.values()) {
    const root = resolveRootCanonicalId(topicById, String(t._id));
    if (root !== cid) continue;
    if (t.deprecated) continue;
    if (!t.isActive && t.isActive !== undefined) continue;
    if (!primary || String(t._id) === cid) {
      primary = t;
    }
  }
  if (primary?.name) return String(primary.name).trim();
  const any = topicById.get(cid);
  return any?.name ? String(any.name).trim() : '';
}

/**
 * Collect previous names across lineage (deduped).
 */
export function collectLineagePreviousNames(topicById, canonicalId) {
  const cid = String(canonicalId);
  const names = new Set();
  for (const t of topicById.values()) {
    const root = resolveRootCanonicalId(topicById, String(t._id));
    if (root !== cid) continue;
    for (const n of t.previousNames || []) {
      if (typeof n === 'string' && n.trim()) names.add(n.trim());
    }
    for (const a of t.aliases || []) {
      if (typeof a === 'string' && a.trim()) names.add(a.trim());
    }
  }
  return [...names];
}

/**
 * @param {string[]} sourceIds
 * @param {string} targetId
 */
export function assertNoMergeCycle(sourceIds, targetId) {
  const target = String(targetId);
  if (sourceIds.some((id) => String(id) === target)) {
    throw new Error('Cannot merge a topic into itself');
  }
}

/**
 * @param {string} canonicalId
 * @param {string[]} childCanonicalIds
 */
export function assertNoSplitCycle(canonicalId, childCanonicalIds) {
  const parent = String(canonicalId);
  if (childCanonicalIds.some((id) => String(id) === parent)) {
    throw new Error('Split child cannot share parent canonical id');
  }
}
