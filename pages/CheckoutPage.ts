import { Page, Locator, expect } from '@playwright/test';

export const digits = (s: string) => Number(s.replace(/\D/g, ''));

export class CheckoutPage {
  readonly code: Locator;
  readonly applyButton: Locator;
  readonly error: Locator;
  readonly success: Locator;
  readonly saving: Locator;
  readonly afterDiscount: Locator;
  readonly grandTotal: Locator;
  readonly editableTotal: Locator;

  constructor(readonly page: Page) {
    const section = page.locator('div.bg-gray-50');
    this.code = page.getByPlaceholder('Nhập mã giảm giá...');
    this.applyButton = page.getByRole('button', { name: 'Áp dụng' });
    this.error = section.locator('p.text-red-600');
    this.success = page.getByText(/Áp dụng thành công/);
    this.saving = page.getByText(/^Tiết kiệm:/);
    this.afterDiscount = page.getByText(/^Thành tiền:/);
    this.grandTotal = page.getByText(/^Tổng thanh toán:/);
    this.editableTotal = page.getByRole('spinbutton');
  }

  async expectOpen() {
    await expect(this.page).toHaveURL(/\/checkout$/);
    await expect(this.code).toBeVisible();
  }

  async apply(code: string) {
    await this.code.fill(code);
    const resp = this.page.waitForResponse((r) => r.url().endsWith('/api/apply-coupon'));
    await this.applyButton.click();
    return resp;
  }
}
