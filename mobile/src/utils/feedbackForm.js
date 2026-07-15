import { Alert } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { feedbackFormConfig, isFeedbackFormConfigured, isValidHttpUrl } from '../config/feedbackConfig';
import logger from './logger';
import { monitoringBreadcrumb } from '../monitoring/sentry';

let openInFlight = false;

function trimEnv(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEntryId(entryId) {
  const trimmed = trimEnv(entryId);
  if (!trimmed) return null;
  return trimmed.startsWith('entry.') ? trimmed : `entry.${trimmed}`;
}

/**
 * Append Google Form prefill params without duplicating `?` or `&`.
 * @param {string} baseUrl
 * @param {Record<string, string>} entries — keys like `entry.123456789`
 */
export function appendGoogleFormPrefill(baseUrl, entries) {
  const pairs = Object.entries(entries).filter(
    ([key, value]) => key && value != null && String(value).trim().length > 0
  );
  if (!pairs.length) return baseUrl;

  const query = pairs
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');

  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}${query}`;
}

/**
 * Build a Google Form URL with optional prefill fields.
 * Returns null when the base URL is missing or invalid.
 */
export function buildFeedbackFormUrl({ type } = {}) {
  const baseUrl = feedbackFormConfig.url;
  if (!isValidHttpUrl(baseUrl)) return null;

  const entries = {};
  const typeKey = normalizeEntryId(feedbackFormConfig.typeEntryId);

  if (typeKey && type) entries[typeKey] = type;

  return appendGoogleFormPrefill(baseUrl, entries);
}

/**
 * Open the configured Google Form in an in-app browser.
 * Uses a short in-flight guard to prevent duplicate windows.
 */
export async function openFeedbackForm({ type, analyticsEvent } = {}) {
  if (openInFlight) return false;
  if (!isFeedbackFormConfigured()) return false;

  const url = buildFeedbackFormUrl({ type });
  if (!url) return false;

  openInFlight = true;
  try {
    if (analyticsEvent) {
      monitoringBreadcrumb('feedback', analyticsEvent, { type });
    }

    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      throw new Error('URL not supported on this device');
    }

    await WebBrowser.openBrowserAsync(url, {
      presentationStyle:
        WebBrowser.WebBrowserPresentationStyle?.FULL_SCREEN ?? 'fullScreen',
      showInRecents: true,
    });
    return true;
  } catch (err) {
    if (__DEV__) {
      logger.debug('[feedback] open failed', { message: err?.message });
    }
    Alert.alert(
      'Feedback',
      "We couldn't open the feedback form. Please try again later."
    );
    return false;
  } finally {
    openInFlight = false;
  }
}

/**
 * Show confirmation dialog, then open the form on Continue.
 */
export function confirmAndOpenFeedbackForm({ type, analyticsEvent } = {}) {
  if (!isFeedbackFormConfigured()) return;

  Alert.alert(
    'Help improve SSBFY',
    'Thanks for helping improve SSBFY. Your feedback helps us prioritize fixes and new features.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Continue',
        onPress: () => {
          void openFeedbackForm({ type, analyticsEvent });
        },
      },
    ]
  );
}
