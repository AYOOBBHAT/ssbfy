import api from './api.js';

/** @returns {Promise<{ results: object[] }>} */
export async function getMyResults(opts = {}) {
  const { signal } = opts;
  const { data } = await api.get('/results', { signal });
  return data?.data ?? { results: [] };
}

