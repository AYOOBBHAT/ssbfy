import React, { memo, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../theme/colors';
import { pressFeedbackStyle } from '../utils/pressFeedback';
import { formatTaxonomyLabel } from '../utils/formatTaxonomyLabel';
import { testTypeMetaLabel } from '../utils/mockTestCardPresentation';
import {
  useDevItemMountCounter,
  useDevRenderTrace,
} from '../utils/renderPerfDevLog';

function humanizeMockTitle(rawTitle, fallbackIndex) {
  const raw = (rawTitle || '').trim();
  if (!raw) return `Mock Test ${fallbackIndex + 1}`;
  if (/jkssb/i.test(raw) && /(test|mock)/i.test(raw)) {
    return `JKSSB Full Mock #${fallbackIndex + 1}`;
  }
  return formatTaxonomyLabel(raw);
}

function statusChipStyle(tone) {
  switch (tone) {
    case 'active':
      return styles.statusActive;
    case 'retry':
      return styles.statusRetry;
    case 'done':
      return styles.statusDone;
    case 'muted':
      return styles.statusMuted;
    default:
      return null;
  }
}

function MockTestCard({
  item,
  displayIndex = 0,
  onStart,
  isStarting,
  actionLabel,
  ctaState = 'start',
  statusLabel = null,
  statusTone = null,
  continuityHint = null,
  prominent = false,
  ctaDisabled = false,
  isRetiredResume = false,
}) {
  const title = humanizeMockTitle(item?.title, displayIndex);
  const duration = Number(item?.duration) || 0;
  const qCount = Array.isArray(item?.questionIds) ? item.questionIds.length : 0;
  const typeLabel = testTypeMetaLabel(item?.type);
  const state = typeof ctaState === 'string' ? ctaState : 'start';
  const isCompleted = state === 'completed';
  const isLoading = state === 'loading';
  const safeLabel =
    typeof actionLabel === 'string' && actionLabel.trim() ? actionLabel : 'Start Mock';
  const disabled = isStarting || ctaDisabled || isLoading;
  const itemId = String(item?._id ?? displayIndex);

  const handlePress = useCallback(() => {
    onStart(item);
  }, [onStart, item]);

  const statusStyle = statusChipStyle(statusTone);

  useDevRenderTrace(
    'MockTestCard',
    () => ({
      itemId,
      prominent,
      isStarting,
      state,
      disabled,
    }),
    { logEvery: 16, slowRenderMs: 12, logFirstRender: false }
  );
  useDevItemMountCounter('MockTestCard', itemId, { logEvery: 16 });

  return (
    <View
      style={[
        styles.card,
        prominent && styles.cardProminent,
        isCompleted && !prominent && styles.cardQuiet,
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <View style={styles.examMetaRow}>
            {qCount > 0 ? (
              <Text style={styles.examMeta}>{qCount} questions</Text>
            ) : null}
            {qCount > 0 && duration > 0 ? <Text style={styles.examMetaDot}>·</Text> : null}
            {duration > 0 ? (
              <View style={styles.timerMeta}>
                <Ionicons name="time-outline" size={13} color={colors.muted} />
                <Text style={styles.examMeta}>{duration} min</Text>
              </View>
            ) : null}
          </View>
          {continuityHint ? (
            <Text style={styles.continuityHint} numberOfLines={1}>
              {continuityHint}
            </Text>
          ) : null}
          <View style={styles.chipRow}>
            <View style={styles.typeChip}>
              <Text style={styles.typeChipText}>{typeLabel}</Text>
            </View>
            {isLoading ? (
              <View style={[styles.skelPill, styles.skelPillWide]} />
            ) : null}
            {!isLoading && isRetiredResume ? (
              <View style={[styles.statusChip, styles.statusMuted]}>
                <Text style={[styles.statusChipText, styles.statusMutedText]}>
                  Retired
                </Text>
              </View>
            ) : null}
            {!isLoading && statusLabel && statusStyle ? (
              <View style={[styles.statusChip, statusStyle]}>
                <Text
                  style={[
                    styles.statusChipText,
                    statusTone === 'active' && styles.statusActiveText,
                    statusTone === 'retry' && styles.statusRetryText,
                  ]}
                >
                  {statusLabel}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      <Pressable
        onPress={handlePress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.cta,
          prominent && styles.ctaProminent,
          isCompleted && styles.ctaDisabled,
          isLoading && styles.ctaSkeleton,
          pressFeedbackStyle(pressed, disabled),
        ]}
      >
        {isLoading ? (
          <View style={styles.skelBtnText} />
        ) : (
          <>
            <Text style={styles.ctaText}>{isStarting ? 'Starting…' : safeLabel}</Text>
            <Ionicons
              name={isCompleted ? 'checkmark' : prominent ? 'play-circle' : 'chevron-forward'}
              size={prominent ? 18 : 16}
              color={colors.textOnPrimary}
            />
          </>
        )}
      </Pressable>
    </View>
  );
}

export default memo(MockTestCard);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
      },
      android: { elevation: 1 },
    }),
  },
  cardProminent: {
    borderColor: colors.primary,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    backgroundColor: colors.primarySoft,
    ...Platform.select({
      ios: {
        shadowOpacity: 0.08,
        shadowRadius: 10,
      },
      android: { elevation: 2 },
    }),
  },
  cardQuiet: {
    opacity: 0.92,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  titleBlock: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.2,
    lineHeight: 21,
  },
  examMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 4,
    gap: 4,
  },
  examMeta: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '500',
  },
  examMetaDot: {
    fontSize: 12,
    color: colors.muted,
  },
  timerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  continuityHint: {
    fontSize: 11,
    color: colors.primaryText,
    fontWeight: '600',
    marginTop: 5,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  typeChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  typeChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.muted,
    letterSpacing: 0.2,
  },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusChipText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.15,
  },
  statusActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  statusActiveText: {
    color: colors.textOnPrimary,
  },
  statusRetry: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentBorder,
  },
  statusRetryText: {
    color: colors.accent,
  },
  statusDone: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
  },
  statusMuted: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
  },
  statusMutedText: {
    color: colors.muted,
    fontWeight: '600',
  },
  skelPill: {
    height: 18,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
  },
  skelPillWide: { width: 88 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  ctaProminent: {
    paddingVertical: 11,
  },
  ctaDisabled: {
    backgroundColor: colors.muted,
  },
  ctaSkeleton: {
    backgroundColor: '#e0e7ff',
  },
  ctaText: {
    color: colors.textOnPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  skelBtnText: {
    height: 14,
    width: 100,
    borderRadius: 7,
    backgroundColor: '#c7d2fe',
  },
});
