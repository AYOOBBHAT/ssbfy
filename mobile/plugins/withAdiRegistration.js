const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

/**
 * Ensures Google "App ownership" token is packaged into the APK as:
 *   android/app/src/main/assets/adi-registration.properties
 *
 * Source-of-truth file (committed in repo):
 *   mobile/assets/adi-registration.properties
 */
module.exports = function withAdiRegistration(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const src = path.join(projectRoot, 'assets', 'adi-registration.properties');
      const destDir = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'assets'
      );
      const dest = path.join(destDir, 'adi-registration.properties');

      if (!fs.existsSync(src)) {
        throw new Error(
          `Missing required token file at ${src}. Create it and paste the token value.`
        );
      }

      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(src, dest);
      return cfg;
    },
  ]);
};

