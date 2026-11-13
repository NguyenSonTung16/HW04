# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fr02-login.spec.ts >> FR-02 N2 – Ô mật khẩu ẩn ký tự (type=password)
- Location: tests\fr02-login.spec.ts:50:3

# Error details

```
Error: expect(locator).toHaveAttribute(expected) failed

Locator:  locator('form').locator('input').nth(1)
Expected: "password"
Received: "text"
Timeout:  7000ms

Call log:
  - Expect "toHaveAttribute" locator('form').locator('input').nth(1) with timeout 7000ms
  - waiting for locator('form').locator('input').nth(1)
    17 × locator resolved to <input value="" required="" type="text" class="w-full border p-2 rounded"/>
       - unexpected value "text"

```

```yaml
- textbox
```

# Test source

```ts
  15  |   lockedAfter?: boolean;
  16  |   lockSecondsAfter?: number;
  17  |   requests?: number;
  18  |   formValid?: boolean;
  19  |   value?: string;
  20  |   apiPath?: string;
  21  | };
  22  | type Case = {
  23  |   id: string; title: string; type: string; kind: 'login' | 'timed' | 'html5' | 'attribute' | 'header' | 'nav';
  24  |   setup?: { attempts?: number; lockedForSeconds?: number };
  25  |   input?: { email: string; password: string };
  26  |   atSeconds?: number; field?: 'email' | 'password'; attribute?: string;
  27  |   links?: { text: string; path: string }[];
  28  |   expected?: Expected;
  29  |   note?: string;
  30  | };
  31  | 
  32  | const cases: Case[] = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'fr02-login.json'), 'utf8'));
  33  | 
  34  | async function expectOutcome(page: Page, login: LoginPage, outcome: 'success' | 'rejected') {
  35  |   if (outcome === 'success') {
  36  |     await expect(page).toHaveURL('/');
  37  |     expect(await login.token()).toBeTruthy();
  38  |   } else {
  39  |     await expect(login.error).toBeVisible();
  40  |     await expect(login.error).toContainText('Đăng nhập thất bại');
  41  |     await expect(page).toHaveURL(/\/login$/);
  42  |     expect(await login.token()).toBeNull();
  43  |   }
  44  | }
  45  | 
  46  | test.beforeEach(() => resetUser(USER));
  47  | test.afterAll(() => resetUser(USER));
  48  | 
  49  | for (const c of cases) {
  50  |   test(`FR-02 ${c.id} – ${c.title}`, async ({ page, request }) => {
  51  |     const login = new LoginPage(page);
  52  |     const exp = c.expected ?? {};
  53  |     if (c.note) test.info().annotations.push({ type: 'note', description: c.note });
  54  |     test.info().annotations.push(...bugAnnotations('FR02', c.id));
  55  | 
  56  |     if (c.kind === 'login') {
  57  |       setUserState(USER, c.setup ?? {});
  58  |       await login.goto();
  59  |       const respPromise = page.waitForResponse((r) => r.url().endsWith('/api/login'));
  60  |       await login.login(c.input!);
  61  |       const resp = await respPromise;
  62  |       if (exp.status) expect.soft(resp.status()).toBe(exp.status);
  63  |       await expectOutcome(page, login, exp.outcome!);
  64  |       if (exp.attemptsAfter !== undefined) {
  65  |         await expect.soft.poll(() => getUser(USER).login_attempts, { message: 'bộ đếm đăng nhập sai' }).toBe(exp.attemptsAfter);
  66  |       }
  67  |       if (exp.lockedAfter !== undefined) {
  68  |         expect.soft(isLocked(getUser(USER)), 'trạng thái khóa').toBe(exp.lockedAfter);
  69  |       }
  70  |       if (exp.lockSecondsAfter !== undefined) {
  71  |         const remaining = lockRemainingSeconds(getUser(USER));
  72  |         expect.soft(remaining, 'thời gian khóa còn lại (giây)').toBeGreaterThan(exp.lockSecondsAfter - 5);
  73  |         expect.soft(remaining, 'thời gian khóa còn lại (giây)').toBeLessThanOrEqual(exp.lockSecondsAfter);
  74  |       }
  75  |     }
  76  | 
  77  |     if (c.kind === 'timed') {
  78  |       test.setTimeout(120_000);
  79  |       // Tạo khóa thật bằng các request đăng nhập sai (không ghi thẳng vào DB).
  80  |       let lockedAt = 0;
  81  |       for (let i = 0; i < 3 && !lockedAt; i++) {
  82  |         await request.post(`${API_URL}/api/login`, { data: { email: USER, password: 'WrongPass9!' } });
  83  |         if (isLocked(getUser(USER))) lockedAt = Date.now();
  84  |       }
  85  |       expect(lockedAt, 'tài khoản phải bị khóa sau các lần sai').toBeGreaterThan(0);
  86  |       await login.goto();
  87  |       await login.fill(c.input!);
  88  |       const wait = c.atSeconds! * 1000 - (Date.now() - lockedAt);
  89  |       if (wait > 0) await page.waitForTimeout(wait);
  90  |       const respPromise = page.waitForResponse((r) => r.url().endsWith('/api/login'));
  91  |       await login.submit.click();
  92  |       const resp = await respPromise;
  93  |       expect.soft(resp.status(), `mã trạng thái /api/login tại t=${c.atSeconds}s`).toBe(exp.status!);
  94  |       await expectOutcome(page, login, exp.outcome!);
  95  |     }
  96  | 
  97  |     if (c.kind === 'html5') {
  98  |       await login.goto();
  99  |       let loginRequests = 0;
  100 |       page.on('request', (r) => { if (r.url().endsWith('/api/login')) loginRequests++; });
  101 |       await login.fill(c.input!);
  102 |       // checkValidity() là kiểm tra đồng bộ của trình duyệt, không cần chờ.
  103 |       const valid = await login.form.evaluate((f) => (f as HTMLFormElement).checkValidity());
  104 |       // Chờ theo sự kiện (có giới hạn) thay vì ngủ cố định: nếu form không bị chặn, request sẽ xuất hiện.
  105 |       const sent = page.waitForRequest((r) => r.url().endsWith('/api/login'), { timeout: 2000 }).then(() => true, () => false);
  106 |       await login.submit.click();
  107 |       await sent;
  108 |       expect.soft(valid, 'HTML5 validity của form').toBe(exp.formValid);
  109 |       expect(loginRequests, 'số request /api/login đã gửi').toBe(exp.requests);
  110 |     }
  111 | 
  112 |     if (c.kind === 'attribute') {
  113 |       await login.goto();
  114 |       const field = c.field === 'email' ? login.email : login.password;
> 115 |       await expect(field).toHaveAttribute(c.attribute!, exp.value!);
      |                           ^ Error: expect(locator).toHaveAttribute(expected) failed
  116 |     }
  117 | 
  118 |     if (c.kind === 'header') {
  119 |       await login.goto();
  120 |       const reqPromise = page.waitForRequest((r) => r.url().includes(exp.apiPath!));
  121 |       await login.login(c.input!);
  122 |       const apiReq = await reqPromise;
  123 |       const token = await login.token();
  124 |       expect(token).toBeTruthy();
  125 |       expect(apiReq.headers()['authorization']).toBe(`Bearer ${token}`);
  126 |     }
  127 | 
  128 |     if (c.kind === 'nav') {
  129 |       for (const link of c.links!) {
  130 |         await login.goto();
  131 |         await page.getByRole('link', { name: link.text }).click();
  132 |         await expect(page).toHaveURL(link.path);
  133 |       }
  134 |     }
  135 |   });
  136 | }
  137 | 
```