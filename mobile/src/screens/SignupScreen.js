import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { getApiErrorMessage } from '../services/api';
import AppButton from '../components/AppButton';
import { colors, brand } from '../theme/colors';

export default function SignupScreen({ navigation }) {
  const { signup, authSubmitting } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSignup() {
    if (authSubmitting) {
      return;
    }
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

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <View style={styles.brandBlock}>
          <Text style={styles.brandName}>{brand.name}</Text>
          <Text style={styles.brandTagline}>{brand.tagline}</Text>
        </View>
        <Text style={styles.title}>Sign up</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {authSubmitting ? <Text style={styles.wait}>Please wait...</Text> : null}
        <TextInput
          style={styles.input}
          placeholder="Name"
          value={name}
          onChangeText={setName}
          editable={!authSubmitting}
        />
        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
          editable={!authSubmitting}
        />
        <TextInput
          style={styles.input}
          placeholder="Password (min 8 characters)"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!authSubmitting}
        />
        <AppButton
          title={authSubmitting ? 'Signing up...' : 'Sign up'}
          onPress={handleSignup}
          disabled={authSubmitting}
        />
        <View style={styles.spacer} />
        <AppButton
          title="Back to Login"
          variant="secondary"
          onPress={() => navigation.navigate('Login')}
          disabled={authSubmitting}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, padding: 16, justifyContent: 'center' },
  brandBlock: { alignItems: 'center', marginBottom: 24 },
  brandName: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 2,
  },
  brandTagline: { fontSize: 13, color: colors.muted, marginTop: 4 },
  title: { fontSize: 20, marginBottom: 12, fontWeight: '600', color: colors.text },
  wait: { marginBottom: 8, color: colors.muted },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    color: colors.text,
  },
  error: { color: colors.danger, marginBottom: 8 },
  spacer: { height: 16 },
});
