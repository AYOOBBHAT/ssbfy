import dotenv from 'dotenv';

dotenv.config();

function required(name) {
  const v = process.env[name];
  if (v === undefined || v === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

/** Strip trailing slash so https://a.com and https://a.com/ match the same allowlist entry. */
export function normalizeCorsOrigin(url) {
  return String(url ?? '')
    .trim()
    .replace(/\/$/, '');
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  mongoUri: required('MONGODB_URI'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS) || 12,
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
  /**
   * Razorpay Dashboard → Webhooks → signing secret. Used ONLY for
   * POST /api/payments/webhook HMAC verification (not the API key secret).
   */
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  /** Default order amount in INR (integer) for create-order when body omits amount */
  razorpayDefaultAmountInr: Number(process.env.RAZORPAY_DEFAULT_AMOUNT_INR) || 99,

  /**
   * Supabase (PDF notes — use a private bucket; server signs short-lived URLs).
   * Service role key must never be sent to the client; backend only.
   *
   * Dashboard: disable public access on the bucket, or signed URLs cannot gate premium.
   */
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  supabaseStorageBucket: process.env.SUPABASE_STORAGE_BUCKET || 'pdf-notes',
  pdfMaxSizeMb: Number(process.env.PDF_MAX_SIZE_MB) || 25,
  /** Signed URL TTL for PDF downloads (seconds). Clamped to [30, 120]. */
  pdfSignedUrlTtlSeconds: Math.min(
    120,
    Math.max(30, Number(process.env.PDF_SIGNED_URL_TTL_SECONDS) || 90)
  ),

  /**
   * Max free mock-test starts per device for non-premium users.
   * Override with FREE_TEST_LIMIT in .env (falls back to 3).
   */
  freeTestLimit: Math.max(1, Number(process.env.FREE_TEST_LIMIT) || 3),

  /**
   * Resend (transactional email — password reset OTP). Backend only.
   * RESEND_FROM_EMAIL must be a verified sender/domain in Resend.
   */
  resendApiKey: process.env.RESEND_API_KEY || '',
  resendFromEmail: process.env.RESEND_FROM_EMAIL || '',
  appName: process.env.APP_NAME || 'SSBFY',

  /** Upstash Redis REST (rate limiting). Optional in local dev. */
  upstashRedisRestUrl: process.env.UPSTASH_REDIS_REST_URL || '',
  upstashRedisRestToken: process.env.UPSTASH_REDIS_REST_TOKEN || '',

  /**
   * Comma-separated browser origins allowed to call the API in production.
   * No wildcards; empty in prod means no web origin matches (mobile still works — no Origin).
   * Example: https://ssbfy.vercel.app,https://admin.example.com
   * Trailing slashes are ignored for comparison.
   */
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => normalizeCorsOrigin(s))
    .filter(Boolean),
};

export const isProd = env.nodeEnv === 'production';

if (isProd && env.allowedOrigins.length === 0) {
  console.error(
    'ALLOWED_ORIGINS is empty in production — web browsers will be blocked by CORS until you set comma-separated origins (e.g. https://app.example.com).'
  );
}
