// Explicit synthetic credentials against the real SQL + pinned DLL test host.
// Never use a production account or send passwords through argv.
import { chromium } from '../../src/frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const credentials = JSON.parse(input); input = '';
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 980 } });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.name));
  await page.goto(process.argv[2]);
  await page.getByLabel('Tên đăng nhập').fill(credentials.username);
  await page.getByLabel('Mật khẩu').fill(credentials.password); credentials.password = '';
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL('**/workspace/');
  await page.getByRole('link', { name: 'Đơn đặt hàng mua', exact: true }).first().click();
  await page.getByRole('heading', { name: 'Đơn đặt hàng mua', exact: true }).waitFor();
  await page.getByText('ORDER-A', { exact: true }).waitFor();
  if (await page.getByText('ORDER-B', { exact: true }).count()) throw new Error('Scope leak');
  await page.getByLabel('Tìm số chứng từ').fill('%');
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  await page.getByText('ORDER%LITERAL', { exact: true }).waitFor();
  await page.waitForFunction(() => !document.body.textContent.includes('ORDER-A'));
  const denied = await page.evaluate(async () => (await fetch('/api/documents/purchase-orders?branchId=BR-B')).status);
  if (denied !== 403) throw new Error('Scope widening accepted');
  await fs.mkdir(new URL('../../src/frontend/test-results/', import.meta.url), { recursive: true });
  await page.screenshot({ path: new URL('../../src/frontend/test-results/legacy-runtime-orders.png', import.meta.url).pathname, fullPage: true });
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await page.waitForURL(process.argv[2] + '/');
  const retired = await page.evaluate(async () => (await fetch('/api/workspace')).status);
  if (retired !== 401 || errors.length) throw new Error('Session retirement or browser error');
  console.log(JSON.stringify({ status: 'PASS', login: 'actual_sql_and_owner_dll', scopeWidening: 403, afterLogout: 401, browserErrors: errors.length }));
} finally { await browser.close(); }
