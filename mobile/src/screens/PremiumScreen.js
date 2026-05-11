import { useCallback, useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { userHasPremiumAccess } from '../utils/premiumAccess';
import {
  createPremiumOrder,
  verifyPremiumPayment,
  openRazorpayForOrder,
  formatPaymentError,
  getSubscriptionPlans,
  isPaymentCancelledError,
} from '../services/paymentService';
import { colors } from '../theme/colors';
import { isRequestCancelled } from '../services/api';

const BENEFITS = [
  'Unlimited Mock Tests',
  'Practice weak topics',
  'Full PDF Notes Access',
  'Premium Topic-wise Notes',
  'Advanced Performance Tracking',
  'Faster Preparation with Smart Revision',
];

const FROM_COPY = {
  limit: 'You’ve reached the free mock limit on this device.',
  daily: 'Daily practice needs an active premium plan on this device.',
  notes: 'Unlock the full notes experience with Premium.',
  pdf: 'Open every PDF and study without limits.',
  home: 'Upgrade when you’re ready — no pressure.',
};

/** Shown while polling `GET /users/me` — never trust Razorpay UI alone. */
const VERIFYING_HINT = 'Verifying payment...';
const BACKEND_POLL_MS = 3000;

export default function PremiumScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { user, refreshUser } = useAuth();
  const from = route.params?.from || 'home';

  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verificationHint, setVerificationHint] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const isPremium = userHasPremiumAccess(user);

  const contextLine = FROM_COPY[from] ?? FROM_COPY.home;

  useEffect(() => {
    const ac = new AbortController();
    const loadPlans = async () => {
      try {
        setPlansLoading(true);
        const data = await getSubscriptionPlans({ signal: ac.signal });
        if (ac.signal.aborted) return;
        const rows = Array.isArray(data?.plans) ? data.plans : [];
        setPlans(rows);
        if (rows.length > 0) {
          const preferred = rows.find((p) => p?.planType === 'monthly') || rows[0];
          setSelectedId(String(preferred._id));
        } else {
          setSelectedId('');
        }
      } catch (e) {
        if (ac.signal.aborted || isRequestCancelled(e)) return;
        setPlans([]);
        setError(formatPaymentError(e));
      } finally {
        setPlansLoading(false);
      }
    };
    void loadPlans();
    return () => {
      ac.abort();
    };
  }, []);

  const selectedPlan = useMemo(() => {
    if (!plans.length) return null;
    return plans.find((p) => String(p?._id) === String(selectedId)) || plans[0];
  }, [plans, selectedId]);

  const goHome = useCallback(() => {
    navigation.navigate('Main', { screen: 'Home' });
  }, [navigation]);

  /** `GET /users/me` via refreshUser — matches backend premium (timed + lifetime). */
  const confirmPremiumFromBackend = useCallback(async () => {
    let u = await refreshUser?.();
    if (userHasPremiumAccess(u)) return true;
    await new Promise((r) => setTimeout(r, BACKEND_POLL_MS));
    u = await refreshUser?.();
    return userHasPremiumAccess(u);
  }, [refreshUser]);

  const handleUpgrade = useCallback(async () => {
    if (busy || isPremium) return;
    setError(null);
    setBusy(true);
    setVerifying(false);
    setVerificationHint('');

    const failNotConfirmed = () => {
      setError(
        'Payment could not be confirmed yet. If you were charged, wait a moment and check Profile, or contact support.'
      );
    };

    try {
      if (!selectedPlan?._id) {
        setError('No subscription plans are available right now.');
        return;
      }
      const order = await createPremiumOrder(selectedPlan._id);
      if (!order?.order_id || !order?.key_id) {
        setError('Could not start checkout. Please try again.');
        return;
      }

      let paymentData = null;
      try {
        paymentData = await openRazorpayForOrder(order, user);
      } catch (openErr) {
        if (isPaymentCancelledError(openErr)) {
          setError('Payment was cancelled.');
          return;
        }
        // UPI/SDK may report failure while webhook still captures — verify via backend only.
      }

      setVerifying(true);
      setVerificationHint(VERIFYING_HINT);

      const orderId = paymentData?.razorpay_order_id;
      const paymentId = paymentData?.razorpay_payment_id;
      const signature = paymentData?.razorpay_signature;

      if (orderId && paymentId && signature) {
        try {
          await verifyPremiumPayment({
            razorpay_order_id: orderId,
            razorpay_payment_id: paymentId,
            razorpay_signature: signature,
          });
        } catch {
          /* client verify optional; webhook + /me is truth */
        }
      }

      const ok = await confirmPremiumFromBackend();
      if (ok) {
        setSuccess(true);
        return;
      }
      failNotConfirmed();
    } catch (e) {
      setVerifying(true);
      setVerificationHint(VERIFYING_HINT);
      try {
        const ok = await confirmPremiumFromBackend();
        if (ok) {
          setSuccess(true);
          return;
        }
      } finally {
        setVerifying(false);
        setVerificationHint('');
      }
      setError(formatPaymentError(e));
    } finally {
      setBusy(false);
      setVerifying(false);
      setVerificationHint('');
    }
  }, [busy, isPremium, selectedPlan, user, refreshUser, confirmPremiumFromBackend]);

  if (isPremium) {
    return (
      <View style={styles.centerWrap}>
        <Text style={styles.premiumActiveEmoji}>✅</Text>
        <Text style={styles.premiumActiveTitle}>Premium Active</Text>
        <Text style={styles.premiumActiveSub}>
          You have full access to mock tests, practice, and study material.
        </Text>
        <Pressable
          onPress={goHome}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
        >
          <Text style={styles.primaryBtnText}>Back to Home</Text>
        </Pressable>
      </View>
    );
  }

  if (success) {
    return (
      <View style={styles.centerWrap}>
        <Text style={styles.successEmoji}>🎉</Text>
        <Text style={styles.successTitle}>Premium Activated</Text>
        <Text style={styles.successSub}>
          You’re all set — unlimited mocks and full prep access are unlocked.
        </Text>
        <Pressable
          onPress={goHome}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
        >
          <Text style={styles.primaryBtnText}>Continue</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.heroTitle}>🚀 Upgrade to Premium</Text>
      <Text style={styles.heroSub}>
        Unlock unlimited mock tests and full preparation access
      </Text>
      <Text style={styles.context}>{contextLine}</Text>

      <View style={styles.benefitsCard}>
        <Text style={styles.benefitsHeading}>What you get</Text>
        {BENEFITS.map((line) => (
          <View key={line} style={styles.benefitRow}>
            <Text style={styles.benefitCheck}>✔</Text>
            <Text style={styles.benefitText}>{line}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionLabel}>Choose your plan</Text>
      {plansLoading ? (
        <View style={styles.inlineLoading}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.inlineLoadingText}>Loading plans...</Text>
        </View>
      ) : null}
      {!plansLoading && plans.length === 0 ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>No active plans available right now.</Text>
        </View>
      ) : null}
      {plans.map((plan) => {
        const active = String(plan?._id) === String(selectedId);
        const recommended = plan?.planType === 'monthly';
        const title = `${plan?.name || 'Plan'} Plan`;
        const priceLabel = `₹${Number(plan?.priceInr || 0)}`;
        const blurb =
          plan?.description ||
          (plan?.planType === 'lifetime'
            ? 'One payment, long-term prep access'
            : `${Number(plan?.durationDays || 0)} days access`);
        return (
          <Pressable
            key={String(plan?._id)}
            onPress={() => setSelectedId(String(plan?._id))}
            disabled={busy || verifying}
            style={({ pressed }) => [
              styles.planCard,
              active && styles.planCardActive,
              recommended && styles.planCardRecommended,
              pressed && !busy && !verifying && styles.pressed,
            ]}
          >
            {recommended ? (
              <View style={styles.recBadge}>
                <Text style={styles.recBadgeText}>Recommended</Text>
              </View>
            ) : null}
            <View style={styles.planRow}>
              <View style={styles.planTextCol}>
                <Text style={styles.planTitle}>{title}</Text>
                <Text style={styles.planBlurb}>{blurb}</Text>
              </View>
              <Text style={styles.planPrice}>{priceLabel}</Text>
              <View style={[styles.radioOuter, active && styles.radioOuterActive]}>
                {active ? <View style={styles.radioInner} /> : null}
              </View>
            </View>
          </Pressable>
        );
      })}

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {verifying && verificationHint ? (
        <View style={styles.verifyingBanner}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.verifyingText}>{verificationHint}</Text>
        </View>
      ) : null}

      <Pressable
        onPress={handleUpgrade}
        disabled={busy || verifying || plansLoading || plans.length === 0}
        style={({ pressed }) => [
          styles.primaryBtn,
          (busy || verifying || plansLoading || plans.length === 0) && styles.primaryBtnDisabled,
          pressed && !busy && !verifying && styles.pressed,
        ]}
      >
        {busy || verifying ? (
          <ActivityIndicator color={colors.textOnPrimary} />
        ) : (
          <Text style={styles.primaryBtnText}>Upgrade Now</Text>
        )}
      </Pressable>

      <Pressable
        onPress={() => (navigation.canGoBack() ? navigation.goBack() : goHome())}
        disabled={busy || verifying}
        style={({ pressed }) => [
          styles.secondaryBtn,
          pressed && !busy && !verifying && styles.pressed,
        ]}
      >
        <Text style={styles.secondaryBtnText}>Maybe Later</Text>
      </Pressable>

      <Text style={styles.footNote}>
        Secure payment via Razorpay. You can cancel before paying — no tricks.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { padding: 20, paddingBottom: 40 },

  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  heroSub: {
    fontSize: 16,
    color: colors.muted,
    lineHeight: 22,
    marginBottom: 10,
  },
  context: {
    fontSize: 14,
    color: colors.primaryText,
    backgroundColor: colors.primarySoft,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    marginBottom: 20,
    lineHeight: 20,
  },

  benefitsCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 22,
  },
  benefitsHeading: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 14,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  benefitCheck: {
    fontSize: 16,
    color: colors.success,
    fontWeight: '800',
    marginRight: 10,
    marginTop: 1,
  },
  benefitText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 22,
  },

  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    letterSpacing: 0.6,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  planCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 2,
    borderColor: colors.border,
    marginBottom: 12,
    position: 'relative',
  },
  planCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  planCardRecommended: {},
  recBadge: {
    position: 'absolute',
    top: -10,
    right: 12,
    backgroundColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  recBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  planTextCol: { flex: 1, minWidth: 0 },
  planTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  planBlurb: { fontSize: 13, color: colors.muted, marginTop: 4 },
  planPrice: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.primary,
    marginRight: 4,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioOuterActive: {
    borderColor: colors.primary,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },

  errorBanner: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '600',
  },

  verifyingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  verifyingText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.primaryText,
    lineHeight: 20,
  },

  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryBtnText: {
    color: colors.textOnPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  secondaryBtn: {
    marginTop: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: colors.muted,
    fontSize: 16,
    fontWeight: '600',
  },
  footNote: {
    marginTop: 20,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 18,
  },
  inlineLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  inlineLoadingText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  pressed: { opacity: 0.85 },

  centerWrap: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  premiumActiveEmoji: { fontSize: 48, marginBottom: 12 },
  premiumActiveTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  premiumActiveSub: {
    fontSize: 15,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  successEmoji: { fontSize: 56, marginBottom: 12 },
  successTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.success,
    marginBottom: 8,
  },
  successSub: {
    fontSize: 15,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
});
