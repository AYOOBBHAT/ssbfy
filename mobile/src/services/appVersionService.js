import api from './api';
import { parseAndroidPolicy } from '../utils/appVersionPolicy';

/**
 * Fetch public Android version policy. Throws on network/HTTP errors
 * so the gate can fail open. Invalid JSON shape returns null.
 */
export async function fetchAndroidVersionPolicy({ signal } = {}) {
  const res = await api.get('/app/version', { signal });
  return parseAndroidPolicy(res?.data);
}
