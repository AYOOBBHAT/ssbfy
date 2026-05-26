import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { pressFeedbackStyle } from '../../utils/pressFeedback';
import { resultPalette, resultShadows } from './resultTheme';

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
    paddingVertical: 10,
    gap: 12,
  },
  left: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: resultPalette.text,
    lineHeight: 21,
  },
  mistakeChip: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: resultPalette.surfaceAlt,
    borderWidth: 1,
    borderColor: resultPalette.border,
  },
  mistakeText: {
    fontSize: 10,
    fontWeight: '700',
    color: resultPalette.textMid,
    textTransform: 'uppercase',
    letterSpacing: 0.55,
  },
  practiceBtn: {
    minWidth: 88,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: resultPalette.border,
    backgroundColor: resultPalette.surface,
    alignItems: 'center',
    ...resultShadows.card,
  },
  practiceBtnDisabled: {
    opacity: 0.5,
  },
  practiceBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: resultPalette.navy800,
    letterSpacing: 0.2,
  },
});
