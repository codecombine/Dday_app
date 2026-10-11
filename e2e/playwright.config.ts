// 한지붕 웹 E2E. 데모 모드 빌드(설정 없이 예시 가족 데이터로 동작)를 띄워 화면 흐름을 끝까지 눌러 본다.
// 실행: cd e2e && npm install && npm run build && npm test
// 브라우저는 따로 받지 않고 설치된 Chrome을 쓴다 (channel: 'chrome').
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8099',
    channel: 'chrome',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'], channel: 'chrome' } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 860 }, channel: 'chrome' } },
  ],
  webServer: {
    command: 'node serve.mjs',
    url: 'http://localhost:8099',
    reuseExistingServer: true,
  },
});
