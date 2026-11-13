import { test as base, expect, Page, APIRequestContext } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { ProductPage, CartPage } from '../pages/ShopPages';
import { CheckoutPage } from '../pages/CheckoutPage';
import { amount } from '../support/money';
import { API_URL } from '../support/env';
import { getUser } from '../support/db';
import {
  SEED_PREFIX, seedProduct, deleteProduct, setCouponUsage, setCouponActive,
  snapshotCoupon, restoreCoupon, CouponSnapshot,
} from '../support/coupon-db';

const USER = { email: 'test@eshop.com', password: 'Test1234!' };

type Case = {
  id: string; title: string; origin: 'HW02' | 'extra';
  kind: 'coupon' | 'guest' | 'badtoken' | 'api-no-user' | 'empty-code' | 'lowercase' | 'edit-total';
  input: { code: string; cartPrice: number; used?: number; couponActive?: boolean; token?: string; newTotal?: number };
  expected: {
    outcome?: 'applied' | 'rejected'; discount?: number; final?: number; errorContains?: string;
    dialogContains?: string; url?: string; meStatus?: number; minStatus?: number;
    applyDisabled?: boolean; requestCode?: string; requestTotal?: number; successHidden?: boolean;
  };
  predictedBug?: string; note?: string;
};

const cases: Case[] = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'fr09-coupon.json'), 'utf8'));

/** Ghi lại các bản ghi do chính test này tạo hoặc sửa để trả về nguyên trạng sau test (kể cả khi test fail). */
class Guard {
  private snapshots: CouponSnapshot[] = [];
  private productIds: number[] = [];
  coupon(code: string, userId: number) {
    const s = snapshotCoupon(code, userId);
    if (s) this.snapshots.push(s);
  }
  product(id: number) { this.productIds.push(id); }
  cleanup() {
    for (const s of this.snapshots.reverse()) restoreCoupon(s);
    for (const id of this.productIds) deleteProduct(id);
  }
}

const test = base.extend<{ guard: Guard }>({
  guard: async ({}, use) => {
    const guard = new Guard();
    try { await use(guard); } finally { guard.cleanup(); }
  },
});

async function loginToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API_URL}/api/login`, { data: USER });
  expect(res.ok(), 'đăng nhập qua API để lấy token').toBeTruthy();
  return (await res.json()).token as string;
}

/**
 * Mở trang sản phẩm có giá = cartPrice, thêm vào giỏ rồi mở giỏ hàng. Trả về response /api/users/me nếu có token.
 * Trước khi bấm thêm lần nữa luôn kiểm tra giỏ: chỉ bấm lại khi giỏ trống; nếu giỏ đã có hàng thì dừng ở
 * kiểm tra cứng (đúng 1 dòng, đúng sản phẩm/giá/số lượng/tổng), không bấm thêm để tránh thêm trùng.
 */
async function putProductInCart(page: Page, guard: Guard, caseId: string, cartPrice: number, token: string | null) {
  const name = `${SEED_PREFIX} ${caseId} ${test.info().project.name} ${cartPrice}`;
  const productId = seedProduct(cartPrice, name);
  guard.product(productId);
  if (token) await page.addInitScript((t) => localStorage.setItem('token', t), token);
  const meWait = token ? page.waitForResponse((r) => r.url().endsWith('/api/users/me')) : null;
  const product = new ProductPage(page);
  const cart = new CartPage(page);
  await product.goto(productId);
  const me = meWait ? await meWait : null;
  for (let attempt = 1; ; attempt++) {
    await product.addToCart();
    await cart.open();
    if ((await cart.items()).length > 0 || attempt === 3) break;
    await page.goBack();
    await expect(product.addButton).toBeVisible();
  }
  await cart.expectOnly({ name, price: cartPrice, quantity: 1 });
  return me;
}

async function goToCheckout(page: Page, cartPrice: number) {
  await new CartPage(page).checkoutButton.click();
  const checkout = new CheckoutPage(page);
  await checkout.expectOpen();
  expect(amount(await checkout.grandTotal.innerText()), 'tổng thanh toán ban đầu = tổng giỏ hàng').toBe(cartPrice);
  return checkout;
}

for (const c of cases) {
  test(`FR-09 ${c.id} – ${c.title}`, async ({ page, request, guard }) => {
    const exp = c.expected;
    const price = c.input.cartPrice;
    if (c.note) test.info().annotations.push({ type: 'note', description: c.note });
    if (c.predictedBug) test.info().annotations.push({ type: 'predicted-bug', description: c.predictedBug });

    if (c.kind === 'coupon' || c.kind === 'lowercase' || c.kind === 'empty-code' || c.kind === 'edit-total') {
      const userId = getUser(USER.email).id;
      const dbCode = c.input.code.toUpperCase(); // giao diện tự viết hoa mã trước khi gửi
      if (dbCode) {
        guard.coupon(dbCode, userId); // chụp trước khi sửa, trả lại nguyên trạng sau test
        setCouponActive(dbCode, c.input.couponActive ?? true);
        setCouponUsage(dbCode, userId, c.input.used ?? 0);
      }
      await putProductInCart(page, guard, c.id, price, await loginToken(request));
      const checkout = await goToCheckout(page, price);

      if (c.kind === 'coupon') {
        const resp = await checkout.apply(c.input.code);
        const body = resp.request().postDataJSON();
        expect.soft(body.total_amount, 'tổng gửi lên API').toBe(price);
        expect.soft(body.user_id, 'user_id gửi lên API').toBe(userId);
        if (exp.outcome === 'applied') {
          expect.soft(resp.status()).toBe(200);
          await expect(checkout.success).toBeVisible();
          const discount = amount(await checkout.saving.innerText());
          const final = amount(await checkout.afterDiscount.innerText());
          expect.soft(discount, 'số tiền giảm không được âm').toBeGreaterThanOrEqual(0);
          expect.soft(final, 'thành tiền không được lớn hơn tổng đơn').toBeLessThanOrEqual(price);
          expect.soft(discount, 'số tiền giảm').toBe(exp.discount);
          expect.soft(final, 'thành tiền').toBe(exp.final);
          expect.soft(amount(await checkout.grandTotal.innerText()), 'tổng thanh toán').toBe(exp.final);
        } else {
          expect.soft(resp.status()).toBeGreaterThanOrEqual(400);
          await expect(checkout.error).toBeVisible();
          if (exp.errorContains) await expect(checkout.error).toContainText(exp.errorContains);
          await expect(checkout.success).toHaveCount(0);
          expect.soft(amount(await checkout.grandTotal.innerText()), 'tổng thanh toán không đổi').toBe(price);
        }
      }

      if (c.kind === 'empty-code') {
        await expect(checkout.code).toHaveValue('');
        await expect(checkout.applyButton).toBeDisabled();
      }

      if (c.kind === 'lowercase') {
        await checkout.code.fill(c.input.code);
        const reqWait = page.waitForRequest((r) => r.url().endsWith('/api/apply-coupon'));
        await checkout.applyButton.click();
        const req = await reqWait;
        expect(req.postDataJSON().code, 'mã gửi lên API').toBe(exp.requestCode);
        expect(req.postDataJSON().total_amount).toBe(exp.requestTotal);
      }

      if (c.kind === 'edit-total') {
        await checkout.apply(c.input.code);
        await expect(checkout.success).toBeVisible();
        await checkout.editableTotal.fill(String(c.input.newTotal));
        if (exp.successHidden) await expect(checkout.success).toHaveCount(0);
        expect.soft(amount(await checkout.grandTotal.innerText()), 'tổng thanh toán sau khi sửa').toBe(c.input.newTotal);
      }
    }

    if (c.kind === 'guest' || c.kind === 'badtoken') {
      if (c.kind === 'badtoken') {
        const me = await putProductInCart(page, guard, c.id, price, c.input.token!);
        expect(me!.status(), '/api/users/me với token sai').toBe(exp.meStatus);
        await expect.poll(() => page.evaluate(() => localStorage.getItem('token')), { message: 'token bị xóa khỏi localStorage' }).toBeNull();
      } else {
        await putProductInCart(page, guard, c.id, price, null);
      }
      let dialogMessage = '';
      page.once('dialog', (d) => { dialogMessage = d.message(); void d.accept(); });
      await page.getByRole('button', { name: 'Tiến hành thanh toán' }).click();
      await expect(page).toHaveURL(new RegExp(`${exp.url}$`));
      expect(dialogMessage, 'nội dung alert').toContain(exp.dialogContains!);
    }

    if (c.kind === 'api-no-user') {
      const res = await request.post(`${API_URL}/api/apply-coupon`, { data: { code: c.input.code, total_amount: price } });
      expect(res.status(), 'API phải từ chối khi không có user_id / chưa đăng nhập').toBeGreaterThanOrEqual(exp.minStatus!);
    }
  });
}
