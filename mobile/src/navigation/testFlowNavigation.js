/**
 * Local test / practice session navigation helpers.
 *
 * Manual QA — navigation stack (after changes):
 * - Practice → Finish → Result → Android back → Practice tab (not stale Test).
 * - Practice → Finish → iOS swipe back from Result → same as Android back.
 * - Rapid double-tap Finish Practice → single Result screen only.
 * - Finish Practice → background app → foreground → no duplicate Result / timers.
 * - Result → Retry wrong → Finish Retry → Result (no Test under stack).
 * - Profile historical Result → back → Profile; isolated from practice stacks.
 * - Mock submit still uses TestScreen.navigateToResult reset [Main, Result].
 */

export const MAIN_TABS = {
  PRACTICE: 'Practice',
  HOME: 'Home',
  PROFILE: 'Profile',
};

const NESTED_MAIN = {
  [MAIN_TABS.PRACTICE]: 'PracticeMain',
  [MAIN_TABS.HOME]: 'HomeMain',
  [MAIN_TABS.PROFILE]: 'ProfileMain',
};

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
  if (tab === MAIN_TABS.PROFILE || params?.viewingHistoricalAttempt || params?.historicalAttemptMode) {
    return { label: 'Back to Profile', route: buildMainReturnRoute(MAIN_TABS.PROFILE) };
  }
  return { label: 'Back to Home', route: buildMainReturnRoute(MAIN_TABS.HOME) };
}
