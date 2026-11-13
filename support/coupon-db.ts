import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { SUT_DIR } from './env';

const dbPath = path.resolve(SUT_DIR, 'backend', 'database.sqlite');
export const SEED_PREFIX = 'HW04 Coupon Item';

function open() {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA busy_timeout = 5000');
  return db;
}

/** Tạo (hoặc lấy lại) sản phẩm có giá chính xác để dựng tổng giỏ hàng biên mà không đụng ô "Tổng tiền". */
export function seedProduct(price: number): number {
  const name = `${SEED_PREFIX} ${price}`;
  const db = open();
  try {
    const found = db.prepare('SELECT id FROM products WHERE name = ?').get(name) as { id: number } | undefined;
    if (found) return found.id;
    const res = db
      .prepare('INSERT INTO products (name, price, description, imageUrl, category_id) VALUES (?, ?, ?, ?, 1)')
      .run(name, price, 'Sản phẩm test HW04 (coupon)', 'https://placehold.co/300x300/png?text=HW04');
    return Number(res.lastInsertRowid);
  } finally {
    db.close();
  }
}

export function removeSeededProducts() {
  const db = open();
  try {
    db.prepare('DELETE FROM products WHERE name LIKE ?').run(`${SEED_PREFIX} %`);
  } finally {
    db.close();
  }
}

/** Đặt số lượt đã dùng của một mã cho một user (xóa lượt cũ rồi chèn đúng n dòng). */
export function setCouponUsage(code: string, userId: number, used: number) {
  const db = open();
  try {
    const c = db.prepare('SELECT id FROM coupons WHERE code = ?').get(code) as { id: number } | undefined;
    if (!c) return;
    db.prepare('DELETE FROM coupon_usage WHERE coupon_id = ? AND user_id = ?').run(c.id, userId);
    const ins = db.prepare('INSERT INTO coupon_usage (coupon_id, user_id) VALUES (?, ?)');
    for (let i = 0; i < used; i++) ins.run(c.id, userId);
  } finally {
    db.close();
  }
}

export function setCouponActive(code: string, active: boolean) {
  const db = open();
  try {
    db.prepare('UPDATE coupons SET is_active = ? WHERE code = ?').run(active ? 1 : 0, code);
  } finally {
    db.close();
  }
}

/** Đưa trạng thái coupon về như dữ liệu seed: kích hoạt lại mọi mã, xóa mọi lượt dùng. */
export function resetCouponState() {
  const db = open();
  try {
    db.exec('UPDATE coupons SET is_active = 1');
    db.exec('DELETE FROM coupon_usage');
  } finally {
    db.close();
  }
}
