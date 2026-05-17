import { useCallback, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { pressFeedbackStyle } from '../utils/pressFeedback';
import { ERROR_TITLES, humanizeErrorMessage } from '../utils/userFacingErrors';

const GLYPHS = {
  tests: '📋',
  notes: '📝',
  pdf: '📄',
  saved: '🔖',
  trophy: '🏆',
  practice: '📚',
  filter: '🔍',
  review: '📖',
  success: '✓',
  default: '○',
};

function StateGlyph({ glyph = 'default', emoji, compact = false }) {
  const symbol = emoji || GLYPHS[glyph] || GLYPHS.default;
  return (
    <View style={[styles.glyphTrack, compact && styles.glyphTrackCompact]}>
      <Text style={[styles.glyphText, compact && styles.glyphTextCompact]}>{symbol}</Text>
    </View>
  );
}

/**
 * Branded loading — spinner-first; optional short contextual label.
 */
export function LoadingState({ label = null, compact = false, size = 'large' }) {
  return (
    <View style={[styles.centered, compact && styles.compact]} accessibilityRole="progressbar">
      <View style={[styles.spinnerTrack, compact && styles.spinnerTrackCompact]}>
        <ActivityIndicator
          size={size === 'small' ? 'small' : 'large'}
          color={colors.primary}
        />
      </View>
      {label ? (
        <Text style={[styles.loadingLabel, compact && styles.loadingLabelCompact]}>{label}</Text>
      ) : null}
    </View>
  );
}

/** Inline loader for cards/rows (matches spinner track styling). */
export function InlineLoading({ size = 'small' }) {
  return (
    <View style={styles.inlineTrack}>
      <ActivityIndicator size={size} color={colors.primary} />
    </View>
  );
}

/**
 * Supportive empty state with optional next-step hint.
 * In compact mode hints are hidden by default to save vertical space.
 */
export function EmptyState({
  title = 'Nothing here yet',
  subtitle,
  hint,
  glyph = 'default',
  emoji,
  compact = false,
  showHintInCompact = false,
}) {
  const showHint = hint && (!compact || showHintInCompact);

  return (
    <View style={[styles.centered, compact && styles.compact]}>
      <StateGlyph glyph={glyph} emoji={emoji} compact={compact} />
      <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, compact && styles.subtitleCompact]}>{subtitle}</Text>
      ) : null}
      {showHint ? (
        <Text style={[styles.hint, compact && styles.hintCompact]}>{hint}</Text>
      ) : null}
    </View>
  );
}

/**
 * Calm error state with unified retry CTA and in-flight tap guard.
 */
export function ErrorState({
  title = ERROR_TITLES.load,
  message,
  context,
  onRetry,
  compact = false,
  retryLabel = 'Try again',
  retrying: retryingExternal = false,
}) {
  const displayMessage = humanizeErrorMessage(message, { context });
  const retryGuardRef = useRef(false);
  const [retryingLocal, setRetryingLocal] = useState(false);
  const retrying = retryingExternal || retryingLocal;

  const handleRetry = useCallback(async () => {
    if (!onRetry || retrying || retryGuardRef.current) return;
    retryGuardRef.current = true;
    setRetryingLocal(true);
    try {
      const result = onRetry();
      if (result != null && typeof result.then === 'function') {
        await result;
      }
    } finally {
      retryGuardRef.current = false;
      setRetryingLocal(false);
    }
  }, [onRetry, retrying]);

  return (
    <View style={[styles.centered, compact && styles.compact]}>
      <StateGlyph glyph="default" emoji="○" compact={compact} />
      <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
      {displayMessage ? (
        <Text style={[styles.errorMessage, compact && styles.subtitleCompact]}>
          {displayMessage}
        </Text>
      ) : null}
      {onRetry ? (
        <Pressable
          onPress={handleRetry}
          disabled={retrying}
          accessibilityRole="button"
          accessibilityLabel={retrying ? 'Retrying' : retryLabel}
          accessibilityState={{ disabled: retrying, busy: retrying }}
          style={({ pressed }) => [
            styles.retryBtn,
            compact && styles.retryBtnCompact,
            pressFeedbackStyle(pressed, retrying),
          ]}
        >
          {retrying ? (
            <View style={styles.retryRow}>
              <ActivityIndicator size="small" color={colors.textOnPrimary} />
              <Text style={styles.retryText}>Trying again…</Text>
            </View>
          ) : (
            <Text style={styles.retryText}>{retryLabel}</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

/** Alias — same component, semantic name for fetch recovery. */
export const RetryState = ErrorState;

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    minHeight: 120,
    width: '100%',
  },
  compact: {
    flex: 0,
    paddingVertical: 20,
    paddingHorizontal: 12,
    minHeight: 0,
  },
  spinnerTrack: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
  },
  spinnerTrackCompact: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  inlineTrack: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    alignSelf: 'center',
  },
  loadingLabel: {
    color: colors.muted,
    marginTop: 12,
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  loadingLabelCompact: {
    marginTop: 8,
    fontSize: 12,
  },
  glyphTrack: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  glyphTrackCompact: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginBottom: 8,
  },
  glyphText: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.primary,
  },
  glyphTextCompact: {
    fontSize: 17,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 340,
  },
  titleCompact: {
    fontSize: 15,
    lineHeight: 20,
    maxWidth: '100%',
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 340,
    paddingHorizontal: 4,
  },
  subtitleCompact: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
    maxWidth: '100%',
  },
  hint: {
    fontSize: 13,
    color: colors.primary,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 18,
    fontWeight: '500',
    maxWidth: 300,
    paddingHorizontal: 4,
  },
  hintCompact: {
    fontSize: 12,
    marginTop: 6,
    maxWidth: '100%',
  },
  errorMessage: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 340,
    paddingHorizontal: 4,
  },
  retryBtn: {
    marginTop: 14,
    backgroundColor: colors.primary,
    paddingVertical: 11,
    paddingHorizontal: 22,
    borderRadius: 12,
    minWidth: 140,
    alignItems: 'center',
  },
  retryBtnCompact: {
    marginTop: 10,
    paddingVertical: 10,
    minWidth: 128,
  },
  retryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  retryText: { color: colors.textOnPrimary, fontWeight: '600', fontSize: 14 },
});
