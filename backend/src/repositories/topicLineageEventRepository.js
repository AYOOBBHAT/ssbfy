import { TopicLineageEvent } from '../models/TopicLineageEvent.js';

export const topicLineageEventRepository = {
  async create(doc) {
    const created = await TopicLineageEvent.create(doc);
    return created.toObject();
  },
};
