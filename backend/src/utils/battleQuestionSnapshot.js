import mongoose from 'mongoose';

/**
 * Immutable question payload frozen on BattleSession at creation.
 * Enough to play, score, and reveal without reading live Question docs.
 */

/**
 * @param {object} q — Question lean doc at battle creation time
 */
export function buildBattleQuestionSnapshot(q) {
  if (!q || q._id == null) {
    throw new Error('Cannot snapshot question without _id');
  }

  const hasArr = Array.isArray(q.correctAnswers) && q.correctAnswers.length > 0;
  const correctAnswers = hasArr
    ? q.correctAnswers.map((n) => Number(n))
    : typeof q.correctAnswerIndex === 'number'
      ? [q.correctAnswerIndex]
      : [];
  const options = Array.isArray(q.options) ? q.options.map((o) => String(o)) : [];
  const primary =
    correctAnswers.length > 0
      ? correctAnswers[0]
      : typeof q.correctAnswerIndex === 'number'
        ? q.correctAnswerIndex
        : null;

  return {
    questionId: q._id instanceof mongoose.Types.ObjectId ? q._id : new mongoose.Types.ObjectId(String(q._id)),
    questionText: typeof q.questionText === 'string' ? q.questionText : '',
    options,
    questionType: q.questionType || 'single_correct',
    questionImage: typeof q.questionImage === 'string' ? q.questionImage : '',
    correctAnswers,
    correctAnswerIndex: primary,
    correctAnswerValue:
      typeof q.correctAnswerValue === 'string' && q.correctAnswerValue
        ? q.correctAnswerValue
        : primary != null && options[primary] != null
          ? String(options[primary]).trim()
          : '',
    explanation: typeof q.explanation === 'string' ? q.explanation : '',
    subjectId: q.subjectId,
    topicId: q.topicId,
    postIds: Array.isArray(q.postIds) ? [...q.postIds] : [],
    difficulty: q.difficulty || 'medium',
    year: q.year != null && Number.isFinite(Number(q.year)) ? Number(q.year) : null,
  };
}

export function buildBattleQuestionSnapshots(questions) {
  return Array.isArray(questions) ? questions.map(buildBattleQuestionSnapshot) : [];
}

export function battleHasQuestionSnapshots(battle) {
  return Array.isArray(battle?.questionSnapshots) && battle.questionSnapshots.length > 0;
}

/**
 * Restore a Question-shaped object for scoring / public projection.
 * Uses `_id` = snapshot.questionId so existing helpers keep working.
 */
export function questionFromBattleSnapshot(snap) {
  if (!snap) return null;
  const questionId = snap.questionId ?? snap._id;
  const hasArr = Array.isArray(snap.correctAnswers) && snap.correctAnswers.length > 0;
  const correctAnswers = hasArr
    ? snap.correctAnswers.map((n) => Number(n))
    : typeof snap.correctAnswerIndex === 'number'
      ? [snap.correctAnswerIndex]
      : [];

  return {
    _id: questionId,
    questionText: snap.questionText ?? '',
    options: Array.isArray(snap.options) ? [...snap.options] : [],
    questionType: snap.questionType || 'single_correct',
    questionImage: snap.questionImage || '',
    correctAnswers,
    correctAnswerIndex:
      snap.correctAnswerIndex != null
        ? snap.correctAnswerIndex
        : correctAnswers.length > 0
          ? correctAnswers[0]
          : null,
    correctAnswerValue: snap.correctAnswerValue || '',
    explanation: typeof snap.explanation === 'string' ? snap.explanation : '',
    subjectId: snap.subjectId,
    topicId: snap.topicId,
    postIds: Array.isArray(snap.postIds) ? [...snap.postIds] : [],
    difficulty: snap.difficulty,
    year: snap.year ?? null,
  };
}

/**
 * Snapshots in battle order. If `orderedIds` provided, reorders / filters to match.
 * @returns {object[]|null} Question-shaped docs, or null when no snapshots
 */
export function questionsFromBattleSnapshots(battle, orderedIds) {
  if (!battleHasQuestionSnapshots(battle)) return null;

  const byId = new Map(
    battle.questionSnapshots.map((s) => [String(s.questionId), questionFromBattleSnapshot(s)])
  );

  if (Array.isArray(orderedIds) && orderedIds.length > 0) {
    const ordered = [];
    for (const id of orderedIds) {
      const q = byId.get(String(id));
      if (!q) return null;
      ordered.push(q);
    }
    return ordered;
  }

  return battle.questionSnapshots.map(questionFromBattleSnapshot);
}
