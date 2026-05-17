import { View, Text, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../theme/colors';
import { premiumStyles } from '../theme/premiumUi';
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
 */
export function MockQuotaExhaustedCard({
  onSeePlans,
  onDailyPractice,
  onTopicPractice,
  compact = false,
}) {
  return (
    <View
      style={[
        premiumStyles.exhaustedCard,
        compact && premiumStyles.exhaustedCardCompact,
      ]}
    >
      <Text style={styles.title}>{MOCK_EXHAUSTED_TITLE}</Text>
      <Text style={styles.lead}>{MOCK_EXHAUSTED_LEAD}</Text>

      <Text style={styles.sectionLabel}>{MOCK_STILL_FREE_TITLE}</Text>
      {MOCK_STILL_FREE_ITEMS.map((item) => (
        <View key={item} style={styles.bulletRow}>
          <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
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
        style={({ pressed }) => [premiumStyles.ctaButton, pressFeedbackStyle(pressed)]}
      >
        <Text style={premiumStyles.ctaButtonText}>{MOCK_LIMIT_CTA}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
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
    borderColor: colors.border,
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
});
