import api, { API_BASE_URL } from './api.js';

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
 * Ensure a PDF URL is absolute and HTTPS-reachable from the device.
 *
 * The admin-side uploader stores `fileUrl` as a relative path when the
 * backend is running without PUBLIC_BASE_URL (common in dev). Devices
 * can't fetch a path without an origin, so we prepend the API origin.
 */
export function resolvePdfUrl(fileUrl) {
  if (!fileUrl || typeof fileUrl !== 'string') return '';
  const raw = fileUrl.trim();
  // Cloudinary and some SDKs return protocol-relative "cdn" URLs. Our
  // dev fallback prepends the API origin to paths; if we treated "//…"
  // as a path, we'd produce https://api…//res.cloudinary.com/… (broken;
  // ERR_INVALID_RESPONSE in WebBrowser).
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

export async function getPosts({ force = false } = {}) {
  if (!force && postsCache) return postsCache;
  if (!force && postsInFlight) return postsInFlight;

  postsInFlight = (async () => {
    try {
      const { data } = await api.get('/posts');
      const payload = data?.data ?? {};
      const list = Array.isArray(payload.posts) ? payload.posts : [];
      postsCache = { posts: list };
      return postsCache;
    } finally {
      postsInFlight = null;
    }
  })();

  return postsInFlight;
}

export function clearPdfCaches() {
  postsCache = null;
  postsInFlight = null;
}

/**
 * Fetch PDF notes scoped to a post. `postId` is optional — omitting it
 * returns every active PDF, which is what we want for the "All posts"
 * browse view.
 *
 * Returns `{ pdfs: [...] }`. Each pdf includes `fileUrl`, `fileName`,
 * `fileSize`, `mimeType`, `title`, etc.
 */
export async function getPdfNotes(postId) {
  const params = {};
  if (postId) params.postId = postId;
  const { data } = await api.get('/notes/pdfs', { params });
  const payload = data?.data ?? {};
  const pdfs = Array.isArray(payload.pdfs) ? payload.pdfs : [];
  return { pdfs };
}
