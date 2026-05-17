import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text } from 'react-native';
import AppButton from '../components/AppButton';
import AuthField from '../components/AuthField';
import AuthTextLink from '../components/auth/AuthTextLink';
import { AuthErrorBanner, AuthInfoBanner } from '../components/auth/AuthErrorBanner';
import AuthScreenShell from '../components/auth/AuthScreenShell';
import { authStyles } from '../theme/authUi';
import {
  sendForgotPasswordOtp,
  verifyForgotPasswordOtp,
} from '../services/authService';
import { getApiErrorMessage } from '../services/api';

const DEFAULT_COOLDOWN_SEC = 45;

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

  useEffect(() => {
    if (initialCooldown > 0) startCooldown(initialCooldown);
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
      setInfo('If an account exists, a new code is on the way.');
      startCooldown(DEFAULT_COOLDOWN_SEC);
      setOtp('');
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
      setResending(false);
    }
  }

  const canSubmit = /^\d{6}$/.test(otp.trim()) && !submitting;
  const resendLabel =
    cooldownLeft > 0 ? `Resend code (${cooldownLeft}s)` : 'Resend code';

  return (
    <AuthScreenShell
      flow
      showBack
      onBack={() => navigation.goBack()}
    >
      <Text style={authStyles.flowTitle}>Check your email</Text>
      <Text style={authStyles.flowSubtitle}>
        Enter the 6-digit code we sent to{' '}
        <Text style={authStyles.emailEm}>{email || 'your email'}</Text>. It expires in 10
        minutes.
      </Text>

      <AuthErrorBanner message={error} />
      <AuthInfoBanner message={info} />

      <AuthField
        label="Verification code"
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
        title="Continue"
        loading={submitting}
        onPress={handleVerify}
        disabled={!canSubmit}
        style={authStyles.primaryCta}
        textStyle={authStyles.primaryCtaText}
      />

      <AuthTextLink
        label={resendLabel}
        onPress={handleResend}
        disabled={cooldownLeft > 0 || !email}
        loading={resending}
        style={authStyles.linkRow}
      />

      <Pressable
        onPress={() => navigation.navigate('ForgotPassword')}
        style={({ pressed }) => [authStyles.linkRow, pressed && { opacity: 0.7 }]}
      >
        <Text style={authStyles.mutedLink}>Use a different email</Text>
      </Pressable>
    </AuthScreenShell>
  );
}
