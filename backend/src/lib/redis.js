import { Redis } from '@upstash/redis';

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

/**
 * Upstash REST client. When URL/token are missing, this is `null` and rate
 * limit middleware skips limiting (local dev).
 */
export const redis =
  url && token ? new Redis({ url, token }) : null;
