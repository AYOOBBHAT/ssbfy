import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { testRepository } from '../repositories/testRepository.js';
import { questionRepository } from '../repositories/questionRepository.js';

export const testService = {
  async list() {
    return testRepository.findAll({});
  },

  async getById(id) {
    const test = await testRepository.findById(id);
    if (!test) {
      throw new AppError('Test not found', HTTP_STATUS.NOT_FOUND);
    }
    return test;
  },

  async create(data) {
    const { title, type, questionIds, duration, negativeMarking } = data;

    const uniqueIds = [...new Set(questionIds.map((id) => String(id)))];
    if (uniqueIds.length !== questionIds.length) {
      throw new AppError('Duplicate questionIds are not allowed', HTTP_STATUS.BAD_REQUEST);
    }

    const activeCount = await questionRepository.countActiveByIds(uniqueIds);
    if (activeCount !== uniqueIds.length) {
      throw new AppError(
        'One or more questionIds are invalid or inactive',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    return testRepository.create({
      title: title.trim(),
      type,
      questionIds: uniqueIds,
      duration,
      negativeMarking: negativeMarking ?? 0,
    });
  },
};
