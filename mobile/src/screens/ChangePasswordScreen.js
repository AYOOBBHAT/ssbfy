import { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppButton from '../components/AppButton';
import AuthField, { PasswordToggle } from '../components/AuthField';
import { colors } from '../theme/colors';
import { changePassword } from '../services/authService';
import { getApiErrorMessage } from '../services/api';

export default function ChangePasswordScreen({ navigation }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const newRef = useRef(null);
  const confirmRef = useRef(null);

  const validate = () => {
    if (!currentPassword) return 'Current password is required';
    if (!newPassword) return 'New password is required';
    if (newPassword.length < 8) return 'Password must be at least 8 characters';
    if (!confirmPassword) return 'Confirm password is required';
    if (newPassword !== confirmPassword) return 'Passwords do not match';
    if (currentPassword === newPassword) {
      return 'New password must be different from current password';
    }
    return '';
  };

  const handleSubmit = async () => {
    if (submitting) return;
    const nextError = validate();
    if (nextError) {
      setError(nextError);
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await changePassword({
        currentPassword,
        newPassword,
        confirmPassword,
      });
      Alert.alert('Success', 'Password updated successfully', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    confirmPassword.length > 0 &&
    !submitting;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Change password</Text>
        <Text style={styles.subtitle}>
          Keep your account secure. Use a strong password you do not use anywhere else.
        </Text>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <AuthField
          label="Current password"
          placeholder="Current password"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          editable={!submitting}
          secureTextEntry={!showCurrent}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          autoComplete="password"
          returnKeyType="next"
          onSubmitEditing={() => newRef.current?.focus()}
          leftAdornment={<Ionicons name="lock-closed-outline" size={20} color={colors.primary} />}
          rightAdornment={
            <PasswordToggle
              visible={showCurrent}
              onPress={() => setShowCurrent((v) => !v)}
              disabled={submitting}
            />
          }
        />

        <AuthField
          ref={newRef}
          label="New password"
          placeholder="At least 8 characters"
          value={newPassword}
          onChangeText={setNewPassword}
          editable={!submitting}
          secureTextEntry={!showNew}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          autoComplete="password-new"
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
          leftAdornment={<Ionicons name="key-outline" size={20} color={colors.primary} />}
          rightAdornment={
            <PasswordToggle
              visible={showNew}
              onPress={() => setShowNew((v) => !v)}
              disabled={submitting}
            />
          }
        />

        <AuthField
          ref={confirmRef}
          label="Confirm new password"
          placeholder="Confirm new password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          editable={!submitting}
          secureTextEntry={!showConfirm}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          autoComplete="password-new"
          returnKeyType="go"
          onSubmitEditing={handleSubmit}
          leftAdornment={<Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />}
          rightAdornment={
            <PasswordToggle
              visible={showConfirm}
              onPress={() => setShowConfirm((v) => !v)}
              disabled={submitting}
            />
          }
        />

        <AppButton
          title={submitting ? 'Updating...' : 'Update password'}
          onPress={handleSubmit}
          disabled={!canSubmit}
          style={styles.cta}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 32 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: 8 },
  subtitle: { fontSize: 14, color: colors.muted, lineHeight: 20, marginBottom: 16 },
  errorBanner: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  errorText: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  cta: { marginTop: 10, paddingVertical: 14, borderRadius: 12 },
});
