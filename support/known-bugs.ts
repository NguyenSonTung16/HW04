// Liên kết ca kiểm thử với bug đã đăng trên GitHub Issues (xem docs/Bug_Report.md).
// Chỉ gắn chú thích (annotation) hiển thị trong báo cáo; không đổi kết quả pass/fail của ca.
const ISSUES_URL = 'https://github.com/NguyenSonTung16/HW04/issues';

type Bug = { id: string; issue: number };

const FR02_1: Bug = { id: 'BUG-FR02-001', issue: 1 };
const FR02_2: Bug = { id: 'BUG-FR02-002', issue: 2 };
const FR02_3: Bug = { id: 'BUG-FR02-003', issue: 3 };
const FR02_4: Bug = { id: 'BUG-FR02-004', issue: 4 };
const FR09_1: Bug = { id: 'BUG-FR09-001', issue: 5 };
const FR09_2: Bug = { id: 'BUG-FR09-002', issue: 6 };
const FR09_3: Bug = { id: 'BUG-FR09-003', issue: 7 };
const FR15_1: Bug = { id: 'BUG-FR15-001', issue: 8 };
const FR15_2: Bug = { id: 'BUG-FR15-002', issue: 9 };
const FR15_3: Bug = { id: 'BUG-FR15-003', issue: 10 };
const FR15_4: Bug = { id: 'BUG-FR15-004', issue: 11 };

const KNOWN: Record<string, Record<string, Bug[]>> = {
  FR02: { TC02: [FR02_1], TC03: [FR02_1], TC04: [FR02_1, FR02_2], TC07: [FR02_3], TC08: [FR02_2], TC14: [FR02_2], N2: [FR02_4] },
  FR09: { TC01: [FR09_1], TC09b: [FR09_2], TC14: [FR09_3], TC17: [FR09_3] },
  FR15: {
    TC03: [FR15_1], TC28: [FR15_1], TC29: [FR15_1], TC30: [FR15_1], TC31: [FR15_1], TC33: [FR15_1],
    TC07: [FR15_2], TC08: [FR15_2], TC09: [FR15_2],
    TC10: [FR15_3], TC11: [FR15_3], TC12: [FR15_3], TC13: [FR15_3], TC14: [FR15_3],
    TC15: [FR15_3], TC16: [FR15_3], TC17: [FR15_3], TC18: [FR15_3],
    TC19: [FR15_4], TC20: [FR15_4], TC21: [FR15_4], TC22: [FR15_4], TC23: [FR15_4],
  },
};

/** Chú thích bug cho một ca: `BUG-... – #n <link>`; trả về mảng rỗng nếu ca chưa gắn bug. */
export function bugAnnotations(feature: 'FR02' | 'FR09' | 'FR15', caseId: string): { type: string; description: string }[] {
  return (KNOWN[feature][caseId] ?? []).map((b) => ({ type: 'bug', description: `${b.id} – #${b.issue} ${ISSUES_URL}/${b.issue}` }));
}
