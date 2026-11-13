import { defineConfig, devices } from '@playwright/test';

const STUDENT_ID = '23120399';
const RUN_AT = process.env.RUN_AT ?? new Date().toISOString();
const FEATURE = process.env.FEATURE ?? 'all';
const BROWSER = process.env.BROWSER_NAME ?? 'all';
const REPORT_TITLE = `EShop HW04 | ${FEATURE} | ${BROWSER} | Run by: ${STUDENT_ID} | ${RUN_AT}`;

const projects = {
  chromium: { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  firefox: { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  webkit: { name: 'webkit', use: { ...devices['Desktop Safari'] } },
};

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1, // DB dùng chung (khóa tài khoản, lượt coupon) nên chạy tuần tự
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 7_000 },
  globalSetup: './support/global-setup.ts',
  reporter: [
    ['list'],
    ['html', { outputFolder: process.env.REPORT_DIR ?? 'reports/all', open: 'never', title: REPORT_TITLE }],
  ],
  metadata: { 'Run by': STUDENT_ID, 'Run at (ISO)': RUN_AT, Feature: FEATURE, Browser: BROWSER },
  use: {
    baseURL: process.env.WEB_URL ?? 'http://localhost:5173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: BROWSER === 'all' ? Object.values(projects) : [projects[BROWSER as keyof typeof projects]],
});
