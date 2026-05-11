import * as WebBrowser from 'expo-web-browser';
import api, { API_BASE_URL, isOfflineError, isTimeoutError } from './api.js';
import logger from '../utils/logger.js';

/**
 * Derive the origin (scheme + host + port) of the API so we can
 * convert the backend's relative `fileUrl` values (e.g. "/uploads/…")
 * into fetchable absolute URLs on a real device. If the backend is
 * configured with PUBLIC_BASE_URL the URL is already absolute and we
 * return it unchanged.
 */
function apiOrigin() {
  // URL is available in the React Native runtime (via `react-native-url-polyfill`
  // which Expo includes by default). Fall back to string-munging if it ever
  // throws, so a malformed base URL can't crash the screen.
  try {
    const u = new URL(API_BASE_URL);
    return `${u.protocol}//${u.host}`;
  } catch {
    return API_BASE_URL.replace(/\/api\/?$/, '');
  }
}

/**
 * Ensure a PDF URL is absolute and loadable in WebBrowser.
 *
 * Full public URLs (https://) from Supabase, Cloudinary, or any CDN are
 * returned unchanged — do not modify them.
 * Relative paths (legacy) get the API origin prepended.
 */
export function resolvePdfUrl(fileUrl) {
  if (!fileUrl || typeof fileUrl !== 'string') return '';
  const raw = fileUrl.trim();
  // Protocol-relative URLs //host/...  →  https://host/...
  if (raw.startsWith('//')) {
    return `https:${raw}`;
  }
  if (/^https?:\/\//i.test(raw)) return raw;
  const origin = apiOrigin();
  if (!origin) return raw;
  return raw.startsWith('/')
    ? `${origin}${raw}`
    : `${origin}/${raw}`;
}

/**
 * Prefer short-lived `signedUrl` from the API; fall back to legacy `fileUrl` if present.
 */
export function resolvePdfOpenUrl(pdfOrRow) {
  const raw = pdfOrRow?.signedUrl || pdfOrRow?.fileUrl;
  return resolvePdfUrl(raw);
}

/**
 * Format a raw byte count as a human-readable size. Returns `''` for
 * missing/invalid values so callers can conditionally render the label.
 */
export function formatFileSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Fetch the list of available posts so the user can pick which exam's
 * PDFs they want to browse. Cached in-memory for the session — posts
 * change rarely and refetching on every screen open wastes bandwidth.
 */
let postsCache = null;
let postsInFlight = null;

export async function getPosts(opts = {}) {
  const { force = false, signal } = opts;
  if (!force && !signal && postsCache) return postsCache;
  if (!force && !signal && postsInFlight) return postsInFlight;

  const exec = async () => {
    const { data } = await api.get('/posts', { signal });
    const payload = data?.data ?? {};
    const list = Array.isArray(payload.posts) ? payload.posts : [];
    const result = { posts: list };
    if (!signal) {
      postsCache = result;
    }
    return result;
  };

  if (signal) {
    return exec();
  }

  postsInFlight = (async () => {
    try {
      return await exec();
    } finally {
      postsInFlight = null;
    }
  })();

  return postsInFlight;
}

/** Short TTL: signed URLs expire; list cache limits duplicate network during navigation. */
const PDF_LIST_TTL_MS = 35000;
const pdfNotesCache = new Map();
const pdfNotesInFlight = new Map();
const pdfListBgScheduled = new Set();

function pdfListCacheKey(postId) {
  return postId ? `p:${String(postId)}` : 'all';
}

export function clearPdfCaches() {
  postsCache = null;
  postsInFlight = null;
  pdfNotesCache.clear();
  pdfNotesInFlight.clear();
  pdfListBgScheduled.clear();
  pdfPreflightInflight.clear();
  pdfResignInflight.clear();
}

function schedulePdfListSwrRefresh(postId, key) {
  if (pdfListBgScheduled.has(key)) return;
  pdfListBgScheduled.add(key);
  const params = {};
  if (postId) params.postId = postId;
  void (async () => {
    try {
      const { data } = await api.get('/notes/pdfs', { params });
      const payload = data?.data ?? {};
      const pdfs = Array.isArray(payload.pdfs) ? payload.pdfs : [];
      const now = Date.now();
      pdfNotesCache.set(key, { value: { pdfs }, expiresAt: now + PDF_LIST_TTL_MS, fetchedAt: now });
    } catch {
      /* ignore background failures */
    } finally {
      pdfListBgScheduled.delete(key);
    }
  })();
}

/**
 * Fetch PDF notes scoped to a post. `postId` is optional — omitting it
 * returns every active PDF, which is what we want for the "All posts"
 * browse view.
 *
 * Returns `{ pdfs: [...] }`. Each item includes `signedUrl` (short-lived),
 * `pdfId`, `title`, `postTitle`, `createdAt`, and metadata — not a permanent public URL.
 *
 * @param {string|null|undefined} postId
 * @param {{ force?: boolean, swr?: boolean, signal?: AbortSignal }} [opts] — `swr` (default true) refreshes stale cache in background. With `signal`, skips in-flight dedupe so the request can be cancelled cleanly.
 */
export async function getPdfNotes(postId, { force = false, swr = true, signal } = {}) {
  const key = pdfListCacheKey(postId);
  const params = {};
  if (postId) params.postId = postId;

  const fetchFresh = async () => {
    const { data } = await api.get('/notes/pdfs', { params, signal });
    const payload = data?.data ?? {};
    const pdfs = Array.isArray(payload.pdfs) ? payload.pdfs : [];
    const now = Date.now();
    const value = { pdfs };
    pdfNotesCache.set(key, { value, expiresAt: now + PDF_LIST_TTL_MS, fetchedAt: now });
    return value;
  };

  if (force) {
    pdfNotesCache.delete(key);
    return fetchFresh();
  }

  if (signal) {
    return fetchFresh();
  }

  const hit = pdfNotesCache.get(key);
  const now = Date.now();
  if (hit && hit.expiresAt > now) {
    if (swr && hit.fetchedAt != null && now - hit.fetchedAt > PDF_LIST_TTL_MS * 0.45) {
      schedulePdfListSwrRefresh(postId, key);
    }
    return hit.value;
  }
  const pending = pdfNotesInFlight.get(key);
  if (pending) return pending;

  const promise = fetchFresh();
  pdfNotesInFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    pdfNotesInFlight.delete(key);
  }
}

/** Dedupe concurrent resign API calls per PDF id. */
const pdfResignInflight = new Map();

/**
 * One fresh signed URL for a PDF (premium). Uses GET /notes/pdfs/:id/signed-url.
 * Concurrent callers for the same id share one in-flight request.
 */
export async function fetchPdfSignedUrlById(pdfId, opts = {}) {
  const { signal } = opts;
  const id = String(pdfId || '').trim();
  if (!id) return '';
  if (!signal) {
    const existing = pdfResignInflight.get(id);
    if (existing) return existing;
  }

  const promise = (async () => {
    const { data } = await api.get(`/notes/pdfs/${encodeURIComponent(id)}/signed-url`, {
      signal,
    });
    const payload = data?.data ?? {};
    const signedUrl = typeof payload.signedUrl === 'string' ? payload.signedUrl.trim() : '';
    return signedUrl;
  })();

  if (!signal) {
    pdfResignInflight.set(id, promise);
  }
  try {
    return await promise;
  } finally {
    if (!signal) {
      pdfResignInflight.delete(id);
    }
  }
}

const PREFLIGHT_TIMEOUT_MS = 4500;
const RANGE_HDR = 'bytes=0-767';
const pdfPreflightInflight = new Map();

function sniffStorageErrorBody(buffer) {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(
    buffer instanceof ArrayBuffer ? buffer.slice(0, 512) : buffer
  );
  const t = text.trim();
  if (!t) return false;
  if (t.startsWith('<?xml')) return true;
  if (/<Error[\s>]|<error[\s>]/i.test(t)) return true;
  if (/AccessDenied|SignatureDoesNotMatch|Request has expired|InvalidArgument/i.test(t)) return true;
  return false;
}

function isPdfMagic(buffer) {
  if (!buffer || buffer.byteLength < 5) return false;
  const u = new Uint8Array(buffer.slice(0, 5));
  return u[0] === 0x25 && u[1] === 0x50 && u[2] === 0x44 && u[3] === 0x46 && u[4] === 0x2d; // %PDF-
}

/**
 * Lightweight pre-open check so we do not surface Supabase XML/error HTML
 * in the in-app browser. HEAD first; small ranged GET to sniff body if needed.
 * @returns {Promise<{ ok: true, via: string } | { ok: false, reason: string, status?: number }>}
 */
export async function preflightSignedPdfUrl(url) {
  const key = String(url || '');
  if (!key) return { ok: false, reason: 'MISSING_URL' };
  const inflight = pdfPreflightInflight.get(key);
  if (inflight) return inflight;

  const run = preflightSignedPdfUrlOnce(key);
  pdfPreflightInflight.set(key, run);
  try {
    return await run;
  } finally {
    pdfPreflightInflight.delete(key);
  }
}

async function preflightSignedPdfUrlOnce(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PREFLIGHT_TIMEOUT_MS);
  try {
    const headRes = await fetch(url, { method: 'HEAD', signal: controller.signal });
    if (headRes.status === 401 || headRes.status === 403) {
      return { ok: false, reason: 'EXPIRED_OR_DENIED', status: headRes.status };
    }
    if (headRes.status === 404) {
      return { ok: false, reason: 'NOT_FOUND', status: 404 };
    }
    if (headRes.status >= 500) {
      return { ok: false, reason: 'SERVER', status: headRes.status };
    }
    if (headRes.ok && (headRes.status === 200 || headRes.status === 204)) {
      const ct = (headRes.headers.get('content-type') || '').toLowerCase();
      if (!ct.includes('xml') && !ct.includes('html') && !ct.includes('text/plain')) {
        return { ok: true, via: 'HEAD' };
      }
    }
    if (headRes.status === 405 || headRes.status === 501) {
      /* fall through to ranged GET */
    }

    const getRes = await fetch(url, {
      method: 'GET',
      headers: { Range: RANGE_HDR },
      signal: controller.signal,
    });
    if (getRes.status === 401 || getRes.status === 403) {
      return { ok: false, reason: 'EXPIRED_OR_DENIED', status: getRes.status };
    }
    if (getRes.status === 404) {
      return { ok: false, reason: 'NOT_FOUND', status: 404 };
    }
    if (getRes.status >= 500) {
      return { ok: false, reason: 'SERVER', status: getRes.status };
    }
    if (getRes.status === 200 || getRes.status === 206) {
      const buf = await getRes.arrayBuffer();
      if (isPdfMagic(buf)) {
        return { ok: true, via: 'GET_RANGE' };
      }
      if (sniffStorageErrorBody(buf)) {
        return { ok: false, reason: 'EXPIRED_OR_DENIED', status: getRes.status };
      }
      return { ok: false, reason: 'BAD_CONTENT', status: getRes.status };
    }
    return { ok: false, reason: 'UNKNOWN', status: getRes.status };
  } catch (e) {
    if (e?.name === 'AbortError') {
      return { ok: false, reason: 'TIMEOUT' };
    }
    if (isOfflineError(e)) {
      return { ok: false, reason: 'OFFLINE' };
    }
    if (isTimeoutError(e)) {
      return { ok: false, reason: 'TIMEOUT' };
    }
    return { ok: false, reason: 'NETWORK' };
  } finally {
    clearTimeout(timer);
  }
}

/** User-safe open errors (never echo storage XML). */
export class PdfOpenError extends Error {
  /** @param {'MISSING'|'EXPIRED'|'OFFLINE'|'TIMEOUT'|'SERVER'|'BROWSER'|'UNKNOWN'} code */
  constructor(code, message) {
    super(message);
    this.name = 'PdfOpenError';
    this.code = code;
  }
}

function pdfOpenErrorFromPreflight(pre) {
  switch (pre.reason) {
    case 'EXPIRED_OR_DENIED':
    case 'NOT_FOUND':
    case 'BAD_CONTENT':
      return new PdfOpenError(
        'EXPIRED',
        'This PDF link has expired. We tried to refresh it—please try again.'
      );
    case 'OFFLINE':
      return new PdfOpenError(
        'OFFLINE',
        'You appear to be offline. Check your connection and try opening the PDF again.'
      );
    case 'TIMEOUT':
      return new PdfOpenError(
        'TIMEOUT',
        'Checking the PDF link took too long. Check your connection and try again.'
      );
    case 'SERVER':
      return new PdfOpenError(
        'SERVER',
        'The file service is temporarily unavailable. Please try again shortly.'
      );
    case 'MISSING_URL':
      return new PdfOpenError('MISSING', 'This PDF has no valid download link.');
    default:
      return new PdfOpenError(
        'UNKNOWN',
        'Could not verify the PDF link. Please try again.'
      );
  }
}

/** Map any thrown value to a short user string (for Alert). */
export function getPdfOpenUserMessage(error) {
  if (error instanceof PdfOpenError) return error.message;
  if (isOfflineError(error)) {
    return 'You appear to be offline. Check your connection and try again.';
  }
  if (isTimeoutError(error) || error?.name === 'AbortError') {
    return 'The request timed out. Check your connection and try again.';
  }
  const msg = typeof error?.message === 'string' ? error.message : '';
  if (msg && !/Network request failed|Failed to fetch|ECONNABORTED/i.test(msg)) {
    return 'Could not open this PDF. Please try again.';
  }
  return 'Could not open this PDF. Please try again.';
}

/**
 * Open a PDF in the in-app browser. Validates the signed URL first (HEAD / small GET)
 * so expired Supabase links are not shown as XML. At most one resign + one re-validate
 * when `pdfId` is available.
 *
 * @param {object} pdf — row with optional `signedUrl`, `_id` or `pdfId`
 * @param {import('expo-web-browser').WebBrowserOpenOptions} browserOptions
 * @param {{ pdfId?: string, onRefreshed?: (signedUrl: string) => void }} [opts]
 */
export async function openPdfInAppBrowser(pdf, browserOptions, opts = {}) {
  const pdfId = String(opts.pdfId ?? pdf?._id ?? pdf?.pdfId ?? '').trim();
  let url = resolvePdfOpenUrl(pdf)?.trim();
  if (!url) {
    throw new PdfOpenError('MISSING', 'This PDF has no valid download link.');
  }

  let didResign = false;
  let preflightFailCount = 0;

  for (;;) {
    const pre = await preflightSignedPdfUrl(url);
    if (!pre.ok) {
      preflightFailCount += 1;
      if (__DEV__) {
        logger.debug('[pdf-open] preflight fail', { reason: pre.reason, status: pre.status });
      }
      if (!pdfId || didResign) {
        throw pdfOpenErrorFromPreflight(pre);
      }
      const fresh = await fetchPdfSignedUrlById(pdfId);
      if (!fresh) {
        throw pdfOpenErrorFromPreflight(pre);
      }
      didResign = true;
      url = fresh;
      opts.onRefreshed?.(fresh);
      continue;
    }

    try {
      await WebBrowser.openBrowserAsync(url, browserOptions);
      if (__DEV__) {
        logger.debug('[pdf-open] ok', {
          via: pre.via,
          didResign,
          preflightFailCount,
        });
      }
      return;
    } catch (browserErr) {
      if (__DEV__) {
        logger.debug('[pdf-open] browser error', { message: browserErr?.message });
      }
      if (!pdfId || didResign) {
        throw new PdfOpenError(
          'BROWSER',
          'Could not open the in-app viewer. Please try again.'
        );
      }
      const fresh = await fetchPdfSignedUrlById(pdfId);
      if (!fresh) {
        throw new PdfOpenError(
          'BROWSER',
          'Could not open the in-app viewer. Please try again.'
        );
      }
      didResign = true;
      url = fresh;
      opts.onRefreshed?.(fresh);
      continue;
    }
  }
}
