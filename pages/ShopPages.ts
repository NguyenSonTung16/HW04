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

  /** Lần bấm đầu tiên của SUT không làm gì (clickCount), phải bấm lần hai mới thêm vào giỏ. */
  async addToCart() {
    await this.addButton.click();
    await this.addButton.click();
    await expect(this.added).toBeVisible();
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
