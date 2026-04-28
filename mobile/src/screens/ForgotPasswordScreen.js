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
import { forgotPassword } from '../services/authService';
import { getApiErrorMessage } from '../services/api';

const COOLDOWN_SEC = 45;

export default function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const tickRef = useRef(null);

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  const startCooldown = useCallback((seconds) => {
    const sec = Math.max(1, Math.min(Number(seconds) || COOLDOWN_SEC, 120));
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

  async function sendCode() {
    if (submitting || cooldownLeft > 0) return;
    setError('');
    setInfo('');
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Enter your email address.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await forgotPassword({ email: trimmed });
      const msg = res?.message || 'If the account exists, reset instructions were sent.';
      setInfo(msg);
      startCooldown(COOLDOWN_SEC);
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
      setSubmitting(false);
    }
  }

  const canSend = email.trim().length > 0 && !submitting && cooldownLeft === 0;
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
        <Text style={styles.title}>Forgot password</Text>
        <Text style={styles.subtitle}>
          Enter the email you use for {brand.name}. We’ll send a 6-digit code if an account
          exists.
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
          label="Email"
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
          editable={!submitting}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
        />

        <AppButton
          title={submitting ? 'Sending…' : 'Send reset code'}
          onPress={sendCode}
          disabled={!canSend}
          style={styles.primaryCta}
        />

        <Pressable
          onPress={sendCode}
          disabled={submitting || cooldownLeft > 0}
          style={({ pressed }) => [
            styles.resendRow,
            pressed && cooldownLeft === 0 && !submitting && { opacity: 0.7 },
          ]}
        >
          <Text
            style={[
              styles.resendText,
              (submitting || cooldownLeft > 0) && styles.resendTextDisabled,
            ]}
          >
            {resendLabel}
          </Text>
        </Pressable>

        <Pressable
          onPress={() =>
            navigation.navigate('ResetPassword', { email: email.trim() })
          }
          style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.linkText}>I have a code — reset password</Text>
        </Pressable>

        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.mutedLink}>Back to sign in</Text>
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
  linkText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  mutedLink: { color: colors.muted, fontSize: 14 },
});
