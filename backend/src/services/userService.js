import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { userRepository } from '../repositories/userRepository.js';
import { isPremiumUser } from '../utils/freeTierAccess.js';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

export const userService = {
  /**
   * Returns the user document with `isPremium` overwritten with the computed
   * truth value from `isPremiumUser`. The raw stored flag may be stale on
   * legacy rows (e.g. an old timed plan that stayed `true` past its expiry);
   * the client should never need to recompute the truth — we hand it the
   * answer here so /me is the single contract for premium state.
   *
   * The shape is otherwise unchanged: `currentPlanType`, `currentPlanId`,
   * `subscriptionEnd`, `plan` continue to come straight from the User model.
   */
  async getProfile(userId) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
    }
    return {
      ...user,
      isPremium: isPremiumUser(user),
    };
  },

  async changePassword(userId, { currentPassword, newPassword, confirmPassword }) {
    const user = await userRepository.findByIdWithPassword(userId);
    if (!user) {
      throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
    }

    if (newPassword !== confirmPassword) {
      throw new AppError('Passwords do not match', HTTP_STATUS.BAD_REQUEST);
    }

    const currentOk = await bcrypt.compare(currentPassword, user.password);
    if (!currentOk) {
      throw new AppError('Incorrect current password', HTTP_STATUS.BAD_REQUEST);
    }

    const sameAsCurrent = await bcrypt.compare(newPassword, user.password);
    if (sameAsCurrent) {
      throw new AppError(
        'New password must be different from current password',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const hashed = await bcrypt.hash(newPassword, env.bcryptSaltRounds);
    await userRepository.updatePassword(userId, hashed);
  },
};
