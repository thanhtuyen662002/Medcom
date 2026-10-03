import { test, expect } from "@playwright/test";

test("published login hydrates under CSP and real unconfigured API rejects login", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Đăng nhập", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("login-desktop.png"), fullPage: true });
  await page.getByLabel("Tên đăng nhập").fill("synthetic-user");
  await page.getByLabel("Mật khẩu").fill("synthetic-password");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Dịch vụ đăng nhập ERP chưa sẵn sàng" })).toBeVisible();
  await expect(page.getByLabel("Mật khẩu")).toHaveValue("");
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
});

test("direct protected route revalidates and returns to login", async ({ page }) => {
  await page.goto("/workspace/");
  await expect(page).toHaveURL(/\/?returnTo=/);
  await expect(page.getByRole("heading", { name: "Đăng nhập", exact: true })).toBeVisible();
});

test("mobile login remains usable without horizontal scrolling", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Đăng nhập", exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("login-mobile.png"), fullPage: true });
});

test("synthetic frontend contract shows scoped workspace and confirmed logout", async ({ page }, testInfo) => {
  // Frontend contract fixture only; backend identity integration is NOT proved.
  const session = { displayName: "Người kiểm thử", tenantId: "test-tenant", companyId: "test-company",
    companyName: "Công ty kiểm thử", authorityVersion: 1, capabilities: ["platform.status"],
    idleExpiresAt: new Date(Date.now() + 3600000).toISOString(), absoluteExpiresAt: new Date(Date.now() + 86400000).toISOString() };
  await page.route("**/api/workspace", route => route.fulfill({ json: { session,
    navigation: [{ id: "platform-status", label: "Trạng thái hệ thống", href: "/workspace/" }] } }));
  await page.route("**/api/auth/csrf", route => route.fulfill({ json: { token: "synthetic-csrf" } }));
  await page.route("**/api/auth/logout", route => route.fulfill({ status: 204 }));
  await page.goto("/workspace/");
  await expect(page.getByRole("heading", { name: "Chào bạn, Người kiểm thử." })).toBeVisible();
  await expect(page.getByText("Chưa kết nối")).toHaveCount(2);
  await expect(page.getByText("Chức năng nghiệp vụ sẽ xuất hiện tại đây")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("workspace-synthetic.png"), fullPage: true });
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL("https://127.0.0.1:5186/");
});
