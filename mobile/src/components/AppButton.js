import { Pressable, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

/**
 * Lightweight pressable button with consistent opacity feedback.
 * variant: "primary" | "secondary" | "ghost"
 */
export default function AppButton({
  title,
  onPress,
  disabled = false,
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

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        base,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={[labelBase, textStyle]}>{title}</Text>
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
  },
  ghostText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.5 },
});
