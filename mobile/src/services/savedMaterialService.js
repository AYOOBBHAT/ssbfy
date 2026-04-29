import api from './api.js';

export const PREMIUM_SAVE_MESSAGE = 'Upgrade to Premium to save materials for later.';

export async function toggleSavedMaterial(payload) {
  const { data } = await api.post('/saved-materials/toggle', payload);
  return data?.data ?? { saved: false };
}

export async function getSavedMaterials() {
  const { data } = await api.get('/saved-materials');
  const payload = data?.data ?? {};
  return {
    savedPdfs: Array.isArray(payload.savedPdfs) ? payload.savedPdfs : [],
    savedNotes: Array.isArray(payload.savedNotes) ? payload.savedNotes : [],
  };
}
