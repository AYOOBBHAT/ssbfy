import { useCallback, useState } from 'react';
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
import {
  getApiErrorMessage,
  isFreeTestLimitError,
  FREE_TEST_LIMIT_MESSAGE,
} from '../services/api';
import { getDailyPractice } from '../services/dailyPracticeService';
import { colors, brand } from '../theme/colors';
import { userHasPremiumAccess } from '../utils/premiumAccess';

function greetingForHour() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const navigation = useNavigation();
  const { user, refreshUser } = useAuth();
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyError, setDailyError] = useState(null);

  useFocusEffect(
    useCallback(() => {
      void refreshUser?.();
    }, [refreshUser])
  );

  const handleStartDailyPractice = async () => {
    if (dailyLoading) return;
    setDailyError(null);
    setDailyLoading(true);
    try {
      const data = await getDailyPractice();
      const questions = Array.isArray(data?.questions) ? data.questions : [];
      const questionIds = questions.map((q) => String(q?._id)).filter(Boolean);
      if (!questionIds.length) {
        setDailyError('No daily practice questions available.');
        return;
      }
      navigation.navigate('Test', {
        mode: 'daily',
        questionIds,
        questions,
      });
    } catch (e) {
      setDailyError(
        isFreeTestLimitError(e)
          ? FREE_TEST_LIMIT_MESSAGE
          : getApiErrorMessage(e)
      );
    } finally {
      setDailyLoading(false);
    }
  };

  const name = user?.name || 'there';
  const streak = Number(user?.streakCount) || 0;
  const streakLabel = streak === 1 ? 'day' : 'days';
  const isPremium = userHasPremiumAccess(user);
  const greet = greetingForHour();

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
        {user?.email ? (
          <Text style={styles.emailHint} numberOfLines={1}>
            {user.email}
          </Text>
        ) : null}
      </View>

      {isPremium ? (
        <View style={styles.premiumActiveCard}>
          <View style={styles.premiumActiveIcon}>
            <Ionicons name="checkmark-circle" size={22} color={colors.success} />
          </View>
          <View style={styles.premiumActiveText}>
            <Text style={styles.premiumActiveTitle}>Premium active</Text>
            <Text style={styles.premiumActiveSub}>
              Full access to mocks, PDFs, and unlimited practice on this device.
            </Text>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={() => navigation.navigate('Premium', { from: 'home' })}
          style={({ pressed }) => [styles.premiumCta, pressed && styles.pressed]}
        >
          <View style={styles.premiumCtaIconWrap}>
            <Ionicons name="star" size={26} color={colors.primaryDark} />
          </View>
          <View style={styles.premiumCtaBody}>
            <Text style={styles.premiumCtaTitle}>Go Premium</Text>
            <Text style={styles.premiumCtaSub}>
              Unlimited mocks, full PDF access, advanced practice & more
            </Text>
            <View style={styles.premiumCtaRow}>
              <Text style={styles.premiumCtaLink}>View plans</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.primary} />
            </View>
          </View>
        </Pressable>
      )}

      <View style={styles.heroCard}>
        <View style={styles.heroTop}>
          <View>
            <Text style={styles.heroKicker}>Today&apos;s practice</Text>
            <Text style={styles.heroTitle}>10 questions</Text>
            <Text style={styles.heroSub}>Sharpen skills with a quick, focused drill.</Text>
          </View>
          <View style={styles.heroIconBadge}>
            <Ionicons name="locate" size={26} color={colors.primary} />
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
            {dailyError === FREE_TEST_LIMIT_MESSAGE ? (
              <Text style={styles.limitHint}>
                Upgrade to premium for unlimited practice on this device.
              </Text>
            ) : null}
            {dailyError === FREE_TEST_LIMIT_MESSAGE ? (
              <Pressable
                onPress={() => navigation.navigate('Premium', { from: 'daily' })}
                style={({ pressed }) => [styles.upgradeLink, pressed && styles.pressed]}
              >
                <Text style={styles.upgradeLinkText}>See plans & upgrade</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <Pressable
          onPress={handleStartDailyPractice}
          disabled={dailyLoading}
          style={({ pressed }) => [
            styles.heroBtn,
            pressed && styles.pressed,
            dailyLoading && styles.disabled,
          ]}
        >
          <Ionicons name="play" size={18} color={colors.textOnPrimary} />
          <Text style={styles.heroBtnText}>
            {dailyLoading ? 'Loading…' : 'Start daily practice'}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Practice</Text>
      <Pressable
        onPress={() => navigation.navigate('Practice')}
        style={({ pressed }) => [styles.linkCard, pressed && styles.pressed]}
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
        style={({ pressed }) => [styles.linkCard, pressed && styles.pressed]}
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

      <Text style={styles.sectionTitle}>Study material</Text>
      <View style={styles.studyGroup}>
        <Pressable
          onPress={() => navigation.navigate('NotesList')}
          style={({ pressed }) => [styles.studyRow, pressed && styles.pressed]}
        >
          <Ionicons name="document-text-outline" size={22} color={colors.primary} />
          <View style={styles.studyRowText}>
            <Text style={styles.studyRowTitle}>Notes</Text>
            <Text style={styles.studyRowSub}>Topic-wise study notes by subject</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>
        <View style={styles.studyDivider} />
        <Pressable
          onPress={() => navigation.navigate('PdfList')}
          style={({ pressed }) => [styles.studyRow, pressed && styles.pressed]}
        >
          <Ionicons name="reader-outline" size={22} color={colors.primary} />
          <View style={styles.studyRowText}>
            <Text style={styles.studyRowTitle}>PDF notes</Text>
            <Text style={styles.studyRowSub}>Downloadable PDF study library</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>
        <View style={styles.studyDivider} />
        <View style={[styles.studyRow, styles.studyRowDisabled]}>
          <Ionicons name="bookmark-outline" size={22} color={colors.muted} />
          <View style={styles.studyRowText}>
            <Text style={[styles.studyRowTitle, styles.mutedTitle]}>Saved material</Text>
            <Text style={styles.studyRowSub}>Coming soon — bookmark PDFs & notes</Text>
          </View>
        </View>
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
  emailHint: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 12,
    opacity: 0.85,
  },

  premiumActiveCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.successSoft,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.success,
    ...shadowCard,
  },
  premiumActiveIcon: { marginRight: 12, marginTop: 2 },
  premiumActiveText: { flex: 1 },
  premiumActiveTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  premiumActiveSub: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 4,
    lineHeight: 18,
  },

  premiumCta: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.primary,
    ...shadowCard,
  },
  premiumCtaIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  premiumCtaBody: { flex: 1 },
  premiumCtaTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.primaryText,
    letterSpacing: -0.2,
  },
  premiumCtaSub: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 6,
    lineHeight: 18,
  },
  premiumCtaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 6,
  },
  premiumCtaLink: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
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
  heroIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
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
  studyRowDisabled: { opacity: 0.65 },
  studyDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 50,
  },
  studyRowText: { flex: 1 },
  studyRowTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  mutedTitle: { color: colors.muted },
  studyRowSub: { fontSize: 12, color: colors.muted, marginTop: 2, lineHeight: 16 },

  footerBrand: {
    textAlign: 'center',
    fontSize: 12,
    color: colors.muted,
    lineHeight: 18,
  },

  inlineAlert: { marginBottom: 12 },
  err: { color: colors.danger, fontSize: 13, marginBottom: 4 },
  limitHint: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  upgradeLink: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  upgradeLinkText: {
    color: colors.textOnPrimary,
    fontSize: 14,
    fontWeight: '700',
  },

  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.55 },
});
