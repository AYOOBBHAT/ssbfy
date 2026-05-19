import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import PracticeSetupChip from './PracticeSetupChip';

const PRESETS = [5, 10, 20, 30];

function QuestionCountSegment({ value, onChange }) {
  return (
    <View style={styles.row}>
      {PRESETS.map((n) => (
        <View key={n} style={styles.cell}>
          <PracticeSetupChip
            label={String(n)}
            selected={value === n}
            onPress={() => onChange(n)}
            compact
          />
        </View>
      ))}
    </View>
  );
}

export default memo(QuestionCountSegment);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  cell: {
    width: '25%',
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
});
