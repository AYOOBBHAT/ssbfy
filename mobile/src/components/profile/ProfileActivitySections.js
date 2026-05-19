import React, { memo, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors } from '../../theme/colors';
import { pressCardStyle } from '../../utils/pressFeedback';
import { formatActivityLabel } from '../../utils/formatActivityLabel';
import {
  formatActivityClock,
  formatDurationShort,
  formatMmSs,
  joinActivityMeta,
} from '../../utils/activityTimeFormat';
import { useProfileActivity } from '../../hooks/useProfileActivity';
import ProfileActivityRow from './ProfileActivityRow';

function resolvePracticeSessionKind(sessionType) {
  const key = String(sessionType || 'practice').toLowerCase();
  if (key === 'weak' || key === 'weak_topics' || key === 'weak_topic') return 'weak';
  if (key === 'smart' || key === 'smart_practice') return 'smart';
  if (key === 'daily' || key === 'daily_practice') return 'daily';
  if (key === 'retry' || key === 'retry_session') return 'retry';
  return key;
}

function practiceTitle(sess) {
  return formatActivityLabel(sess?.sessionType || 'Practice session');
}

function practiceMeta(sess) {
  const parts = [];
  const q = Number(sess?.totalQuestions) || 0;
  if (q > 0) parts.push(`${q} question${q === 1 ? '' : 's'}`);
  const clock = formatActivityClock(sess?.completedAt);
  if (clock) parts.push(clock);
  return joinActivityMeta(parts);
}

function mockTitle(att) {
  return formatActivityLabel(att?.testTitle || 'Mock Test');
}

function mockMeta(att, fallbackIndex) {
  const parts = [];
  if (att?.attemptNumber != null) {
    parts.push(`Attempt #${String(att.attemptNumber)}`);
  } else {
    parts.push(`Attempt ${fallbackIndex + 1}`);
  }
  const duration =
    att?.timeTaken != null && Number.isFinite(Number(att.timeTaken))
      ? formatDurationShort(Number(att.timeTaken)) ||
        formatMmSs(Number(att.timeTaken))
      : null;
  if (duration) parts.push(duration);
  const clock = formatActivityClock(att?.endTime);
  if (clock) parts.push(clock);
  return joinActivityMeta(parts);
}

function scoreLabel(accuracy) {
  if (accuracy == null || !Number.isFinite(Number(accuracy))) return '—';
  return `${Math.round(Number(accuracy))}%`;
}

function ActivitySectionHeader({ title }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function ViewAllButton({ onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.viewAllBtn, pressCardStyle(pressed)]}
    >
      <Text style={styles.viewAllText}>View all</Text>
      <Text style={styles.viewAllHint}>Show more</Text>
    </Pressable>
  );
}

function ProfileActivitySections({
  recentMocksFromAnalytics,
  onOpenMockAttempt,
  onOpenLearningSession,
}) {
  const {
    ready,
    practice,
    mocks,
    practiceHasMore,
    mocksHasMore,
    expandPractice,
    expandMocks,
  } = useProfileActivity(recentMocksFromAnalytics);

  const handleOpenPractice = useCallback(
    (id) => {
      if (id) onOpenLearningSession?.(id);
    },
    [onOpenLearningSession]
  );

  const handleOpenMock = useCallback(
    (id) => {
      if (id) onOpenMockAttempt?.(id);
    },
    [onOpenMockAttempt]
  );

  const practiceRows = useMemo(
    () =>
      practice.map((sess, idx) => {
        const kind = resolvePracticeSessionKind(sess.sessionType);
        const canOpen = !!sess.id && !!onOpenLearningSession;
        return (
          <ProfileActivityRow
            key={sess.id || `p-${idx}`}
            title={practiceTitle(sess)}
            meta={practiceMeta(sess)}
            scoreLabel={scoreLabel(sess.accuracy)}
            sessionKind={kind}
            disabled={!canOpen}
            onPress={canOpen ? () => handleOpenPractice(sess.id) : undefined}
          />
        );
      }),
    [practice, onOpenLearningSession, handleOpenPractice]
  );

  const mockRows = useMemo(
    () =>
      mocks.map((att, idx) => {
        const canOpen = !!att.id && !!onOpenMockAttempt;
        return (
          <ProfileActivityRow
            key={att.id || `m-${idx}`}
            title={mockTitle(att)}
            meta={mockMeta(att, idx)}
            scoreLabel={scoreLabel(att.accuracy)}
            sessionKind="mock"
            disabled={!canOpen}
            onPress={canOpen ? () => handleOpenMock(att.id) : undefined}
          />
        );
      }),
    [mocks, onOpenMockAttempt, handleOpenMock]
  );

  if (!ready) return null;

  const showPractice = practice.length > 0;
  const showMocks = mocks.length > 0;

  if (!showPractice && !showMocks) return null;

  return (
    <>
      {showPractice ? (
        <View style={styles.block}>
          <ActivitySectionHeader title="Recent practice sessions" />
          {practiceRows}
          {practiceHasMore ? <ViewAllButton onPress={expandPractice} /> : null}
        </View>
      ) : null}

      {showMocks ? (
        <View style={styles.block}>
          <ActivitySectionHeader title="Recent mock attempts" />
          {mockRows}
          {mocksHasMore ? <ViewAllButton onPress={expandMocks} /> : null}
        </View>
      ) : null}
    </>
  );
}

export default memo(ProfileActivitySections);

const styles = StyleSheet.create({
  block: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.55,
    marginBottom: 4,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    marginTop: 2,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  viewAllHint: {
    fontSize: 12,
    color: colors.muted,
  },
});
