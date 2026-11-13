import { test as base, expect, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { AdminProductPage } from '../pages/AdminProductPage';
import { API_URL } from '../support/env';
import { adminToken, deleteProductsAfter, getProduct, maxProductId, productsAfter, seedProduct } from '../support/product-db';

type Input = { name?: string; nameLength?: number; price?: number | string };
type Case = {
  id: string; title: string; origin: string;
  kind: 'view' | 'add' | 'edit' | 'delete' | 'blocked-add' | 'blocked-edit' | 'api-add' | 'api-edit';
  input?: Input;
  api?: { set?: Record<string, unknown>; omit?: string[] };
  expected: { accepted?: boolean };
  predicted: 'Pass' | 'Fail'; predictedBug?: string; note?: string;
};

const cases: Case[] = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'fr15-product.json'), 'utf8'));

const TARGET_PRICE = 150000;
const CONTROL_PRICE = 220000;

// Mốc id chụp trước mỗi test; sau test xóa mọi dòng có id lớn hơn mốc (chỉ dữ liệu do test này tạo).
const test = base.extend<{ baseId: number }>({
  baseId: async ({}, use) => {
    const baseId = maxProductId();
    await use(baseId);
    deleteProductsAfter(baseId);
  },
});

function nameOf(i?: Input): string | undefined {
  if (!i) return undefined;
  return i.name ?? (i.nameLength ? 'A'.repeat(i.nameLength) : undefined);
}

/** Ghi lại hộp thoại alert và tự đồng ý. */
function captureDialogs(page: Page): string[] {
  const messages: string[] = [];
  page.on('dialog', (d) => { messages.push(d.message()); void d.accept(); });
  return messages;
}

/** Ghi lại các request ghi sản phẩm mà trình duyệt gửi đi. */
function captureWrites(page: Page): string[] {
  const writes: string[] = [];
  page.on('request', (r) => {
    if (/\/api\/products/.test(r.url()) && ['POST', 'PUT', 'DELETE'].includes(r.method())) writes.push(`${r.method()} ${r.url()}`);
  });
  return writes;
}

for (const c of cases) {
  test(`FR-15 ${c.id} – ${c.title}`, async ({ page, request, baseId }) => {
    const tag = `HW04 FR15 ${c.id} ${test.info().project.name}`;
    const info = test.info();
    info.annotations.push({ type: 'predicted', description: c.predicted + (c.predictedBug ? ` – ${c.predictedBug}` : '') });
    if (c.note) info.annotations.push({ type: 'note', description: c.note });

    const token = await adminToken();
    const admin = new AdminProductPage(page);
    const dialogs = captureDialogs(page);
    const writes = captureWrites(page);
    const name = nameOf(c.input);
    const price = c.input?.price;

    // ---- T0: dựng dữ liệu, đối chiếu theo ID ----
    const needsTarget = ['view', 'edit', 'delete', 'blocked-edit', 'api-edit'].includes(c.kind);
    const targetId = needsTarget ? seedProduct(`${tag} ĐÍCH`, TARGET_PRICE) : undefined;
    const controlId = seedProduct(`${tag} ĐỐI CHỨNG`, CONTROL_PRICE);
    const target0 = targetId ? getProduct(targetId) : undefined;
    const control0 = getProduct(controlId)!;
    if (targetId) expect(target0?.price).toBe(TARGET_PRICE);
    expect(control0.price).toBe(CONTROL_PRICE);

    /** T3 – DB theo ID: đối chứng không đổi (và đích không đổi nếu thao tác bị từ chối). */
    const expectControlUnchanged = () => expect.soft(getProduct(controlId), 'đối chứng không được đổi').toEqual(control0);
    const expectNoNewProduct = () =>
      expect.soft(productsAfter(controlId), 'không được có sản phẩm mới').toEqual([]);

    await page.addInitScript((t) => localStorage.setItem('adminToken', t), token);

    switch (c.kind) {
      case 'view': {
        await admin.open();
        await test.step('T1 hiển thị theo ID', async () => {
          const t = await admin.rowOf(targetId!);
          await expect(admin.nameCell(t)).toHaveText(target0!.name!);
          await expect(admin.priceCell(t)).toHaveText(`${TARGET_PRICE} ₫`);
          const k = await admin.rowOf(controlId);
          await expect(admin.nameCell(k)).toHaveText(control0.name!);
        });
        expect(getProduct(targetId!)).toEqual(target0);
        expectControlUnchanged();
        break;
      }

      case 'add': {
        const accepted = c.expected.accepted!;
        await admin.open();
        const before = await admin.rows.count();
        await admin.fill({ name, price: String(price) });
        const [resp] = await Promise.all([
          page.waitForResponse((r) => /\/api\/products$/.test(r.url()) && r.request().method() === 'POST'),
          admin.save.click(),
        ]);
        if (accepted) {
          expect(resp.status()).toBeLessThan(300);
          await expect(admin.rows).toHaveCount(before + 1);
          const created = productsAfter(controlId);
          expect(created, 'phải có đúng 1 sản phẩm mới trong DB').toHaveLength(1);
          const newId = created[0].id;
          await test.step('T1 hàng mới trên giao diện (chưa reload)', async () => {
            const row = await admin.rowOf(newId);
            await expect.soft(admin.nameCell(row)).toHaveText(name!);
            await expect.soft(admin.priceCell(row)).toHaveText(`${price} ₫`);
          });
          await test.step('T2 sau reload', async () => {
            await admin.open();
            const row = await admin.rowOf(newId);
            await expect.soft(admin.nameCell(row)).toHaveText(name!);
            await expect.soft(admin.priceCell(row)).toHaveText(`${price} ₫`);
          });
          await test.step('T3 DB theo ID', async () => {
            const db = getProduct(newId)!;
            expect.soft(db.name).toBe(name);
            expect.soft(db.name!.length).toBe(name!.length);
            expect.soft(Number(db.price)).toBe(Number(price));
            expect.soft(Number(db.category_id)).toBe(1);
          });
        } else {
          await test.step('T1 bị từ chối: mã trạng thái và danh sách', async () => {
            expect.soft(resp.status(), 'request không hợp lệ phải bị từ chối (>= 400)').toBeGreaterThanOrEqual(400);
            await expect.soft(admin.rows).toHaveCount(before);
          });
          await test.step('T3 DB theo ID', async () => { expectNoNewProduct(); });
        }
        expectControlUnchanged();
        break;
      }

      case 'edit': {
        const accepted = c.expected.accepted!;
        await admin.open();
        await admin.startEdit(targetId!);
        await expect(admin.name).toHaveValue(target0!.name!); // biểu mẫu nạp đúng sản phẩm đích
        await admin.fill({ name, price: String(price) });
        const [resp] = await Promise.all([
          page.waitForResponse((r) => new RegExp(`/api/products/${targetId}$`).test(r.url()) && r.request().method() === 'PUT'),
          admin.save.click(),
        ]);
        await expect.poll(() => dialogs.length, { message: 'phải có hộp thoại alert sau khi lưu' }).toBeGreaterThan(0);

        if (accepted) {
          expect(resp.status()).toBeLessThan(300);
          expect.soft(dialogs[0]).toContain('Cập nhật thành công');
          await test.step('T1 ngay sau khi lưu (chưa reload): đích đổi, đối chứng giữ nguyên', async () => {
            const t = await admin.rowOf(targetId!);
            await expect.soft(admin.nameCell(t), 'tên đích').toHaveText(name!);
            await expect.soft(admin.priceCell(t), 'giá đích').toHaveText(`${price} ₫`);
            const k = await admin.rowOf(controlId);
            await expect.soft(admin.nameCell(k), 'tên đối chứng không được đổi').toHaveText(control0.name!);
            await expect.soft(admin.priceCell(k), 'giá đối chứng').toHaveText(`${CONTROL_PRICE} ₫`);
          });
          await test.step('T2 sau reload', async () => {
            await admin.open();
            const t = await admin.rowOf(targetId!);
            await expect.soft(admin.nameCell(t)).toHaveText(name!);
            await expect.soft(admin.priceCell(t)).toHaveText(`${price} ₫`);
            const k = await admin.rowOf(controlId);
            await expect.soft(admin.nameCell(k)).toHaveText(control0.name!);
          });
          await test.step('T3 DB theo ID', async () => {
            const db = getProduct(targetId!)!;
            expect.soft(db.name).toBe(name);
            expect.soft(Number(db.price)).toBe(Number(price));
          });
        } else {
          await test.step('T1 bị từ chối: mã trạng thái', async () => {
            expect.soft(resp.status(), 'request không hợp lệ phải bị từ chối (>= 400)').toBeGreaterThanOrEqual(400);
            expect.soft(dialogs[0] ?? '', 'không được báo cập nhật thành công').not.toContain('Cập nhật thành công');
          });
          await test.step('T3 DB theo ID: đích không đổi', async () => {
            expect.soft(getProduct(targetId!), 'đích không được đổi').toEqual(target0);
          });
        }
        expectControlUnchanged();
        break;
      }

      case 'delete': {
        await admin.open();
        const before = await admin.rows.count();
        await Promise.all([
          page.waitForResponse((r) => new RegExp(`/api/products/${targetId}$`).test(r.url()) && r.request().method() === 'DELETE'),
          admin.remove(targetId!),
        ]);
        await test.step('T1 danh sách sau khi xóa', async () => {
          await expect(admin.rows).toHaveCount(before - 1);
          const k = await admin.rowOf(controlId);
          await expect(admin.nameCell(k)).toHaveText(control0.name!);
        });
        await test.step('T2 sau reload', async () => {
          const ids = await admin.open();
          expect(ids).not.toContain(targetId);
          expect(ids).toContain(controlId);
        });
        expect(getProduct(targetId!), 'đích phải bị xóa khỏi DB').toBeUndefined();
        expectControlUnchanged();
        break;
      }

      case 'blocked-add':
      case 'blocked-edit': {
        const editing = c.kind === 'blocked-edit';
        await admin.open();
        if (editing) await admin.startEdit(targetId!);
        await admin.fill({ name, price: String(price) });
        await admin.save.click();
        await test.step('T1 trình duyệt chặn: tên bắt buộc, không gửi request', async () => {
          const missing = await admin.name.evaluate((el) => (el as HTMLInputElement).validity.valueMissing);
          expect.soft(missing, 'ô tên phải ở trạng thái valueMissing').toBe(true);
          expect.soft(writes, 'không được gửi request ghi nào').toEqual([]);
        });
        await test.step('T3 DB theo ID', async () => {
          if (editing) expect.soft(getProduct(targetId!), 'đích không được đổi').toEqual(target0);
          else expectNoNewProduct();
        });
        expectControlUnchanged();
        break;
      }

      case 'api-add':
      case 'api-edit': {
        const editing = c.kind === 'api-edit';
        const body: Record<string, unknown> = {
          name: `${tag} API`, price: 100000,
          description: 'HW04 FR15 api', imageUrl: 'https://placehold.co/50', category_id: 1,
          ...(c.api?.set ?? {}),
        };
        for (const k of c.api?.omit ?? []) delete body[k];
        const headers = { Authorization: `Bearer ${token}` };
        const resp = editing
          ? await request.put(`${API_URL}/api/products/${targetId}`, { data: body, headers })
          : await request.post(`${API_URL}/api/products`, { data: body, headers });
        await test.step('T1 phản hồi API', async () => {
          expect.soft(resp.status(), 'request không hợp lệ phải bị từ chối (>= 400)').toBeGreaterThanOrEqual(400);
        });
        await test.step('T3 DB theo ID', async () => {
          if (editing) expect.soft(getProduct(targetId!), 'đích không được đổi').toEqual(target0);
          else expectNoNewProduct();
        });
        expectControlUnchanged();
        break;
      }
    }
  });
}
