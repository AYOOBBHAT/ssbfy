import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text } from 'react-native';
import AppButton from '../components/AppButton';
import AuthField from '../components/AuthField';
import { AuthErrorBanner } from '../components/auth/AuthErrorBanner';
import AuthScreenShell from '../components/auth/AuthScreenShell';
import { brand } from '../theme/colors';
import { authStyles } from '../theme/authUi';
import { sendForgotPasswordOtp } from '../services/authService';
import { getApiErrorMessage } from '../services/api';

const DEFAULT_COOLDOWN_SEC = 45;

export default function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const tickRef = useRef(null);

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

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

  async function sendCode() {
    if (submitting || cooldownLeft > 0) return;
    setError('');
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Enter your email address.');
      return;
    }
    setSubmitting(true);
    try {
      await sendForgotPasswordOtp({ email: trimmed });
      startCooldown(DEFAULT_COOLDOWN_SEC);
      navigation.navigate('VerifyOtp', {
        email: trimmed,
        cooldownLeft: DEFAULT_COOLDOWN_SEC,
      });
    } catch (e) {
      const status = e?.response?.status;
      const retry = e?.response?.data?.details?.retryAfterSeconds;
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
  const ctaLabel =
    cooldownLeft > 0 ? `Resend in ${cooldownLeft}s` : 'Send reset code';

  return (
    <AuthScreenShell
      flow
      showBack
      onBack={() => navigation.goBack()}
    >
      <Text style={authStyles.flowTitle}>Forgot password</Text>
      <Text style={authStyles.flowSubtitle}>
        Enter the email for your {brand.name} account. We&apos;ll email a 6-digit code if
        an account exists.
      </Text>

      <AuthErrorBanner message={error} />

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
        returnKeyType="send"
        onSubmitEditing={sendCode}
      />

      <AppButton
        title={ctaLabel}
        loading={submitting}
        onPress={sendCode}
        disabled={!canSend}
        style={authStyles.primaryCta}
        textStyle={authStyles.primaryCtaText}
      />

      <Pressable
        onPress={() => navigation.navigate('VerifyOtp', { email: email.trim() })}
        disabled={!email.trim() || submitting}
        style={({ pressed }) => [
          authStyles.linkRow,
          pressed && email.trim() && !submitting && { opacity: 0.7 },
        ]}
      >
        <Text
          style={[
            authStyles.linkText,
            (!email.trim() || submitting) && authStyles.linkTextDisabled,
          ]}
        >
          I already have a code
        </Text>
      </Pressable>
    </AuthScreenShell>
  );
}
