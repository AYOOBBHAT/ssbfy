function trimEnv(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isValidHttpUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export const feedbackFormConfig = {
  url: trimEnv(process.env.EXPO_PUBLIC_FEEDBACK_FORM_URL),
  typeEntryId: trimEnv(process.env.EXPO_PUBLIC_FEEDBACK_FORM_TYPE_ENTRY_ID),
};

export function isFeedbackFormConfigured() {
  return isValidHttpUrl(feedbackFormConfig.url);
}

export { isValidHttpUrl };
