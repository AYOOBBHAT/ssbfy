import { Resend } from 'resend';
import { env } from './env.js';

let client = null;

/**
 * Lazy Resend client (server-only). Never import this in client bundles.
 */
export function getResendClient() {
  if (!env.resendApiKey) {
    return null;
  }
  if (!client) {
    client = new Resend(env.resendApiKey);
  }
  return client;
}

export function isResendConfigured() {
  return Boolean(env.resendApiKey && env.resendFromEmail);
}
