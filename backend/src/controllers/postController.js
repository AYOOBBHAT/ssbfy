import { postService } from '../services/postService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated } from '../utils/response.js';

export const postController = {
  /** GET /api/posts — public list of active posts. */
  getPosts: asyncHandler(async (req, res) => {
    const posts = await postService.list();
    return sendSuccess(res, { posts }, 'Posts');
  }),

  /** GET /api/posts/:id — detail by id. */
  getById: asyncHandler(async (req, res) => {
    const post = await postService.getById(req.params.id);
    return sendSuccess(res, { post }, 'Post');
  }),

  /** POST /api/posts — admin-only post creation. */
  createPost: asyncHandler(async (req, res) => {
    const { name, slug, description } = req.body;
    const post = await postService.create({ name, slug, description });
    return sendCreated(res, { post }, 'Post created');
  }),
};
