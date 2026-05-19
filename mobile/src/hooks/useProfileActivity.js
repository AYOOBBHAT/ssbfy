import { useCallback, useEffect, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getRecentLearningSessions } from '../services/learningSessionService';
import {
  getProfileActivityCache,
  putProfileActivityCache,
} from '../utils/profileActivityCache';
import { isRequestCancelled } from '../services/api';

export const PROFILE_ACTIVITY_PREVIEW = 3;
const EXPANDED_PRACTICE_LIMIT = 15;

function normalizePracticeRow(row) {
  const id = row?.id ?? row?._id;
  if (!id) return null;
  return {
    id: String(id),
    sessionType: row?.sessionType ?? 'practice',
    accuracy: row?.accuracy != null ? Number(row.accuracy) : null,
    totalQuestions: Number(row?.totalQuestions) || 0,
    completedAt: row?.completedAt ?? null,
  };
}

export function normalizeMockActivityRow(row) {
  if (!row?.id) return null;
  return {
    id: String(row.id),
    testTitle: row?.testTitle ?? null,
    attemptNumber: row?.attemptNumber ?? null,
    accuracy: row?.accuracy != null ? Number(row.accuracy) : null,
    timeTaken: row?.timeTaken != null ? Number(row.timeTaken) : null,
    endTime: row?.endTime ?? null,
  };
}

/**
 * Deferred recent-activity loader for Profile.
 * Practice: `/learning-sessions/recent` (limit 3, then 15 on expand).
 * Mocks: sliced from profile analytics payload (no extra request).
 */
export function useProfileActivity(recentMocksFromAnalytics) {
  const [ready, setReady] = useState(false);
  const [practice, setPractice] = useState([]);
  const [loading, setLoading] = useState(false);
  const [practiceExpanded, setPracticeExpanded] = useState(false);
  const [mocksExpanded, setMocksExpanded] = useState(false);

  const allMocks = useRef([]);

  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => setReady(true));
    return () => handle.cancel();
  }, []);

  useEffect(() => {
    const source = Array.isArray(recentMocksFromAnalytics) ? recentMocksFromAnalytics : [];
    allMocks.current = source.map(normalizeMockActivityRow).filter(Boolean);
  }, [recentMocksFromAnalytics]);

  const loadPractice = useCallback(async (practiceLimit, signal, { preferCache = true } = {}) => {
    try {
      if (preferCache) {
        const cached = await getProfileActivityCache();
        if (signal.aborted) return;
        if (cached?.practice?.length) {
          setPractice(cached.practice.slice(0, practiceLimit));
          return;
        }
      }

      setLoading(true);

      const { sessions } = await getRecentLearningSessions({
        signal,
        limit: practiceLimit,
      });
      if (signal.aborted) return;

      const normalizedPractice = sessions.map(normalizePracticeRow).filter(Boolean);
      setPractice(normalizedPractice);

      const mocksForCache = allMocks.current.slice(0, PROFILE_ACTIVITY_PREVIEW);
      void putProfileActivityCache({ practice: normalizedPractice, mocks: mocksForCache });
    } catch (e) {
      if (signal.aborted || isRequestCancelled(e)) return;
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return undefined;

    const ac = new AbortController();
    const practiceLimit = practiceExpanded ? EXPANDED_PRACTICE_LIMIT : PROFILE_ACTIVITY_PREVIEW;
    void loadPractice(practiceLimit, ac.signal, { preferCache: true });

    return () => ac.abort();
  }, [ready, practiceExpanded, loadPractice]);

  /** Refetch when Profile regains focus after cache invalidation (post-completion). */
  useFocusEffect(
    useCallback(() => {
      if (!ready) return undefined;

      const ac = new AbortController();
      let cancelled = false;
      const practiceLimit = practiceExpanded ? EXPANDED_PRACTICE_LIMIT : PROFILE_ACTIVITY_PREVIEW;

      (async () => {
        const cached = await getProfileActivityCache();
        if (cancelled || ac.signal.aborted) return;
        if (cached?.practice?.length) return;
        await loadPractice(practiceLimit, ac.signal, { preferCache: false });
      })();

      return () => {
        cancelled = true;
        ac.abort();
      };
    }, [ready, practiceExpanded, loadPractice])
  );

  const mocks = mocksExpanded
    ? allMocks.current
    : allMocks.current.slice(0, PROFILE_ACTIVITY_PREVIEW);

  const practiceVisible = practiceExpanded
    ? practice
    : practice.slice(0, PROFILE_ACTIVITY_PREVIEW);

  const practiceHasMore =
    !practiceExpanded && practice.length >= PROFILE_ACTIVITY_PREVIEW;

  const mocksHasMore =
    !mocksExpanded && allMocks.current.length > PROFILE_ACTIVITY_PREVIEW;

  return {
    ready,
    loading,
    practice: practiceVisible,
    mocks,
    practiceHasMore,
    mocksHasMore,
    expandPractice: () => setPracticeExpanded(true),
    expandMocks: () => setMocksExpanded(true),
  };
}
