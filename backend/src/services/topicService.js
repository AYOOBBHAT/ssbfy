import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { topicRepository } from '../repositories/topicRepository.js';

export const topicService = {
  async listBySubject(subjectId) {
    return topicRepository.findAll({ subjectId });
  },

  async getById(id) {
    const topic = await topicRepository.findById(id);
    if (!topic) {
      throw new AppError('Topic not found', HTTP_STATUS.NOT_FOUND);
    }
    return topic;
  },
};
