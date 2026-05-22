import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';
import { isBattleSetupMode } from '../../theme/setupPresentation';
import logger from '../../utils/logger';

let practiceSetupLoadingWarned = false;

function PracticeSetupSection({
  mode = 'practice',
  step,
  title,
  helper,
  selectedHint,
  optional = false,
  children,
  loading: _deprecatedLoading,
}) {
  const battle = isBattleSetupMode(mode);
  const accentStyles = useMemo(
    () =>
      battle
        ? {
            stepBadge: styles.stepBadgeBattle,
            stepText: styles.stepTextBattle,
            selectedHint: styles.selectedHintBattle,
          }
        : {
            stepBadge: styles.stepBadge,
            stepText: styles.stepText,
            selectedHint: styles.selectedHint,
          },
    [battle]
  );
  if (__DEV__ && _deprecatedLoading !== undefined && !practiceSetupLoadingWarned) {
    practiceSetupLoadingWarned = true;
    logger.warn(
      '[PracticeSetupSection] loading prop is not supported — use inline LoadingState in the section body'
    );
  }
  return (
    <View style={styles.section}>
      <View style={styles.headRow}>
        {step != null ? (
          <View style={accentStyles.stepBadge}>
            <Text style={accentStyles.stepText}>{step}</Text>
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
      {selectedHint ? <Text style={accentStyles.selectedHint}>{selectedHint}</Text> : null}
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
  stepBadgeBattle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#fff4e6',
    borderWidth: 1,
    borderColor: '#fde3c4',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepTextBattle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#9a3412',
  },
  selectedHintBattle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9a3412',
    marginBottom: 8,
  },
  body: {},
});
