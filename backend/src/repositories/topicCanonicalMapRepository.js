import { TopicCanonicalMap } from '../models/TopicCanonicalMap.js';

export const topicCanonicalMapRepository = {
  async deleteAll() {
    await TopicCanonicalMap.deleteMany({}).exec();
  },

  async bulkUpsert(rows) {
    if (!rows?.length) return;
    const ops = rows.map((row) => ({
      updateOne: {
        filter: { topicId: row.topicId },
        update: { $set: row },
        upsert: true,
      },
    }));
    await TopicCanonicalMap.bulkWrite(ops, { ordered: false });
  },

  async listAllLean() {
    return TopicCanonicalMap.find({})
      .select('topicId canonicalTopicId displayName previousNames deprecated')
      .lean()
      .exec();
  },

  async findByTopicId(topicId) {
    return TopicCanonicalMap.findOne({ topicId }).lean().exec();
  },

  async findActiveByCanonicalId(canonicalTopicId) {
    return TopicCanonicalMap.find({
      canonicalTopicId,
      deprecated: false,
    })
      .select('topicId displayName')
      .lean()
      .exec();
  },
};
