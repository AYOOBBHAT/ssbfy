import api from './api';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? null;
}

export async function getBattleQuota({ signal } = {}) {
  const res = await api.get('/battles/quota', { signal });
  return unwrap(res);
}

export async function getBattleAvailability({ subjectId, topicId, difficulty }, { signal } = {}) {
  const res = await api.get('/battles/availability', {
    params: { subjectId, topicId, difficulty: difficulty || 'all' },
    signal,
  });
  return unwrap(res);
}

export async function createBattle(body, { signal } = {}) {
  const res = await api.post('/battles', body, { signal });
  return unwrap(res);
}

export async function previewBattleInvite(inviteCode, { signal } = {}) {
  const code = String(inviteCode).trim().toUpperCase();
  const res = await api.get(`/battles/invite/${encodeURIComponent(code)}`, { signal });
  return unwrap(res);
}

export async function joinBattle(inviteCode, { signal } = {}) {
  const code = String(inviteCode).trim().toUpperCase();
  const res = await api.post(`/battles/join/${encodeURIComponent(code)}`, {}, { signal });
  return unwrap(res);
}

export async function getBattle(battleId, { signal } = {}) {
  const res = await api.get(`/battles/${battleId}`, { signal });
  return unwrap(res);
}

export async function startBattleAttempt(battleId, { signal } = {}) {
  const res = await api.post(`/battles/${battleId}/start`, {}, { signal });
  return unwrap(res);
}

export async function getBattleResult(battleId, { signal } = {}) {
  const res = await api.get(`/battles/${battleId}/result`, { signal });
  return unwrap(res);
}

export async function listMyBattles({ signal } = {}) {
  const res = await api.get('/battles/mine', { signal });
  return unwrap(res);
}

export async function getBattleHistory({ recentLimit, recentSkip } = {}, { signal } = {}) {
  const res = await api.get('/battles/history', {
    params: {
      ...(recentLimit != null ? { recentLimit } : {}),
      ...(recentSkip != null ? { recentSkip } : {}),
    },
    signal,
  });
  return unwrap(res);
}
