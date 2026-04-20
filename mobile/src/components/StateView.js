import { View, Text, ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

/**
 * Reusable full-screen state view: loading, empty, or error.
 * Use one of <LoadingState />, <EmptyState />, <ErrorState /> for consistent UX.
 */
export function LoadingState({ label = 'Loading...', compact = false }) {
  return (
    <View style={[styles.centered, compact && styles.compact]}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

export function EmptyState({
  title = 'No data available',
  subtitle,
  emoji = '📭',
  compact = false,
}) {
  return (
    <View style={[styles.centered, compact && styles.compact]}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  compact = false,
}) {
  return (
    <View style={[styles.centered, compact && styles.compact]}>
      <Text style={styles.emoji}>⚠️</Text>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.errorMessage}>{message}</Text> : null}
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [styles.retryBtn, pressed && styles.retryPressed]}
        >
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  compact: { flex: 0, paddingVertical: 32 },
  label: { color: colors.muted, marginTop: 12, fontSize: 14 },
  emoji: { fontSize: 36, marginBottom: 8 },
  title: { fontSize: 16, fontWeight: '600', color: colors.text, textAlign: 'center' },
  subtitle: { fontSize: 14, color: colors.muted, marginTop: 6, textAlign: 'center' },
  errorMessage: {
    fontSize: 14,
    color: colors.danger,
    marginTop: 6,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 16,
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryPressed: { opacity: 0.8 },
  retryText: { color: colors.textOnPrimary, fontWeight: '600', fontSize: 14 },
});
