import { API_URL } from './env';

// Kiểm tra backend đang chạy trước khi test; báo lỗi rõ ràng thay vì để từng test fail khó hiểu.
export default async function globalSetup() {
  try {
    const res = await fetch(`${API_URL}/api/products`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    throw new Error(`Backend ${API_URL} không phản hồi (${(e as Error).message}). Hãy chạy SUT trước: backend :3000, web :5173, admin :5174.`);
  }
}
