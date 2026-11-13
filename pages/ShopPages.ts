import { Page, Locator, expect } from '@playwright/test';

export class ProductPage {
  readonly addButton: Locator;
  readonly added: Locator;

  constructor(readonly page: Page) {
    this.addButton = page.getByRole('button', { name: 'Thêm vào giỏ hàng' });
    this.added = page.getByRole('button', { name: 'Đã thêm' });
  }

  async goto(productId: number) {
    await this.page.goto(`/product/${productId}`);
    await expect(this.addButton).toBeVisible();
  }

  /**
   * Lần bấm đầu của SUT không làm gì (clickCount), phải bấm lần hai mới thêm vào giỏ.
   * Ở Firefox thỉnh thoảng hai cú bấm liền nhau không thêm được (nguyên nhân chưa rõ), nên bấm từng lần
   * một và thử lại đến khi nút chuyển thành "Đã thêm" thay vì bấm cố định hai lần rồi chờ.
   */
  async addToCart() {
    await expect(async () => {
      await this.addButton.click({ timeout: 2_000 });
      await expect(this.added).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000, intervals: [250] });
  }
}

export class CartPage {
  readonly navLink: Locator;
  readonly checkoutButton: Locator;
  readonly subtotal: Locator;

  constructor(readonly page: Page) {
    this.navLink = page.getByRole('link', { name: 'Giỏ hàng' });
    this.checkoutButton = page.getByRole('button', { name: 'Tiến hành thanh toán' });
    this.subtotal = page.getByText(/^Tổng tạm tính:/);
  }

  /** Giỏ hàng nằm trong bộ nhớ nên phải đi bằng link trong trang, không được reload. */
  async open() {
    await this.navLink.click();
    await expect(this.page).toHaveURL(/\/cart$/);
    await expect(this.checkoutButton).toBeVisible();
  }
}
