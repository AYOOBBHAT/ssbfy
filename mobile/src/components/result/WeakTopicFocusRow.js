import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors } from '../../theme/colors';
import { pressFeedbackStyle } from '../../utils/pressFeedback';

function WeakTopicFocusRow({ displayLabel, mistakeCount, loading, disabled, onPractice }) {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Text style={styles.title} numberOfLines={2}>
          {displayLabel}
        </Text>
        <View style={styles.mistakeChip}>
          <Text style={styles.mistakeText}>
            {mistakeCount} mistake{mistakeCount === 1 ? '' : 's'}
          </Text>
        </View>
      </View>
      <Pressable
        onPress={onPractice}
        disabled={disabled}
        style={({ pressed }) => [
          styles.practiceBtn,
          (disabled || loading) && styles.practiceBtnDisabled,
          pressFeedbackStyle(pressed, disabled || loading),
        ]}
      >
        <Text style={styles.practiceBtnText}>{loading ? '…' : 'Practice'}</Text>
      </Pressable>
    </View>
  );
}

export default memo(WeakTopicFocusRow);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  left: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 19,
  },
  mistakeChip: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mistakeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.muted,
  },
  practiceBtn: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  practiceBtnDisabled: {
    opacity: 0.5,
  },
  practiceBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
});
