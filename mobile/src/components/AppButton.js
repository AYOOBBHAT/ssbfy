import { Pressable, Text, StyleSheet, View } from 'react-native';
import { colors } from '../theme/colors';
import AuthBusyIndicator from './auth/AuthBusyIndicator';

/**
 * Pressable button with a clear busy state: full contrast, animated spinner,
 * dimmed label — avoids the “frozen grey button” trap on slow devices.
 */
export default function AppButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  style,
  textStyle,
}) {
  const base =
    variant === 'primary'
      ? styles.primary
      : variant === 'secondary'
        ? styles.secondary
        : styles.ghost;

  const labelBase =
    variant === 'primary'
      ? styles.primaryText
      : variant === 'secondary'
        ? styles.secondaryText
        : styles.ghostText;

  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityLabel={title}
      accessibilityHint={loading ? 'Please wait' : undefined}
      style={({ pressed }) => [
        styles.base,
        base,
        pressed && !isDisabled && styles.pressed,
        disabled && !loading && styles.disabled,
        loading && styles.loadingBusy,
        style,
      ]}
    >
      {loading ? (
        <View style={styles.loadingRow}>
          <AuthBusyIndicator
            prominent
            onPrimary={variant === 'primary'}
            color={variant === 'primary' ? colors.textOnPrimary : colors.primary}
          />
          <Text
            style={[labelBase, textStyle, styles.loadingLabel]}
            numberOfLines={1}
            importantForAccessibility="no-hide-descendants"
          >
            {title}
          </Text>
        </View>
      ) : (
        <Text style={[labelBase, textStyle]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  primary: { backgroundColor: colors.primary },
  primaryText: { color: colors.textOnPrimary, fontSize: 15, fontWeight: '600' },
  secondary: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  ghost: {
    backgroundColor: 'transparent',
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: 40,
  },
  ghostText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.5 },
  /** Full-strength button while busy — never reuse `disabled` fade. */
  loadingBusy: {
    opacity: 1,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 24,
  },
  loadingLabel: {
    opacity: 0.55,
    marginLeft: 12,
  },
});
