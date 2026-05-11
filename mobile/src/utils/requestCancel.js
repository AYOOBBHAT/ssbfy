import axios from 'axios';

/**
 * True when the request was aborted (navigation, dependency change, explicit cancel).
 * Covers axios (AbortController / CancelToken) and native fetch AbortError.
 */
export function isRequestCancelled(error) {
  if (!error) return false;
  if (axios.isCancel?.(error)) return true;
  if (error.code === 'ERR_CANCELED') return true;
  if (error.name === 'CanceledError') return true;
  if (error.name === 'AbortError') return true;
  return false;
}
