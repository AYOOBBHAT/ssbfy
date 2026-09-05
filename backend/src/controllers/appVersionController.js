import { appVersionService } from '../services/appVersionService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const appVersionController = {
  /** GET /api/app/version — public Android version policy. */
  getVersion: asyncHandler(async (req, res) => {
    return sendSuccess(
      res,
      { android: appVersionService.getAndroidPolicy() },
      'App version'
    );
  }),
};
