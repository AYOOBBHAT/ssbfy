/**
 * Calm, human-friendly error copy — never expose Axios/stack traces in UI.
 */

const TECHNICAL =
  /axios|network error|err_network|econnrefused|econnaborted|status code|request failed|socket|fetch failed/i;

/**
 * @param {string} [raw] — from getApiErrorMessage or similar
 * @param {{ context?: string }} [opts] — e.g. "notes", "PDFs", "leaderboard"
 */
export function humanizeErrorMessage(raw, { context } = {}) {
  const ctx = context ? String(context).trim() : '';
  const fallback = ctx
    ? `Couldn't load ${ctx} right now. Check your connection and try again.`
    : "Couldn't load this right now. Check your connection and try again.";

  if (!raw || !String(raw).trim()) return fallback;

  const msg = String(raw).trim();

  if (TECHNICAL.test(msg)) {
    return ctx
      ? `Couldn't reach ${ctx}. Check your connection and try again.`
      : 'Unable to reach the server. Check your connection and try again.';
  }
  if (/timeout|timed out/i.test(msg)) {
    return 'This is taking longer than usual. Try again in a moment.';
  }
  if (msg.length > 160 || msg.includes(' at ') || /^Error:/i.test(msg)) {
    return fallback;
  }

  return msg;
}

export const ERROR_TITLES = {
  load: "Couldn't load right now",
  open: "Couldn't open right now",
  save: "Couldn't save right now",
  start: "Couldn't start right now",
};
