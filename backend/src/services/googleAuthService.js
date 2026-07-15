import { HTTP_STATUS } from '../constants/httpStatus.js';
import { ROLES } from '../constants/roles.js';
import { userRepository } from '../repositories/userRepository.js';
import { AppError } from '../utils/AppError.js';
import { signAuthToken } from '../utils/jwt.js';
import { logSecurityEvent, logger } from '../utils/logger.js';
import { verifyGoogleIdToken } from './googleTokenVerifier.js';

function toPublicUser(doc) {
  if (!doc) return null;
  const u = doc.toObject ? doc.toObject() : { ...doc };
  delete u.password;
  return u;
}

function issueAuthResponse(user) {
  const publicUser = toPublicUser(user);
  const token = signAuthToken({
    sub: publicUser._id.toString(),
    role: publicUser.role,
  });

  if (publicUser.role === ROLES.ADMIN) {
    logSecurityEvent('admin_token_issued', {
      userIdSuffix: String(publicUser._id).slice(-8),
      sessionTier: 'privileged',
      provider: 'google',
    });
  }

  return { user: publicUser, token };
}

function isDuplicateKeyError(err) {
  return err?.code === 11000;
}

function duplicateKeyField(err) {
  const key = err?.keyPattern || err?.keyValue;
  if (!key || typeof key !== 'object') return null;
  const fields = Object.keys(key);
  if (fields.includes('authProviders.google.sub')) return 'googleSub';
  if (fields.includes('email')) return 'email';
  return fields[0] || null;
}

/**
 * After a duplicate-key race, re-resolve the account without creating a second user.
 */
async function resolveAfterDuplicateRace({ sub, email }) {
  const bySub = await userRepository.findByGoogleSub(sub);
  if (bySub) return bySub;

  const byEmail = await userRepository.findByEmail(email);
  if (byEmail) {
    if (byEmail.authProviders?.google?.sub && byEmail.authProviders.google.sub !== sub) {
      throw new AppError(
        'This email is linked to a different Google account. Sign in with email and password, or contact support.',
        HTTP_STATUS.CONFLICT,
        null,
        { code: 'GOOGLE_ACCOUNT_CONFLICT' }
      );
    }
    return linkGoogleSafely(byEmail._id, { sub, email });
  }

  const emailCount = await userRepository.countByEmail(email);
  if (emailCount > 1) {
    logger.warn(
      {
        event: 'google_account_conflict',
        reason: 'duplicate_email_rows',
        emailDomain: email.split('@')[1] || 'unknown',
      },
      'Google login blocked — multiple accounts share the same email'
    );
    throw new AppError(
      'We could not sign you in with Google because this email is associated with multiple accounts. Please contact support.',
      HTTP_STATUS.CONFLICT,
      null,
      { code: 'GOOGLE_ACCOUNT_CONFLICT' }
    );
  }

    throw new AppError(
      'Google sign-in could not be completed. Please try again.',
      HTTP_STATUS.CONFLICT,
      null,
      { code: 'GOOGLE_ACCOUNT_CONFLICT' }
    );
}

async function linkGoogleSafely(userId, { sub, email }) {
  try {
    return await userRepository.linkGoogleProvider(userId, { sub, email });
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
    const winner = await userRepository.findByGoogleSub(sub);
    if (winner) return winner;
    throw err;
  }
}

async function resolveExistingGoogleUser(user, { sub, email }) {
  const linkedSub = user.authProviders?.google?.sub;
  if (linkedSub && linkedSub !== sub) {
    logger.warn(
      {
        event: 'google_account_conflict',
        reason: 'sub_mismatch_on_email_match',
        userIdSuffix: String(user._id).slice(-8),
      },
      'Google sub mismatch for email-linked account'
    );
    throw new AppError(
      'This email is linked to a different Google account. Sign in with email and password, or contact support.',
      HTTP_STATUS.CONFLICT,
      null,
      { code: 'GOOGLE_ACCOUNT_CONFLICT' }
    );
  }

  if (!linkedSub) {
    return linkGoogleSafely(user._id, { sub, email });
  }

  if (user.authProviders?.google?.email !== email) {
    return userRepository.updateGoogleProviderEmail(user._id, { sub, email });
  }

  return user;
}

export const googleAuthService = {
  /**
   * Verify Google ID token and resolve/create/link user, then issue SSBFY JWT.
   * @param {{ idToken: string }} input
   */
  async loginWithGoogle({ idToken }) {
    const profile = await verifyGoogleIdToken(idToken);
    const { sub, email, name, picture } = profile;

    // Case C / D — stable identity is Google sub.
    let user = await userRepository.findByGoogleSub(sub);
    if (user) {
      if (user.authProviders?.google?.email !== email) {
        user = await userRepository.updateGoogleProviderEmail(user._id, { sub, email });
      }
      return issueAuthResponse(user);
    }

    const emailCount = await userRepository.countByEmail(email);
    if (emailCount > 1) {
      logger.warn(
        {
          event: 'google_account_conflict',
          reason: 'duplicate_email_rows',
          emailDomain: email.split('@')[1] || 'unknown',
        },
        'Google login blocked — multiple accounts share the same email'
      );
      throw new AppError(
        'We could not sign you in with Google because this email is associated with multiple accounts. Please contact support.',
        HTTP_STATUS.CONFLICT,
        null,
        { code: 'GOOGLE_ACCOUNT_CONFLICT' }
      );
    }

    const emailUser = emailCount === 1 ? await userRepository.findByEmail(email) : null;

    if (emailUser) {
      // Case B — link Google to existing email/password account (verified email only).
      user = await resolveExistingGoogleUser(emailUser, { sub, email });
      logSecurityEvent('google_provider_linked', {
        userIdSuffix: String(user._id).slice(-8),
      });
      return issueAuthResponse(user);
    }

    // Case A — new Google-only user.
    try {
      user = await userRepository.createGoogleUser({
        name,
        email,
        sub,
        picture,
      });
      logSecurityEvent('google_signup', {
        userIdSuffix: String(user._id).slice(-8),
      });
      return issueAuthResponse(user);
    } catch (err) {
      if (!isDuplicateKeyError(err)) {
        throw err;
      }

      const field = duplicateKeyField(err);
      logger.info(
        {
          event: 'google_signup_duplicate_race',
          field: field || 'unknown',
        },
        'Concurrent Google signup — re-resolving account'
      );

      user = await resolveAfterDuplicateRace({ sub, email });
      return issueAuthResponse(user);
    }
  },
};
