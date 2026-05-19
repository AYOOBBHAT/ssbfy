/**
 * Display-only copy and helpers for focused retry / recovery sessions.
 */

export const RETRY_SESSION_BADGE = 'Focused retry';

/**
 * @param {{ timed?: boolean, scopeCount?: number, sourceKind?: 'mock'|'practice'|'session' }} opts
 */
export function getRetrySessionHint({ timed = false, scopeCount = 0, sourceKind = 'session' } = {}) {
  const n = Number(scopeCount) || 0;
  const scope =
    n > 0
      ? `${n} question${n === 1 ? '' : 's'} from your last attempt`
      : 'Questions from your last attempt';
  const pacing = timed ? 'Timed recovery mode' : 'Untimed · learn at your pace';
  const source =
    sourceKind === 'mock'
      ? 'Second pass on mock misses'
      : sourceKind === 'practice'
      ? 'Second pass on practice misses'
      : 'Targeted second attempt';
  return { scope, pacing, source };
}

/**
 * @param {{ correct: number, total: number, remainingWrong: number }} stats
 */
export function getRetryCompletionMessage({ correct = 0, total = 0, remainingWrong = 0 } = {}) {
  const c = Number(correct) || 0;
  const t = Number(total) || 0;
  const left = Number(remainingWrong) || 0;

  if (t > 0 && left === 0) {
    return 'Strong recovery — you cleared the retry set';
  }
  if (t > 0 && c === t) {
    return 'Perfect on this retry round — review to lock it in';
  }
  if (left > 0 && c > 0) {
    return `Progress made — ${left} still worth revisiting when ready`;
  }
  if (left > 0) {
    return 'Recovery takes reps — review explanations below';
  }
  return 'Focused retry complete — review builds lasting recall';
}

/**
 * Entry CTA from a parent Result (before navigate to Test).
 * @param {{ incorrect: number, unanswered: number, retryable: number }} breakdown
 */
export function getRetryEntryCtaTitle({ incorrect = 0, unanswered = 0, retryable = 0 } = {}) {
  const n = Number(retryable) || 0;
  if (n <= 0) return 'Start focused retry';
  if (unanswered > 0 && incorrect === 0) return 'Continue unanswered';
  if (incorrect > 0 && unanswered === 0) return 'Retry missed questions';
  return 'Start focused retry';
}

export function getRetryEntryCtaSubtitle(retryable) {
  const n = Number(retryable) || 0;
  if (n <= 0) return 'Untimed second pass on selected questions';
  return `Untimed recovery · ${n} question${n === 1 ? '' : 's'}`;
}

/** Finish button on TestScreen during retry. */
export const RETRY_FINISH_LABEL = 'Complete recovery';
