import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useEvent, useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { getApiErrorMessage, isRequestCancelled } from '../services/api';
import { requestLecturePlayback } from '../services/videoLectureService';
import {
  getLectureProgress,
  saveLectureProgress,
  LECTURE_PROGRESS_SAVE_INTERVAL_MS,
} from '../utils/lectureProgress';
import { PremiumPdfUpgradeModal } from '../components/PremiumPdfUpgradeModal';
import { LECTURE_UPSELL_SUB, LECTURE_UPSELL_TITLE } from '../constants/upgradeCopy';
import { colors } from '../theme/colors';
import { pressFeedbackStyle } from '../utils/pressFeedback';

function PlayerSurface({ source, resumeSeconds, onTick, onPause, onEnded, onPlaybackError }) {
  const player = useVideoPlayer(source, (instance) => {
    instance.loop = false;
    instance.timeUpdateEventInterval = 1;
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const seekedRef = useRef(false);
  const errorSentRef = useRef(false);

  useEventListener(player, 'playToEnd', () => {
    onEnded?.(player.currentTime, player.duration);
  });

  useEventListener(player, 'timeUpdate', ({ currentTime, duration }) => {
    onTick?.(currentTime, duration);
  });

  useEventListener(player, 'playingChange', ({ isPlaying }) => {
    if (!isPlaying) {
      onPause?.(player.currentTime, player.duration);
    }
  });

  useEventListener(player, 'statusChange', ({ status: next }) => {
    if (next === 'error' && !errorSentRef.current) {
      errorSentRef.current = true;
      onPlaybackError?.();
    }
  });

  useEffect(() => {
    if (status === 'readyToPlay' && !seekedRef.current && resumeSeconds > 2) {
      player.currentTime = resumeSeconds;
      seekedRef.current = true;
      player.play();
    } else if (status === 'readyToPlay' && !seekedRef.current) {
      seekedRef.current = true;
      player.play();
    }
  }, [status, resumeSeconds, player]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        try {
          onTick?.(player.currentTime, player.duration);
          player.pause();
        } catch {
          /* player may already be released */
        }
      };
    }, [player, onTick])
  );

  return (
    <View style={styles.playerWrap}>
      <VideoView
        style={styles.video}
        player={player}
        nativeControls
        allowsFullscreen
        contentFit="contain"
      />
      {status === 'loading' ? (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.textOnPrimary} />
          <Text style={styles.overlayText}>Loading video…</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function LecturePlayerScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { user } = useAuth();
  const lectureId = route.params?.lectureId;
  const title = route.params?.title || 'Lecture';
  const userId = user?._id || user?.id;

  const [source, setSource] = useState(null);
  const [resumeSeconds, setResumeSeconds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [upgradeVisible, setUpgradeVisible] = useState(false);
  const lastSavedRef = useRef(0);
  const latestTickRef = useRef({ position: 0, duration: 0 });
  const abortRef = useRef(null);
  const playbackRetryRef = useRef(false);

  const persist = useCallback(
    async (position, duration, completed = false) => {
      if (!userId || !lectureId) return;
      await saveLectureProgress(userId, lectureId, {
        positionSeconds: position,
        durationSeconds: duration,
        completed,
      });
    },
    [lectureId, userId]
  );

  const authorize = useCallback(async () => {
    if (!lectureId) {
      setError('This lecture is unavailable.');
      setLoading(false);
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);
    setSource(null);
    try {
      const [auth, progress] = await Promise.all([
        requestLecturePlayback(lectureId, { signal: ac.signal }),
        getLectureProgress(userId, lectureId),
      ]);
      if (abortRef.current !== ac) return;
      const uri = typeof auth?.playbackUrl === 'string' ? auth.playbackUrl.trim() : '';
      if (!uri) {
        setError('Unable to start playback. Please try again.');
        return;
      }
      const resume =
        progress && !progress.completed ? Number(progress.positionSeconds) || 0 : 0;
      setResumeSeconds(resume);
      setSource({ uri, contentType: 'hls' });
      playbackRetryRef.current = false;
    } catch (e) {
      if (isRequestCancelled(e) || abortRef.current !== ac) return;
      if (e?.response?.status === 403) {
        setUpgradeVisible(true);
        setError('Premium required');
        return;
      }
      setError(getApiErrorMessage(e) || 'Unable to start playback. Please try again.');
    } finally {
      if (abortRef.current === ac) setLoading(false);
    }
  }, [lectureId, userId]);

  useEffect(() => {
    void authorize();
    return () => abortRef.current?.abort();
  }, [authorize]);

  const onTick = useCallback(
    (position, duration) => {
      latestTickRef.current = { position, duration };
      const now = Date.now();
      if (now - lastSavedRef.current < LECTURE_PROGRESS_SAVE_INTERVAL_MS) return;
      lastSavedRef.current = now;
      void persist(position, duration);
    },
    [persist]
  );

  const onPause = useCallback(
    (position, duration) => {
      latestTickRef.current = { position, duration };
      lastSavedRef.current = Date.now();
      void persist(position, duration);
    },
    [persist]
  );

  const onEnded = useCallback(
    (position, duration) => {
      lastSavedRef.current = Date.now();
      void persist(position, duration, true);
    },
    [persist]
  );

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({ title });
      return () => {
        const { position, duration } = latestTickRef.current;
        void persist(position, duration);
      };
    }, [navigation, persist, title])
  );

  return (
    <View style={styles.screen}>
      {loading && !source ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.hint}>Preparing lecture…</Text>
        </View>
      ) : error && !source ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error === 'Premium required' ? LECTURE_UPSELL_SUB : error}</Text>
          {error !== 'Premium required' ? (
            <Pressable
              onPress={() => void authorize()}
              style={({ pressed }) => [styles.retry, pressFeedbackStyle(pressed)]}
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          ) : null}
        </View>
      ) : source ? (
        <PlayerSurface
          source={source}
          resumeSeconds={resumeSeconds}
          onTick={onTick}
          onPause={onPause}
          onEnded={onEnded}
          onPlaybackError={() => {
            if (playbackRetryRef.current) {
              setSource(null);
              setError('Playback failed. Please try again.');
              return;
            }
            playbackRetryRef.current = true;
            void authorize();
          }}
        />
      ) : null}
      <PremiumPdfUpgradeModal
        visible={upgradeVisible}
        onClose={() => setUpgradeVisible(false)}
        title={LECTURE_UPSELL_TITLE}
        subtitle={LECTURE_UPSELL_SUB}
        onUpgrade={() => {
          setUpgradeVisible(false);
          navigation.navigate('Premium', { from: 'lecture' });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0f172a' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  hint: { marginTop: 12, color: colors.textOnPrimary },
  error: { color: colors.textOnPrimary, textAlign: 'center', lineHeight: 22 },
  retry: {
    marginTop: 16,
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: { color: colors.textOnPrimary, fontWeight: '700' },
  playerWrap: { flex: 1, justifyContent: 'center' },
  video: { width: '100%', height: 240 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.35)',
  },
  overlayText: { color: colors.textOnPrimary, marginTop: 8 },
});
