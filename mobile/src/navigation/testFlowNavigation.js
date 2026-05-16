/**
 * Test / practice / mock navigation helpers.
 *
 * Manual QA — navigation stack & transitions:
 * - Practice → Finish → Result → Android back → Practice tab (not stale Test).
 * - Daily → Finish → Result → Android back → Home tab.
 * - Mock submit → Result → Android back / footer → Tests tab (not Home).
 * - Spam Android back during “Finishing…” / Submitting → back consumed, single Result.
 * - Retry chain: Result → Test → Finish Retry → one Result; returnMainTab preserved.
 * - Finish while app backgrounds → no duplicate reset / orphaned Test (see testTransitionLifecycle.js).
 * - Profile historical Result → back → Profile.
 * - Low-network delayed mock submit → one navigation commit only.
 */

export const MAIN_TABS = {
  PRACTICE: 'Practice',
  HOME: 'Home',
  TESTS: 'Tests',
  PROFILE: 'Profile',
};

const NESTED_MAIN = {
  [MAIN_TABS.PRACTICE]: 'PracticeMain',
  [MAIN_TABS.HOME]: 'HomeMain',
  [MAIN_TABS.TESTS]: 'TestsMain',
  [MAIN_TABS.PROFILE]: 'ProfileMain',
};

/**
 * True while finish/submit/navigation-reset is in flight.
 * Hardware back must be consumed during this window (not permanently).
 */
export function isNavigationTransitionActive({
  submitting = false,
  submitLockRef,
  transitionInFlightRef,
} = {}) {
  return !!(
    submitting ||
    submitLockRef?.current ||
    transitionInFlightRef?.current
  );
}

/** @returns {boolean} true if the back press was consumed (caller should return true). */
export function consumeHardwareBackDuringTransition(ctx) {
  return isNavigationTransitionActive(ctx);
}

/** Route object for `navigation.reset` bottom of stack (tab + nested screen). */
export function buildMainReturnRoute(mainTab = MAIN_TABS.HOME) {
  const tab = mainTab || MAIN_TABS.HOME;
  const nested = NESTED_MAIN[tab] || NESTED_MAIN[MAIN_TABS.HOME];
  return {
    name: 'Main',
    params: { screen: tab, params: { screen: nested } },
  };
}

/**
 * Replace entire root stack with [Main (origin tab), Result].
 * Removes completed TestScreen from history so back cannot resurrect it.
 *
 * @param {import('@react-navigation/native').NavigationProp<any>} navigation
 * @param {{ originMainTab?: string, resultParams?: object, commitRef?: { current: boolean } }} opts
 * @returns {boolean} false if navigation was already committed (duplicate guard)
 */
export function resetStackToResult(navigation, { originMainTab, resultParams, commitRef }) {
  if (commitRef?.current) return false;
  if (commitRef) commitRef.current = true;

  const tab = originMainTab || MAIN_TABS.HOME;
  navigation.reset({
    index: 1,
    routes: [
      buildMainReturnRoute(tab),
      {
        name: 'Result',
        params: {
          ...(resultParams || {}),
          returnMainTab: tab,
        },
      },
    ],
  });
  return true;
}

export function resolveResultBackTarget(params) {
  const tab = params?.returnMainTab;
  if (tab === MAIN_TABS.PRACTICE) {
    return { label: 'Back to Practice', route: buildMainReturnRoute(MAIN_TABS.PRACTICE) };
  }
  if (tab === MAIN_TABS.TESTS) {
    return { label: 'Back to Tests', route: buildMainReturnRoute(MAIN_TABS.TESTS) };
  }
  if (tab === MAIN_TABS.PROFILE || params?.viewingHistoricalAttempt || params?.historicalAttemptMode) {
    return { label: 'Back to Profile', route: buildMainReturnRoute(MAIN_TABS.PROFILE) };
  }
  return { label: 'Back to Home', route: buildMainReturnRoute(MAIN_TABS.HOME) };
}

/** Default return tab for retry Test sessions launched from a Result screen. */
export function resolveRetryOriginMainTab({ returnMainTab, isHistoricalAttempt, testId }) {
  if (returnMainTab) return returnMainTab;
  if (isHistoricalAttempt) return MAIN_TABS.PROFILE;
  if (testId) return MAIN_TABS.TESTS;
  return MAIN_TABS.HOME;
}
