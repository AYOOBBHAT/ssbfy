import { useRef, useState } from 'react';
import { Alert, Pressable, Text } from 'react-native';
import AppButton from '../components/AppButton';
import AuthField, { PasswordToggle } from '../components/AuthField';
import { AuthErrorBanner } from '../components/auth/AuthErrorBanner';
import AuthScreenShell from '../components/auth/AuthScreenShell';
import { brand } from '../theme/colors';
import { authStyles } from '../theme/authUi';
import { completePasswordReset } from '../services/authService';
import { getApiErrorMessage } from '../services/api';

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

  if (!resetToken || !email) {
    return (
      <AuthScreenShell flow showBack onBack={() => navigation.replace('ForgotPassword')}>
        <Text style={authStyles.flowTitle}>Reset session expired</Text>
        <Text style={authStyles.flowSubtitle}>
          Please request a new code to continue.
        </Text>
        <AppButton
          title="Request new code"
          onPress={() => navigation.replace('ForgotPassword')}
          style={authStyles.primaryCta}
          textStyle={authStyles.primaryCtaText}
        />
      </AuthScreenShell>
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
      Alert.alert(
        'Password updated',
        'You can sign in with your new password.',
        [
          {
            text: 'Go to login',
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
    newPassword.length >= 8 && confirmPassword.length > 0 && !submitting;

  return (
    <AuthScreenShell
      flow
      showBack
      onBack={() => navigation.goBack()}
    >
      <Text style={authStyles.flowTitle}>New password</Text>
      <Text style={authStyles.flowSubtitle}>
        Choose a password for{' '}
        <Text style={authStyles.emailEm}>{email}</Text>, then sign in to {brand.name}.
      </Text>

      <AuthErrorBanner message={error} />

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

      <Text style={authStyles.fieldHint}>
        Use 8 or more characters with letters and numbers.
      </Text>

      <AuthField
        ref={confirmRef}
        label="Confirm password"
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
        title="Update password"
        loading={submitting}
        onPress={handleReset}
        disabled={!canSubmit}
        style={authStyles.primaryCta}
        textStyle={authStyles.primaryCtaText}
      />

      <Pressable
        onPress={() => navigation.replace('ForgotPassword')}
        disabled={submitting}
        style={({ pressed }) => [
          authStyles.linkRow,
          pressed && !submitting && { opacity: 0.7 },
        ]}
      >
        <Text style={authStyles.mutedLink}>Start over</Text>
      </Pressable>
    </AuthScreenShell>
  );
}
