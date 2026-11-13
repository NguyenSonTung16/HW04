import { test, expect, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { LoginPage } from '../pages/LoginPage';
import { API_URL } from '../support/env';
import { getUser, isLocked, lockRemainingSeconds, resetUser, setUserState } from '../support/db';

const USER = 'test@eshop.com';

type Expected = {
  outcome?: 'success' | 'rejected';
  status?: number;
  attemptsAfter?: number;
  lockedAfter?: boolean;
  lockSecondsAfter?: number;
  requests?: number;
  formValid?: boolean;
  value?: string;
  apiPath?: string;
};
type Case = {
  id: string; title: string; type: string; kind: 'login' | 'timed' | 'html5' | 'attribute' | 'header' | 'nav';
  setup?: { attempts?: number; lockedForSeconds?: number };
  input?: { email: string; password: string };
  atSeconds?: number; field?: 'email' | 'password'; attribute?: string;
  links?: { text: string; path: string }[];
  expected?: Expected;
};

const cases: Case[] = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'fr02-login.json'), 'utf8'));

async function expectOutcome(page: Page, login: LoginPage, outcome: 'success' | 'rejected') {
  if (outcome === 'success') {
    await expect(page).toHaveURL('/');
    expect(await login.token()).toBeTruthy();
  } else {
    await expect(login.error).toBeVisible();
    await expect(login.error).toContainText('Đăng nhập thất bại');
    await expect(page).toHaveURL(/\/login$/);
    expect(await login.token()).toBeNull();
  }
}

test.beforeEach(() => resetUser(USER));
test.afterAll(() => resetUser(USER));

for (const c of cases) {
  test(`FR-02 ${c.id} – ${c.title}`, async ({ page, request }) => {
    const login = new LoginPage(page);
    const exp = c.expected ?? {};

    if (c.kind === 'login') {
      setUserState(USER, c.setup ?? {});
      await login.goto();
      const respPromise = page.waitForResponse((r) => r.url().endsWith('/api/login'));
      await login.login(c.input!);
      const resp = await respPromise;
      if (exp.status) expect(resp.status()).toBe(exp.status);
      await expectOutcome(page, login, exp.outcome!);
      if (exp.attemptsAfter !== undefined) {
        await expect.poll(() => getUser(USER).login_attempts).toBe(exp.attemptsAfter);
      }
      if (exp.lockedAfter !== undefined) {
        expect(isLocked(getUser(USER))).toBe(exp.lockedAfter);
      }
      if (exp.lockSecondsAfter !== undefined) {
        const remaining = lockRemainingSeconds(getUser(USER));
        expect(remaining).toBeGreaterThan(exp.lockSecondsAfter - 5);
        expect(remaining).toBeLessThanOrEqual(exp.lockSecondsAfter);
      }
    }

    if (c.kind === 'timed') {
      test.setTimeout(120_000);
      // Tạo khóa thật bằng các request đăng nhập sai (không ghi thẳng vào DB).
      let lockedAt = 0;
      for (let i = 0; i < 3 && !lockedAt; i++) {
        await request.post(`${API_URL}/api/login`, { data: { email: USER, password: 'WrongPass9!' } });
        if (isLocked(getUser(USER))) lockedAt = Date.now();
      }
      expect(lockedAt, 'tài khoản phải bị khóa sau các lần sai').toBeGreaterThan(0);
      await login.goto();
      await login.fill(c.input!);
      const wait = c.atSeconds! * 1000 - (Date.now() - lockedAt);
      if (wait > 0) await page.waitForTimeout(wait);
      await login.submit.click();
      await expectOutcome(page, login, exp.outcome!);
    }

    if (c.kind === 'html5') {
      await login.goto();
      let loginRequests = 0;
      page.on('request', (r) => { if (r.url().endsWith('/api/login')) loginRequests++; });
      await login.fill(c.input!);
      await login.submit.click();
      await page.waitForTimeout(500);
      expect(loginRequests).toBe(exp.requests);
      expect(await login.form.evaluate((f) => (f as HTMLFormElement).checkValidity())).toBe(exp.formValid);
    }

    if (c.kind === 'attribute') {
      await login.goto();
      const field = c.field === 'email' ? login.email : login.password;
      await expect(field).toHaveAttribute(c.attribute!, exp.value!);
    }

    if (c.kind === 'header') {
      await login.goto();
      const reqPromise = page.waitForRequest((r) => r.url().includes(exp.apiPath!));
      await login.login(c.input!);
      const apiReq = await reqPromise;
      const token = await login.token();
      expect(token).toBeTruthy();
      expect(apiReq.headers()['authorization']).toBe(`Bearer ${token}`);
    }

    if (c.kind === 'nav') {
      for (const link of c.links!) {
        await login.goto();
        await page.getByRole('link', { name: link.text }).click();
        await expect(page).toHaveURL(link.path);
      }
    }
  });
}
