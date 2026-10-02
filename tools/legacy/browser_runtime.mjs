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
  const orderRow = page.getByRole('row').filter({ has: page.getByRole('button', { name: 'Xem chi tiết ORDER-A', exact: true }) });
  await orderRow.focus(); await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: 'Chi tiết hàng hóa · ORDER-A', exact: true }).waitFor();
  await page.getByText('12345678901234567890123456.78', { exact: true }).waitFor();
  if (await page.getByText('HIDDEN-ITEM', { exact: true }).count()) throw new Error('Detail scope leak');
  const detailScopes = await page.evaluate(async () => Promise.all(['ORDER-B','MISSING'].map(documentId =>
    fetch('/api/documents/purchase-orders/detail?' + new URLSearchParams({ documentId })).then(response => response.status))));
  if (detailScopes.some(status => status !== 404)) throw new Error('Hidden detail existence leaked');
  await fs.mkdir(new URL('../../artifacts/legacy-browser/', import.meta.url), { recursive: true });
  await page.screenshot({ path: new URL('../../artifacts/legacy-browser/legacy-runtime-detail.png', import.meta.url).pathname, fullPage: true });
  await page.keyboard.press('Escape');
  if (!await orderRow.evaluate(element => element === document.activeElement)) throw new Error('Detail focus not restored');
  await page.getByRole('link', { name: 'Yêu cầu nhập kho', exact: true }).first().click();
  await page.getByRole('button', { name: 'Xem chi tiết INBOUND-A', exact: true }).click();
  await page.getByText('123456789012345678', { exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw new Error('Mobile page overflow');
  await page.screenshot({ path: new URL('../../artifacts/legacy-browser/legacy-runtime-detail-mobile.png', import.meta.url).pathname, fullPage: true });
  await page.getByRole('button', { name: 'Đóng chi tiết' }).click();
  await page.setViewportSize({ width: 1440, height: 980 });
  await page.getByRole('link', { name: 'Đơn đặt hàng mua', exact: true }).first().click();
  await page.getByLabel('Tìm số chứng từ').fill('%');
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  await page.getByText('ORDER%LITERAL', { exact: true }).waitFor();
  await page.waitForFunction(() => !document.body.textContent.includes('ORDER-A'));
  const denied = await page.evaluate(async () => (await fetch('/api/documents/purchase-orders?branchId=BR-B')).status);
  if (denied !== 403) throw new Error('Scope widening accepted');
  await fs.mkdir(new URL('../../artifacts/legacy-browser/', import.meta.url), { recursive: true });
  await page.screenshot({ path: new URL('../../artifacts/legacy-browser/legacy-runtime-orders.png', import.meta.url).pathname, fullPage: true });
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await page.waitForURL(process.argv[2] + '/');
  const retired = await page.evaluate(async () => (await fetch('/api/workspace')).status);
  if (retired !== 401 || errors.length) throw new Error('Session retirement or browser error');
  console.log(JSON.stringify({ status: 'PASS', login: 'actual_sql_and_owner_dll', scopeWidening: 403, detailScopes,
    exactDecimalQuantities: true, keyboardDetail: true, mobileDetail: true, afterLogout: 401, browserErrors: errors.length }));
} finally { await browser.close(); }
