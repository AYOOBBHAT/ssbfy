import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { postRepository } from '../repositories/postRepository.js';

export const postService = {
  async list() {
    return postRepository.findAll({ isActive: true });
  },

  async getById(id) {
    const post = await postRepository.findById(id);
    if (!post || !post.isActive) {
      throw new AppError('Post not found', HTTP_STATUS.NOT_FOUND);
    }
    return post;
  },
};
