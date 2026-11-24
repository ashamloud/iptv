const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withAndroidTvBanner = (config, props = {}) => {
  const bannerRelativePath = props.banner || './assets/images/tv-banner.png';

  // 1. Copier l'image dans res/drawable/tv_banner.png
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const resDir = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'drawable');
      if (!fs.existsSync(resDir)) {
        fs.mkdirSync(resDir, { recursive: true });
      }
      const srcPath = path.resolve(config.modRequest.projectRoot, bannerRelativePath);
      if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, path.join(resDir, 'tv_banner.png'));
      }
      return config;
    },
  ]);

  // 2. Définir android:banner et usesCleartextTraffic dans AndroidManifest.xml
  config = withAndroidManifest(config, async (config) => {
    const manifest = config.modResults.manifest;
    const application = manifest.application?.[0];
    if (application) {
      application.$['android:banner'] = '@drawable/tv_banner';
      application.$['android:usesCleartextTraffic'] = 'true';
      if (Array.isArray(application.activity)) {
        const mainActivity = application.activity.find(
          (a) => a.$ && (a.$['android:name'] === '.MainActivity' || a.$['android:name'] === 'com.ashamloud.bokktv.MainActivity')
        );
        if (mainActivity && mainActivity.$) {
          mainActivity.$['android:banner'] = '@drawable/tv_banner';
        }
      }
    }
    return config;
  });

  return config;
};

module.exports = withAndroidTvBanner;
