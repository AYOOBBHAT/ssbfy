import { env } from '../config/env.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { videoLectureService } from '../services/videoLectureService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logger } from '../utils/logger.js';
import { verifyCloudflareStreamWebhookSignature } from '../utils/cloudflareStreamWebhook.js';

function readUid(parsed) {
  const uid = parsed?.uid;
  return uid != null && String(uid).trim() ? String(uid).trim() : null;
}

export const cloudflareStreamWebhookController = {
  /**
   * Public Cloudflare Stream webhook — HMAC `Webhook-Signature` over raw body.
   * Never trusts unsigned payloads. Does not expose the signing secret.
   */
  handleStream: asyncHandler(async (req, res) => {
    const secret = env.cloudflareStreamWebhookSecret;
    if (!secret) {
      logger.error('[VIDEO LECTURE WEBHOOK] signing secret not configured');
      return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        success: false,
        message: 'Webhook is not configured',
      });
    }

    const signatureHeader = String(req.get('Webhook-Signature') || '');
    const raw = req.rawBody;
    const verified = verifyCloudflareStreamWebhookSignature({
      secret,
      rawBody: raw,
      signatureHeader,
    });
    if (!verified.ok) {
      logger.warn('[VIDEO LECTURE WEBHOOK] signature verification failed', {
        reason: verified.reason,
      });
      const status =
        verified.reason === 'timestamp_expired'
          ? HTTP_STATUS.BAD_REQUEST
          : HTTP_STATUS.UNAUTHORIZED;
      return res.status(status).json({
        success: false,
        message: 'Invalid webhook signature',
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(raw.toString('utf8'));
    } catch {
      logger.warn('[VIDEO LECTURE WEBHOOK] invalid JSON body');
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Invalid webhook payload',
      });
    }

    const uid = readUid(parsed);
    if (!uid) {
      logger.warn('[VIDEO LECTURE WEBHOOK] payload missing uid');
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Invalid webhook payload',
      });
    }

    const result = await videoLectureService.applyCloudflareStreamNotification(parsed);
    return res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        handled: result.handled === true,
        reason: result.reason || null,
        lectureId: result.lectureId || null,
        cloudflareVideoId: result.cloudflareVideoId || uid,
        status: result.status || null,
      },
    });
  }),
};
