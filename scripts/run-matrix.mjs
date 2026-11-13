// Chạy 3 feature x 3 browser = 9 lượt, mỗi lượt một report HTML riêng.
// Dùng: node scripts/run-matrix.mjs [fr02|fr09|fr15|fr05 ...]
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const features = { fr02: 'fr02-login', fr09: 'fr09-coupon', fr15: 'fr15-product-admin', fr05: 'fr05-search' };
const browsers = ['chromium', 'firefox', 'webkit'];
const sutDir = process.env.SUT_DIR ?? path.resolve('../../eshop-sut');
const dbFile = path.join(sutDir, 'backend', 'database.sqlite');
const snapshot = path.resolve('.sut-backup', 'database.sqlite');

const selected = process.argv.slice(2).length ? process.argv.slice(2) : ['fr02', 'fr09', 'fr15'];
mkdirSync('.sut-backup', { recursive: true });
if (!existsSync(snapshot)) copyFileSync(dbFile, snapshot); // snapshot DB sạch lần đầu

let failedRuns = 0;
for (const f of selected) for (const b of browsers) {
  // Reset DB về snapshot sạch trước mỗi lượt (backend cần được chạy lại nếu giữ DB trong bộ nhớ)
  copyFileSync(snapshot, dbFile);
  const runAt = new Date().toISOString();
  console.log(`\n=== ${f} | ${b} | ${runAt} ===`);
  const r = spawnSync('npx', ['playwright', 'test', features[f]], {
    stdio: 'inherit', shell: true,
    env: { ...process.env, FEATURE: f.toUpperCase(), BROWSER_NAME: b, RUN_AT: runAt, REPORT_DIR: `reports/${f}-${b}` },
  });
  if (r.status !== 0) failedRuns++;
}
console.log(`\nXong. Lượt có test fail: ${failedRuns}/${selected.length * browsers.length}. Report: reports/<feature>-<browser>/index.html`);
