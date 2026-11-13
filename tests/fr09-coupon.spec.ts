import { test, expect, Page, APIRequestContext } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { ProductPage, CartPage } from '../pages/ShopPages';
import { CheckoutPage, digits } from '../pages/CheckoutPage';
import { API_URL } from '../support/env';
import { getUser } from '../support/db';
import { seedProduct, removeSeededProducts, setCouponUsage, setCouponActive, resetCouponState } from '../support/coupon-db';

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

async function loginToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API_URL}/api/login`, { data: USER });
  expect(res.ok(), 'đăng nhập qua API để lấy token').toBeTruthy();
  return (await res.json()).token as string;
}

/** Mở trang sản phẩm có giá = cartPrice, thêm vào giỏ. Trả về response /api/users/me nếu có token. */
async function putProductInCart(page: Page, cartPrice: number, token: string | null) {
  const productId = seedProduct(cartPrice);
  if (token) await page.addInitScript((t) => localStorage.setItem('token', t), token);
  const meWait = token ? page.waitForResponse((r) => r.url().endsWith('/api/users/me')) : null;
  const product = new ProductPage(page);
  await product.goto(productId);
  const me = meWait ? await meWait : null;
  await product.addToCart();
  return me;
}

async function goToCheckout(page: Page, cartPrice: number) {
  const cart = new CartPage(page);
  await cart.open();
  expect.soft(digits(await cart.subtotal.innerText()), 'tổng giỏ hàng').toBe(cartPrice);
  await cart.checkoutButton.click();
  const checkout = new CheckoutPage(page);
  await checkout.expectOpen();
  return checkout;
}

test.beforeEach(() => resetCouponState());
test.afterAll(() => {
  resetCouponState();
  removeSeededProducts();
});

for (const c of cases) {
  test(`FR-09 ${c.id} – ${c.title}`, async ({ page, request }) => {
    const exp = c.expected;
    const price = c.input.cartPrice;
    if (c.note) test.info().annotations.push({ type: 'note', description: c.note });
    if (c.predictedBug) test.info().annotations.push({ type: 'predicted-bug', description: c.predictedBug });

    if (c.kind === 'coupon' || c.kind === 'lowercase' || c.kind === 'empty-code' || c.kind === 'edit-total') {
      const userId = getUser(USER.email).id;
      if (c.input.code && c.input.used !== undefined) setCouponUsage(c.input.code, userId, c.input.used);
      if (c.input.couponActive === false) setCouponActive(c.input.code, false);
      await putProductInCart(page, price, await loginToken(request));
      const checkout = await goToCheckout(page, price);

      if (c.kind === 'coupon') {
        const resp = await checkout.apply(c.input.code);
        const body = resp.request().postDataJSON();
        expect.soft(body.total_amount, 'tổng gửi lên API').toBe(price);
        expect.soft(body.user_id, 'user_id gửi lên API').toBe(userId);
        if (exp.outcome === 'applied') {
          expect.soft(resp.status()).toBe(200);
          await expect(checkout.success).toBeVisible();
          expect.soft(digits(await checkout.saving.innerText()), 'số tiền giảm').toBe(exp.discount);
          expect.soft(digits(await checkout.afterDiscount.innerText()), 'thành tiền').toBe(exp.final);
          expect.soft(digits(await checkout.grandTotal.innerText()), 'tổng thanh toán').toBe(exp.final);
        } else {
          expect.soft(resp.status()).toBeGreaterThanOrEqual(400);
          await expect(checkout.error).toBeVisible();
          if (exp.errorContains) await expect(checkout.error).toContainText(exp.errorContains);
          await expect(checkout.success).toHaveCount(0);
          expect.soft(digits(await checkout.grandTotal.innerText()), 'tổng thanh toán không đổi').toBe(price);
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
        expect.soft(digits(await checkout.grandTotal.innerText()), 'tổng thanh toán sau khi sửa').toBe(c.input.newTotal);
      }
    }

    if (c.kind === 'guest' || c.kind === 'badtoken') {
      if (c.kind === 'badtoken') {
        const me = await putProductInCart(page, price, c.input.token!);
        expect(me!.status(), '/api/users/me với token sai').toBe(exp.meStatus);
        await expect.poll(() => page.evaluate(() => localStorage.getItem('token')), { message: 'token bị xóa khỏi localStorage' }).toBeNull();
      } else {
        await putProductInCart(page, price, null);
      }
      await new CartPage(page).open();
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
