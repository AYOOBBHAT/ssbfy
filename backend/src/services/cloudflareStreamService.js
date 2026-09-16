import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';

/** Official Cloudflare API v4 base. https://developers.cloudflare.com/api/ */
export const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';

/**
 * Official Stream permission names (API token):
 * - Stream Read — list/get videos
 * - Stream Write / Stream Edit — direct creator uploads and management
 * Direct upload: POST /accounts/{account_id}/stream/direct_upload requires Stream Write.
 * List videos: GET /accounts/{account_id}/stream accepts Stream Read or Stream Write.
 */

function streamConfig() {
  return {
    accountId: (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim(),
    apiToken: (process.env.CLOUDFLARE_STREAM_API_TOKEN || '').trim(),
  };
}

export function isCloudflareStreamConfigured() {
  const { accountId, apiToken } = streamConfig();
  return Boolean(accountId && apiToken);
}

export function assertCloudflareStreamConfigured() {
  const { accountId, apiToken } = streamConfig();
  if (!accountId && !apiToken) {
    throw new AppError(
      'Cloudflare Stream is not configured. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_STREAM_API_TOKEN.',
      HTTP_STATUS.SERVICE_UNAVAILABLE
    );
  }
  if (!accountId) {
    throw new AppError(
      'Cloudflare Stream is not configured. Set CLOUDFLARE_ACCOUNT_ID.',
      HTTP_STATUS.SERVICE_UNAVAILABLE
    );
  }
  if (!apiToken) {
    throw new AppError(
      'Cloudflare Stream is not configured. Set CLOUDFLARE_STREAM_API_TOKEN.',
      HTTP_STATUS.SERVICE_UNAVAILABLE
    );
  }
}

function cloudflareErrorMessage(payload, status) {
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  const first = errors[0];
  const code = first?.code != null ? String(first.code) : '';
  const msg =
    typeof first?.message === 'string' && first.message.trim()
      ? first.message.trim()
      : '';
  if (code && msg) return `Cloudflare Stream error ${code}: ${msg}`;
  if (msg) return `Cloudflare Stream error: ${msg}`;
  return `Cloudflare Stream request failed (${status})`;
}

function permissionHint(status, payload) {
  const raw = JSON.stringify(payload || {}).toLowerCase();
  if (status === 401 || status === 403) {
    if (raw.includes('authentication') || status === 401) {
      return 'Token is missing, expired, or invalid. Recreate an API token with Account → Stream → Edit (Stream Write).';
    }
    return 'Token lacks Stream access. Grant Account → Stream → Edit (API: Stream Write). Do not grant DNS, Workers, R2, or account admin.';
  }
  return null;
}

/**
 * Low-level Cloudflare API call. Never logs Authorization or token values.
 * @param {{ method?: string, pathname: string, query?: Record<string, string>, jsonBody?: unknown, extraHeaders?: Record<string, string>, parseJson?: boolean }} opts
 */
export async function cloudflareApiRequest(opts) {
  assertCloudflareStreamConfigured();
  const method = (opts.method || 'GET').toUpperCase();
  const { apiToken } = streamConfig();
  const url = new URL(`${CLOUDFLARE_API_BASE}${opts.pathname}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v == null || v === '') continue;
      url.searchParams.set(k, String(v));
    }
  }

  const headers = {
    Authorization: `Bearer ${apiToken}`,
    ...(opts.jsonBody !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(opts.extraHeaders || {}),
  };

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: opts.jsonBody !== undefined ? JSON.stringify(opts.jsonBody) : undefined,
    });
  } catch {
    throw new AppError(
      'Unable to reach Cloudflare Stream.',
      HTTP_STATUS.BAD_GATEWAY
    );
  }

  const parseJson = opts.parseJson !== false;
  let payload = null;
  if (parseJson) {
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }
  }

  if (!res.ok || payload?.success === false) {
    const hint = permissionHint(res.status, payload);
    const message = hint
      ? `${cloudflareErrorMessage(payload, res.status)} ${hint}`
      : cloudflareErrorMessage(payload, res.status);
    const statusCode =
      res.status === 401 || res.status === 403
        ? HTTP_STATUS.FORBIDDEN
        : HTTP_STATUS.BAD_GATEWAY;
    throw new AppError(message, statusCode);
  }

  return { status: res.status, payload, headers: res.headers };
}

export const cloudflareStreamService = {
  isConfigured: isCloudflareStreamConfigured,
  assertConfigured: assertCloudflareStreamConfigured,

  /**
   * Confirms the API token is recognized (no Stream mutation).
   * GET /accounts/{account_id}/tokens/verify
   */
  async verifyApiToken() {
    const { payload } = await cloudflareApiRequest({
      method: 'GET',
      pathname: `/accounts/${streamConfig().accountId}/tokens/verify`,
    });
    const status = payload?.result?.status || null;
    return { ok: payload?.success === true, status };
  },

  /**
   * Read-only Stream access + library size.
   * GET /accounts/{account_id}/stream?include_counts=true&limit=1
   * Permissions: Stream Read or Stream Write.
   */
  async listVideosSummary() {
    const { payload } = await cloudflareApiRequest({
      method: 'GET',
      pathname: `/accounts/${streamConfig().accountId}/stream`,
      query: { include_counts: 'true', limit: '1' },
    });
    const total =
      typeof payload?.total === 'number'
        ? payload.total
        : Array.isArray(payload?.result)
          ? payload.result.length
          : 0;
    return { ok: payload?.success === true, total };
  },

  /**
   * Direct Creator Upload (basic POST URL).
   *
   * WARNING: Official POST /accounts/{id}/stream/direct_upload creates a
   * pending Stream video (uid + one-time uploadURL) even before any bytes
   * are uploaded. Do not call this in Phase 2 connectivity tests.
   *
   * Permission: Stream Write.
   * https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/
   *
   * @param {{ maxDurationSeconds: number, expiry?: string, requireSignedURLs?: boolean }} input
   * @returns {Promise<{ uid: string, uploadURL: string }>}
   */
  async createDirectUploadUrl(input) {
    const maxDurationSeconds = Number(input?.maxDurationSeconds);
    if (!Number.isInteger(maxDurationSeconds) || maxDurationSeconds < 1) {
      throw new AppError(
        'maxDurationSeconds must be a positive integer',
        HTTP_STATUS.BAD_REQUEST
      );
    }
    const body = {
      maxDurationSeconds,
      requireSignedURLs: input?.requireSignedURLs !== false,
    };
    if (input?.expiry) body.expiry = input.expiry;

    const { payload } = await cloudflareApiRequest({
      method: 'POST',
      pathname: `/accounts/${streamConfig().accountId}/stream/direct_upload`,
      jsonBody: body,
    });
    const uid = payload?.result?.uid;
    const uploadURL = payload?.result?.uploadURL;
    if (!uid || !uploadURL) {
      throw new AppError(
        'Cloudflare Stream did not return a direct upload URL',
        HTTP_STATUS.BAD_GATEWAY
      );
    }
    return { uid: String(uid), uploadURL: String(uploadURL) };
  },
};
