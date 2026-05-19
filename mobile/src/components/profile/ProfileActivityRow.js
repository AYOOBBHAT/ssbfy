import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../../theme/colors';
import { pressCardStyle } from '../../utils/pressFeedback';
import { getSessionActivityVisual } from '../../utils/sessionActivityVisual';

function ScoreChip({ value, visual }) {
  if (value == null || value === '') return null;
  return (
    <View style={[styles.scoreChip, { backgroundColor: visual.chipBg }]}>
      <Text style={[styles.scoreChipText, { color: visual.chipText }]}>{value}</Text>
    </View>
  );
}

function ProfileActivityRow({
  title,
  meta,
  scoreLabel,
  sessionKind = 'practice',
  disabled = false,
  onPress,
}) {
  const visual = getSessionActivityVisual(sessionKind);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      style={({ pressed }) => [
        styles.row,
        pressCardStyle(pressed),
        (disabled || !onPress) && styles.rowDisabled,
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: visual.iconBg }]}>
        <Ionicons name={visual.icon} size={18} color={visual.iconColor} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {meta ? (
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      <View style={styles.trailing}>
        <ScoreChip value={scoreLabel} visual={visual} />
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </View>
    </Pressable>
  );
}

export default memo(ProfileActivityRow);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    gap: 12,
  },
  rowDisabled: {
    opacity: 0.55,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: -0.1,
  },
  meta: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 3,
    fontWeight: '500',
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scoreChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    minWidth: 44,
    alignItems: 'center',
  },
  scoreChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
