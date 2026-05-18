/**
 * Smoke test for learning analytics engine (no DB).
 */
import {
  applySessionToAggregate,
  computeTopicMasteryScore,
  createEmptyAnalyticsState,
  buildOverviewFromState,
  extractSessionMetrics,
} from '../src/utils/learningAnalyticsEngine.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const session = {
  _id: '507f1f77bcf86cd799439011',
  sessionType: 'topic',
  completedAt: new Date('2025-05-10T12:00:00Z'),
  summary: { accuracy: 80, totalQuestions: 5, correct: 4 },
  snapshot: {
    version: 1,
    sessionType: 'topic',
    completedAt: new Date('2025-05-10T12:00:00Z'),
    summary: { accuracy: 80, totalQuestions: 5, correct: 4 },
    weakTopics: [{ topicId: '507f1f77bcf86cd799439012', topicName: 'Polity', mistakeCount: 1 }],
    questions: [
      {
        questionId: '507f1f77bcf86cd799439013',
        topicId: '507f1f77bcf86cd799439012',
        topicName: 'Polity',
        isCorrect: true,
        options: ['a', 'b'],
      },
      {
        questionId: '507f1f77bcf86cd799439014',
        topicId: '507f1f77bcf86cd799439012',
        topicName: 'Polity',
        isCorrect: false,
        options: ['a', 'b'],
      },
    ],
  },
};

const metrics = extractSessionMetrics(session);
assert(metrics && metrics.accuracy === 80, 'extract metrics');

let state = createEmptyAnalyticsState();
state = applySessionToAggregate(state, session);
assert(state.totals.sessions === 1, 'one session');
assert(state.processedSessionIds.length === 1, 'processed id');

state = applySessionToAggregate(state, session);
assert(state.totals.sessions === 1, 'idempotent');

const mastery = computeTopicMasteryScore({
  recentAccuracies: [50, 60, 70, 80],
  sessionCount: 3,
  retryBonus: 5,
});
assert(mastery >= 50 && mastery <= 100, 'mastery range');

const overview = buildOverviewFromState(state, { streakDays: 3, mockSessions: 2 });
assert(overview.streakDays === 3, 'streak');
assert(overview.practiceBreakdown.mock === 2, 'mock breakdown');
assert(overview.hasPracticeData === true, 'has practice');

console.log('verify-learning-analytics: all checks passed');
