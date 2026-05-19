export function formatActivityClock(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatDurationShort(totalSeconds) {
  const s = Math.max(0, Number(totalSeconds) || 0);
  if (s <= 0) return null;
  if (s < 60) return `${s} sec`;
  const m = Math.max(1, Math.round(s / 60));
  return m === 1 ? '1 min' : `${m} min`;
}

export function formatMmSs(totalSeconds) {
  const s = Math.max(0, Number(totalSeconds) || 0);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/** @param {(string|null|undefined)[]} parts */
export function joinActivityMeta(parts) {
  return parts.filter(Boolean).join(' · ');
}
