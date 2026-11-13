import { Page, Locator, expect } from '@playwright/test';

export class LoginPage {
  readonly form: Locator;
  readonly email: Locator;
  readonly password: Locator;
  readonly submit: Locator;
  readonly error: Locator;

  constructor(readonly page: Page) {
    // Form đăng nhập không có id/name/label liên kết -> định vị theo vị trí input trong form.
    this.form = page.locator('form');
    this.email = this.form.locator('input').nth(0);
    this.password = this.form.locator('input').nth(1);
    this.submit = this.form.getByRole('button', { name: 'Sign In' });
    this.error = page.locator('.bg-red-100');
  }

  async goto() {
    await this.page.goto('/login');
    await expect(this.submit).toBeVisible();
  }

  async fill(input: { email: string; password: string }) {
    await this.email.fill(input.email);
    await this.password.fill(input.password);
  }

  async login(input: { email: string; password: string }) {
    await this.fill(input);
    await this.submit.click();
  }

  async token() {
    return this.page.evaluate(() => localStorage.getItem('token'));
  }
}
