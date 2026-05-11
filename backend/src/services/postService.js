import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { postRepository } from '../repositories/postRepository.js';
import { cachedActivePostsList } from '../utils/ttlCache.js';

/**
 * Convert an arbitrary display name into a canonical URL slug:
 *   "JKSSB Junior Engineer!" → "jkssb-junior-engineer"
 * Collapses whitespace/punctuation to single hyphens, strips leading/
 * trailing hyphens, and lowercases everything.
 */
function slugify(input) {
  return String(input ?? '')
    .toLowerCase()
    .normalize('NFKD') // strip accents — "Patwārī" → "patwari"
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const postService = {
  async list() {
    return cachedActivePostsList(() => postRepository.findAll({ isActive: true }));
  },

  async getById(id) {
    const post = await postRepository.findById(id);
    if (!post || !post.isActive) {
      throw new AppError('Post not found', HTTP_STATUS.NOT_FOUND);
    }
    return post;
  },

  /**
   * Create a post. `slug` is optional: when missing we derive it from `name`.
   * Duplicate checks are performed case-insensitively on `name` AND on the
   * final `slug` before the insert, with an E11000 backstop in case of a
   * race with the unique indexes.
   */
  async create({ name, slug, description = '' } = {}) {
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (!trimmedName) {
      throw new AppError('Post name is required', HTTP_STATUS.BAD_REQUEST);
    }

    const finalSlug = slug ? String(slug).trim().toLowerCase() : slugify(trimmedName);
    if (!finalSlug) {
      throw new AppError(
        'Could not derive a valid slug from the provided name; pass `slug` explicitly.',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // Pre-checks so the client gets a 409 with a clear message rather than
    // a raw Mongo duplicate-key surface. The unique indexes are still the
    // last line of defense against races.
    const nameDupe = await postRepository.findByName(trimmedName);
    if (nameDupe) {
      throw new AppError(
        'A post with this name already exists.',
        HTTP_STATUS.CONFLICT
      );
    }
    const slugDupe = await postRepository.findOneBySlug(finalSlug);
    if (slugDupe) {
      throw new AppError(
        'A post with this slug already exists.',
        HTTP_STATUS.CONFLICT
      );
    }

    try {
      return await postRepository.create({
        name: trimmedName,
        slug: finalSlug,
        description: typeof description === 'string' ? description.trim() : '',
      });
    } catch (err) {
      if (err?.code === 11000) {
        // Translate the storage-level race into a friendly 409. The key
        // pattern tells us which index fired so the message can be precise.
        const field = err?.keyPattern?.name
          ? 'name'
          : err?.keyPattern?.slug
          ? 'slug'
          : 'value';
        throw new AppError(
          `A post with this ${field} already exists.`,
          HTTP_STATUS.CONFLICT
        );
      }
      throw err;
    }
  },
};
