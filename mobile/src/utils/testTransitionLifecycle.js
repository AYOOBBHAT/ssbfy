/**
 * Finish / submit transition lifecycle guards (TestScreen).
 *
 * Ref semantics:
 * - submitLockRef: user tapped finish/submit once; blocks duplicate taps.
 * - transitionInFlightRef: critical window active (sync finish or async HTTP); blocks back.
 * - transitionStartedAtRef: timestamp for stall recovery after background / slow devices.
 * - submissionCompletedRef: server accepted mock submit OR navigation committed; never replay submit.
 * - navigationCommittedRef: resetStackToResult ran; prevents duplicate navigation.
 * - transitionGenRef: incremented on unmount / new transition; stale async must not navigate.
 * - mountedRef: screen still mounted before setState / navigation.
 *
 * Lifecycle assumptions:
 * - Backgrounding does NOT cancel in-flight HTTP; axios timeout (15s) still applies.
 * - Foreground resume: if transition still in flight within STALL_MS, keep spinner.
 * - After STALL_MS with no navigation commit, release guards and show retry error.
 * - Successful navigation unmounts TestScreen; refs are discarded (no permanent back block).
 *
 * Manual QA — lifecycle interruptions:
 * - Finish → Home immediately → single Result, no duplicate submit.
 * - Finish → lock phone 30s → resume → completes or timeout error, not infinite spinner.
 * - Mock submit → switch apps → resume → one Result or error; no second POST.
 * - Finish offline / timeout → error shown, finish button works again, back works.
 * - Retry / daily / practice finish during background → same rules.
 */

export const TRANSITION_STALL_MS = 90_000;

export function nextTransitionGeneration(transitionGenRef) {
  transitionGenRef.current += 1;
  return transitionGenRef.current;
}

export function isStaleTransitionGeneration(transitionGenRef, generation) {
  return generation !== transitionGenRef.current;
}

export function markTransitionStarted(refs) {
  refs.transitionInFlightRef.current = true;
  refs.transitionStartedAtRef.current = Date.now();
}

/**
 * Clear transition guards when navigation did not complete.
 * Safe to call after failed submit, stall recovery, or inconsistent state on resume.
 */
export function releaseIncompleteTransition(refs, { setSubmitting } = {}) {
  if (refs.navigationCommittedRef?.current) return;
  refs.transitionInFlightRef.current = false;
  refs.submitLockRef.current = false;
  refs.submissionCompletedRef.current = false;
  refs.transitionStartedAtRef.current = 0;
  if (typeof setSubmitting === 'function') setSubmitting(false);
}

/**
 * After app returns to foreground: recover stuck "Finishing…" / submit UI.
 */
export function recoverStalledTransitionOnForeground({
  mountedRef,
  refs,
  setSubmitError,
  setSubmitting,
  stallMs = TRANSITION_STALL_MS,
}) {
  if (!mountedRef?.current) return;
  if (refs.navigationCommittedRef?.current) return;

  const inFlight =
    refs.transitionInFlightRef?.current || refs.submitLockRef?.current;

  if (!inFlight) {
    recoverOrphanedTransitionFlags({ mountedRef, refs, setSubmitting, setSubmitError });
    return;
  }

  const started = refs.transitionStartedAtRef?.current || 0;
  if (!started) return;

  if (Date.now() - started < stallMs) return;

  releaseIncompleteTransition(refs, { setSubmitting });
  if (typeof setSubmitError === 'function') {
    setSubmitError(
      'This is taking longer than expected. Check your connection and try again.'
    );
  }
}

/** Flags set without active in-flight work — e.g. interrupted between setState and reset. */
export function recoverOrphanedTransitionFlags({
  mountedRef,
  refs,
  setSubmitting,
  setSubmitError,
}) {
  if (!mountedRef?.current) return;
  if (refs.navigationCommittedRef?.current) return;
  if (refs.transitionInFlightRef?.current || refs.submitLockRef?.current) return;

  if (!refs.submissionCompletedRef?.current) return;

  releaseIncompleteTransition(refs, { setSubmitting });
  if (typeof setSubmitError === 'function') {
    setSubmitError('Could not complete. Please try again.');
  }
}
