import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { API_URL, ADMIN } from './env';

const dbPath = path.resolve(process.env.SUT_DIR ?? '../../eshop-sut', 'backend', 'database.sqlite');

export type ProductRow = {
  id: number; name: string | null; price: number | string | null;
  description: string | null; imageUrl: string | null; category_id: number | string | null;
};

function open() {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA busy_timeout = 5000');
  return db;
}

/** Tạo sản phẩm test (đích hoặc đối chứng) và trả về id. */
export function seedProduct(name: string, price: number, categoryId = 1): number {
  const db = open();
  try {
    const r = db
      .prepare('INSERT INTO products (name, price, description, imageUrl, category_id) VALUES (?, ?, ?, ?, ?)')
      .run(name, price, 'Sản phẩm test HW04 (FR-15)', 'https://placehold.co/300x300/png?text=HW04', categoryId);
    return Number(r.lastInsertRowid);
  } finally { db.close(); }
}

export function getProduct(id: number): ProductRow | undefined {
  const db = open();
  try {
    return db.prepare('SELECT * FROM products WHERE id = ?').get(id) as ProductRow | undefined;
  } finally { db.close(); }
}

export function countProducts(): number {
  const db = open();
  try {
    return (db.prepare('SELECT COUNT(*) AS c FROM products').get() as { c: number }).c;
  } finally { db.close(); }
}

/** Dọn dữ liệu: chỉ xóa đúng các ID mà test đã tạo (seed hoặc do SUT trả về trong phản hồi). */
export function deleteProductsByIds(ids: number[]) {
  if (!ids.length) return;
  const db = open();
  try {
    const del = db.prepare('DELETE FROM products WHERE id = ?');
    for (const id of ids) del.run(id);
  } finally { db.close(); }
}

let cachedToken: string | undefined;
/** Token admin hợp lệ (đăng nhập qua API một lần cho cả lượt chạy). */
export async function adminToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  const res = await fetch(`${API_URL}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ADMIN),
  });
  if (!res.ok) throw new Error(`Đăng nhập admin thất bại: HTTP ${res.status}`);
  cachedToken = ((await res.json()) as { token: string }).token;
  return cachedToken;
}
