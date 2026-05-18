import mongoose from 'mongoose';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { Topic } from '../models/Topic.js';
import { topicRepository } from '../repositories/topicRepository.js';
import { topicCanonicalMapRepository } from '../repositories/topicCanonicalMapRepository.js';
import { topicLineageEventRepository } from '../repositories/topicLineageEventRepository.js';
import {
  assertNoMergeCycle,
  assertNoSplitCycle,
  collectLineagePreviousNames,
  resolveCanonicalDisplayName,
  resolveRootCanonicalId,
} from '../utils/canonicalTopicLineage.js';
import { invalidateCanonicalTopicCache } from './canonicalTopicResolver.js';
import { logger } from '../utils/logger.js';

function toObjectId(id, label = 'id') {
  const s = String(id ?? '').trim();
  if (!mongoose.Types.ObjectId.isValid(s)) {
    throw new AppError(`Invalid ${label}`, HTTP_STATUS.BAD_REQUEST);
  }
  return new mongoose.Types.ObjectId(s);
}

async function loadAllTopicsMap() {
  const topics = await Topic.find({}).lean().exec();
  const map = new Map();
  for (const t of topics) {
    map.set(String(t._id), t);
  }
  return map;
}

function buildFlattenedRows(topicById) {
  const rows = [];
  for (const t of topicById.values()) {
    const tid = String(t._id);
    const canonical = resolveRootCanonicalId(topicById, tid);
    if (!canonical) continue;
    const displayName = resolveCanonicalDisplayName(topicById, canonical);
    const previousNames = collectLineagePreviousNames(topicById, canonical);
    rows.push({
      topicId: t._id,
      canonicalTopicId: new mongoose.Types.ObjectId(canonical),
      displayName,
      previousNames,
      deprecated: !!t.deprecated,
    });
  }
  return rows;
}

export const canonicalTopicService = {
  /**
   * Backfill canonicalTopicId = _id for legacy topics and rebuild flattened map.
   */
  async backfillAll(actorId = null) {
    const topics = await Topic.find({
      $or: [{ canonicalTopicId: null }, { canonicalTopicId: { $exists: false } }],
    })
      .select('_id')
      .lean()
      .exec();

    if (topics.length > 0) {
      await Topic.updateMany(
        { _id: { $in: topics.map((t) => t._id) } },
        [{ $set: { canonicalTopicId: '$_id' } }]
      );
    }

    await this.rebuildFlattenedMap();

    if (topics.length > 0) {
      await topicLineageEventRepository.create({
        action: 'backfill',
        canonicalTopicId: topics[0]._id,
        actorId: actorId ? toObjectId(actorId, 'actorId') : null,
        meta: { count: topics.length },
      });
    }

    return { backfilled: topics.length };
  },

  async rebuildFlattenedMap() {
    const topicById = await loadAllTopicsMap();
    const rows = buildFlattenedRows(topicById);
    await topicCanonicalMapRepository.deleteAll();
    await topicCanonicalMapRepository.bulkUpsert(rows);
    invalidateCanonicalTopicCache();
    return { entries: rows.length };
  },

  /**
   * On topic create — set canonicalTopicId to self.
   */
  async onTopicCreated(topic) {
    const id = topic?._id;
    if (!id) return;
    await Topic.updateOne(
      { _id: id, $or: [{ canonicalTopicId: null }, { canonicalTopicId: { $exists: false } }] },
      { $set: { canonicalTopicId: id } }
    );
    await this.rebuildFlattenedMap();
  },

  /**
   * Rename: canonical id unchanged; push old name to previousNames.
   */
  async renameTopic(topicId, newName, actor = null) {
    const id = toObjectId(topicId, 'topicId');
    const existing = await topicRepository.findById(id);
    if (!existing) {
      throw new AppError('Topic not found', HTTP_STATUS.NOT_FOUND);
    }

    const trimmed = String(newName || '').trim();
    if (!trimmed) {
      throw new AppError('Topic name is required', HTTP_STATUS.BAD_REQUEST);
    }

    const oldName = String(existing.name || '').trim();
    const update = { name: trimmed };
    if (oldName && oldName.toLowerCase() !== trimmed.toLowerCase()) {
      const prev = new Set(existing.previousNames || []);
      prev.add(oldName);
      update.previousNames = [...prev];
    }

    const canonical =
      existing.canonicalTopicId != null
        ? existing.canonicalTopicId
        : existing._id;
    if (!existing.canonicalTopicId) {
      update.canonicalTopicId = canonical;
    }

    const updated = await topicRepository.updateById(id, update);
    await this.rebuildFlattenedMap();

    await topicLineageEventRepository.create({
      action: 'rename',
      canonicalTopicId: canonical,
      sourceTopicIds: [id],
      actorId: actor?.id ? toObjectId(actor.id, 'actorId') : null,
      meta: { from: oldName, to: trimmed },
    });

    logger.info('[TAXONOMY] Topic renamed', {
      topicId: String(id),
      canonicalTopicId: String(canonical),
      from: oldName,
      to: trimmed,
    });

    return updated;
  },

  /**
   * Add alias (does not change display name).
   */
  async addAlias(topicId, alias, actor = null) {
    const id = toObjectId(topicId, 'topicId');
    const existing = await topicRepository.findById(id);
    if (!existing) {
      throw new AppError('Topic not found', HTTP_STATUS.NOT_FOUND);
    }
    const trimmed = String(alias || '').trim();
    if (!trimmed) {
      throw new AppError('Alias is required', HTTP_STATUS.BAD_REQUEST);
    }

    const aliases = new Set(existing.aliases || []);
    if (aliases.has(trimmed)) {
      return existing;
    }
    aliases.add(trimmed);

    const updated = await topicRepository.updateById(id, {
      aliases: [...aliases],
    });
    await this.rebuildFlattenedMap();

    const canonical = existing.canonicalTopicId || existing._id;
    await topicLineageEventRepository.create({
      action: 'alias',
      canonicalTopicId: canonical,
      sourceTopicIds: [id],
      actorId: actor?.id ? toObjectId(actor.id, 'actorId') : null,
      meta: { alias: trimmed },
    });

    return updated;
  },

  /**
   * Merge source topics into target canonical lineage.
   */
  async mergeTopics(targetTopicId, sourceTopicIds, actor = null) {
    const targetId = toObjectId(targetTopicId, 'targetTopicId');
    const sources = (Array.isArray(sourceTopicIds) ? sourceTopicIds : [])
      .map((s) => String(s))
      .filter((s) => mongoose.Types.ObjectId.isValid(s) && s !== String(targetId));

    if (sources.length === 0) {
      throw new AppError('sourceTopicIds required', HTTP_STATUS.BAD_REQUEST);
    }

    assertNoMergeCycle(sources, String(targetId));

    const target = await topicRepository.findById(targetId);
    if (!target) {
      throw new AppError('Target topic not found', HTTP_STATUS.NOT_FOUND);
    }

    const targetCanonical = target.canonicalTopicId || target._id;

    for (const sid of sources) {
      const source = await topicRepository.findById(sid);
      if (!source) {
        throw new AppError(`Source topic not found: ${sid}`, HTTP_STATUS.BAD_REQUEST);
      }
      const prev = new Set(source.previousNames || []);
      if (source.name) prev.add(String(source.name).trim());

      await topicRepository.updateById(sid, {
        deprecated: true,
        isActive: false,
        canonicalTopicId: targetCanonical,
        lineageMeta: {
          ...(source.lineageMeta || {}),
          mergedIntoTopicId: targetId,
        },
        previousNames: [...prev],
      });
    }

    const mergedSources = [
      ...new Set([
        ...(target.lineageMeta?.mergedSourceTopicIds || []).map(String),
        ...sources,
      ]),
    ].map((s) => new mongoose.Types.ObjectId(s));

    await topicRepository.updateById(targetId, {
      canonicalTopicId: targetCanonical,
      lineageMeta: {
        ...(target.lineageMeta || {}),
        mergedSourceTopicIds: mergedSources,
      },
    });

    await this.rebuildFlattenedMap();

    await topicLineageEventRepository.create({
      action: 'merge',
      canonicalTopicId: targetCanonical,
      sourceTopicIds: [targetId, ...sources.map((s) => toObjectId(s, 'sourceTopicId'))],
      actorId: actor?.id ? toObjectId(actor.id, 'actorId') : null,
      meta: { targetTopicId: String(targetId), merged: sources },
    });

    logger.info('[TAXONOMY] Topics merged', {
      targetTopicId: String(targetId),
      canonicalTopicId: String(targetCanonical),
      sources,
    });

    return { canonicalTopicId: String(targetCanonical), merged: sources.length };
  },

  /**
   * Split: create child topics under new canonical ids; parent lineage preserved.
   */
  async splitTopic(sourceTopicId, splits, actor = null) {
    const sourceId = toObjectId(sourceTopicId, 'topicId');
    const source = await topicRepository.findById(sourceId);
    if (!source) {
      throw new AppError('Source topic not found', HTTP_STATUS.NOT_FOUND);
    }

    const splitList = Array.isArray(splits) ? splits : [];
    if (splitList.length < 1) {
      throw new AppError('At least one split child is required', HTTP_STATUS.BAD_REQUEST);
    }

    const parentCanonical = String(source.canonicalTopicId || source._id);
    const childCanonicalIds = [];

    const created = [];
    for (const spec of splitList) {
      const name = String(spec?.name || '').trim();
      if (!name) {
        throw new AppError('Each split child requires a name', HTTP_STATUS.BAD_REQUEST);
      }
      const doc = await topicRepository.create({
        name,
        subjectId: source.subjectId,
        order: spec.order != null ? Number(spec.order) : 0,
        canonicalTopicId: null,
        lineageMeta: {
          splitFromCanonicalId: new mongoose.Types.ObjectId(parentCanonical),
        },
      });
      await Topic.updateOne({ _id: doc._id }, { $set: { canonicalTopicId: doc._id } });
      childCanonicalIds.push(String(doc._id));
      created.push(doc);
    }

    assertNoSplitCycle(parentCanonical, childCanonicalIds);

    const childIds = created.map((c) => c._id);
    await topicRepository.updateById(sourceId, {
      lineageMeta: {
        ...(source.lineageMeta || {}),
        childTopicIds: childIds,
      },
    });

    await this.rebuildFlattenedMap();

    await topicLineageEventRepository.create({
      action: 'split',
      canonicalTopicId: source.canonicalTopicId || source._id,
      sourceTopicIds: [sourceId, ...childIds],
      actorId: actor?.id ? toObjectId(actor.id, 'actorId') : null,
      meta: { children: childCanonicalIds },
    });

    return { parentCanonicalTopicId: parentCanonical, children: created };
  },

  async deprecateTopic(topicId, actor = null) {
    const id = toObjectId(topicId, 'topicId');
    const existing = await topicRepository.findById(id);
    if (!existing) {
      throw new AppError('Topic not found', HTTP_STATUS.NOT_FOUND);
    }

    const updated = await topicRepository.updateById(id, {
      deprecated: true,
      isActive: false,
    });
    await this.rebuildFlattenedMap();

    await topicLineageEventRepository.create({
      action: 'deprecate',
      canonicalTopicId: existing.canonicalTopicId || existing._id,
      sourceTopicIds: [id],
      actorId: actor?.id ? toObjectId(actor.id, 'actorId') : null,
      meta: {},
    });

    return updated;
  },
};
