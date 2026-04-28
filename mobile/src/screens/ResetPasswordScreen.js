import { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import AppButton from '../components/AppButton';
import AuthField, { PasswordToggle } from '../components/AuthField';
import { colors, brand } from '../theme/colors';
import { resetPassword } from '../services/authService';
import { getApiErrorMessage } from '../services/api';

export default function ResetPasswordScreen({ navigation, route }) {
  const initialEmail = route.params?.email || '';
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const otpRef = useRef(null);
  const passRef = useRef(null);
  const confirmRef = useRef(null);

  async function handleReset() {
    if (submitting) return;
    setError('');
    const trimmedEmail = email.trim();
    if (!trimmed) {
      setError('Email is required.');
      return;
    }
    const code = otp.trim();
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword({
        email: trimmedEmail,
        otp: code,
        newPassword,
      });
      Alert.alert(
        'Password updated',
        'You can sign in with your new password.',
        [{ text: 'OK', onPress: () => navigation.navigate('Login') }]
      );
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    email.trim().length > 0 &&
    /^\d{6}$/.test(otp.trim()) &&
    newPassword.length >= 8 &&
    confirmPassword.length > 0 &&
    !submitting;

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
        <Text style={styles.title}>Reset password</Text>
        <Text style={styles.subtitle}>
          Enter the code from your email and choose a new password for {brand.name}.
        </Text>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <AuthField
          label="Email"
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
          editable={!submitting}
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          returnKeyType="next"
          onSubmitEditing={() => otpRef.current?.focus()}
        />

        <AuthField
          ref={otpRef}
          label="6-digit code"
          placeholder="000000"
          value={otp}
          onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, 6))}
          editable={!submitting}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          maxLength={6}
          returnKeyType="next"
          onSubmitEditing={() => passRef.current?.focus()}
        />

        <AuthField
          ref={passRef}
          label="New password"
          placeholder="At least 8 characters"
          value={newPassword}
          onChangeText={setNewPassword}
          editable={!submitting}
          secureTextEntry={!showPassword}
          textContentType="newPassword"
          autoComplete="password-new"
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
          rightAdornment={
            <PasswordToggle
              visible={showPassword}
              onPress={() => setShowPassword((v) => !v)}
              disabled={submitting}
            />
          }
        />

        <AuthField
          ref={confirmRef}
          label="Confirm new password"
          placeholder="Repeat password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          editable={!submitting}
          secureTextEntry={!showConfirm}
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={handleReset}
          rightAdornment={
            <PasswordToggle
              visible={showConfirm}
              onPress={() => setShowConfirm((v) => !v)}
              disabled={submitting}
            />
          }
        />

        <AppButton
          title={submitting ? 'Updating…' : 'Update password'}
          onPress={handleReset}
          disabled={!canSubmit}
          style={styles.primaryCta}
        />

        <Pressable
          onPress={() => navigation.navigate('ForgotPassword')}
          style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.linkText}>Need a new code?</Text>
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
  primaryCta: { marginTop: 8, paddingVertical: 14, borderRadius: 12 },
  linkRow: { alignSelf: 'center', marginTop: 16, paddingVertical: 8 },
  linkText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  mutedLink: { color: colors.muted, fontSize: 14 },
});
