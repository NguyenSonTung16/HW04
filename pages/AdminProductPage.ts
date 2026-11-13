import { expect, Locator, Page } from '@playwright/test';
import { ADMIN_URL, API_URL } from '../support/env';
import { getProduct } from '../support/product-db';

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

  /** Chờ giao diện đồng bộ với API (số dòng bằng số sản phẩm API trả về) và trả về số dòng. */
  async syncedCount(): Promise<number> {
    const n = (await this.listIds()).length;
    await expect(this.rows).toHaveCount(n);
    return n;
  }

  /**
   * Gắn dấu nhận diện ổn định `data-hw04-id` lên dòng của từng sản phẩm. Gọi khi giao diện đang khớp DB
   * (ngay sau open() hoặc sau khi danh sách đã đồng bộ): dòng được tìm bằng cặp (tên, giá) lấy từ DB và
   * phải duy nhất. Dấu này không phụ thuộc thứ tự bảng và vẫn còn sau khi form Sửa đổi tên mọi dòng
   * (React giữ nguyên phần tử theo key); sau reload phải gắn lại.
   */
  async tag(...ids: number[]) {
    for (const id of ids) {
      const db = getProduct(id);
      expect(db, `sản phẩm id=${id} phải có trong DB để nhận diện dòng`).toBeDefined();
      const want = { name: String(db!.name), price: `${db!.price} ₫` };
      const idx = await this.rows.evaluateAll((trs, w) => {
        const hits: number[] = [];
        trs.forEach((tr, i) => {
          const td = tr.querySelectorAll('td');
          if (td[1]?.textContent?.trim() === w.name && td[2]?.textContent?.trim() === w.price) hits.push(i);
        });
        return hits;
      }, want);
      expect(idx, `dòng của id=${id} phải duy nhất theo (tên, giá)`).toHaveLength(1);
      await this.rows.nth(idx[0]).evaluate((el, v) => el.setAttribute('data-hw04-id', v), String(id));
    }
  }

  /** Dòng đã được gắn dấu theo id (xem tag()). */
  rowOf(id: number): Locator {
    return this.page.locator(`tbody tr[data-hw04-id="${id}"]`);
  }

  nameCell(row: Locator) { return row.locator('td').nth(1); }
  priceCell(row: Locator) { return row.locator('td').nth(2); }

  async startEdit(id: number) {
    await this.rowOf(id).getByRole('button', { name: 'Sửa' }).click();
    await expect(this.page.getByRole('heading', { name: 'Sửa sản phẩm' })).toBeVisible();
  }

  async remove(id: number) {
    await this.rowOf(id).getByRole('button', { name: 'Xóa' }).click();
  }

  /** Điền các trường được cung cấp (undefined = giữ nguyên). */
  async fill(v: { name?: string; price?: string }) {
    if (v.name !== undefined) await this.name.fill(v.name);
    if (v.price !== undefined) await this.price.fill(v.price);
  }
}
