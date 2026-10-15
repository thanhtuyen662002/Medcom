// Compiled, unconfigured loopback host only. No real ERP credentials or SQL.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.MEDCOM_SWAGGER_PLAYWRIGHT
  || path.resolve("src/frontend/node_modules/playwright"));
const expectedContract = JSON.parse(await readFile("docs/backend/medcom-openapi.json", "utf8"));
const expectedPaths = Object.keys(expectedContract.paths).length;
const expectedOperations = Object.values(expectedContract.paths).reduce((count, item) => count + Object.keys(item).length, 0);
const privateDir = await mkdtemp(path.join(tmpdir(), "medcom-swagger-browser-"));
const privateConfig = path.join(privateDir, "synthetic.json");
await writeFile(privateConfig, "{}");
let browser, child;
try {
  const cleanEnvironment = Object.fromEntries(Object.entries(process.env)
    .filter(([key]) => !/^(Legacy__|Medcom__|ConnectionStrings__)/i.test(key)));
  child = spawn(process.env.DOTNET || "dotnet", [
    path.resolve("src/backend/Medcom.Api/bin/Release/net10.0/Medcom.Api.dll"),
    "--environment", "Production", "--Legacy:Enabled", "false",
    "--Medcom:PrivateConfigPath", privateConfig, "--urls", "http://127.0.0.1:0"
  ], { env: cleanEnvironment, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  const address = await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("Synthetic Swagger host startup timed out")), 45000);
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("exit", code => { clearTimeout(timer); reject(new Error(`Synthetic Swagger host exited: ${code}`)); });
    child.stdout.on("data", chunk => {
      output += chunk.toString();
      const match = /Now listening on:\s*(http:\/\/127\.0\.0\.1:\d+)/.exec(output);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  browser = await chromium.launch({ headless: true,
    ...(process.env.MEDCOM_SWAGGER_CHROMIUM ? { executablePath: process.env.MEDCOM_SWAGGER_CHROMIUM } : {}) });
  const page = await browser.newPage();
  const scriptErrors = [], policyErrors = [], consoleErrors = [], requests = [];
  page.on("pageerror", error => scriptErrors.push(error.message));
  page.on("console", message => {
    if (/content security policy|unsafe-eval|refused to execute/i.test(message.text())) policyErrors.push(message.text());
    if (message.type() === "error") consoleErrors.push(message.text().slice(0, 1200));
  });
  page.on("request", request => requests.push({ url: request.url(), method: request.method() }));
  await page.goto(address + "/swagger", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Medcom — Kiểm tra API" }).waitFor();
  try {
    await page.waitForFunction(expected => window.ui?.getSystem().specSelectors.specJson().get("paths")?.size === expected, expectedPaths, { timeout: 45000 });
  } catch (error) {
    console.error(JSON.stringify({ operations: await page.locator(".opblock").count(), scriptErrors, policyErrors, consoleErrors: consoleErrors.slice(0, 5),
      errors: await page.locator(".errors-wrapper").allTextContents(), ui: (await page.locator("#swagger-ui").innerText()).slice(0, 700),
      state: await page.evaluate(() => {
        const system = window.ui.getSystem(), raw = system.specSelectors.specJson(), resolved = system.specSelectors.specResolved();
        return { rawPaths: raw.get("paths")?.size, resolvedPaths: resolved.get("paths")?.size,
          tagged: system.specSelectors.taggedOperations().map(tag => tag.get("operations").size).toJS(),
          config: { filter: system.getConfigs().filter, docExpansion: system.getConfigs().docExpansion },
          loading: system.specSelectors.loadingStatus() };
      }) }));
    throw error;
  }
  const count = await page.evaluate(() => window.ui.getSystem().specSelectors.taggedOperations()
    .reduce((total, tag) => total + tag.get("operations").size, 0));
  assert.equal(count, expectedOperations);
  const captions = JSON.parse(await readFile("inventories/erp/20261012/captions.json", "utf8"));
  for (const screen of captions.screens)
    assert.equal(await page.locator(".opblock-tag").getByRole("link", { name: screen.caption, exact: true }).count(), 1, screen.module);
  assert.equal(await page.locator(".opblock-tag").filter({ hasText: "ERP ·" }).count(), 0);
  await page.locator(".opblock-tag").filter({ hasText: "Đặt mua hàng" }).click();
  await page.locator(".opblock-summary-path").filter({ hasText: "/api/erp/purchase-orders/create" }).waitFor();
  const orders = page.locator(".opblock").filter({ has: page.locator(".opblock-summary-path").filter({ hasText: /^\/api\/erp\/purchase-orders$/ }) });
  await orders.locator(".opblock-summary").click();
  await orders.getByRole("button", { name: "Try it out" }).click();
  await orders.getByPlaceholder("branchId", { exact: true }).fill("QA-BRANCH");
  const scopeRequest = page.waitForRequest(request => request.url() === address + "/api/workspace");
  await orders.getByRole("button", { name: "Execute", exact: true }).click();
  await scopeRequest; // blank managed headers passed UI validation; server still rejects the anonymous scope read
  assert.equal(requests.some(request => new URL(request.url).pathname === "/api/erp/purchase-orders"), false);
  await page.locator(".opblock-tag").filter({ hasText: "Hệ thống" }).click();
  const health = page.locator(".opblock").filter({ has: page.locator(".opblock-summary-path").filter({ hasText: "/health/live" }) }).first();
  await health.locator(".opblock-summary").click();
  await health.getByRole("button", { name: "Try it out" }).click();
  const response = page.waitForResponse(result => result.url() === address + "/health/live");
  await health.getByRole("button", { name: "Execute", exact: true }).click();
  assert.equal((await response).status(), 200);
  await health.locator(".live-responses-table").waitFor();
  await page.getByLabel("Tên đăng nhập", { exact: true }).fill("synthetic-user");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Không đăng nhập được" }).waitFor();
  assert.equal(await page.getByLabel("Mật khẩu", { exact: true }).inputValue(), "");
  assert.equal(requests.filter(request => request.method === "POST").length, 0); // HTTP writes fail before dispatch
  assert.ok(requests.every(request => new URL(request.url).origin === address));
  assert.deepEqual(scriptErrors, []);
  assert.deepEqual(policyErrors, []);
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/swagger-browser.png", fullPage: true });
  console.log(`PASS: ${expectedOperations} grouped operations under production CSP; Try it out succeeds; managed headers do not block UI validation; anonymous scope/HTTP writes remain denied`);
} finally {
  if (browser) await browser.close();
  if (child && child.exitCode === null) child.kill();
  // Delete only the exact invocation-owned temporary directory within OS temp.
  if (path.dirname(privateDir) !== path.resolve(tmpdir()) || !path.basename(privateDir).startsWith("medcom-swagger-browser-"))
    throw new Error("Unexpected synthetic configuration cleanup path");
  await rm(privateDir, { recursive: true, force: true });
}
