import { postService } from '../services/postService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const postController = {
  list: asyncHandler(async (req, res) => {
    const posts = await postService.list();
    return sendSuccess(res, { posts }, 'Posts');
  }),

  getById: asyncHandler(async (req, res) => {
    const post = await postService.getById(req.params.id);
    return sendSuccess(res, { post }, 'Post');
  }),
};
