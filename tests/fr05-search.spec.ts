import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { HomePage, apiProducts } from '../pages/HomePage';
import { API_URL } from '../support/env';
import { bugAnnotations } from '../support/known-bugs';

type Case = {
  id: string; title: string; origin: string;
  kind: 'grid-count' | 'card-fields' | 'price-format' | 'img-alt' | 'search-match' | 'search-empty-all'
    | 'search-none' | 'search-html' | 'loading' | 'h1-count' | 'search-quote';
  input?: { keyword?: string };
  expected?: { contains?: string; count?: number };
  predicted: 'Pass' | 'Fail'; predictedBug?: string; note?: string;
};

const cases: Case[] = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'fr05-search.json'), 'utf8'));

for (const c of cases) {
  test(`FR-05 ${c.id} – ${c.title}`, async ({ page, request }) => {
    const info = test.info();
    info.annotations.push({ type: 'predicted', description: c.predicted + (c.predictedBug ? ` – ${c.predictedBug}` : '') });
    if (c.note) info.annotations.push({ type: 'note', description: c.note });
    info.annotations.push(...bugAnnotations('FR05', c.id));

    const home = new HomePage(page);
    const all = await apiProducts(request);
    expect(all.status).toBe(200); // tiền điều kiện
    expect(all.body.length).toBeGreaterThan(0);

    switch (c.kind) {
      case 'grid-count': {
        await home.open(all.body.length);
        await expect.soft(home.cards).toHaveCount(all.body.length);
        await expect.soft(page.getByText(`Hiển thị ${all.body.length} sản phẩm`)).toBeVisible();
        break;
      }
      case 'card-fields': {
        await home.open(all.body.length);
        for (let i = 0; i < all.body.length; i++) {
          const card = home.cards.nth(i);
          const name = (await card.locator('h2').innerText()).trim();
          const p = all.body.find((x) => x.name === name);
          expect(p, `Thẻ ${i} có tên không có trong API: ${name}`).toBeTruthy(); // tiền điều kiện của các so sánh sau
          await expect.soft(card.locator('img')).toHaveAttribute('src', p?.imageUrl ?? '__none__');
          // So giá hiển thị với giá API: chỉ lấy chữ số nên không phụ thuộc định dạng (VND/₫, dấu , hay .).
          const priceText = (await card.locator('p').first().innerText()).trim();
          expect.soft(priceText.replace(/\D/g, ''), `Giá hiển thị "${priceText}" của "${name}"`).toBe(String(p?.price));
        }
        break;
      }
      case 'price-format': {
        await home.open(all.body.length);
        const texts = (await home.prices.allTextContents()).map((s) => s.trim());
        expect(texts.length).toBe(all.body.length);
        for (const t of texts) {
          expect.soft(t, `Giá hiển thị: "${t}"`).toMatch(/^\d{1,3}([.,]\d{3})*\s?₫$/);
        }
        break;
      }
      case 'img-alt': {
        await home.open(all.body.length);
        const n = await home.images.count();
        for (let i = 0; i < n; i++) {
          const alt = await home.images.nth(i).getAttribute('alt');
          expect.soft((alt ?? '').trim().length, `Ảnh ${i} có alt "${alt}"`).toBeGreaterThan(0);
        }
        break;
      }
      case 'search-match':
      case 'search-empty-all': {
        const kw = c.input?.keyword ?? '';
        const api = await apiProducts(request, kw);
        expect(api.status).toBe(200); // tiền điều kiện
        await home.open(all.body.length);
        const resp = await home.search(kw);
        // 304 là hợp lệ: trình duyệt dùng lại bản cache của cùng URL; nội dung vẫn được đối chiếu qua giao diện bên dưới.
        expect([200, 304]).toContain(resp.status());
        const expectedNames = api.body.map((p) => p.name);
        await expect(home.cards).toHaveCount(expectedNames.length);
        expect.soft(await home.cardNames()).toEqual(expectedNames);
        if (c.kind === 'search-match') {
          expect(expectedNames.length).toBeGreaterThan(0);
          for (const n of await home.cardNames()) expect.soft(n.toLowerCase()).toContain(kw.toLowerCase());
          if (c.expected?.contains) expect.soft(await home.cardNames()).toContain(c.expected.contains);
        } else {
          expect.soft(await home.cardNames()).toHaveLength(all.body.length);
        }
        break;
      }
      case 'search-none': {
        const kw = c.input!.keyword!;
        const api = await apiProducts(request, kw);
        expect(api.status).toBe(200);
        expect(api.body).toHaveLength(0); // tiền điều kiện: API trả rỗng
        await home.open(all.body.length);
        await home.search(kw);
        await expect(home.cards).toHaveCount(0);
        await expect.soft(page.getByText(/không tìm thấy|không có sản phẩm|không có kết quả/i)).toBeVisible();
        break;
      }
      case 'search-html': {
        const kw = c.input!.keyword!;
        await home.open(all.body.length);
        const resp = await home.search(kw);
        expect(new URL(resp.url()).searchParams.get('search')).toBe(kw); // đúng request tìm kiếm
        expect(resp.status()).toBe(200);
        await expect.soft(page.locator('#hw04-xss')).toHaveCount(0); // HTML không được render thành phần tử
        await expect.soft(page.getByText(kw, { exact: false })).toBeVisible(); // từ khóa phải hiện như văn bản
        break;
      }
      case 'loading': {
        // Giữ request danh sách cho tới khi test cho phép, để kiểm tra loading đúng lúc request còn đang chờ.
        let release!: () => void;
        const gate = new Promise<void>((r) => (release = r));
        let held = false;
        await page.route((u) => u.origin === new URL(API_URL).origin && u.pathname === '/api/products', async (route) => {
          held = true;
          await gate;
          await route.continue();
        });
        try {
          await page.goto('/');
          await expect(home.searchInput).toBeVisible();
          await expect.poll(() => held, { message: 'request /api/products phải bị giữ lại' }).toBe(true);
          await expect(home.cards).toHaveCount(0); // tiền điều kiện: dữ liệu chưa về
          await expect.soft(page.getByText(/đang tải|loading/i).or(page.getByRole('progressbar'))).toBeVisible({ timeout: 1000 });
        } finally {
          release();
        }
        await expect(home.cards).toHaveCount(all.body.length); // sau khi nhả request thì phải tải xong
        break;
      }
      case 'h1-count': {
        await home.open(all.body.length);
        await expect.soft(home.h1).toHaveCount(c.expected!.count!);
        break;
      }
      case 'search-quote': {
        const kw = c.input!.keyword!;
        const api = await apiProducts(request, kw);
        expect.soft(api.status, 'API không được trả 5xx với từ khóa hợp lệ').toBeLessThan(500);
        await home.open(all.body.length);
        await home.search(kw);
        await expect.soft(page.getByText('Database Error')).toHaveCount(0);
        break;
      }
    }
  });
}
