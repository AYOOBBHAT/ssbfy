import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';

function PracticeSetupSection({
  step,
  title,
  helper,
  selectedHint,
  optional = false,
  children,
}) {
  return (
    <View style={styles.section}>
      <View style={styles.headRow}>
        {step != null ? (
          <View style={styles.stepBadge}>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ) : null}
        <View style={styles.headText}>
          <Text style={styles.title}>
            {title}
            {optional ? <Text style={styles.optionalTag}> · Optional</Text> : null}
          </Text>
          {helper ? <Text style={styles.helper}>{helper}</Text> : null}
        </View>
      </View>
      {selectedHint ? <Text style={styles.selectedHint}>{selectedHint}</Text> : null}
      <View style={styles.body}>{children}</View>
    </View>
  );
}

export default memo(PracticeSetupSection);

const styles = StyleSheet.create({
  section: {
    marginBottom: 22,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
  },
  headText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.2,
  },
  optionalTag: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  helper: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
    marginTop: 4,
  },
  selectedHint: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primaryText,
    marginBottom: 8,
  },
  body: {},
});
