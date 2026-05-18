import api from './api.js';
import { PREMIUM_SAVE_MESSAGE } from '../constants/upgradeCopy.js';
import { sanitizeSavedMaterialTogglePayload } from '../utils/mongoId.js';

export { PREMIUM_SAVE_MESSAGE };

export async function toggleSavedMaterial(payload, opts = {}) {
  const clean = sanitizeSavedMaterialTogglePayload(payload);
  if (!clean) {
    return { saved: false };
  }
  const { signal } = opts;
  const { data } = await api.post('/saved-materials/toggle', clean, { signal });
  return data?.data ?? { saved: false };
}

export async function getSavedMaterials(opts = {}) {
  const { signal } = opts;
  const { data } = await api.get('/saved-materials', { signal });
  const payload = data?.data ?? {};
  return {
    savedPdfs: Array.isArray(payload.savedPdfs) ? payload.savedPdfs : [],
    savedNotes: Array.isArray(payload.savedNotes) ? payload.savedNotes : [],
  };
}
