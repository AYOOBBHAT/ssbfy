import { getResendClient, isResendConfigured } from '../config/resend.js';
import { env } from '../config/env.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';

/**
 * Send password reset OTP via Resend. Throws AppError on misconfiguration
 * or provider failure (caller logs and maps to a safe client message).
 */
export async function sendPasswordResetOtp({ email, otp, userName }) {
  if (!isResendConfigured()) {
    throw new AppError('Email delivery is not configured', HTTP_STATUS.SERVICE_UNAVAILABLE);
  }
  const resend = getResendClient();
  if (!resend) {
    throw new AppError('Email client unavailable', HTTP_STATUS.SERVICE_UNAVAILABLE);
  }

  const name =
    typeof userName === 'string' && userName.trim() ? userName.trim() : 'there';
  const text = [
    `Hello ${name},`,
    '',
    'Your password reset OTP is:',
    '',
    otp,
    '',
    'This OTP expires in 10 minutes.',
    '',
    'If you did not request this, please ignore this email.',
    '',
    `— ${env.appName} Team`,
  ].join('\n');

  const html = `
<p>Hello ${escapeHtml(name)},</p>
<p>Your password reset OTP is:</p>
<p style="font-size:22px;font-weight:700;letter-spacing:4px;">${escapeHtml(otp)}</p>
<p>This OTP expires in 10 minutes.</p>
<p>If you did not request this, please ignore this email.</p>
<p>— ${escapeHtml(env.appName)} Team</p>
`.trim();

  const subject = `Your ${env.appName} Password Reset Code`;

  const { data, error } = await resend.emails.send({
    from: env.resendFromEmail,
    to: email,
    subject,
    text,
    html,
  });

  if (error) {
    const msg =
      typeof error === 'object' && error !== null && 'message' in error
        ? String(error.message)
        : 'Failed to send email';
    throw new AppError(msg, HTTP_STATUS.BAD_GATEWAY);
  }
  return data;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
