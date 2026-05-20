import { useCallback, useRef, useState } from 'react';
import {
  NAV_TRANSITION_LOCK_MS,
  releaseLockAfter,
  tryAcquireLock,
} from '../utils/navigationGuard';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../context/AuthContext';
import { getApiErrorMessage, isRequestCancelled } from '../services/api';
import { getDailyPractice } from '../services/dailyPracticeService';
import { questionIdsFromDocs } from '../utils/mongoId.js';
import { useMockQuota } from '../hooks/useMockQuota';
import { MockQuotaBanner } from '../components/MockQuotaBanner';
import { PremiumHomeBanner } from '../components/PremiumHomeBanner';
import {
  HOME_NOTES_SUB,
  HOME_PDF_SUB,
  HOME_PREMIUM_BUTTON,
  HOME_PREMIUM_SUB,
  HOME_PREMIUM_TITLE,
} from '../constants/upgradeCopy';
import { colors, brand } from '../theme/colors';
import { pressCardStyle, pressFeedbackStyle } from '../utils/pressFeedback';
import { userHasPremiumAccess } from '../utils/premiumAccess';

function greetingForHour() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const navigation = useNavigation();
  const dailyStartLockRef = useRef(false);
  const { user, refreshUser } = useAuth();
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyError, setDailyError] = useState(null);
  const dailyAbortRef = useRef(null);

  useFocusEffect(
    useCallback(() => {
      void refreshUser?.();
    }, [refreshUser])
  );

  const handleStartDailyPractice = async () => {
    if (dailyLoading || !tryAcquireLock(dailyStartLockRef)) return;
    dailyAbortRef.current?.abort();
    const ac = new AbortController();
    dailyAbortRef.current = ac;
    setDailyError(null);
    setDailyLoading(true);
    try {
      const data = await getDailyPractice({ signal: ac.signal });
      if (dailyAbortRef.current !== ac) return;
      const questions = Array.isArray(data?.questions) ? data.questions : [];
      const questionIds = questionIdsFromDocs(questions);
      const practiceSessionId = data?.practiceSessionId;
      if (!questionIds.length) {
        setDailyError('No daily practice questions available.');
        return;
      }
      if (!practiceSessionId) {
        setDailyError('Could not start daily practice. Please try again.');
        return;
      }
      navigation.navigate('Test', {
        mode: 'daily',
        questionIds,
        questions,
        practiceSessionId,
        originMainTab: 'Home',
      });
    } catch (e) {
      if (isRequestCancelled(e) || dailyAbortRef.current !== ac) return;
      setDailyError(getApiErrorMessage(e));
    } finally {
      if (dailyAbortRef.current === ac) {
        setDailyLoading(false);
      }
      releaseLockAfter(dailyStartLockRef, NAV_TRANSITION_LOCK_MS);
    }
  };

  const name = user?.name || 'there';
  const streak = Number(user?.streakCount) || 0;
  const streakLabel = streak === 1 ? 'day' : 'days';
  const greet = greetingForHour();
  const showPremiumBanner = !userHasPremiumAccess(user);
  const { quota, loading: quotaLoading, showQuota } = useMockQuota();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.greetingBlock}>
        <Text style={styles.greetLine}>
          {greet}, {name}{' '}
          <Text style={styles.wave}>👋</Text>
        </Text>
        <Text style={styles.taglinePrompt}>Ready for today&apos;s practice?</Text>
      </View>

      {showPremiumBanner ? (
        <PremiumHomeBanner
          title={HOME_PREMIUM_TITLE}
          subtitle={HOME_PREMIUM_SUB}
          buttonLabel={HOME_PREMIUM_BUTTON}
          onPress={() => navigation.navigate('Premium', { from: 'home' })}
        />
      ) : null}

      <View style={styles.heroCard}>
        <View style={styles.heroTop}>
          <View>
            <Text style={styles.heroKicker}>Today&apos;s practice</Text>
            <Text style={styles.heroTitle}>10 questions</Text>
            <Text style={styles.heroSub}>Sharpen skills with a quick, focused drill.</Text>
          </View>
        </View>
        <View style={styles.streakRow}>
          <Ionicons name="trophy" size={18} color={colors.primaryDark} />
          <Text style={styles.streakText}>
            {streak === 0
              ? "Start your streak — finish today's practice"
              : `${streak} ${streakLabel} streak · keep the momentum`}
          </Text>
        </View>
        {dailyError ? (
          <View style={styles.inlineAlert}>
            <Text style={styles.err}>{dailyError}</Text>
          </View>
        ) : null}
        <Pressable
          onPress={handleStartDailyPractice}
          disabled={dailyLoading}
          style={({ pressed }) => [
            styles.heroBtn,
            pressFeedbackStyle(pressed, dailyLoading),
          ]}
        >
          <Ionicons name="play" size={18} color={colors.textOnPrimary} />
          <Text style={styles.heroBtnText}>
            {dailyLoading ? 'Starting…' : 'Start daily practice'}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Practice</Text>
      <Pressable
        onPress={() => navigation.navigate('Practice')}
        style={({ pressed }) => [styles.linkCard, pressCardStyle(pressed)]}
      >
        <View style={styles.linkIcon}>
          <Ionicons name="book" size={22} color={colors.primary} />
        </View>
        <View style={styles.linkBody}>
          <Text style={styles.linkTitle}>Practice by topic</Text>
          <Text style={styles.linkSub}>
            Choose a subject or topic for untimed, targeted practice.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color={colors.muted} />
      </Pressable>

      <Pressable
        onPress={() => navigation.navigate('Tests')}
        style={({ pressed }) => [styles.linkCard, pressCardStyle(pressed)]}
      >
        <View style={styles.linkIcon}>
          <Ionicons name="clipboard" size={22} color={colors.primary} />
        </View>
        <View style={styles.linkBody}>
          <Text style={styles.linkTitle}>Mock tests</Text>
          <Text style={styles.linkSub}>
            Full-length timed papers — start when you&apos;re exam ready.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color={colors.muted} />
      </Pressable>
      {showQuota ? (
        <View style={styles.mockQuotaWrap}>
          <MockQuotaBanner quota={quota} loading={quotaLoading} />
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Study material</Text>
      <View style={styles.studyGroup}>
        <Pressable
          onPress={() => navigation.navigate('NotesList')}
          style={({ pressed }) => [styles.studyRow, pressCardStyle(pressed)]}
        >
          <Ionicons name="document-text-outline" size={22} color={colors.primary} />
          <View style={styles.studyRowText}>
            <Text style={styles.studyRowTitle}>Notes</Text>
            <Text style={styles.studyRowSub}>{HOME_NOTES_SUB}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>
        <View style={styles.studyDivider} />
        <Pressable
          onPress={() => navigation.navigate('PdfList')}
          style={({ pressed }) => [styles.studyRow, pressCardStyle(pressed)]}
        >
          <Ionicons name="reader-outline" size={22} color={colors.primary} />
          <View style={styles.studyRowText}>
            <Text style={styles.studyRowTitle}>PDF notes</Text>
            <Text style={styles.studyRowSub}>{HOME_PDF_SUB}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>
      </View>

      <Text style={styles.footerBrand}>
        {brand.name} · {brand.tagline}
      </Text>
    </ScrollView>
  );
}

const shadowCard = Platform.select({
  ios: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.09,
    shadowRadius: 16,
  },
  android: { elevation: 5 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },

  greetingBlock: { marginBottom: 20 },
  greetLine: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.4,
    lineHeight: 30,
  },
  wave: { fontSize: 22 },
  taglinePrompt: {
    fontSize: 15,
    color: colors.muted,
    marginTop: 8,
    lineHeight: 22,
  },

  heroCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    ...shadowCard,
  },
  heroTop: {
    marginBottom: 16,
  },
  heroKicker: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
  },
  heroSub: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 6,
    lineHeight: 20,
    maxWidth: '88%',
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.bg,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  streakText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  heroBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
  },
  heroBtnText: {
    color: colors.textOnPrimary,
    fontSize: 16,
    fontWeight: '700',
  },

  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 12,
    marginTop: 4,
  },

  mockQuotaWrap: {
    marginTop: -4,
    marginBottom: 20,
  },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
      android: { elevation: 2 },
    }),
  },
  linkIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  linkBody: { flex: 1 },
  linkTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  linkSub: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 4,
    lineHeight: 18,
  },

  studyGroup: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
      },
      android: { elevation: 2 },
    }),
  },
  studyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  studyDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 50,
  },
  studyRowText: { flex: 1 },
  studyRowTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  studyRowSub: { fontSize: 12, color: colors.muted, marginTop: 2, lineHeight: 16 },

  footerBrand: {
    textAlign: 'center',
    fontSize: 12,
    color: colors.muted,
    lineHeight: 18,
  },

  inlineAlert: { marginBottom: 12 },
  err: { color: colors.danger, fontSize: 13, marginBottom: 4 },
});
