import { env } from '../config/env.js';

export const appVersionService = {
  getAndroidPolicy() {
    return { ...env.androidVersion };
  },
};
