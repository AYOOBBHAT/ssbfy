import { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../context/AuthContext';
import { getApiErrorMessage } from '../services/api';
import AppButton from '../components/AppButton';
import AuthField, { PasswordToggle } from '../components/AuthField';
import { colors, brand } from '../theme/colors';

const MIN_PASSWORD_LENGTH = 8;
const MOTO_DOT = '#c9a227';

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

  const iconColor = colors.primary;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
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
            <Image
              source={require('../../assets/icon.png')}
              style={styles.logoImage}
              resizeMode="contain"
              accessibilityRole="image"
              accessibilityLabel={`${brand.name} logo`}
            />
            <Text style={styles.brandName}>{brand.name}</Text>
            <View style={styles.mottoRow}>
              <Text style={styles.mottoPart}>Prepare</Text>
              <Text style={styles.mottoDot}> • </Text>
              <Text style={styles.mottoPart}>Practice</Text>
              <Text style={styles.mottoDot}> • </Text>
              <Text style={styles.mottoPart}>Succeed</Text>
            </View>
            <Text style={styles.welcomeTitle}>Create your account</Text>
            <Text style={styles.welcomeSub}>Start practicing in minutes — it&apos;s free.</Text>
          </View>

          <View style={styles.card}>
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
              leftAdornment={
                <Ionicons name="person-outline" size={22} color={iconColor} />
              }
            />

            <AuthField
              ref={emailRef}
              label="Email"
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
              leftAdornment={
                <Ionicons name="mail-outline" size={22} color={iconColor} />
              }
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
              leftAdornment={
                <Ionicons name="lock-closed-outline" size={22} color={iconColor} />
              }
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
              textStyle={styles.primaryCtaText}
            />

            <Pressable
              onPress={() => navigation.navigate('Login')}
              disabled={authSubmitting}
              style={({ pressed }) => [
                styles.switchRow,
                pressed && !authSubmitting && { opacity: 0.7 },
              ]}
            >
              <Text style={styles.switchMuted}>Already have an account? </Text>
              <Text style={styles.switchLink}>Log In</Text>
            </Pressable>
          </View>

          <Text style={styles.footer}>
            By creating an account, you agree to SSBFY&apos;s Terms &amp; Privacy Policy.
          </Text>

          <View style={styles.academicFooter} pointerEvents="none">
            <View style={[styles.academicBlob, styles.blob1]} />
            <View style={[styles.academicBlob, styles.blob2]} />
            <View style={[styles.academicBlob, styles.blob3]} />
            <View style={styles.academicHill} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fafbff' },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 28,
  },

  brandBlock: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoImage: {
    width: 112,
    height: 112,
    marginBottom: 16,
  },
  brandName: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.primaryText,
    letterSpacing: 3,
  },
  mottoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 8,
  },
  mottoPart: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    letterSpacing: 0.3,
  },
  mottoDot: {
    fontSize: 13,
    fontWeight: '700',
    color: MOTO_DOT,
  },
  welcomeTitle: {
    marginTop: 18,
    fontSize: 22,
    fontWeight: '800',
    color: colors.primaryText,
    letterSpacing: 0.2,
  },
  welcomeSub: {
    marginTop: 6,
    fontSize: 14,
    color: colors.muted,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 8,
  },

  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.08)',
    padding: 22,
    shadowColor: colors.primaryText,
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
    elevation: 3,
  },

  errorBanner: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },

  passwordHint: {
    fontSize: 12,
    color: colors.muted,
    marginTop: -4,
    marginBottom: 14,
    fontWeight: '500',
  },
  passwordHintOk: { color: colors.success, fontWeight: '700' },

  primaryCta: {
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 4,
  },
  primaryCtaText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 22,
    marginBottom: 22,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    marginHorizontal: 14,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
  },

  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    gap: 12,
  },
  googleButtonPressed: {
    backgroundColor: colors.primarySoft,
    opacity: 0.95,
  },
  googleButtonDisabled: {
    opacity: 0.55,
  },
  googleG: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  googleGText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.primary,
  },
  googleLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primaryText,
  },

  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 8,
  },
  switchMuted: { color: colors.muted, fontSize: 15 },
  switchLink: { color: colors.primary, fontSize: 15, fontWeight: '800' },

  footer: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: 11,
    marginTop: 22,
    paddingHorizontal: 12,
    lineHeight: 16,
  },

  academicFooter: {
    marginTop: 20,
    height: 100,
    marginHorizontal: -24,
    marginBottom: -8,
    overflow: 'hidden',
  },
  academicBlob: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.14,
  },
  blob1: {
    width: 160,
    height: 160,
    backgroundColor: colors.primary,
    left: -48,
    bottom: -60,
  },
  blob2: {
    width: 100,
    height: 100,
    backgroundColor: colors.primaryDark,
    right: 20,
    bottom: -20,
  },
  blob3: {
    width: 56,
    height: 56,
    backgroundColor: MOTO_DOT,
    right: 100,
    bottom: 40,
    opacity: 0.2,
  },
  academicHill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 48,
    backgroundColor: colors.primarySoft,
    opacity: 0.45,
    borderTopLeftRadius: 48,
    borderTopRightRadius: 48,
  },
});
