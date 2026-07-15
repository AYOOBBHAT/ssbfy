import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppButton from '../AppButton';
import { colors } from '../../theme/colors';
import { authStyles } from '../../theme/authUi';

export function AuthOrDivider() {
  return (
    <View style={styles.row}>
      <View style={styles.line} />
      <Text style={styles.label}>OR</Text>
      <View style={styles.line} />
    </View>
  );
}

export function GoogleSignInButton({ onPress, loading, disabled }) {
  return (
    <AppButton
      title="Continue with Google"
      variant="secondary"
      onPress={onPress}
      loading={loading}
      disabled={disabled}
      style={styles.googleBtn}
      textStyle={styles.googleBtnText}
    />
  );
}

export function GoogleSignInHint() {
  return (
    <View style={styles.hintRow}>
      <Ionicons name="logo-google" size={16} color={colors.muted} />
      <Text style={styles.hintText}>Use your Google account to sign in securely.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  label: {
    marginHorizontal: 12,
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    letterSpacing: 0.6,
  },
  googleBtn: {
    marginTop: 0,
    borderColor: 'rgba(37, 99, 235, 0.18)',
    backgroundColor: colors.card,
  },
  googleBtnText: {
    fontWeight: '700',
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  hintText: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '500',
  },
});
