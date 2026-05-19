import { formatTaxonomyLabel } from './formatTaxonomyLabel';

/**
 * Exam-oriented tier copy for mock results (display only).
 */
export function getMockTierMessage(accuracy, wrongCount, totalQ) {
  const pct = Number(accuracy) || 0;
  const missed = Number(wrongCount) || 0;
  const total = Number(totalQ) || 0;

  if (pct >= 80) {
    return 'Strong mock performance — keep this exam rhythm';
  }
  if (pct >= 50) {
    return missed > 0
      ? 'Solid attempt — targeted retry can lift weak sections'
      : 'Solid timed attempt — review to lock in pacing';
  }
  if (missed > 0 && total > 0) {
    return 'Every mock builds readiness — focus recovery below';
  }
  return 'Timed practice builds exam confidence over time';
}

/**
 * @param {number} seconds
 * @param {number} totalQuestions
 */
export function buildMockPacingLine(seconds, totalQuestions) {
  const s = Math.max(0, Number(seconds) || 0);
  const q = Number(totalQuestions) || 0;
  if (s <= 0) return null;
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  const timeStr = mm > 0 ? `${mm}m ${String(ss).padStart(2, '0')}s` : `${ss}s`;
  if (q > 0) {
    const perQ = Math.round(s / q);
    return `Finished in ${timeStr} · ~${perQ}s per question`;
  }
  return `Finished in ${timeStr} under timed conditions`;
}

export function formatMockExamHint(testTitle) {
  const raw = testTitle != null ? String(testTitle).trim() : '';
  if (!raw) return 'Full-length timed mock';
  return formatTaxonomyLabel(raw);
}

export const MOCK_WEAK_SECTION = {
  title: 'Recovery focus',
  subtitle: 'Sections to strengthen before your next mock',
  primaryCta: 'Drill weak sections',
  primarySub: '10-question mixed review',
};

export const PRACTICE_WEAK_SECTION = {
  title: 'Focus areas',
  subtitle: 'Topics to strengthen next',
  primaryCta: 'Practice all weak topics',
  primarySub: '10-question mixed drill',
};
