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

  // 2. Configurer le Manifest pour Android TV + Mobile (Compatibilité Universelle)
  config = withAndroidManifest(config, async (config) => {
    const manifest = config.modResults.manifest;

    // Déclarer les fonctionnalités matérielles non requises (OBLIGATOIRE pour Android TV / Google TV)
    // Sans touchscreen=false, Android TV masque complètement l'application du lanceur d'accueil !
    if (!manifest['uses-feature']) {
      manifest['uses-feature'] = [];
    }

    const optionalFeatures = [
      'android.software.leanback',
      'android.hardware.touchscreen',
      'android.hardware.faketouch',
      'android.hardware.telephony',
      'android.hardware.camera',
      'android.hardware.camera.autofocus',
      'android.hardware.bluetooth',
      'android.hardware.wifi',
      'android.hardware.microphone',
      'android.hardware.location',
      'android.hardware.location.gps'
    ];

    for (const feat of optionalFeatures) {
      const existing = manifest['uses-feature'].find(
        (f) => f.$ && f.$['android:name'] === feat
      );
      if (existing) {
        existing.$['android:required'] = 'false';
      } else {
        manifest['uses-feature'].push({
          $: {
            'android:name': feat,
            'android:required': 'false'
          }
        });
      }
    }

    const application = manifest.application?.[0];
    if (application) {
      application.$['android:banner'] = '@drawable/tv_banner';
      application.$['android:usesCleartextTraffic'] = 'true';
      application.$['android:hardwareAccelerated'] = 'true';
      application.$['android:largeHeap'] = 'true';

      if (Array.isArray(application.activity)) {
        const mainActivity = application.activity.find(
          (a) => a.$ && (a.$['android:name'] === '.MainActivity' || a.$['android:name'] === 'com.ashamloud.bokktv.MainActivity')
        );
        if (mainActivity) {
          mainActivity.$['android:banner'] = '@drawable/tv_banner';
          mainActivity.$['android:screenOrientation'] = 'unspecified';

          if (!mainActivity['intent-filter']) {
            mainActivity['intent-filter'] = [];
          }

          // Nettoyer les filtres : s'assurer qu'un intent-filter LEANBACK_LAUNCHER dédié existe
          const hasLeanback = mainActivity['intent-filter'].some((filter) =>
            filter.category?.some((c) => c.$ && c.$['android:name'] === 'android.intent.category.LEANBACK_LAUNCHER')
          );

          if (!hasLeanback) {
            mainActivity['intent-filter'].push({
              action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
              category: [{ $: { 'android:name': 'android.intent.category.LEANBACK_LAUNCHER' } }]
            });
          }
        }
      }
    }

    return config;
  });

  return config;
};

module.exports = withAndroidTvBanner;
