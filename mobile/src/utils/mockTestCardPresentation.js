/**
 * Maps backend status flags → card CTA + session-state chips (display only).
 */

export function resolveMockTestPresentation({
  hasOpen = false,
  isCompleted = false,
  canRetry = false,
  statusLoading = false,
  statusError = null,
  isPremium = false,
}) {
  if (statusLoading) {
    return {
      ctaLabel: 'Start Mock',
      ctaState: 'loading',
      statusLabel: null,
      statusTone: null,
      continuityHint: null,
      prominent: false,
      ctaDisabled: true,
    };
  }

  if (statusError) {
    return {
      ctaLabel: 'Open Mock',
      ctaState: 'unknown',
      statusLabel: 'Syncing',
      statusTone: 'muted',
      continuityHint: null,
      prominent: false,
      ctaDisabled: false,
    };
  }

  if (hasOpen) {
    return {
      ctaLabel: 'Continue Mock',
      ctaState: 'resume',
      statusLabel: 'In Progress',
      statusTone: 'active',
      continuityHint: 'Resume your timed attempt',
      prominent: true,
      ctaDisabled: false,
    };
  }

  if (isCompleted && isPremium && canRetry) {
    return {
      ctaLabel: 'Retry Mock',
      ctaState: 'retry',
      statusLabel: 'Retry Available',
      statusTone: 'retry',
      continuityHint: 'Prior attempt completed',
      prominent: false,
      ctaDisabled: false,
    };
  }

  if (isCompleted && !isPremium) {
    return {
      ctaLabel: 'Completed',
      ctaState: 'completed',
      statusLabel: 'Completed',
      statusTone: 'done',
      continuityHint: 'Upgrade to retry',
      prominent: false,
      ctaDisabled: true,
    };
  }

  return {
    ctaLabel: 'Start Mock',
    ctaState: 'start',
    statusLabel: null,
    statusTone: null,
    continuityHint: null,
    prominent: false,
    ctaDisabled: false,
  };
}

export function testTypeMetaLabel(type) {
  if (type === 'post') return 'Full Syllabus';
  if (type === 'subject') return 'Subject Focus';
  if (type === 'topic') return 'Topic Focus';
  if (type === 'mixed') return 'Mixed Syllabus';
  return 'Mock Test';
}
