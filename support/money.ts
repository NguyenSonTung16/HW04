/**
 * Đọc số tiền từ chuỗi hiển thị (khác locale: "40,000" hay "40.000"), giữ dấu trừ.
 * Báo lỗi nếu chuỗi không chứa số, để assertion không qua nhầm với giá trị 0.
 */
export function amount(text: string): number {
  const m = text.match(/([-−–])?\s*(\d[\d.,  ]*)/);
  if (!m) throw new Error(`Không tìm thấy số tiền hợp lệ trong: "${text}"`);
  const value = Number(m[2].replace(/\D/g, ''));
  if (!Number.isFinite(value)) throw new Error(`Số tiền không hợp lệ trong: "${text}"`);
  return m[1] ? -value : value;
}
