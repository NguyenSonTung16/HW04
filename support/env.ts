export const API_URL = process.env.API_URL ?? 'http://localhost:3000';
export const WEB_URL = process.env.WEB_URL ?? 'http://localhost:5173';
export const ADMIN_URL = process.env.ADMIN_URL ?? 'http://localhost:5174';
export const ADMIN = { email: 'admin@eshop.com', password: 'Admin123!' };
// Đường dẫn tới thư mục eshop-sut (backend/database.sqlite). Đặt SUT_DIR nếu khác mặc định.
export const SUT_DIR = process.env.SUT_DIR ?? '../../eshop-sut';
