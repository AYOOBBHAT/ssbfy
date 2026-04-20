import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { subjectRepository } from '../repositories/subjectRepository.js';

export const subjectService = {
  async listByPost(postId) {
    return subjectRepository.findAll({ postId });
  },

  async getById(id) {
    const subject = await subjectRepository.findById(id);
    if (!subject) {
      throw new AppError('Subject not found', HTTP_STATUS.NOT_FOUND);
    }
    return subject;
  },
};
