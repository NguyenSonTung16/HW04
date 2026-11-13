import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { SUT_DIR } from './env';

const dbPath = path.resolve(SUT_DIR, 'backend', 'database.sqlite');
export const SEED_PREFIX = 'HW04 FR09';

function open() {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA busy_timeout = 5000');
  return db;
}

/**
 * Tạo sản phẩm có giá chính xác để dựng tổng giỏ hàng biên mà không đụng ô "Tổng tiền".
 * Tên sản phẩm là duy nhất cho từng test (mã ca + trình duyệt), nên chỉ xóa đúng bản ghi do test đó tạo.
 */
export function seedProduct(price: number, name: string): number {
  const db = open();
  try {
    db.prepare('DELETE FROM products WHERE name = ?').run(name); // bản sót lại của đúng test này từ lượt bị ngắt
    const res = db
      .prepare('INSERT INTO products (name, price, description, imageUrl, category_id) VALUES (?, ?, ?, ?, 1)')
      .run(name, price, 'Sản phẩm test HW04 (coupon)', 'https://placehold.co/300x300/png?text=HW04');
    return Number(res.lastInsertRowid);
  } finally {
    db.close();
  }
}

export function deleteProduct(id: number) {
  const db = open();
  try {
    db.prepare('DELETE FROM products WHERE id = ? AND name LIKE ?').run(id, `${SEED_PREFIX} %`);
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

export type CouponSnapshot = {
  couponId: number;
  userId: number;
  isActive: number;
  usage: { id: number; used_at: string }[];
};

/** Chụp trạng thái của đúng một mã (is_active và các lượt dùng của một user) trước khi test sửa. Mã không tồn tại thì trả null. */
export function snapshotCoupon(code: string, userId: number): CouponSnapshot | null {
  const db = open();
  try {
    const c = db.prepare('SELECT id, is_active FROM coupons WHERE code = ?').get(code) as { id: number; is_active: number } | undefined;
    if (!c) return null;
    const usage = db
      .prepare('SELECT id, used_at FROM coupon_usage WHERE coupon_id = ? AND user_id = ? ORDER BY id')
      .all(c.id, userId) as { id: number; used_at: string }[];
    return { couponId: c.id, userId, isActive: c.is_active, usage };
  } finally {
    db.close();
  }
}

/** Khôi phục đúng trạng thái đã chụp: chỉ đụng tới mã và user đó, không ảnh hưởng mã khác hay feature khác. */
export function restoreCoupon(s: CouponSnapshot) {
  const db = open();
  try {
    db.prepare('UPDATE coupons SET is_active = ? WHERE id = ?').run(s.isActive, s.couponId);
    db.prepare('DELETE FROM coupon_usage WHERE coupon_id = ? AND user_id = ?').run(s.couponId, s.userId);
    const ins = db.prepare('INSERT INTO coupon_usage (id, coupon_id, user_id, used_at) VALUES (?, ?, ?, ?)');
    for (const u of s.usage) ins.run(u.id, s.couponId, s.userId, u.used_at);
  } finally {
    db.close();
  }
}
