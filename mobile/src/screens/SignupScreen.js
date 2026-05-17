import { useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../context/AuthContext';
import { getApiErrorMessage } from '../services/api';
import AppButton from '../components/AppButton';
import AuthField, { PasswordToggle } from '../components/AuthField';
import AuthBrandHeader from '../components/auth/AuthBrandHeader';
import { AuthErrorBanner } from '../components/auth/AuthErrorBanner';
import AuthScreenShell from '../components/auth/AuthScreenShell';
import { colors } from '../theme/colors';
import { authStyles } from '../theme/authUi';

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
      return `At least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return `${MIN_PASSWORD_LENGTH - password.length} more character${
        MIN_PASSWORD_LENGTH - password.length === 1 ? '' : 's'
      } needed.`;
    }
    return 'Password meets the minimum length.';
  }, [password]);
  const passwordHintOk = password.length >= MIN_PASSWORD_LENGTH;

  const canSubmit =
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= MIN_PASSWORD_LENGTH &&
    !authSubmitting;

  const iconColor = colors.primary;

  return (
    <AuthScreenShell
      footer={
        <Text style={authStyles.footerLegal}>
          By creating an account, you agree to SSBFY&apos;s Terms &amp; Privacy Policy.
        </Text>
      }
    >
      <AuthBrandHeader subtitle="Create your account" />

      <View style={authStyles.card}>
        <AuthErrorBanner message={error} />

        <AuthField
          label="Full name"
          placeholder="Your name"
          value={name}
          onChangeText={setName}
          editable={!authSubmitting}
          autoCapitalize="words"
          autoCorrect={false}
          textContentType="name"
          autoComplete="name"
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
          leftAdornment={<Ionicons name="person-outline" size={20} color={iconColor} />}
        />

        <AuthField
          ref={emailRef}
          label="Email"
          placeholder="you@example.com"
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
          leftAdornment={<Ionicons name="mail-outline" size={20} color={iconColor} />}
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
          leftAdornment={<Ionicons name="lock-closed-outline" size={20} color={iconColor} />}
          rightAdornment={
            <PasswordToggle
              visible={showPassword}
              onPress={() => setShowPassword((v) => !v)}
              disabled={authSubmitting}
            />
          }
        />

        <Text
          style={[authStyles.passwordHint, passwordHintOk && authStyles.passwordHintOk]}
        >
          {passwordHint}
        </Text>

        <AppButton
          title="Create account"
          loading={authSubmitting}
          onPress={handleSignup}
          disabled={!canSubmit}
          style={authStyles.primaryCta}
          textStyle={authStyles.primaryCtaText}
        />

        <Pressable
          onPress={() => navigation.navigate('Login')}
          disabled={authSubmitting}
          style={({ pressed }) => [
            authStyles.switchRow,
            pressed && !authSubmitting && { opacity: 0.7 },
          ]}
        >
          <Text style={authStyles.switchMuted}>Already have an account? </Text>
          <Text style={authStyles.switchLink}>Log in</Text>
        </Pressable>
      </View>
    </AuthScreenShell>
  );
}
