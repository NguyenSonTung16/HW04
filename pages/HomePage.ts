import { expect, Locator, Page, Response } from '@playwright/test';
import { API_URL } from '../support/env';

/** Trang chủ (danh sách sản phẩm và tìm kiếm). Locator lấy từ Home.jsx, chưa xác nhận trên DOM thật. */
export class HomePage {
  readonly searchInput: Locator;
  readonly searchButton: Locator;
  readonly cards: Locator;
  readonly names: Locator;
  readonly prices: Locator;
  readonly images: Locator;
  readonly h1: Locator;

  constructor(private readonly page: Page) {
    this.searchInput = page.getByPlaceholder('Tìm kiếm...');
    this.searchButton = page.getByRole('button', { name: 'Tìm', exact: true });
    this.cards = page.locator('div.grid > div');
    this.names = this.cards.locator('h2');
    this.prices = this.cards.locator('p');
    this.images = this.cards.locator('img');
    this.h1 = page.locator('h1');
  }

  /** Mở trang chủ và chờ danh sách khớp số sản phẩm API trả về. */
  async open(expectedCount: number) {
    await this.page.goto('/');
    await expect(this.searchInput).toBeVisible();
    await expect(this.cards).toHaveCount(expectedCount);
  }

  /** Nhập từ khóa, gửi form, trả về phản hồi của đúng request tìm kiếm (tham số search trùng từ khóa). */
  async search(keyword: string): Promise<Response> {
    await this.searchInput.fill(keyword);
    const [resp] = await Promise.all([
      this.page.waitForResponse(
        (r) => {
          const u = new URL(r.url());
          return r.request().method() === 'GET' && u.pathname === '/api/products' && (u.searchParams.get('search') ?? '') === keyword;
        },
      ),
      this.searchButton.click(),
    ]);
    return resp;
  }

  async cardNames(): Promise<string[]> {
    return (await this.names.allTextContents()).map((s) => s.trim());
  }
}

export type ApiProduct = { id: number; name: string; price: number; imageUrl: string };

export async function apiProducts(request: import('@playwright/test').APIRequestContext, search?: string) {
  const url = `${API_URL}/api/products` + (search !== undefined ? `?search=${encodeURIComponent(search)}` : '');
  const resp = await request.get(url);
  return { status: resp.status(), body: resp.status() === 200 ? ((await resp.json()) as ApiProduct[]) : [] };
}
