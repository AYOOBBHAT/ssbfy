import { Pressable, Text, StyleSheet, View } from 'react-native';
import { colors } from '../../theme/colors';
import AuthBusyIndicator from './AuthBusyIndicator';

/**
 * Text link with inline busy state — spinner + dimmed label (not spinner-only).
 */
export default function AuthTextLink({
  label,
  onPress,
  disabled = false,
  loading = false,
  style,
  textStyle,
}) {
  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityState={{ disabled: inactive, busy: loading }}
      accessibilityLabel={label}
      accessibilityHint={loading ? 'Please wait' : undefined}
      style={({ pressed }) => [
        styles.row,
        style,
        pressed && !inactive && styles.pressed,
        loading && styles.loadingRow,
      ]}
    >
      {loading ? (
        <View style={styles.busyContent}>
          <AuthBusyIndicator color={colors.primary} prominent track />
          <Text style={[styles.text, styles.loadingLabel, textStyle]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      ) : (
        <Text style={[styles.text, disabled && styles.textDisabled, textStyle]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignSelf: 'center',
    paddingVertical: 8,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingRow: {
    opacity: 1,
  },
  busyContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pressed: { opacity: 0.7 },
  text: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  textDisabled: { color: colors.muted, fontWeight: '600' },
  loadingLabel: {
    opacity: 0.5,
    maxWidth: 220,
    marginLeft: 10,
  },
});
