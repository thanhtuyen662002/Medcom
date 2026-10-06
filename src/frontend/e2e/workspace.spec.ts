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

for (const width of [1280, 390]) {
  test(`synthetic native purchase navigation preserves bundled workspace at ${width}px`, async ({ page }) => {
    // Contract-only fixture. Does not prove real login, SQL or business acceptance.
    await page.setViewportSize({ width, height: 844 });
    const session = { displayName: "Synthetic", tenantId: "test", companyId: "test", companyName: "Synthetic company",
      authorityVersion: 1, capabilities: ["platform.status", "purchase-requests.read", "purchase-orders.read"],
      idleExpiresAt: new Date(Date.now() + 3600000).toISOString(), absoluteExpiresAt: new Date(Date.now() + 86400000).toISOString() };
    const requests: string[] = [];
    page.on("request", request => { if (request.url().includes("/api/")) requests.push(request.url()); });
    await page.route("**/api/workspace", route => route.fulfill({ json: { session, branchIds: ["TEST"], navigation: [
      { id: "platform-status", label: "Trạng thái hệ thống", href: "/workspace/" },
      { id: "purchase-requests", label: "Đề nghị mua hàng", href: "/workspace/?screen=purchase-requests" },
      { id: "purchase-orders", label: "Đơn đặt hàng mua", href: "/workspace/?screen=purchase-orders" },
    ] } }));
    await page.route("**/api/documents/purchase-orders?*", route => route.fulfill({ json: { rows: [], page: 1, pageSize: 50, hasMore: false } }));
    await page.goto("/workspace/");
    await expect(page.getByRole("heading", { name: "Chào bạn, Synthetic." })).toBeVisible();
    // Assert across both navigation variants, including the CSS-hidden one.
    await expect(page.locator('a[href="/workspace/?screen=purchase-requests"]')).toHaveCount(0);
    const menu = page.getByRole("navigation", { name: width < 600 ? "Điều hướng nghiệp vụ" : "Điều hướng chính" });
    await menu.getByRole("link", { name: "Đơn đặt hàng mua" }).click();
    await expect(page.getByRole("heading", { name: "Đơn đặt hàng mua", exact: true })).toBeVisible();
    for (const screen of ["purchase-requests", "unknown", "inbound-requests"]) {
      await page.goto(`/workspace/?screen=${screen}`);
      await expect(page.getByRole("heading", { name: "Màn hình không khả dụng trong giao diện đi kèm" })).toBeVisible();
      await expect(page.getByText("Không thể mở không gian làm việc", { exact: true })).toHaveCount(0);
      await page.getByRole("button", { name: "Về tổng quan" }).click();
      await expect(page).toHaveURL("https://127.0.0.1:5186/workspace/");
      await expect(page.getByRole("heading", { name: "Chào bạn, Synthetic." })).toBeVisible();
      await page.reload();
      await expect(page.getByRole("heading", { name: "Chào bạn, Synthetic." })).toBeVisible();
    }
    expect(requests.some(url => /\/api\/(?:documents\/)?(?:purchase-requests|inbound-requests)/.test(url))).toBe(false);
  });
}

test("synthetic malformed workspace reports compatibility without leaking the payload", async ({ page }) => {
  await page.route("**/api/workspace", route => route.fulfill({ status: 200, json: { private: "synthetic-private-detail" } }));
  await page.goto("/workspace/");
  await expect(page.getByRole("heading", { name: "Không thể mở không gian làm việc" })).toBeVisible();
  await expect(page.getByText("Dữ liệu máy chủ không tương thích với giao diện này. Vui lòng liên hệ quản trị viên.")).toBeVisible();
  await expect(page.getByText("synthetic-private-detail")).toHaveCount(0);
  await expect(page.getByText("Không thể kết nối. Kiểm tra mạng rồi thử lại.")).toHaveCount(0);
});
