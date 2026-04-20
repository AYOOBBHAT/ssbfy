import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { resultRepository } from '../repositories/resultRepository.js';

export const resultService = {
  async listForUser(userId) {
    return resultRepository.findByUser(userId);
  },

  async getById(id, userId) {
    const result = await resultRepository.findById(id);
    if (!result) {
      throw new AppError('Result not found', HTTP_STATUS.NOT_FOUND);
    }
    if (result.userId.toString() !== userId) {
      throw new AppError('Forbidden', HTTP_STATUS.FORBIDDEN);
    }
    return result;
  },
};
