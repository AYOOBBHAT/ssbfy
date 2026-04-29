import api from './api.js';

/** @returns {Promise<{ results: object[] }>} */
export async function getMyResults() {
  const { data } = await api.get('/results');
  return data?.data ?? { results: [] };
}

