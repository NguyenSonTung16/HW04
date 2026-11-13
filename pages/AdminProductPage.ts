import { expect, Locator, Page } from '@playwright/test';
import { ADMIN_URL, API_URL } from '../support/env';

/** Tab "Quản lý Sản phẩm" của trang Admin (:5174). Locator dựa trên mã nguồn App.jsx, cần xác nhận khi chạy. */
export class AdminProductPage {
  readonly rows: Locator;
  readonly name: Locator;
  readonly price: Locator;
  readonly category: Locator;
  readonly save: Locator;

  constructor(private readonly page: Page) {
    this.rows = page.locator('tbody tr');
    this.name = page.getByPlaceholder('Tên sản phẩm');
    this.price = page.getByPlaceholder('Giá tiền');
    this.category = page.locator('form select');
    this.save = page.getByRole('button', { name: 'Lưu sản phẩm' });
  }

  /** Danh sách id theo đúng thứ tự mà giao diện hiển thị (cùng endpoint GET /api/products). */
  async listIds(): Promise<number[]> {
    const res = await this.page.request.get(`${API_URL}/api/products`);
    expect(res.ok()).toBeTruthy();
    return ((await res.json()) as { id: number }[]).map((p) => p.id);
  }

  /** Mở tab Sản phẩm (token admin phải được nạp trước bằng addInitScript) và chờ danh sách khớp API. */
  async open(): Promise<number[]> {
    await this.page.goto(ADMIN_URL);
    await this.page.locator('li').filter({ hasText: /^\s*Sản phẩm\s*$/ }).click();
    await expect(this.page.getByRole('heading', { name: 'Quản lý Sản phẩm' })).toBeVisible();
    const ids = await this.listIds();
    await expect(this.rows).toHaveCount(ids.length);
    return ids;
  }

  /** Dòng của sản phẩm theo id (ánh xạ theo vị trí trong danh sách API). */
  async rowOf(id: number): Promise<Locator> {
    const idx = (await this.listIds()).indexOf(id);
    expect(idx, `sản phẩm id=${id} phải có trong danh sách API`).toBeGreaterThanOrEqual(0);
    return this.rows.nth(idx);
  }

  nameCell(row: Locator) { return row.locator('td').nth(1); }
  priceCell(row: Locator) { return row.locator('td').nth(2); }

  async startEdit(id: number) {
    await (await this.rowOf(id)).getByRole('button', { name: 'Sửa' }).click();
    await expect(this.page.getByRole('heading', { name: 'Sửa sản phẩm' })).toBeVisible();
  }

  async remove(id: number) {
    await (await this.rowOf(id)).getByRole('button', { name: 'Xóa' }).click();
  }

  /** Điền các trường được cung cấp (undefined = giữ nguyên). */
  async fill(v: { name?: string; price?: string }) {
    if (v.name !== undefined) await this.name.fill(v.name);
    if (v.price !== undefined) await this.price.fill(v.price);
  }
}
