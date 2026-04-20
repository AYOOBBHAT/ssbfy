import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { ROLES } from '../constants/roles.js';
import { AppError } from '../utils/AppError.js';
import { signToken } from '../utils/jwt.js';
import { userRepository } from '../repositories/userRepository.js';

function toPublicUser(doc) {
  if (!doc) return null;
  const u = doc.toObject ? doc.toObject() : { ...doc };
  delete u.password;
  return u;
}

export const authService = {
  async signup({ name, email, password }) {
    const existing = await userRepository.findByEmail(email);
    if (existing) {
      throw new AppError('Email already registered', HTTP_STATUS.CONFLICT);
    }

    const hashed = await bcrypt.hash(password, env.bcryptSaltRounds);
    // SECURITY: role is hardcoded to USER. Admins must be promoted manually
    // (e.g. via DB or a future admin-only `PUT /api/users/:id/role`). Never
    // accept role from request input.
    const user = await userRepository.create({
      name,
      email: email.toLowerCase(),
      password: hashed,
      role: ROLES.USER,
    });

    const publicUser = toPublicUser(user);
    const token = signToken({
      sub: publicUser._id.toString(),
      role: publicUser.role,
    });

    return { user: publicUser, token };
  },

  async login({ email, password }) {
    const user = await userRepository.findByEmail(email, { includePassword: true });
    if (!user) {
      throw new AppError('Invalid email or password', HTTP_STATUS.UNAUTHORIZED);
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      throw new AppError('Invalid email or password', HTTP_STATUS.UNAUTHORIZED);
    }

    const publicUser = toPublicUser(user);
    const token = signToken({
      sub: publicUser._id.toString(),
      role: publicUser.role,
    });

    return { user: publicUser, token };
  },
};
