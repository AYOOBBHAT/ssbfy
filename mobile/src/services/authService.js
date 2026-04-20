import api, { getApiErrorMessage } from './api.js';

/**
 * @returns {Promise<{ user: object, token: string }>}
 */
export async function signup({ name, email, password }) {
  const { data } = await api.post('/auth/signup', { name, email, password });
  return data?.data ?? {};
}

/**
 * @returns {Promise<{ user: object, token: string }>}
 */
export async function login({ email, password }) {
  const { data } = await api.post('/auth/login', { email, password });
  return data?.data ?? {};
}

export { getApiErrorMessage };
