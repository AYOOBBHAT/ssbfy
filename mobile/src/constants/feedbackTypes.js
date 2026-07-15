/** Canonical values sent to the Google Form prefill (must match form option labels exactly). */
export const FEEDBACK_TYPES = {
  BUG: 'Bug Report',
  FEATURE: 'feature Suggestion',
  GENERAL: 'General  Feedback',
};

/** Profile menu items → feedback type mapping. */
export const FEEDBACK_MENU_ITEMS = [
  {
    id: 'bug',
    type: FEEDBACK_TYPES.BUG,
    title: 'Report a Bug',
    subtitle: 'Tell us what went wrong',
    icon: 'bug-outline',
    analyticsEvent: 'feedback_bug_opened',
  },
  {
    id: 'feature',
    type: FEEDBACK_TYPES.FEATURE,
    title: 'Suggest a Feature',
    subtitle: 'Share an idea for SSBFY',
    icon: 'bulb-outline',
    analyticsEvent: 'feedback_feature_opened',
  },
  {
    id: 'general',
    type: FEEDBACK_TYPES.GENERAL,
    title: 'Send Feedback',
    subtitle: 'Tell us about your experience',
    icon: 'chatbubble-ellipses-outline',
    analyticsEvent: 'feedback_general_opened',
  },
];
