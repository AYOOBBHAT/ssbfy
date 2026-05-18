import { resolveMongoId } from './mongoId.js';

/**
 * Pick active topic id for practice when lineage was renamed/merged.
 * @param {string} topicId
 * @param {unknown[]} catalogTopics
 */
export function resolvePracticeTopicId(topicId, catalogTopics = []) {
  const sid = resolveMongoId(topicId, 'topicId');
  if (!sid || !Array.isArray(catalogTopics)) return sid;

  const row = catalogTopics.find((t) => resolveMongoId(t?._id ?? t, 'topicId') === sid);
  if (!row) return sid;
  if (!row.deprecated) return sid;

  const canonical = resolveMongoId(row.canonicalTopicId ?? row._id, 'canonicalTopicId') || sid;
  const active = catalogTopics.find((t) => {
    const tid = resolveMongoId(t?._id ?? t, 'topicId');
    const tc = resolveMongoId(t?.canonicalTopicId ?? t?._id, 'canonicalTopicId');
    return tc === canonical && !t?.deprecated && t?.isActive !== false;
  });
  return active ? resolveMongoId(active._id ?? active, 'topicId') : sid;
}
