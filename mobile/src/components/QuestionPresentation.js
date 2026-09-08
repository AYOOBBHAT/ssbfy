import { memo, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import {
  PRESENTATION_KINDS,
  resolveQuestionPresentation,
} from '../utils/questionPresentation';

/**
 * Renders only the question stem (plain text, statements, numbered list, or table).
 * Options, scoring, and navigation stay in the parent screen.
 */
function QuestionPresentation({
  question,
  variant = 'test',
  fallbackLabel = '(question unavailable)',
  emptyAsFallback = false,
}) {
  const resolved = useMemo(
    () => resolveQuestionPresentation(question, { fallbackLabel, emptyAsFallback }),
    [question, fallbackLabel, emptyAsFallback]
  );
  const review = variant === 'review';
  const introStyle = review ? styles.reviewIntro : styles.testIntro;
  const promptStyle = review ? styles.reviewPrompt : styles.testPrompt;
  const bodyStyle = review ? styles.reviewBody : styles.testBody;
  const labelStyle = review ? styles.reviewLabel : styles.testLabel;

  if (resolved.kind === PRESENTATION_KINDS.PLAIN) {
    return (
      <Text style={review ? styles.reviewPlain : styles.testPlain}>{resolved.text}</Text>
    );
  }

  return (
    <View style={review ? styles.wrapReview : styles.wrap} accessibilityRole="text">
      {resolved.intro ? <Text style={introStyle}>{resolved.intro}</Text> : null}

      {resolved.kind === PRESENTATION_KINDS.TWO_STATEMENTS
        ? resolved.statements.map((row, i) => (
            <View key={`st-${i}`} style={styles.statementBlock}>
              <Text style={labelStyle}>{row.label}</Text>
              <Text style={bodyStyle}>{row.text}</Text>
            </View>
          ))
        : null}

      {resolved.kind === PRESENTATION_KINDS.NUMBERED_LIST
        ? resolved.items.map((item, i) => (
            <View key={`n-${item.n}-${i}`} style={styles.numberedRow}>
              <Text style={review ? styles.reviewNumber : styles.testNumber}>{item.n}.</Text>
              <Text style={[bodyStyle, styles.numberedText]}>{item.text}</Text>
            </View>
          ))
        : null}

      {resolved.kind === PRESENTATION_KINDS.TABLE ? (
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator
          style={styles.tableScroll}
          contentContainerStyle={styles.tableScrollContent}
        >
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeaderRow]}>
              {resolved.columns.map((col, i) => (
                <View
                  key={`h-${i}`}
                  style={[
                    styles.tableCell,
                    styles.tableHeaderCell,
                    i === resolved.columns.length - 1 && styles.tableCellLast,
                  ]}
                >
                  <Text style={review ? styles.reviewTableHeader : styles.testTableHeader}>
                    {col}
                  </Text>
                </View>
              ))}
            </View>
            {resolved.rows.map((row, r) => (
              <View
                key={`r-${r}`}
                style={[
                  styles.tableRow,
                  r === resolved.rows.length - 1 && styles.tableRowLast,
                ]}
              >
                {row.map((cell, c) => (
                  <View
                    key={`c-${r}-${c}`}
                    style={[
                      styles.tableCell,
                      c === row.length - 1 && styles.tableCellLast,
                    ]}
                  >
                    <Text style={review ? styles.reviewTableCell : styles.testTableCell}>
                      {cell}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      ) : null}

      {resolved.prompt ? <Text style={promptStyle}>{resolved.prompt}</Text> : null}
    </View>
  );
}

export default memo(QuestionPresentation);

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  testPlain: { ...typography.questionText, marginBottom: 12 },
  reviewPlain: {
    ...typography.questionText,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 10,
  },
  testIntro: { ...typography.questionText, marginBottom: 10 },
  reviewIntro: {
    ...typography.questionText,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 8,
  },
  testPrompt: { ...typography.questionText, marginTop: 4, marginBottom: 4 },
  reviewPrompt: {
    ...typography.questionText,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 4,
    marginBottom: 2,
  },
  statementBlock: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  testLabel: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    color: colors.primaryText,
    marginBottom: 4,
  },
  reviewLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: colors.primaryText,
    marginBottom: 4,
  },
  testBody: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
    color: colors.text,
  },
  reviewBody: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
    color: colors.text,
  },
  numberedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  numberedText: { flex: 1, flexShrink: 1 },
  testNumber: {
    minWidth: 28,
    marginRight: 8,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '700',
    color: colors.primaryText,
  },
  reviewNumber: {
    minWidth: 26,
    marginRight: 8,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    color: colors.primaryText,
  },
  wrapReview: { marginBottom: 10 },
  tableScroll: { marginBottom: 10 },
  tableScrollContent: { flexGrow: 1 },
  table: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.card,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableRowLast: { borderBottomWidth: 0 },
  tableHeaderRow: { backgroundColor: colors.bg },
  tableCell: {
    minWidth: 112,
    maxWidth: 220,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  tableCellLast: { borderRightWidth: 0 },
  tableHeaderCell: { backgroundColor: colors.bg },
  testTableHeader: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: colors.text,
  },
  reviewTableHeader: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    color: colors.text,
  },
  testTableCell: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
  reviewTableCell: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
  },
});
