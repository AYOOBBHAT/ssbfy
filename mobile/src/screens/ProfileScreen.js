import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../context/AuthContext';
import { colors, brand } from '../theme/colors';
import { userHasPremiumAccess } from '../utils/premiumAccess';
import { getSubscriptionStatus, formatPlanDate } from '../utils/subscriptionStatus';
import { getProfileAnalytics } from '../services/profileAnalyticsService';

export default function ProfileScreen({ navigation }) {
  const { user, logout } = useAuth();
  const name = user?.name || 'Student';
  const isPremium = userHasPremiumAccess(user);
  const plan = getSubscriptionStatus(user);

  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          setAnalyticsLoading(true);
          setAnalyticsError(false);
          const data = await getProfileAnalytics();
          if (!cancelled) setAnalytics(data);
        } catch {
          if (!cancelled) setAnalyticsError(true);
        } finally {
          if (!cancelled) setAnalyticsLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const goPremium = (from) => navigation.navigate('Premium', { from });
  const goToTests = () => navigation.navigate('Main', { screen: 'Tests' });
  const openLegalUrl = useCallback(async (url) => {
    try {
      await Linking.openURL(url);
    } catch {
      // Silently ignore if device cannot open URL.
    }
  }, []);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={28} color={colors.primary} />
        </View>
        <Text style={styles.name}>{name}</Text>
        {user?.email ? (
          <Text style={styles.email} numberOfLines={1}>
            {user.email}
          </Text>
        ) : null}
      </View>

      <PlanCard plan={plan} onPress={goPremium} />

      <Text style={styles.sectionLabel}>Progress & Performance</Text>
      <ProgressSection
        analytics={analytics}
        loading={analyticsLoading}
        error={analyticsError}
        onStart={goToTests}
      />

      <Text style={styles.sectionLabel}>Account</Text>
      <View style={styles.card}>
        <Pressable
          onPress={() => navigation.navigate('ChangePassword')}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <Ionicons name="lock-closed-outline" size={22} color={colors.text} />
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Change Password</Text>
            <Text style={styles.rowSub}>Update your account password securely</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>
      </View>
      <View style={styles.card}>
        <Pressable
          onPress={() =>
            isPremium
              ? navigation.navigate('SavedMaterials')
              : navigation.navigate('Premium', { from: 'saved-materials' })
          }
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <Ionicons
            name={isPremium ? 'bookmark' : 'bookmark-outline'}
            size={22}
            color={isPremium ? colors.primary : colors.muted}
          />
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Saved Materials</Text>
            <Text style={styles.rowSub}>
              {isPremium ? 'Your bookmarked notes and PDFs' : 'Premium feature'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>
      </View>
      <Text style={styles.sectionLabel}>Legal</Text>
      <View style={styles.card}>
        <Pressable
          onPress={() => openLegalUrl('https://ssbfy.vercel.app/privacy-policy')}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <Ionicons name="document-text-outline" size={22} color={colors.text} />
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Privacy Policy</Text>
            <Text style={styles.rowSub}>How we collect and use your data</Text>
          </View>
          <Ionicons name="open-outline" size={20} color={colors.muted} />
        </Pressable>
        <Pressable
          onPress={() => openLegalUrl('https://ssbfy.vercel.app/terms-and-conditions')}
          style={({ pressed }) => [styles.row, styles.rowDivider, pressed && styles.pressed]}
        >
          <Ionicons name="shield-checkmark-outline" size={22} color={colors.text} />
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Terms & Conditions</Text>
            <Text style={styles.rowSub}>Usage rules, payments, and subscriptions</Text>
          </View>
          <Ionicons name="open-outline" size={20} color={colors.muted} />
        </Pressable>
      </View>
      <Text style={styles.brandFoot}>
        {brand.name} — {brand.tagline}
      </Text>

      <Text style={styles.sectionLabel}>Session</Text>
      <Pressable
        onPress={logout}
        style={({ pressed }) => [styles.logout, pressed && styles.pressed]}
      >
        <Ionicons name="log-out-outline" size={22} color={colors.danger} />
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
    </ScrollView>
  );
}

function PlanCard({ plan, onPress }) {
  const visual = visualForStatus(plan.status);

  const onCta = () => {
    if (plan.status === 'free') return onPress('profile');
    if (plan.status === 'expired') return onPress('renew');
    return onPress('manage');
  };

  return (
    <View
      style={[
        styles.planCard,
        { backgroundColor: visual.surface, borderColor: visual.border },
      ]}
    >
      <View style={styles.planHeaderRow}>
        <View
          style={[
            styles.planIconWrap,
            { backgroundColor: visual.iconBg },
            visual.iconWrapRadius != null && { borderRadius: visual.iconWrapRadius },
          ]}
        >
          <Ionicons name={visual.icon} size={22} color={visual.iconColor} />
        </View>
        <View style={styles.planHeaderText}>
          {plan.status === 'free' ? (
            <Text style={styles.planCurrentLabel}>CURRENT PLAN</Text>
          ) : null}
          <Text
            style={[
              styles.planTitle,
              { color: visual.titleColor },
              visual.titleFontWeight != null && { fontWeight: visual.titleFontWeight },
            ]}
          >
            {visual.title}
          </Text>
          <Text
            style={[
              styles.planSubtitle,
              plan.status === 'free' && styles.planSubtitleFree,
              visual.subtitleColor != null && { color: visual.subtitleColor },
            ]}
            numberOfLines={2}
          >
            {planSubtitleFor(plan)}
          </Text>
        </View>
      </View>

      {plan.status === 'active' && plan.subscriptionEnd ? (
        <View style={styles.planMetaRow}>
          <Ionicons name="calendar-outline" size={14} color={colors.muted} />
          <Text style={styles.planMetaText}>
            Valid till {formatPlanDate(plan.subscriptionEnd)}
          </Text>
        </View>
      ) : null}

      {plan.status === 'expired' && plan.subscriptionEnd ? (
        <View style={styles.planMetaRow}>
          <Ionicons name="time-outline" size={14} color={colors.muted} />
          <Text style={styles.planMetaText}>
            Expired on {formatPlanDate(plan.subscriptionEnd)}
          </Text>
        </View>
      ) : null}

      <Pressable
        onPress={onCta}
        style={({ pressed }) => [
          styles.planCta,
          plan.status === 'free' && styles.planCtaFree,
          { backgroundColor: visual.ctaBg },
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.planCtaText, { color: visual.ctaText }]}>
          {ctaLabelFor(plan.status)}
        </Text>
        <Ionicons name="chevron-forward" size={18} color={visual.ctaText} />
      </Pressable>
    </View>
  );
}

function planSubtitleFor(plan) {
  if (plan.status === 'free') {
    return 'Limited access to mock tests and features';
  }
  if (plan.status === 'lifetime') {
    return 'Lifetime Access — never expires';
  }
  if (plan.status === 'active') {
    const days = plan.daysRemaining;
    const planLabel = plan.planName ? `${plan.planName} Plan` : 'Premium';
    if (typeof days === 'number' && days > 0 && days <= 30) {
      return `${planLabel} • ${days} day${days === 1 ? '' : 's'} remaining`;
    }
    return planLabel;
  }
  if (plan.status === 'expired') {
    const planLabel = plan.planName ? `${plan.planName} Plan` : 'Premium';
    return `Your ${planLabel} has ended. Renew to continue full access.`;
  }
  return '';
}

function ctaLabelFor(status) {
  switch (status) {
    case 'free':
      return 'Go Premium';
    case 'active':
      return 'Renew / Manage Plan';
    case 'lifetime':
      return 'Manage Plan';
    case 'expired':
      return 'Renew Premium';
    default:
      return 'Go Premium';
  }
}

function visualForStatus(status) {
  switch (status) {
    case 'lifetime':
      return {
        title: 'Lifetime Premium 👑',
        icon: 'star',
        iconColor: colors.accent,
        iconBg: colors.accentSoft,
        surface: colors.accentSoft,
        border: colors.accentBorder,
        titleColor: colors.text,
        ctaBg: colors.accent,
        ctaText: '#ffffff',
      };
    case 'active':
      return {
        title: 'Premium Active',
        icon: 'checkmark-circle',
        iconColor: '#4F46E5',
        iconBg: '#E0E7FF',
        surface: '#EEF2FF',
        border: '#6366F1',
        titleColor: '#4338CA',
        titleFontWeight: '700',
        subtitleColor: '#4B5563',
        ctaBg: '#4F46E5',
        ctaText: '#FFFFFF',
      };
    case 'expired':
      return {
        title: 'Premium Expired',
        icon: 'time-outline',
        iconColor: colors.warning,
        iconBg: colors.warningSoft,
        surface: colors.warningSoft,
        border: colors.warning,
        titleColor: colors.text,
        ctaBg: colors.primary,
        ctaText: colors.textOnPrimary,
      };
    case 'free':
    default:
      return {
        title: 'Free Plan',
        icon: 'star-outline',
        iconColor: '#4F46E5',
        iconBg: '#E0E7FF',
        iconWrapRadius: 12,
        surface: '#F8FAFF',
        border: '#E0E7FF',
        titleColor: '#1F2937',
        titleFontWeight: '700',
        subtitleColor: '#6B7280',
        ctaBg: '#4F46E5',
        ctaText: '#FFFFFF',
      };
  }
}

function ProgressSection({ analytics, loading, error, onStart }) {
  if (loading && !analytics) {
    return (
      <View style={[styles.progressCard, styles.progressLoading]}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.progressLoadingText}>Loading your progress…</Text>
      </View>
    );
  }

  if (error && !analytics) {
    return (
      <View style={[styles.progressCard, styles.progressEmpty]}>
        <Ionicons name="cloud-offline-outline" size={26} color={colors.muted} />
        <Text style={styles.progressEmptyTitle}>Progress unavailable</Text>
        <Text style={styles.progressEmptySub}>
          We couldn’t load your stats just now. Please try again in a moment.
        </Text>
      </View>
    );
  }

  const a = analytics || {};
  const totalMocks = Number(a.totalMocks) || 0;
  const isNewUser = totalMocks === 0;

  if (isNewUser) {
    return (
      <View style={[styles.progressCard, styles.progressEmpty]}>
        <View style={styles.progressEmptyIconWrap}>
          <Ionicons name="rocket-outline" size={24} color={colors.primary} />
        </View>
        <Text style={styles.progressEmptyTitle}>No progress yet</Text>
        <Text style={styles.progressEmptySub}>
          Start your first mock test to track your progress.
        </Text>
        <Pressable
          onPress={onStart}
          style={({ pressed }) => [styles.progressEmptyCta, pressed && styles.pressed]}
        >
          <Text style={styles.progressEmptyCtaText}>Take a Test</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textOnPrimary} />
        </Pressable>
      </View>
    );
  }

  const bestScore = Number(a.bestScore) || 0;
  const currentStreak = Number(a.currentStreak) || 0;
  const latestScore = Number(a.latestScore) || 0;
  const averageScore = Number(a.averageScore) || 0;
  const overallAccuracy = Number(a.overallAccuracy) || 0;
  const totalQuestionsSolved = Number(a.totalQuestionsSolved) || 0;
  const dailyPracticeCount = Number(a.dailyPracticeCount) || 0;
  const smartPracticeCount = Number(a.smartPracticeCount) || 0;
  const recentAttempts = Array.isArray(a.recentAttempts) ? a.recentAttempts : [];

  const formatMmSs = (totalSeconds) => {
    const s = Math.max(0, Number(totalSeconds) || 0);
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  };

  return (
    <View style={styles.progressCard}>
      <View style={styles.heroStatsRow}>
        <View style={[styles.heroStat, styles.heroStatBest]}>
          <View style={styles.heroStatHead}>
            <Ionicons name="trophy" size={14} color="#4338CA" />
            <Text style={[styles.heroStatLabel, styles.heroStatLabelBest]}>Best Score</Text>
          </View>
          <Text style={[styles.heroStatValue, styles.heroStatValueBest]}>{bestScore}%</Text>
        </View>
        <View style={[styles.heroStat, styles.heroStatStreak]}>
          <View style={styles.heroStatHead}>
            <Ionicons name="flame" size={14} color={colors.accent} />
            <Text style={[styles.heroStatLabel, { color: colors.accent }]}>Current Streak</Text>
          </View>
          <Text style={styles.heroStatValue}>
            {currentStreak} <Text style={styles.heroStatUnit}>{currentStreak === 1 ? 'Day' : 'Days'}</Text>
          </Text>
        </View>
      </View>

      <View style={styles.statGrid}>
        <SmallStat label="Total Mocks" value={String(totalMocks)} />
        <SmallStat label="Latest Score" value={`${latestScore}%`} />
        <SmallStat label="Average Score" value={`${averageScore}%`} />
        <SmallStat label="Accuracy" value={`${overallAccuracy}%`} />
      </View>

      <View style={styles.progressFooter}>
        <View style={styles.progressFooterItem}>
          <Ionicons name="checkmark-done-outline" size={14} color={colors.muted} />
          <Text style={styles.progressFooterText}>
            {compactNumber(totalQuestionsSolved)} questions solved
          </Text>
        </View>
        {dailyPracticeCount > 0 ? (
          <View style={styles.progressFooterItem}>
            <Ionicons name="calendar-outline" size={14} color={colors.muted} />
            <Text style={styles.progressFooterText}>
              {dailyPracticeCount} daily {dailyPracticeCount === 1 ? 'practice' : 'practices'}
            </Text>
          </View>
        ) : null}
        {smartPracticeCount > 0 ? (
          <View style={styles.progressFooterItem}>
            <Ionicons name="bulb-outline" size={14} color={colors.muted} />
            <Text style={styles.progressFooterText}>
              {smartPracticeCount} smart {smartPracticeCount === 1 ? 'session' : 'sessions'}
            </Text>
          </View>
        ) : null}
      </View>

      {recentAttempts.length > 0 ? (
        <View style={styles.recentAttemptsBlock}>
          <Text style={styles.recentAttemptsTitle}>Recent mock attempts</Text>
          {recentAttempts.slice(0, 5).map((att, idx) => {
            const title = att?.testTitle ? String(att.testTitle) : 'Mock Test';
            const attemptNo =
              att?.attemptNumber != null ? `Attempt #${String(att.attemptNumber)}` : `Attempt ${idx + 1}`;
            const endTime = att?.endTime ? new Date(att.endTime).toLocaleString() : '—';
            const accuracy = att?.accuracy != null ? `${String(att.accuracy)}%` : '—';
            const timeTaken =
              att?.timeTaken != null && Number.isFinite(Number(att.timeTaken))
                ? ` • ${formatMmSs(Number(att.timeTaken))}`
                : '';
            return (
              <View key={att?.id || `${idx}`} style={styles.recentAttemptRow}>
                <View style={styles.recentAttemptLeft}>
                  <Text style={styles.recentAttemptName} numberOfLines={1}>
                    {title}
                  </Text>
                  <Text style={styles.recentAttemptMeta} numberOfLines={1}>
                    {attemptNo} • {endTime}
                    {timeTaken}
                  </Text>
                </View>
                <View style={styles.recentAttemptRight}>
                  <Text style={styles.recentAttemptScore}>{accuracy}</Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function SmallStat({ label, value }) {
  return (
    <View style={styles.smallStat}>
      <Text style={styles.smallStatLabel}>{label}</Text>
      <Text style={styles.smallStatValue}>{value}</Text>
    </View>
  );
}

function compactNumber(n) {
  const v = Number(n) || 0;
  if (v >= 1000) {
    const k = Math.round((v / 1000) * 10) / 10;
    return `${k}k`;
  }
  return String(v);
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },
  hero: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 16,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },
  email: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 6,
    maxWidth: '100%',
    paddingHorizontal: 24,
  },

  planCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    marginTop: 4,
    marginBottom: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08,
        shadowRadius: 14,
      },
      android: { elevation: 3 },
    }),
  },
  planHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  planIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planHeaderText: { flex: 1, minWidth: 0 },
  planCurrentLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: '#6B7280',
    marginBottom: 4,
  },
  planTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  planSubtitle: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 4,
    lineHeight: 18,
  },
  planSubtitleFree: {
    marginTop: 6,
  },
  planMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  planMetaText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  planCta: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  planCtaFree: {
    paddingHorizontal: 16,
  },
  planCtaText: {
    fontSize: 15,
    fontWeight: '700',
  },

  progressCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
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
  progressLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 18,
  },
  progressLoadingText: {
    fontSize: 13,
    color: colors.muted,
  },
  progressEmpty: {
    alignItems: 'center',
    paddingVertical: 22,
    paddingHorizontal: 16,
  },
  progressEmptyIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  progressEmptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginTop: 4,
  },
  progressEmptySub: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
    maxWidth: 320,
  },
  progressEmptyCta: {
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  progressEmptyCtaText: {
    color: colors.textOnPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  heroStatsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  heroStat: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  heroStatBest: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
  },
  heroStatStreak: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentBorder,
  },
  heroStatHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroStatLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  heroStatLabelBest: {
    color: '#4338CA',
  },
  heroStatValue: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    marginTop: 6,
    letterSpacing: -0.5,
  },
  heroStatValueBest: {
    color: '#111827',
  },
  heroStatUnit: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.muted,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    gap: 8,
  },
  smallStat: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: colors.bg,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  smallStatLabel: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  smallStatValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginTop: 2,
  },
  progressFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  progressFooterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progressFooterText: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '500',
  },

  recentAttemptsBlock: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  recentAttemptsTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  recentAttemptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  recentAttemptLeft: { flex: 1, paddingRight: 12, minWidth: 0 },
  recentAttemptName: { fontSize: 14, fontWeight: '700', color: colors.text },
  recentAttemptMeta: { fontSize: 12, color: colors.muted, marginTop: 3 },
  recentAttemptRight: { alignItems: 'flex-end' },
  recentAttemptScore: { fontSize: 14, fontWeight: '800', color: colors.text },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 16,
    marginBottom: 8,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  rowSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  brandFoot: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 18,
    marginTop: 8,
    marginBottom: 8,
    textAlign: 'center',
  },
  logout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.danger,
  },
  pressed: { opacity: 0.85 },
});
