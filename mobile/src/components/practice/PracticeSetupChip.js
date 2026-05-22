import React, { memo } from 'react';
import { Pressable, Text, StyleSheet, Platform, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../../theme/colors';
import { battleAccent, isBattleSetupMode } from '../../theme/setupPresentation';
import { pressCardStyle } from '../../utils/pressFeedback';

function PracticeSetupChip({ mode = 'practice', label, selected, onPress, compact = false }) {
  const battle = isBattleSetupMode(mode);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        compact && styles.chipCompact,
        selected && (battle ? styles.chipSelectedBattle : styles.chipSelected),
        pressCardStyle(pressed),
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      {selected ? (
        <View style={styles.checkWrap}>
          <Ionicons name="checkmark" size={12} color={colors.textOnPrimary} />
        </View>
      ) : null}
      <Text
        style={[styles.chipText, selected && styles.chipTextSelected]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default memo(PracticeSetupChip);

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
    maxWidth: '100%',
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 2,
      },
      android: { elevation: 0 },
    }),
  },
  chipCompact: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
    }),
  },
  chipSelectedBattle: {
    backgroundColor: battleAccent.primary,
    borderColor: battleAccent.primary,
    ...Platform.select({
      ios: {
        shadowColor: battleAccent.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
    }),
  },
  checkWrap: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    flexShrink: 1,
  },
  chipTextSelected: {
    color: colors.textOnPrimary,
    fontWeight: '700',
  },
});
