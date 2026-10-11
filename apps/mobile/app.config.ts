/// <reference types="node" />
// 앱 설정. 비밀이 아닌 값은 EXPO_PUBLIC_* 환경 변수, google-services.json은 EAS 파일 변수(GOOGLE_SERVICES_JSON)로 넣는다.
import { existsSync } from 'node:fs';

import type { ConfigContext, ExpoConfig } from 'expo/config';

const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ?? (existsSync('./google-services.json') ? './google-services.json' : undefined);
const kakaoNativeAppKey = process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY || 'KAKAO_NATIVE_APP_KEY_NOT_SET';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: '한지붕',
  slug: 'hanjibung',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'hanjibung',
  userInterfaceStyle: 'automatic',
  android: {
    package: 'com.codecombine.hanjibung',
    versionCode: 1,
    googleServicesFile,
    adaptiveIcon: {
      backgroundColor: '#0B3040',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    permissions: [
      'android.permission.READ_CALENDAR',
      'android.permission.WRITE_CALENDAR',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.ACCESS_MEDIA_LOCATION',
      'android.permission.POST_NOTIFICATIONS',
    ],
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'https', host: (process.env.EXPO_PUBLIC_WEB_ORIGIN ?? 'https://hanjibung.pages.dev').replace('https://', ''), pathPrefix: '/invite' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  web: {
    output: 'single',
    favicon: './assets/images/favicon.png',
    name: '한지붕',
    shortName: '한지붕',
    themeColor: '#0B3040',
    backgroundColor: '#F4F5F7',
    lang: 'ko',
  },
  plugins: [
    'expo-router',
    ['expo-splash-screen', { backgroundColor: '#0B3040', image: './assets/images/splash-icon.png', imageWidth: 120 }],
    ['expo-notifications', { color: '#0B3040', defaultChannel: 'default' }],
    ['expo-calendar', { calendarPermission: '폰 캘린더의 일정을 한지붕으로 가져오려면 캘린더 접근 권한이 필요해요.' }],
    [
      'expo-media-library',
      {
        photosPermission: '가족과 함께 볼 사진을 고르고 자동으로 올리려면 사진 접근 권한이 필요해요.',
        savePhotosPermission: '사진을 폰에 저장하려면 권한이 필요해요.',
        isAccessMediaLocationEnabled: true,
      },
    ],
    ['expo-image-picker', { photosPermission: '가족과 함께 볼 사진을 고르려면 사진 접근 권한이 필요해요.' }],
    'expo-sharing',
    'expo-background-task',
    ['expo-build-properties', { android: { minSdkVersion: 26 } }],
    ['@react-native-kakao/core', { nativeAppKey: kakaoNativeAppKey, android: { authCodeHandlerActivity: true } }],
    [
      'react-native-android-widget',
      {
        widgets: [
          {
            name: 'DdaySmall',
            label: '한지붕 D-Day',
            description: '기념일 하나의 D-Day를 보여줘요',
            minWidth: '110dp',
            minHeight: '110dp',
            targetCellWidth: 2,
            targetCellHeight: 2,
            updatePeriodMillis: 1800000,
            widgetFeatures: 'reconfigurable',
          },
          {
            name: 'DdayList',
            label: '한지붕 다가오는 날',
            description: '고정하거나 가까운 기념일 4개',
            minWidth: '250dp',
            minHeight: '110dp',
            targetCellWidth: 4,
            targetCellHeight: 2,
            updatePeriodMillis: 1800000,
            resizeMode: 'horizontal|vertical',
          },
        ],
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
});
