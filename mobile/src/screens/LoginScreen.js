import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../context/AuthContext';
import { getApiErrorMessage } from '../services/api';
import { getAuthFlowMessageAfterRetry } from '../utils/authNetworkRetry.js';
import AppButton from '../components/AppButton';
import AuthField, { PasswordToggle } from '../components/AuthField';
import AuthBrandHeader from '../components/auth/AuthBrandHeader';
import { AuthErrorBanner } from '../components/auth/AuthErrorBanner';
import AuthScreenShell from '../components/auth/AuthScreenShell';
import { colors } from '../theme/colors';
import { authStyles } from '../theme/authUi';
import { markStartup } from '../utils/startupTiming';

export default function LoginScreen({ navigation }) {
  const { login, authSubmitting } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const passwordRef = useRef(null);

  useEffect(() => {
    markStartup('FIRST_LOGIN_RENDER');
  }, []);

  async function handleLogin() {
    if (authSubmitting) return;
    setError('');
    try {
      await login({ email: email.trim(), password });
    } catch (e) {
      const afterRetry = getAuthFlowMessageAfterRetry(e);
      setError(afterRetry || getApiErrorMessage(e));
    }
  }

  const canSubmit = email.trim().length > 0 && password.length > 0 && !authSubmitting;
  const iconColor = colors.primary;

  return (
    <AuthScreenShell
      footer={
        <Text style={authStyles.footerLegal}>
          By continuing, you agree to SSBFY&apos;s Terms &amp; Privacy Policy.
        </Text>
      }
    >
      <AuthBrandHeader subtitle="Welcome back" />

      <View style={authStyles.card}>
        <AuthErrorBanner message={error} />

        <AuthField
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
          placeholder="Your password"
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
          leftAdornment={<Ionicons name="lock-closed-outline" size={20} color={iconColor} />}
          rightAdornment={
            <PasswordToggle
              visible={showPassword}
              onPress={() => setShowPassword((v) => !v)}
              disabled={authSubmitting}
            />
          }
        />

        <Pressable
          onPress={() => navigation.navigate('ForgotPassword')}
          disabled={authSubmitting}
          hitSlop={8}
          style={({ pressed }) => [
            authStyles.forgotRow,
            pressed && !authSubmitting && { opacity: 0.7 },
          ]}
        >
          <Text style={authStyles.forgotText}>Forgot password?</Text>
        </Pressable>

        <AppButton
          title="Login"
          loading={authSubmitting}
          onPress={handleLogin}
          disabled={!canSubmit}
          style={authStyles.primaryCta}
          textStyle={authStyles.primaryCtaText}
        />

        <Pressable
          onPress={() => navigation.navigate('Signup')}
          disabled={authSubmitting}
          style={({ pressed }) => [
            authStyles.switchRow,
            pressed && !authSubmitting && { opacity: 0.7 },
          ]}
        >
          <Text style={authStyles.switchMuted}>Don&apos;t have an account? </Text>
          <Text style={authStyles.switchLink}>Sign up</Text>
        </Pressable>
      </View>
    </AuthScreenShell>
  );
}
