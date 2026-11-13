import { removeSeededProducts, resetCouponState } from './coupon-db';

// Chạy một lần sau khi toàn bộ test của tiến trình kết thúc: dọn sản phẩm seed và trạng thái coupon.
export default async function globalTeardown() {
  resetCouponState();
  removeSeededProducts();
}
