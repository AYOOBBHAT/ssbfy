import mongoose from 'mongoose';
import {
  BATTLE_HISTORY_PENDING_MAX,
  BATTLE_HISTORY_RECENT_DEFAULT,
  BATTLE_HISTORY_RECENT_MAX,
  BATTLE_RECENT_OPPONENTS_MAX,
} from '../constants/battleHistory.js';
import { battleSessionRepository } from '../repositories/battleSessionRepository.js';
import { subjectRepository } from '../repositories/subjectRepository.js';
import { topicRepository } from '../repositories/topicRepository.js';
import { userRepository } from '../repositories/userRepository.js';
import {
  buildBattleHeadline,
  buildScoreComparisonLine,
  deriveBattleUxStatus,
  deriveOutcomeForUser,
  deriveReopenAction,
  sortPendingRows,
} from '../utils/battleHistoryPresentation.js';

function displayNameFromUser(user) {
  if (!user) return 'Opponent';
  const name = typeof user.name === 'string' ? user.name.trim() : '';
  if (name) return name;
  const email = typeof user.email === 'string' ? user.email.trim() : '';
  if (email) return email.split('@')[0];
  return 'Opponent';
}

function opponentUserIdFor(battle, userId) {
  const uid = String(userId);
  if (String(battle.creatorUserId) === uid) {
    return battle.opponentUserId ? String(battle.opponentUserId) : null;
  }
  return String(battle.creatorUserId);
}

function scoresForViewer(battle, userId) {
  const uid = String(userId);
  if (String(battle.creatorUserId) === uid) {
    return {
      yourScore: battle.creatorScore ?? null,
      opponentScore: battle.opponentScore ?? null,
    };
  }
  return {
    yourScore: battle.opponentScore ?? null,
    opponentScore: battle.creatorScore ?? null,
  };
}

function toIso(d) {
  if (!d) return null;
  return new Date(d).toISOString();
}

/**
 * @param {object} battle
 * @param {string} userId
 * @param {Map<string, string>} nameByUserId
 * @param {Map<string, string>} subjectNameById
 * @param {Map<string, string>} topicNameById
 */
function buildHistoryRow(battle, userId, nameByUserId, subjectNameById, topicNameById) {
  const uxStatus = deriveBattleUxStatus(battle, userId);
  const outcome = deriveOutcomeForUser(battle, userId);
  const opponentId = opponentUserIdFor(battle, userId);
  const opponentDisplayName = opponentId ? nameByUserId.get(opponentId) || 'Opponent' : null;
  const { yourScore, opponentScore } = scoresForViewer(battle, userId);
  const role =
    String(battle.creatorUserId) === String(userId)
      ? 'creator'
      : 'opponent';

  const subjectName = subjectNameById.get(String(battle.subjectId)) || '';
  const topicName = topicNameById.get(String(battle.topicId)) || '';

  return {
    id: String(battle._id),
    inviteCode: battle.inviteCode,
    uxStatus,
    backendStatus: battle.status,
    viewerRole: role,
    subjectId: String(battle.subjectId),
    topicId: String(battle.topicId),
    subjectName,
    topicName,
    topicLabel: topicName || subjectName || 'Battle',
    opponentUserId: opponentId,
    opponentDisplayName,
    yourScore,
    opponentScore,
    winnerUserId: battle.winnerUserId ? String(battle.winnerUserId) : null,
    outcome,
    headline: buildBattleHeadline({
      uxStatus,
      outcome,
      opponentDisplayName: opponentDisplayName || 'friend',
      yourScore,
      opponentScore,
    }),
    scoreLine: buildScoreComparisonLine(yourScore, opponentScore),
    reopenAction: deriveReopenAction(uxStatus),
    questionCount: battle.questionCount,
    createdAt: toIso(battle.createdAt),
    updatedAt: toIso(battle.updatedAt),
    expiresAt: toIso(battle.expiresAt),
    yourAttemptComplete: role === 'creator' ? Boolean(battle.creatorAttemptId) : Boolean(battle.opponentAttemptId),
  };
}

async function hydrateNames(battles) {
  const userIds = new Set();
  const subjectIds = new Set();
  const topicIds = new Set();

  for (const b of battles) {
    if (b.creatorUserId) userIds.add(String(b.creatorUserId));
    if (b.opponentUserId) userIds.add(String(b.opponentUserId));
    if (b.subjectId) subjectIds.add(String(b.subjectId));
    if (b.topicId) topicIds.add(String(b.topicId));
  }

  const [users, subjects, topics] = await Promise.all([
    userRepository.findDisplayNamesByIds([...userIds]),
    subjectRepository.findNamesByIds([...subjectIds]),
    topicRepository.findNamesByIds([...topicIds]),
  ]);

  const nameByUserId = new Map(
    users.map((u) => [String(u._id), displayNameFromUser(u)])
  );
  const subjectNameById = new Map(
    subjects.map((s) => [String(s._id), typeof s.name === 'string' ? s.name : ''])
  );
  const topicNameById = new Map(
    topics.map((t) => [String(t._id), typeof t.name === 'string' ? t.name : ''])
  );

  return { nameByUserId, subjectNameById, topicNameById };
}

function buildRecentOpponents(recentRows, userId) {
  const uid = String(userId);
  const seen = new Set();
  const out = [];

  for (const row of recentRows) {
    if (row.uxStatus !== 'completed' || !row.opponentUserId) continue;
    const oid = String(row.opponentUserId);
    if (oid === uid || seen.has(oid)) continue;
    seen.add(oid);
    out.push({
      userId: oid,
      displayName: row.opponentDisplayName || 'Opponent',
      lastBattleAt: row.updatedAt,
      lastOutcome: row.outcome,
      lastBattleId: row.id,
    });
    if (out.length >= BATTLE_RECENT_OPPONENTS_MAX) break;
  }

  return out;
}

export const battleHistoryService = {
  async getHistory(userId, query = {}) {
    const recentLimit = Math.max(
      1,
      Math.min(
        Number(query.recentLimit) || BATTLE_HISTORY_RECENT_DEFAULT,
        BATTLE_HISTORY_RECENT_MAX
      )
    );
    const recentSkip = Math.max(0, Math.min(Number(query.recentSkip) || 0, 200));

    const [record, pendingCount, pendingRaw, recentRaw] = await Promise.all([
      battleSessionRepository.aggregateRecordForUser(userId),
      battleSessionRepository.countPendingForUser(userId),
      battleSessionRepository.findPendingForUser(userId, { limit: BATTLE_HISTORY_PENDING_MAX }),
      battleSessionRepository.findRecentFinishedForUser(userId, {
        limit: recentLimit,
        skip: recentSkip,
      }),
    ]);

    const pendingMarked = [];
    for (const row of pendingRaw) {
      const b = await battleSessionRepository.markExpiredIfNeeded(row);
      if (deriveBattleUxStatus(b, userId) === 'expired') continue;
      pendingMarked.push(b);
    }

    const recentMarked = [];
    for (const row of recentRaw) {
      recentMarked.push(await battleSessionRepository.markExpiredIfNeeded(row));
    }

    const allForNames = [...pendingMarked, ...recentMarked];
    const { nameByUserId, subjectNameById, topicNameById } = await hydrateNames(allForNames);

    const pendingBattles = sortPendingRows(
      pendingMarked.map((b) =>
        buildHistoryRow(b, userId, nameByUserId, subjectNameById, topicNameById)
      )
    );

    const recentBattles = recentMarked.map((b) =>
      buildHistoryRow(b, userId, nameByUserId, subjectNameById, topicNameById)
    );

    const recentOpponents = buildRecentOpponents(recentBattles, userId);

    return {
      summary: {
        wins: record.wins,
        losses: record.losses,
        ties: record.ties,
        pendingCount,
      },
      pendingBattles,
      recentBattles,
      recentOpponents,
      pagination: {
        recentLimit,
        recentSkip,
        hasMoreRecent: recentRaw.length === recentLimit,
      },
    };
  },
};
