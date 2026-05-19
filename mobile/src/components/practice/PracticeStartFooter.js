import React, { memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { colors } from '../../theme/colors';
import { pressFeedbackStyle } from '../../utils/pressFeedback';

function PracticeStartFooter({
  headline,
  sublines = [],
  helperText,
  error,
  starting,
  disabled,
  onStart,
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.summaryTitle}>Ready to practice</Text>
        <Text style={styles.summaryHeadline}>{headline}</Text>
        {sublines.map((line) => (
          <Text key={line} style={styles.summarySub}>
            {line}
          </Text>
        ))}
        {helperText ? <Text style={styles.helper}>{helperText}</Text> : null}
        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        <Pressable
          onPress={onStart}
          disabled={disabled || starting}
          style={({ pressed }) => [
            styles.primaryBtn,
            (disabled || starting) && styles.primaryBtnDisabled,
            pressFeedbackStyle(pressed, disabled || starting),
          ]}
        >
          {starting ? (
            <ActivityIndicator color={colors.textOnPrimary} />
          ) : (
            <Text style={styles.primaryBtnText}>Start Practice</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

export default memo(PracticeStartFooter);

const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: { elevation: 2 },
    }),
  },
  summaryTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  summaryHeadline: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  summarySub: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 4,
    fontWeight: '500',
  },
  helper: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 10,
    lineHeight: 16,
  },
  errorBanner: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 14,
  },
  primaryBtnDisabled: {
    opacity: 0.55,
  },
  primaryBtnText: {
    color: colors.textOnPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
});
