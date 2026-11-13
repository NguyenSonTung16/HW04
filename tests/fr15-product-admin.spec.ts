import { test as base, expect, Page, Response } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { AdminProductPage } from '../pages/AdminProductPage';
import { API_URL } from '../support/env';
import { adminToken, countProducts, deleteProductsByIds, getProduct, seedProduct } from '../support/product-db';

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
/** Mã trạng thái cho thấy hệ thống từ chối vì dữ liệu không hợp lệ (không nhận 401/403 hay 5xx). */
const VALIDATION_REJECT = [400, 422];

// Mỗi test ghi lại ID mình tạo (seed hoặc ID do SUT trả về) và chỉ xóa đúng các ID đó khi kết thúc.
const test = base.extend<{ created: number[] }>({
  created: async ({}, use) => {
    const ids: number[] = [];
    await use(ids);
    deleteProductsByIds(ids);
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

/** ID sản phẩm do SUT tạo (đọc từ phản hồi POST thành công). */
async function createdId(resp: { ok(): boolean; json(): Promise<unknown> }): Promise<number | undefined> {
  if (!resp.ok()) return undefined;
  try { return Number(((await resp.json()) as { id?: number }).id) || undefined; } catch { return undefined; }
}

const isProductsGet = (r: Response) => /\/api\/products$/.test(r.url()) && r.request().method() === 'GET';
const isProductsPost = (r: Response) => /\/api\/products$/.test(r.url()) && r.request().method() === 'POST';

for (const c of cases) {
  test(`FR-15 ${c.id} – ${c.title}`, async ({ page, request, created }) => {
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
    const seed = (n: string, p: number) => { const id = seedProduct(n, p); created.push(id); return id; };
    const needsTarget = ['view', 'edit', 'delete', 'blocked-edit', 'api-edit'].includes(c.kind);
    const targetId = needsTarget ? seed(`${tag} ĐÍCH`, TARGET_PRICE) : undefined;
    const controlId = seed(`${tag} ĐỐI CHỨNG`, CONTROL_PRICE);
    const target0 = targetId ? getProduct(targetId) : undefined;
    const control0 = getProduct(controlId)!;
    const dbCount0 = countProducts();
    if (targetId) expect(target0?.price).toBe(TARGET_PRICE);
    expect(control0.price).toBe(CONTROL_PRICE);

    /** T3 – đối chứng không đổi (so theo ID). */
    const expectControlUnchanged = () => expect.soft(getProduct(controlId), 'đối chứng không được đổi').toEqual(control0);
    /** T3 – dữ liệu không hợp lệ không được lưu: sản phẩm do SUT trả ID không tồn tại và tổng số dòng DB không tăng. */
    const expectNothingSaved = (savedId?: number) => {
      if (savedId !== undefined) expect.soft(getProduct(savedId), 'sản phẩm không hợp lệ không được lưu vào DB').toBeUndefined();
      expect.soft(countProducts(), 'số sản phẩm trong DB không được tăng').toBe(dbCount0);
    };
    /** T1 – hệ thống phải từ chối vì dữ liệu không hợp lệ (400/422), không phải lỗi quyền hay lỗi máy chủ. */
    const expectRejected = (status: number) =>
      expect.soft(VALIDATION_REJECT.includes(status), `phải từ chối vì dữ liệu không hợp lệ (400/422), nhận ${status}`).toBe(true);

    await page.addInitScript((t) => localStorage.setItem('adminToken', t), token);

    switch (c.kind) {
      case 'view': {
        await admin.open();
        await admin.tag(targetId!, controlId);
        await test.step('T1 hiển thị theo ID', async () => {
          await expect(admin.nameCell(admin.rowOf(targetId!))).toHaveText(target0!.name!);
          await expect(admin.priceCell(admin.rowOf(targetId!))).toHaveText(`${TARGET_PRICE} ₫`);
          await expect(admin.nameCell(admin.rowOf(controlId))).toHaveText(control0.name!);
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
        const listReload = page.waitForResponse(isProductsGet, { timeout: 15_000 }).catch(() => null);
        const [resp] = await Promise.all([page.waitForResponse(isProductsPost), admin.save.click()]);
        const newId = await createdId(resp);
        if (newId !== undefined) created.push(newId);
        // Nếu thêm thành công, chờ bảng tải lại và đồng bộ với API rồi mới kiểm tra giao diện.
        if (resp.ok()) await listReload;
        const after = await admin.syncedCount();

        if (accepted) {
          expect(resp.status()).toBeLessThan(300);
          expect(newId, 'phản hồi phải trả ID sản phẩm mới').toBeDefined();
          expect(after).toBe(before + 1);
          await admin.tag(newId!);
          await test.step('T1 hàng mới trên giao diện (chưa reload)', async () => {
            await expect.soft(admin.nameCell(admin.rowOf(newId!))).toHaveText(name!);
            await expect.soft(admin.priceCell(admin.rowOf(newId!))).toHaveText(`${price} ₫`);
          });
          await test.step('T2 sau reload', async () => {
            await admin.open();
            await admin.tag(newId!);
            await expect.soft(admin.nameCell(admin.rowOf(newId!))).toHaveText(name!);
            await expect.soft(admin.priceCell(admin.rowOf(newId!))).toHaveText(`${price} ₫`);
          });
          await test.step('T3 DB theo ID', async () => {
            const db = getProduct(newId!)!;
            expect.soft(db.name).toBe(name);
            expect.soft(db.name!.length).toBe(name!.length);
            expect.soft(Number(db.price)).toBe(Number(price));
            expect.soft(Number(db.category_id)).toBe(1);
          });
        } else {
          await test.step('T1 bị từ chối: mã trạng thái và danh sách đã đồng bộ', async () => {
            expectRejected(resp.status());
            expect.soft(after, 'danh sách (sau khi đồng bộ) không được có thêm dòng').toBe(before);
          });
          await test.step('T3 DB theo ID', async () => { expectNothingSaved(newId); });
        }
        expectControlUnchanged();
        break;
      }

      case 'edit': {
        const accepted = c.expected.accepted!;
        await admin.open();
        await admin.tag(targetId!, controlId);
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
            // Điều kiện tiên quyết của phép đối chiếu: dấu nhận diện còn trên đúng 1 dòng mỗi sản phẩm (React giữ phần tử theo key).
            await expect(admin.rowOf(targetId!), 'mất dấu nhận diện dòng đích').toHaveCount(1);
            await expect(admin.rowOf(controlId), 'mất dấu nhận diện dòng đối chứng').toHaveCount(1);
            await expect.soft(admin.nameCell(admin.rowOf(targetId!)), 'tên đích').toHaveText(name!);
            await expect.soft(admin.priceCell(admin.rowOf(targetId!)), 'giá đích').toHaveText(`${price} ₫`);
            await expect.soft(admin.nameCell(admin.rowOf(controlId)), 'tên đối chứng không được đổi').toHaveText(control0.name!);
            await expect.soft(admin.priceCell(admin.rowOf(controlId)), 'giá đối chứng').toHaveText(`${CONTROL_PRICE} ₫`);
          });
          await test.step('T2 sau reload', async () => {
            await admin.open();
            await admin.tag(targetId!, controlId);
            await expect.soft(admin.nameCell(admin.rowOf(targetId!))).toHaveText(name!);
            await expect.soft(admin.priceCell(admin.rowOf(targetId!))).toHaveText(`${price} ₫`);
            await expect.soft(admin.nameCell(admin.rowOf(controlId))).toHaveText(control0.name!);
          });
          await test.step('T3 DB theo ID', async () => {
            const db = getProduct(targetId!)!;
            expect.soft(db.name).toBe(name);
            expect.soft(Number(db.price)).toBe(Number(price));
          });
        } else {
          await test.step('T1 bị từ chối: mã trạng thái', async () => {
            expectRejected(resp.status());
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
        await admin.tag(targetId!, controlId);
        const before = await admin.rows.count();
        await Promise.all([
          page.waitForResponse((r) => new RegExp(`/api/products/${targetId}$`).test(r.url()) && r.request().method() === 'DELETE'),
          admin.remove(targetId!),
        ]);
        await test.step('T1 danh sách sau khi xóa', async () => {
          await expect(admin.rows).toHaveCount(before - 1);
          await expect(admin.rowOf(targetId!)).toHaveCount(0);
          await expect(admin.nameCell(admin.rowOf(controlId))).toHaveText(control0.name!);
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
        if (editing) { await admin.tag(targetId!); await admin.startEdit(targetId!); }
        await admin.fill({ name, price: String(price) });
        await admin.save.click();
        await test.step('T1 trình duyệt chặn: tên bắt buộc, không gửi request', async () => {
          const missing = await admin.name.evaluate((el) => (el as HTMLInputElement).validity.valueMissing);
          expect.soft(missing, 'ô tên phải ở trạng thái valueMissing').toBe(true);
          expect.soft(writes, 'không được gửi request ghi nào').toEqual([]);
        });
        await test.step('T3 DB theo ID', async () => {
          if (editing) expect.soft(getProduct(targetId!), 'đích không được đổi').toEqual(target0);
          else expectNothingSaved();
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
        const newId = editing ? undefined : await createdId(resp);
        if (newId !== undefined) created.push(newId);
        await test.step('T1 phản hồi API: từ chối vì dữ liệu không hợp lệ', async () => {
          expectRejected(resp.status());
        });
        await test.step('T3 DB theo ID', async () => {
          if (editing) expect.soft(getProduct(targetId!), 'đích không được đổi').toEqual(target0);
          else expectNothingSaved(newId);
        });
        expectControlUnchanged();
        break;
      }
    }
  });
}
