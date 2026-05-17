/**
 * Encouraging, achievable copy for Result → retry flows.
 * Retry includes incorrect + unanswered; tone must not feel punitive.
 */

function plural(n, one, many = `${one}s`) {
  return n === 1 ? one : many;
}

/**
 * @param {{ total: number, incorrect: number, unanswered: number, retryable: number, examTotal: number }} stats
 */
export function buildRetryCtaCopy({ total, incorrect, unanswered, retryable, examTotal }) {
  if (retryable <= 0) {
    return { title: 'Practice missed questions', subtitle: '', encourage: '' };
  }

  const examRatio = examTotal > 0 ? total / examTotal : 0;
  const isLargeSet = retryable >= 15 || examRatio >= 0.45;

  let title = 'Practice missed questions';
  let subtitle = '';
  let encourage = 'A short focused session — not a full retake.';

  if (unanswered > 0 && incorrect === 0) {
    title = 'Continue unanswered questions';
    subtitle =
      retryable === 1
        ? 'Pick up where you left off — no timer on this retry'
        : `${retryable} skipped — finish them at your own pace`;
    encourage = 'Skipping happens — you can close the gap question by question.';
  } else if (incorrect > 0 && unanswered === 0) {
    title = isLargeSet ? 'Focused practice on mistakes' : 'Practice what you missed';
    subtitle = isLargeSet
      ? `${retryable} questions in one calm session — step by step`
      : `${retryable} ${plural(retryable, 'question')} to strengthen — learn from each one`;
    encourage = 'You only need to work on what was missed, not the whole paper again.';
  } else {
    title = isLargeSet ? 'Start a focused retry' : 'Practice missed questions';
    const parts = [];
    if (incorrect > 0) parts.push(`${incorrect} to review`);
    if (unanswered > 0) parts.push(`${unanswered} unanswered`);
    subtitle = isLargeSet
      ? `${parts.join(' · ')} — manageable pace, not a full retake`
      : `${parts.join(' · ')} — a short session to build confidence`;
    encourage =
      examRatio >= 0.5
        ? 'Many misses today is normal — chip away with a focused retry.'
        : 'Mix of skips and misses — take them one at a time.';
  }

  if (retryable < total) {
    subtitle = `${subtitle}${subtitle ? ' · ' : ''}${total - retryable} unavailable skipped`;
  }

  return { title, subtitle, encourage };
}

/** @param {number} remaining */
export function buildRetryAgainCopy(remaining) {
  if (remaining <= 0) return { title: 'Practice again', subtitle: '' };
  if (remaining === 1) {
    return {
      title: 'Try once more',
      subtitle: 'One question left — small win within reach',
    };
  }
  if (remaining >= 12) {
    return {
      title: 'Keep going',
      subtitle: `${remaining} left — take a breather, then continue in batches`,
    };
  }
  return {
    title: 'Practice again',
    subtitle: `${remaining} to go — each round makes the ideas stick`,
  };
}

/**
 * Softer tier line when many questions need work (low score).
 */
export function getEncouragingTierMessage(accuracy, retryWorthyCount, examTotal) {
  const pct = Number(accuracy) || 0;
  const ratio = examTotal > 0 ? retryWorthyCount / examTotal : 0;
  if (retryWorthyCount >= 10 && (pct < 55 || ratio >= 0.45)) {
    return 'This attempt is a starting point — a focused retry turns gaps into growth';
  }
  if (pct < 50) {
    return 'Every session builds skill — focus on small wins below';
  }
  if (pct < 80) {
    return 'Solid effort — small improvements add up';
  }
  return 'Strong work — keep this momentum';
}
