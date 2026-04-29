import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
} from 'react-native';
import AppButton from '../components/AppButton';
import AuthField from '../components/AuthField';
import { colors, brand } from '../theme/colors';
import {
  sendForgotPasswordOtp,
  verifyForgotPasswordOtp,
} from '../services/authService';
import { getApiErrorMessage } from '../services/api';

const DEFAULT_COOLDOWN_SEC = 45;

/**
 * STEP 2 of the Forgot Password flow.
 *
 * The user enters the 6-digit code from their email. On success the
 * server returns a short-lived `resetToken` which we forward to the
 * ResetPassword screen — the OTP itself is never sent again.
 *
 * Resend is throttled with the same cooldown as the previous step. The
 * server is the source of truth for the cooldown duration (it returns
 * `details.retryAfterSeconds` on 429), but we seed a sensible default so
 * the timer starts immediately after a successful navigate-from-step-1.
 */
export default function VerifyOtpScreen({ navigation, route }) {
  const initialEmail = route?.params?.email || '';
  const initialCooldown = Number(route?.params?.cooldownLeft) || 0;

  const [email] = useState(initialEmail);
  const [otp, setOtp] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [cooldownLeft, setCooldownLeft] = useState(initialCooldown);
  const tickRef = useRef(null);

  const startCooldown = useCallback((seconds) => {
    const sec = Math.max(1, Math.min(Number(seconds) || DEFAULT_COOLDOWN_SEC, 120));
    setCooldownLeft(sec);
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setCooldownLeft((s) => {
        if (s <= 1) {
          if (tickRef.current) clearInterval(tickRef.current);
          tickRef.current = null;
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, []);

  // Kick off the visible cooldown if we landed here right after the
  // email step. Anything passed via route params is taken on faith —
  // the server is still the authoritative gate via 429.
  useEffect(() => {
    if (initialCooldown > 0) {
      startCooldown(initialCooldown);
    }
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [initialCooldown, startCooldown]);

  async function handleVerify() {
    if (submitting) return;
    setError('');
    setInfo('');
    const code = otp.trim();
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    if (!email) {
      setError('Email is missing. Please start again.');
      return;
    }
    setSubmitting(true);
    try {
      const out = await verifyForgotPasswordOtp({ email, otp: code });
      const resetToken = out?.resetToken;
      if (!resetToken) {
        setError('Could not verify the code. Please try again.');
        return;
      }
      navigation.navigate('ResetPassword', { email, resetToken });
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (resending || cooldownLeft > 0 || !email) return;
    setError('');
    setInfo('');
    setResending(true);
    try {
      await sendForgotPasswordOtp({ email });
      setInfo('A new code is on the way if the account exists.');
      startCooldown(DEFAULT_COOLDOWN_SEC);
      // Wipe any partially-typed code so the user re-enters fresh.
      setOtp('');
    } catch (e) {
      const status = e?.response?.status;
      const details = e?.response?.data?.details;
      const retry = details?.retryAfterSeconds;
      if (status === 429 && retry) {
        setError('Please wait before requesting another code.');
        startCooldown(retry);
      } else {
        setError(getApiErrorMessage(e));
      }
    } finally {
      setResending(false);
    }
  }

  const canSubmit = /^\d{6}$/.test(otp.trim()) && !submitting;
  const resendLabel =
    cooldownLeft > 0 ? `Resend code (${cooldownLeft}s)` : 'Resend code';

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Enter verification code</Text>
        <Text style={styles.subtitle}>
          We sent a 6-digit code to{' '}
          <Text style={styles.emailEm}>{email || 'your email'}</Text>. The code
          expires in 10 minutes.
        </Text>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        {info ? (
          <View style={styles.infoBanner}>
            <Text style={styles.infoText}>{info}</Text>
          </View>
        ) : null}

        <AuthField
          label="6-digit code"
          placeholder="000000"
          value={otp}
          onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, 6))}
          editable={!submitting}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={6}
          returnKeyType="go"
          onSubmitEditing={handleVerify}
        />

        <AppButton
          title={submitting ? 'Verifying…' : 'Verify code'}
          onPress={handleVerify}
          disabled={!canSubmit}
          style={styles.primaryCta}
        />

        <Pressable
          onPress={handleResend}
          disabled={resending || cooldownLeft > 0 || !email}
          style={({ pressed }) => [
            styles.resendRow,
            pressed && cooldownLeft === 0 && !resending && { opacity: 0.7 },
          ]}
        >
          <Text
            style={[
              styles.resendText,
              (resending || cooldownLeft > 0 || !email) &&
                styles.resendTextDisabled,
            ]}
          >
            {resending ? 'Resending…' : resendLabel}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.mutedLink}>Use a different email</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 20,
    lineHeight: 20,
  },
  emailEm: { color: colors.text, fontWeight: '700' },
  errorBanner: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  errorText: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  infoBanner: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  infoText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  primaryCta: { marginTop: 8, paddingVertical: 14, borderRadius: 12 },
  resendRow: { alignSelf: 'center', marginTop: 16, paddingVertical: 8 },
  resendText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  resendTextDisabled: { color: colors.muted, fontWeight: '600' },
  linkRow: { alignSelf: 'center', marginTop: 12, paddingVertical: 8 },
  mutedLink: { color: colors.muted, fontSize: 14 },
});
