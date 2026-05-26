import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Share, ActivityIndicator } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getApiErrorMessage, isRequestCancelled } from '../services/api';
import { getBattle, startBattleAttempt } from '../services/battleService';
import { questionIdsFromDocs } from '../utils/mongoId';
import BattleFramingBanner from '../components/battle/BattleFramingBanner';
import { colors } from '../theme/colors';
import { battleAccent, formatBattleTimerLabel } from '../theme/setupPresentation';
import { setupPresentationDevLog } from '../utils/setupPresentationDevLog';
import { NAV_TRANSITION_LOCK_MS, tryAcquireLock } from '../utils/navigationGuard';
import { pressCardStyle } from '../utils/pressFeedback';
import { MAIN_TABS } from '../navigation/testFlowNavigation';
import { battleHistoryDevLog } from '../utils/battleHistoryDevLog';
import {
  formatBattleShareMessage,
  normalizeBattleWebLink,
} from '../utils/battleInviteLinks';
import {
  logNavigationPayload,
  storeSessionQuestionSnapshot,
} from '../utils/navigationPayloadStore';

async function copyToClipboard(text) {
  try {
    const Clipboard = await import('expo-clipboard');
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}

export default function BattleLobbyScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const battleId = String(route.params?.battleId ?? '');
  const created = !!route.params?.created;
  const joined = !!route.params?.joined;

  const [battle, setBattle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);
  const startLockRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!battleId) return;
    pollRef.current?.abort();
    const ac = new AbortController();
    pollRef.current = ac;
    try {
      const data = await getBattle(battleId, { signal: ac.signal });
      if (pollRef.current !== ac) return;
      const b = data?.battle ?? null;
      setBattle(b);
      setError(null);
      if (b?.status === 'expired') {
        battleHistoryDevLog('lobby_expired', { battleId });
      }
    } catch (e) {
      if (isRequestCancelled(e) || pollRef.current !== ac) return;
      setError(getApiErrorMessage(e));
    } finally {
      if (pollRef.current === ac) setLoading(false);
    }
  }, [battleId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void refresh();
      const id = setInterval(() => void refresh(), 8000);
      return () => {
        clearInterval(id);
        pollRef.current?.abort();
      };
    }, [refresh])
  );

  const shareInvite = useCallback(async () => {
    if (!battle?.inviteCode) return;
    try {
      await Share.share({
        message: formatBattleShareMessage(battle.inviteCode, battle.webLink),
      });
    } catch {
      /* user dismissed */
    }
  }, [battle]);

  const handleCopy = useCallback(async () => {
    if (!battle?.inviteCode) return;
    await copyToClipboard(normalizeBattleWebLink(battle.webLink, battle.inviteCode));
  }, [battle]);

  const myAttemptDone =
    battle?.viewerRole === 'creator'
      ? !!battle?.creatorAttemptId
      : !!battle?.opponentAttemptId;

  const handlePlay = useCallback(async () => {
    if (!battleId || myAttemptDone || !tryAcquireLock(startLockRef)) return;
    setStarting(true);
    setError(null);
    try {
      const data = await startBattleAttempt(battleId);
      const questions = Array.isArray(data?.questions) ? data.questions : [];
      const questionIds = questionIdsFromDocs(questions);
      const practiceSessionId = data?.practiceSessionId;
      if (!practiceSessionId || !questionIds.length) {
        setError('Could not start battle. Try again.');
        return;
      }
      const durationMinutes =
        battle?.timerMode === 'total' && battle?.timerSeconds
          ? Math.ceil(Number(battle.timerSeconds) / 60)
          : undefined;
      storeSessionQuestionSnapshot(practiceSessionId, questions, {
        source: 'battle_start',
      });
      const testParams = {
        mode: 'battle',
        practiceType: 'battle',
        battleId,
        questionIds,
        practiceSessionId,
        originMainTab: MAIN_TABS.HOME,
        durationMinutes,
      };
      logNavigationPayload('Test', testParams, {
        includeDebug: true,
        source: 'battle_start',
      });
      navigation.navigate('Test', testParams);
    } catch (e) {
      if (!isRequestCancelled(e)) setError(getApiErrorMessage(e));
    } finally {
      setStarting(false);
    }
  }, [battleId, battle, myAttemptDone, navigation]);

  const handleViewResult = useCallback(() => {
    if (!battleId) return;
    navigation.navigate('BattleResult', { battleId });
  }, [battleId, navigation]);

  useEffect(() => {
    if (!battle) return;
    const isCreator = battle.viewerRole === 'creator';
    const label = starting
      ? 'Starting…'
      : isCreator
      ? 'Start battle'
      : 'Enter battle';
    setupPresentationDevLog('battle_lobby_presentation', {
      viewerRole: battle.viewerRole,
      status: battle.status,
      playCtaLabel: label,
      created,
      joined,
    });
  }, [battle, starting, created, joined]);

  if (loading && !battle) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!battle) {
    return (
      <View style={styles.centered}>
        <Text style={styles.err}>{error || 'Battle not found'}</Text>
      </View>
    );
  }

  const isCreator = battle.viewerRole === 'creator';
  const waitingOpponent = !battle.opponentUserId && isCreator;
  const statusLabel =
    battle.status === 'completed'
      ? 'Battle complete'
      : battle.status === 'expired'
      ? 'Challenge expired'
      : waitingOpponent
      ? 'Waiting for opponent'
      : isCreator
      ? 'Battle ready'
      : 'Challenge accepted';

  const playCtaLabel = starting
    ? 'Starting…'
    : isCreator
    ? 'Start battle'
    : 'Enter battle';

  return (
    <View style={styles.container}>
      {created ? (
        <BattleFramingBanner
          title="Challenge created"
          subtitle="Share the code or link so your opponent can join. You both play the same questions."
          icon="share-social-outline"
        />
      ) : joined && !isCreator ? (
        <BattleFramingBanner
          title="Challenge accepted"
          subtitle="Match rules are locked by the creator. Enter the battle when you're ready."
          icon="checkmark-done-outline"
        />
      ) : !isCreator && battle.opponentUserId ? (
        <BattleFramingBanner
          title="Head-to-head match"
          subtitle="You're the opponent in this challenge. Settings were chosen by the creator."
          icon="people-outline"
        />
      ) : null}

      <Text style={styles.codeLabel}>Battle code</Text>
      <Text style={styles.code}>{battle.inviteCode}</Text>
      <Text style={styles.status}>{statusLabel}</Text>
      <Text style={styles.meta}>
        {battle.questionCount} questions · {formatBattleTimerLabel(battle)}
      </Text>

      {battle.status !== 'expired' && battle.viewerRole === 'creator' ? (
        <View style={styles.shareRow}>
          <Pressable onPress={shareInvite} style={({ pressed }) => [styles.shareBtn, pressCardStyle(pressed)]}>
            <Ionicons name="share-social" size={20} color={colors.primary} />
            <Text style={styles.shareBtnText}>Share challenge</Text>
          </Pressable>
          <Pressable onPress={handleCopy} style={({ pressed }) => [styles.shareBtn, pressCardStyle(pressed)]}>
            <Ionicons name="copy" size={20} color={colors.primary} />
            <Text style={styles.shareBtnText}>Copy link</Text>
          </Pressable>
        </View>
      ) : null}

      {error ? <Text style={styles.err}>{error}</Text> : null}

      {battle.status === 'completed' ? (
        <Pressable
          onPress={handleViewResult}
          style={({ pressed }) => [styles.primaryBtn, pressCardStyle(pressed)]}
        >
          <Text style={styles.primaryBtnText}>View battle results</Text>
        </Pressable>
      ) : myAttemptDone ? (
        <View style={styles.waitCard}>
          <Text style={styles.waitTitle}>Your battle attempt is in</Text>
          <Text style={styles.waitSub}>
            {battle.opponentUserId
              ? 'Waiting for your opponent to finish their attempt…'
              : 'Share the challenge so your opponent can join and play.'}
          </Text>
          <Pressable onPress={handleViewResult} style={({ pressed }) => [styles.secondaryBtn, pressCardStyle(pressed)]}>
            <Text style={styles.secondaryBtnText}>View match standings</Text>
          </Pressable>
        </View>
      ) : battle.status === 'expired' ? (
        <Text style={styles.expired}>This battle has expired.</Text>
      ) : (
        <Pressable
          onPress={handlePlay}
          disabled={starting || (battle.viewerRole === 'opponent' && !battle.opponentUserId)}
          style={({ pressed }) => [
            styles.primaryBtn,
            pressCardStyle(pressed),
            starting && styles.btnDisabled,
          ]}
        >
          <Ionicons name="flash" size={20} color={colors.textOnPrimary} />
          <Text style={styles.primaryBtnText}>{playCtaLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 20 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  codeLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  code: {
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 4,
    color: battleAccent.primary,
    textAlign: 'center',
    marginTop: 4,
  },
  status: { fontSize: 18, fontWeight: '700', textAlign: 'center', marginTop: 8, color: colors.text },
  meta: { fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 4, marginBottom: 20 },
  shareRow: { flexDirection: 'row', gap: 12, justifyContent: 'center', marginBottom: 24 },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 12,
    backgroundColor: colors.card,
    borderRadius: 10,
  },
  shareBtnText: { color: battleAccent.text, fontWeight: '600' },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: battleAccent.primary,
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
  },
  primaryBtnText: { color: colors.textOnPrimary, fontWeight: '700', fontSize: 16 },
  secondaryBtn: {
    marginTop: 12,
    padding: 12,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: battleAccent.primary,
  },
  secondaryBtnText: { color: battleAccent.text, fontWeight: '600' },
  waitCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  waitTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  waitSub: { fontSize: 14, color: colors.muted, marginTop: 6, lineHeight: 20 },
  expired: { fontSize: 15, color: colors.muted, textAlign: 'center', marginTop: 16 },
  err: { color: colors.error, marginBottom: 12, textAlign: 'center' },
  btnDisabled: { opacity: 0.6 },
});
