import { View, Text, StyleSheet, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../theme/colors';
import { pressFeedbackStyle } from '../utils/pressFeedback';
import {
  MOCK_EXHAUSTED_LEAD,
  MOCK_EXHAUSTED_PREMIUM_LINE,
  MOCK_EXHAUSTED_TITLE,
  MOCK_LIMIT_CTA,
  MOCK_STILL_FREE_ITEMS,
  MOCK_STILL_FREE_TITLE,
} from '../utils/mockQuotaCopy';

/**
 * Supportive exhausted-quota card with free-loop recovery + Premium CTA.
 * @param {{
 *   onSeePlans: () => void,
 *   onDailyPractice?: () => void,
 *   onTopicPractice?: () => void,
 *   compact?: boolean,
 * }} props
 */
export function MockQuotaExhaustedCard({
  onSeePlans,
  onDailyPractice,
  onTopicPractice,
  compact = false,
}) {
  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <Text style={styles.title}>{MOCK_EXHAUSTED_TITLE}</Text>
      <Text style={styles.lead}>{MOCK_EXHAUSTED_LEAD}</Text>

      <Text style={styles.sectionLabel}>{MOCK_STILL_FREE_TITLE}</Text>
      {MOCK_STILL_FREE_ITEMS.map((item) => (
        <View key={item} style={styles.bulletRow}>
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}

      <View style={styles.recoveryRow}>
        {onDailyPractice ? (
          <Pressable
            onPress={onDailyPractice}
            style={({ pressed }) => [styles.recoveryBtn, pressFeedbackStyle(pressed)]}
          >
            <Text style={styles.recoveryBtnText}>Daily practice</Text>
          </Pressable>
        ) : null}
        {onTopicPractice ? (
          <Pressable
            onPress={onTopicPractice}
            style={({ pressed }) => [styles.recoveryBtn, pressFeedbackStyle(pressed)]}
          >
            <Text style={styles.recoveryBtnText}>Topic practice</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.premiumLine}>{MOCK_EXHAUSTED_PREMIUM_LINE}</Text>
      <Pressable
        onPress={onSeePlans}
        style={({ pressed }) => [styles.primaryBtn, pressFeedbackStyle(pressed)]}
      >
        <Text style={styles.primaryBtnText}>{MOCK_LIMIT_CTA}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardCompact: {
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  lead: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 6,
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
  recoveryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    marginBottom: 14,
  },
  recoveryBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  recoveryBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primaryText,
  },
  premiumLine: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
    marginBottom: 12,
  },
  primaryBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  primaryBtnText: {
    color: colors.textOnPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
});
