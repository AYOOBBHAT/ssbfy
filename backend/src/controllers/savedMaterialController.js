import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import { userRepository } from '../repositories/userRepository.js';
import { isPremiumUser } from '../utils/freeTierAccess.js';
import { savedMaterialService } from '../services/savedMaterialService.js';

const PREMIUM_SAVE_MESSAGE = 'Upgrade to Premium to save materials for later.';

async function assertPremium(userId) {
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
  }
  if (!isPremiumUser(user)) {
    throw new AppError(PREMIUM_SAVE_MESSAGE, HTTP_STATUS.FORBIDDEN);
  }
}

export const savedMaterialController = {
  toggle: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    await assertPremium(userId);
    const result = await savedMaterialService.toggle(userId, req.body);
    return sendSuccess(res, result, result.saved ? 'Material saved' : 'Material removed');
  }),

  listMine: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    await assertPremium(userId);
    const payload = await savedMaterialService.listMine(userId);
    return sendSuccess(res, payload, 'Saved materials');
  }),
};
