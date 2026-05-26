import { formatActivityClock } from './activityTimeFormat';

export function getBattleHistoryScoreChip(row) {
  if (row?.uxStatus === 'completed') {
    if (row?.outcome === 'win') return 'Win';
    if (row?.outcome === 'loss') return 'Loss';
    if (row?.outcome === 'tie') return 'Tie';
  }
  if (row?.uxStatus === 'awaiting_opponent') return 'Wait';
  if (row?.uxStatus === 'waiting') return 'Invite';
  if (row?.uxStatus === 'active') return 'Play';
  if (row?.uxStatus === 'expired') return 'End';
  return '-';
}

export function getBattleHistoryVisualKind(row) {
  if (row?.uxStatus === 'completed') {
    if (row?.outcome === 'win') return 'win';
    if (row?.outcome === 'loss') return 'loss';
    return 'tie';
  }
  return 'pending';
}

export function getBattleHistoryMeta(row) {
  const parts = [];
  if (row?.topicLabel) parts.push(row.topicLabel);
  if (row?.scoreLine && row?.uxStatus === 'completed') parts.push(row.scoreLine);
  const clock = formatActivityClock(row?.updatedAt || row?.createdAt);
  if (clock) parts.push(clock);
  return parts.filter(Boolean).join(' · ');
}

export function canOpenBattleHistoryRow(row) {
  return row?.uxStatus !== 'expired' || row?.reopenAction === 'lobby';
}

export function areBattleHistoryRowsRenderEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.uxStatus === b.uxStatus &&
    a.reopenAction === b.reopenAction &&
    a.outcome === b.outcome &&
    a.headline === b.headline &&
    a.topicLabel === b.topicLabel &&
    a.scoreLine === b.scoreLine &&
    a.updatedAt === b.updatedAt &&
    a.createdAt === b.createdAt
  );
}

export function areBattleHistorySummariesEqual(a, b) {
  if (a === b) return true;
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    (a.wins ?? 0) === (b.wins ?? 0) &&
    (a.losses ?? 0) === (b.losses ?? 0) &&
    (a.ties ?? 0) === (b.ties ?? 0) &&
    (a.pendingCount ?? 0) === (b.pendingCount ?? 0)
  );
}

function areRecentOpponentsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.userId === b.userId &&
    a.displayName === b.displayName &&
    a.lastBattleAt === b.lastBattleAt &&
    a.lastOutcome === b.lastOutcome &&
    a.lastBattleId === b.lastBattleId
  );
}

function arePaginationEqual(a, b) {
  if (a === b) return true;
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    (a.recentLimit ?? 0) === (b.recentLimit ?? 0) &&
    (a.recentSkip ?? 0) === (b.recentSkip ?? 0) &&
    !!a.hasMoreRecent === !!b.hasMoreRecent
  );
}

function stabilizeArray(prevList, nextList, areItemsEqual) {
  const next = Array.isArray(nextList) ? nextList : [];
  const prev = Array.isArray(prevList) ? prevList : [];
  if (!prev.length) return next;

  const prevById = new Map(
    prev.map((item) => [String(item?.id ?? item?.userId ?? ''), item])
  );
  let changed = prev.length !== next.length;

  const merged = next.map((item, index) => {
    const key = String(item?.id ?? item?.userId ?? '');
    const prevItem = prevById.get(key);
    const stableItem =
      prevItem && areItemsEqual(prevItem, item) ? prevItem : item;
    if (!changed && prev[index] !== stableItem) {
      changed = true;
    }
    return stableItem;
  });

  return changed ? merged : prev;
}

export function stabilizeBattleHistoryPayload(prevPayload, nextPayload) {
  const next =
    nextPayload && typeof nextPayload === 'object' ? nextPayload : null;
  const prev =
    prevPayload && typeof prevPayload === 'object' ? prevPayload : null;

  if (!next) return next;
  if (!prev) return next;

  const summary = areBattleHistorySummariesEqual(prev.summary, next.summary)
    ? prev.summary
    : next.summary ?? null;
  const pendingBattles = stabilizeArray(
    prev.pendingBattles,
    next.pendingBattles,
    areBattleHistoryRowsRenderEqual
  );
  const recentBattles = stabilizeArray(
    prev.recentBattles,
    next.recentBattles,
    areBattleHistoryRowsRenderEqual
  );
  const recentOpponents = stabilizeArray(
    prev.recentOpponents,
    next.recentOpponents,
    areRecentOpponentsEqual
  );
  const pagination = arePaginationEqual(prev.pagination, next.pagination)
    ? prev.pagination
    : next.pagination ?? null;

  const unchanged =
    summary === prev.summary &&
    pendingBattles === prev.pendingBattles &&
    recentBattles === prev.recentBattles &&
    recentOpponents === prev.recentOpponents &&
    pagination === prev.pagination;

  if (unchanged) {
    return prev;
  }

  return {
    ...next,
    summary,
    pendingBattles,
    recentBattles,
    recentOpponents,
    pagination,
  };
}
