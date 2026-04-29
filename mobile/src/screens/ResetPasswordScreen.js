import { useRef, useState } from 'react';
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
import { completePasswordReset } from '../services/authService';
import { getApiErrorMessage } from '../services/api';

/**
 * STEP 3 of the Forgot Password flow.
 *
 * The user has already verified their OTP and we hold a short-lived
 * `resetToken`. From here we never touch the OTP again — only the
 * token + new password leave the device. On success the server tells
 * us the password was updated; we surface a clear confirmation and
 * reset the navigation stack to Login (no auto-login).
 *
 * Route params (required): { email, resetToken }
 *
 * If a user lands here without a resetToken (e.g. via a deep link or
 * back-navigation accident) we redirect them to ForgotPassword so they
 * can re-establish a verified session.
 */
export default function ResetPasswordScreen({ navigation, route }) {
  const email = route?.params?.email || '';
  const resetToken = route?.params?.resetToken || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const confirmRef = useRef(null);

  // Defensive: cannot reset without a verified-session token.
  if (!resetToken || !email) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.title}>Reset session expired</Text>
        <Text style={styles.subtitle}>
          Please start again to receive a new code.
        </Text>
        <AppButton
          title="Back to Forgot Password"
          onPress={() => navigation.replace('ForgotPassword')}
          style={styles.primaryCta}
        />
      </View>
    );
  }

  function validate() {
    if (newPassword.length < 8) {
      return 'Password must be at least 8 characters.';
    }
    if (newPassword !== confirmPassword) {
      return 'Passwords do not match.';
    }
    return '';
  }

  async function handleReset() {
    if (submitting) return;
    setError('');
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setSubmitting(true);
    try {
      await completePasswordReset({
        email,
        resetToken,
        newPassword,
        confirmPassword,
      });
      // Success — explicit confirmation, no auto-login. Reset the stack
      // so back navigation cannot land on a forgot-password screen with
      // stale state.
      Alert.alert(
        'Password reset successful',
        'You can now sign in with your new password.',
        [
          {
            text: 'Go to Login',
            onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Login' }] }),
          },
        ]
      );
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
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
        <Text style={styles.title}>Choose a new password</Text>
        <Text style={styles.subtitle}>
          Set a new password for{' '}
          <Text style={styles.emailEm}>{email}</Text>. You&apos;ll sign in to{' '}
          {brand.name} with the new password right after.
        </Text>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <AuthField
          label="New password"
          placeholder="At least 8 characters"
          value={newPassword}
          onChangeText={setNewPassword}
          editable={!submitting}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
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

        <Text style={styles.hint}>
          Use 8+ characters. Mix letters, numbers and symbols for a stronger
          password.
        </Text>

        <AuthField
          ref={confirmRef}
          label="Confirm new password"
          placeholder="Repeat password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          editable={!submitting}
          secureTextEntry={!showConfirm}
          autoCapitalize="none"
          autoCorrect={false}
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
          onPress={() => navigation.replace('ForgotPassword')}
          disabled={submitting}
          style={({ pressed }) => [
            styles.linkRow,
            pressed && !submitting && { opacity: 0.7 },
          ]}
        >
          <Text style={styles.mutedLink}>Cancel and start over</Text>
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
  fallback: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 20,
    paddingTop: 48,
    alignItems: 'stretch',
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
  hint: {
    fontSize: 12,
    color: colors.muted,
    marginTop: -8,
    marginBottom: 12,
    lineHeight: 16,
  },
  primaryCta: { marginTop: 8, paddingVertical: 14, borderRadius: 12 },
  linkRow: { alignSelf: 'center', marginTop: 16, paddingVertical: 8 },
  mutedLink: { color: colors.muted, fontSize: 14 },
});
