import { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { getApiErrorMessage } from '../services/api';
import AppButton from '../components/AppButton';
import AuthField, { PasswordToggle } from '../components/AuthField';
import { colors, brand } from '../theme/colors';

const MIN_PASSWORD_LENGTH = 8;

export default function SignupScreen({ navigation }) {
  const { signup, authSubmitting } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  async function handleSignup() {
    if (authSubmitting) return;
    setError('');
    // UI only — same signup payload shape as before.
    try {
      await signup({
        name: name.trim(),
        email: email.trim(),
        password,
      });
    } catch (e) {
      setError(getApiErrorMessage(e));
    }
  }

  // Lightweight client hint so the user doesn't discover the 8-char rule
  // only via a backend rejection. Does NOT replace server validation.
  const passwordHint = useMemo(() => {
    if (password.length === 0) {
      return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return `${MIN_PASSWORD_LENGTH - password.length} more character${
        MIN_PASSWORD_LENGTH - password.length === 1 ? '' : 's'
      } to go.`;
    }
    return 'Looks good.';
  }, [password]);
  const passwordHintOk = password.length >= MIN_PASSWORD_LENGTH;

  const canSubmit =
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= MIN_PASSWORD_LENGTH &&
    !authSubmitting;

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
        <View style={styles.brandBlock}>
          <View style={styles.logoTile}>
            <Text style={styles.logoMark}>S</Text>
          </View>
          <Text style={styles.brandName}>{brand.name}</Text>
          <Text style={styles.brandTagline}>{brand.tagline}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>
            Start practicing in minutes — it’s free.
          </Text>

          {error ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <AuthField
            label="Full Name"
            placeholder="Enter your full name"
            value={name}
            onChangeText={setName}
            editable={!authSubmitting}
            autoCapitalize="words"
            autoCorrect={false}
            textContentType="name"
            autoComplete="name"
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
          />

          <AuthField
            ref={emailRef}
            label="Email Address"
            placeholder="Enter your email"
            value={email}
            onChangeText={setEmail}
            editable={!authSubmitting}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />

          <AuthField
            ref={passwordRef}
            label="Password"
            placeholder="Create a password"
            value={password}
            onChangeText={setPassword}
            editable={!authSubmitting}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="newPassword"
            autoComplete="password-new"
            returnKeyType="go"
            onSubmitEditing={handleSignup}
            rightAdornment={
              <PasswordToggle
                visible={showPassword}
                onPress={() => setShowPassword((v) => !v)}
                disabled={authSubmitting}
              />
            }
          />

          <Text
            style={[
              styles.passwordHint,
              passwordHintOk && styles.passwordHintOk,
            ]}
          >
            {passwordHint}
          </Text>

          <AppButton
            title={authSubmitting ? 'Creating account…' : 'Create Account'}
            onPress={handleSignup}
            disabled={!canSubmit}
            style={styles.primaryCta}
          />

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <Pressable
            onPress={() => navigation.navigate('Login')}
            disabled={authSubmitting}
            style={({ pressed }) => [
              styles.switchRow,
              pressed && !authSubmitting && { opacity: 0.7 },
            ]}
          >
            <Text style={styles.switchMuted}>Already have an account? </Text>
            <Text style={styles.switchLink}>Log in</Text>
          </Pressable>
        </View>

        <Text style={styles.footer}>
          By creating an account, you agree to SSBFY’s Terms & Privacy Policy.
        </Text>
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

  brandBlock: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logoTile: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  logoMark: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 1,
  },
  brandName: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 2,
  },
  brandTagline: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 4,
  },

  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    shadowColor: '#0f172a',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 18,
  },

  errorBanner: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },

  passwordHint: {
    fontSize: 12,
    color: colors.muted,
    marginTop: -6,
    marginBottom: 16,
  },
  passwordHintOk: { color: colors.success, fontWeight: '600' },

  primaryCta: {
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 4,
  },

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: {
    marginHorizontal: 10,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 6,
  },
  switchMuted: { color: colors.muted, fontSize: 14 },
  switchLink: { color: colors.primary, fontSize: 14, fontWeight: '700' },

  footer: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: 12,
    marginTop: 20,
    paddingHorizontal: 16,
    lineHeight: 18,
  },
});
