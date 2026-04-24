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
import { useAuth } from '../context/AuthContext';
import { getApiErrorMessage } from '../services/api';
import AppButton from '../components/AppButton';
import AuthField, { PasswordToggle } from '../components/AuthField';
import { colors, brand } from '../theme/colors';

export default function LoginScreen({ navigation }) {
  const { login, authSubmitting } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const passwordRef = useRef(null);

  async function handleLogin() {
    if (authSubmitting) return;
    setError('');
    // Deliberately preserves the exact same call signature that the
    // AuthContext already expects — this change is UI only.
    try {
      await login({ email: email.trim(), password });
    } catch (e) {
      setError(getApiErrorMessage(e));
    }
  }

  // Forgot-password is a UI entry point for now. A dedicated reset
  // flow can wire in later; until then we surface a helpful hint so
  // the user isn't left staring at a dead link.
  function handleForgotPassword() {
    if (authSubmitting) return;
    Alert.alert(
      'Forgot Password',
      'Password reset is handled manually for now. Please contact support with your registered email and we’ll help you regain access.',
      [{ text: 'OK' }]
    );
  }

  const canSubmit = email.trim().length > 0 && password.length > 0 && !authSubmitting;

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
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Log in to continue your exam prep.</Text>

          {error ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <AuthField
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
            placeholder="Enter your password"
            value={password}
            onChangeText={setPassword}
            editable={!authSubmitting}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            autoComplete="password"
            returnKeyType="go"
            onSubmitEditing={handleLogin}
            rightAdornment={
              <PasswordToggle
                visible={showPassword}
                onPress={() => setShowPassword((v) => !v)}
                disabled={authSubmitting}
              />
            }
          />

          <Pressable
            onPress={handleForgotPassword}
            disabled={authSubmitting}
            hitSlop={8}
            style={({ pressed }) => [
              styles.forgotRow,
              pressed && !authSubmitting && { opacity: 0.7 },
            ]}
          >
            <Text style={styles.forgotText}>Forgot Password?</Text>
          </Pressable>

          <AppButton
            title={authSubmitting ? 'Logging in…' : 'Log In'}
            onPress={handleLogin}
            disabled={!canSubmit}
            style={styles.primaryCta}
          />

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <Pressable
            onPress={() => navigation.navigate('Signup')}
            disabled={authSubmitting}
            style={({ pressed }) => [
              styles.switchRow,
              pressed && !authSubmitting && { opacity: 0.7 },
            ]}
          >
            <Text style={styles.switchMuted}>New here? </Text>
            <Text style={styles.switchLink}>Create an account</Text>
          </Pressable>
        </View>

        <Text style={styles.footer}>
          By continuing, you agree to SSBFY’s Terms & Privacy Policy.
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
    // Subtle elevation so the card reads as "content" rather than blending
    // into the page background. Tuned conservatively to stay on-brand.
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

  forgotRow: {
    alignSelf: 'flex-end',
    marginTop: -4,
    marginBottom: 16,
    paddingVertical: 4,
  },
  forgotText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },

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
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
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
