import { Page, Locator, expect } from '@playwright/test';
import { amount } from '../support/money';

export class ProductPage {
  readonly addButton: Locator;

  constructor(readonly page: Page) {
    this.addButton = page.getByRole('button', { name: 'Thêm vào giỏ hàng' });
  }

  async goto(productId: number) {
    await this.page.goto(`/product/${productId}`);
    await expect(this.addButton).toBeVisible();
  }

  /**
   * Lần bấm đầu của SUT không làm gì (clickCount), lần hai mới thêm vào giỏ, nên bấm hai lần.
   * Không dùng nút "Đã thêm" làm bằng chứng (chỉ hiện 2 giây, Firefox thỉnh thoảng không hiện);
   * trạng thái giỏ được kiểm tra riêng ở CartPage trước khi quyết định có bấm lại hay không.
   */
  async addToCart() {
    await this.addButton.click();
    await this.addButton.click();
  }
}

export type CartItem = { name: string; price: number; quantity: number; lineTotal: number };

export class CartPage {
  readonly navLink: Locator;
  readonly heading: Locator;
  readonly checkoutButton: Locator;
  readonly subtotal: Locator;

  constructor(readonly page: Page) {
    this.navLink = page.getByRole('link', { name: 'Giỏ hàng' });
    this.heading = page.getByRole('heading', { level: 2 });
    this.checkoutButton = page.getByRole('button', { name: 'Tiến hành thanh toán' });
    this.subtotal = page.getByText(/^Tổng tạm tính:/);
  }

  /** Giỏ hàng nằm trong bộ nhớ nên phải đi bằng link trong trang, không được reload. Giỏ trống vẫn mở được. */
  async open() {
    await this.navLink.click();
    await expect(this.page).toHaveURL(/\/cart$/);
    await expect(this.heading).toBeVisible();
  }

  async items(): Promise<CartItem[]> {
    const rows = this.page.locator('tbody tr');
    const out: CartItem[] = [];
    for (let i = 0; i < (await rows.count()); i++) {
      const cells = await rows.nth(i).locator('td').allInnerTexts();
      out.push({ name: cells[0].trim(), price: amount(cells[1]), quantity: Number(cells[2]), lineTotal: amount(cells[3]) });
    }
    return out;
  }

  /** Dừng test (assertion cứng) nếu giỏ không đúng một dòng với đúng sản phẩm, giá, số lượng và tổng tiền. */
  async expectOnly(exp: { name: string; price: number; quantity: number }) {
    expect(await this.items(), 'giỏ hàng phải có đúng 1 dòng, đúng sản phẩm, giá và số lượng').toEqual([
      { name: exp.name, price: exp.price, quantity: exp.quantity, lineTotal: exp.price * exp.quantity },
    ]);
    expect(amount(await this.subtotal.innerText()), 'tổng tạm tính của giỏ hàng').toBe(exp.price * exp.quantity);
  }
}
