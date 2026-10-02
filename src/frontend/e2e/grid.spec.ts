import { test, expect, type Page } from "@playwright/test";

// Browser contract tests of the actual packaged FE. Synthetic API responses
// prove UI/cache/focus behavior only; legacy SQL, DLL and real-host admission are separate.
const documentRow = (id: string, branchId = "branch-a") => ({ documentId: id, documentDate: "2026-10-02", branchId, statusId: 1, isLocked: false });
const session = (version = 1) => ({ displayName: "Người kiểm thử", tenantId: "test-tenant", companyId: "test-company",
  companyName: "Công ty kiểm thử", authorityVersion: version, capabilities: ["purchase-orders.read", "inbound-requests.read"],
  idleExpiresAt: new Date(Date.now() + 3600000).toISOString(), absoluteExpiresAt: new Date(Date.now() + 86400000).toISOString() });
async function workspace(page: Page, version = () => 1) {
  await page.route("**/api/workspace", route => route.fulfill({ json: { session: session(version()), branchIds: ["branch-a", "branch-b"],
    navigation: [{ id: "purchase-orders", label: "Đơn đặt hàng mua", href: "/workspace/?screen=purchase-orders" },
      { id: "inbound-requests", label: "Yêu cầu nhập kho", href: "/workspace/?screen=inbound-requests" }] } }));
  await page.route("**/api/documents/*/detail?*", route => {
    const url = new URL(route.request().url());
    const purchase = url.pathname.includes("purchase-orders");
    return route.fulfill({ json: { document: documentRow(url.searchParams.get("documentId")!),
      purchaseOrderLines: purchase ? [{ lineId: "line-1", itemId: "item-1", quantity: "999999999999999999999999.1234", quantity2: null }] : [],
      inboundRequestLines: purchase ? [] : [{ lineId: "line-1", itemId: "item-1", setQuantityByDocument: "999999999999999999999999.1234",
        barrelQuantityByDocument: null, setQuantityByReal: "0.0001", barrelQuantityByReal: "-1.0000" }],
      page: Number(url.searchParams.get("page")), pageSize: 50, hasMore: false } });
  });
  await page.route("**/api/documents/*?*", route => {
    if (new URL(route.request().url()).pathname.endsWith("/detail")) return route.fallback();
    const url = new URL(route.request().url());
    const pageNumber = Number(url.searchParams.get("page"));
    const search = url.searchParams.get("search");
    const branch = url.searchParams.get("branchId") || "branch-a";
    return route.fulfill({ json: { rows: Array.from({ length: 50 }, (_, index) => documentRow(`${search || "DOC"}-${pageNumber}-${index + 1}`, branch)),
      page: pageNumber, pageSize: 50, hasMore: pageNumber === 1 } });
  });
  await page.goto("/workspace/?screen=purchase-orders");
  await expect(page.getByRole("grid", { name: "Đơn đặt hàng mua, trang 1", exact: true })).toBeVisible();
}

test("roving cell navigation, bounded endpoints, Tab exit and detail focus restoration", async ({ page }) => {
  await workspace(page);
  const grid = page.getByRole("grid", { name: "Đơn đặt hàng mua, trang 1", exact: true });
  await expect(grid.locator('[role="gridcell"][tabindex="0"]')).toHaveCount(1);
  await expect(grid.getByRole("row")).toHaveCount(51);
  const first = grid.getByRole("gridcell").first();
  await first.focus();
  await page.keyboard.press("ArrowRight");
  await expect(grid.getByRole("gridcell").nth(1)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(grid.getByRole("gridcell").nth(6)).toBeFocused();
  await page.keyboard.press("Control+End");
  await expect(grid.getByRole("gridcell").last()).toBeFocused();
  await page.keyboard.press("Control+Home");
  await expect(first).toBeFocused();
  await page.keyboard.press("Enter");
  const detail = page.getByRole("heading", { name: "Chi tiết hàng hóa · DOC-1-1", exact: true });
  await expect(detail).toBeFocused();
  await expect(page.getByRole("gridcell", { name: "999999999999999999999999.1234", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(detail).toHaveCount(0);
  await expect(first).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Trang sau", exact: true })).toBeFocused();
});

test("column hide, reorder, keyboard resize, density, reset and frozen identity", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 900 });
  await workspace(page);
  const grid = page.getByRole("grid", { name: "Đơn đặt hàng mua, trang 1", exact: true });
  await page.getByText("Tùy chỉnh cột", { exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Hiển thị Số chứng từ", exact: true })).toBeDisabled();
  await page.getByRole("checkbox", { name: "Hiển thị Mã trạng thái", exact: true }).uncheck();
  await expect(grid.getByRole("columnheader", { name: "Mã trạng thái", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Đưa Chi nhánh sang trái", exact: true }).click();
  await expect(grid.getByRole("columnheader").nth(1)).toHaveText("Chi nhánh");
  const width = page.getByRole("slider", { name: "Độ rộng Chi nhánh", exact: true });
  await width.focus(); await page.keyboard.press("ArrowRight");
  await expect(width).toHaveValue("190");
  const before = await grid.getByRole("row").nth(1).evaluate(element => element.getBoundingClientRect().height);
  await page.getByRole("checkbox", { name: "Dòng gọn", exact: true }).check();
  expect(await grid.getByRole("row").nth(1).evaluate(element => element.getBoundingClientRect().height)).toBeLessThan(before);
  await page.getByRole("button", { name: "Khôi phục bố cục", exact: true }).click();
  await expect(grid.getByRole("columnheader").nth(1)).toHaveText("Ngày chứng từ");
  await expect(grid.getByRole("columnheader")).toHaveCount(5);
  await expect(page.getByRole("checkbox", { name: "Dòng gọn", exact: true })).not.toBeChecked();
  const cell = grid.getByRole("gridcell").first();
  const left = await cell.evaluate(element => element.getBoundingClientRect().left);
  await grid.locator("..").evaluate(element => { element.scrollLeft = 300; });
  expect(await grid.locator("..").evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  expect(await cell.evaluate(element => element.getBoundingClientRect().left)).toBeCloseTo(left, 0);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
});

test("server pagination, search and branch changes close detail and restore a useful focus", async ({ page }) => {
  await workspace(page);
  await page.getByRole("button", { name: "Trang sau", exact: true }).click();
  let grid = page.getByRole("grid", { name: "Đơn đặt hàng mua, trang 2", exact: true });
  await expect(grid.getByRole("gridcell").first()).toBeFocused();
  await expect(grid.getByRole("gridcell").first()).toHaveText("DOC-2-1");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Chi tiết hàng hóa · DOC-2-1", exact: true })).toBeFocused();
  await page.getByLabel("Tìm số chứng từ", { exact: true }).fill("FILTER");
  await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Chi tiết hàng hóa/ })).toHaveCount(0);
  grid = page.getByRole("grid", { name: "Đơn đặt hàng mua, trang 1", exact: true });
  await expect(grid.getByRole("gridcell").first()).toHaveText("FILTER-1-1");
  await expect(grid.getByRole("gridcell").first()).toBeFocused();
  await page.getByLabel("Chi nhánh", { exact: true }).selectOption("branch-b");
  await expect(grid.getByRole("gridcell").nth(2)).toHaveText("branch-b");
  await expect(grid.getByRole("gridcell").first()).toBeFocused();
});

test("authority refresh destroys old detail and local draft before rendering new scope", async ({ page }) => {
  let version = 1;
  await workspace(page, () => version);
  await page.getByRole("button", { name: "Xem chi tiết DOC-1-1", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Chi tiết hàng hóa · DOC-1-1", exact: true })).toBeVisible();
  await page.getByLabel("Tìm số chứng từ", { exact: true }).fill("old-scope-draft");
  version = 2;
  // An actual focus event triggers the existing QueryClient authority refresh.
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  // TanStack uses visibilitychange rather than focus in its current browser manager.
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByLabel("Tìm số chứng từ", { exact: true })).toHaveValue("");
  await expect(page.getByRole("heading", { name: /Chi tiết hàng hóa/ })).toHaveCount(0);
  await expect(page.getByRole("gridcell", { name: "999999999999999999999999.1234", exact: true })).toHaveCount(0);
});

test("403 while reading details hides the cached parent list; failed retry cannot restore it", async ({ page }) => {
  await workspace(page);
  await page.route("**/api/documents/purchase-orders/detail?*", route => route.fulfill({ status: 403, json: { code: "forbidden" } }));
  await page.getByRole("button", { name: "Xem chi tiết DOC-1-1", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Quyền xem chứng từ đã thay đổi" })).toBeVisible();
  await expect(page.getByRole("grid")).toHaveCount(0);
  await page.route("**/api/documents/purchase-orders?*", route => route.fulfill({ status: 403, json: { code: "forbidden" } }));
  await page.getByRole("button", { name: "Làm mới", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Quyền xem chứng từ đã thay đổi" })).toBeVisible();
  await expect(page.getByText("DOC-1-1", { exact: true })).toHaveCount(0);
});

test("mobile wide line grid preserves exact values and confines horizontal scrolling", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await workspace(page);
  await page.getByRole("navigation", { name: "Điều hướng nghiệp vụ", exact: true }).getByRole("link", { name: "Yêu cầu nhập kho", exact: true }).click();
  await expect(page.getByRole("grid", { name: "Yêu cầu nhập kho, trang 1", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Xem chi tiết DOC-1-1", exact: true }).click();
  const grid = page.getByRole("grid", { name: "Dòng hàng chứng từ DOC-1-1, trang 1", exact: true });
  await expect(grid.getByRole("gridcell", { name: "999999999999999999999999.1234", exact: true })).toBeVisible();
  await expect(grid.getByRole("gridcell", { name: "—", exact: true })).toHaveCount(1);
  const first = grid.getByRole("gridcell").first();
  await first.focus(); await page.keyboard.press("Control+End");
  await expect(grid.getByRole("gridcell").last()).toBeFocused();
  await expect(grid.getByRole("gridcell").last()).toBeInViewport();
  const bounds = await grid.getByRole("gridcell").last().evaluate(element => {
    const cell = element.getBoundingClientRect();
    const scroller = element.closest('table')!.parentElement!.getBoundingClientRect();
    return { left: cell.left, right: cell.right, viewportLeft: scroller.left, viewportRight: scroller.right };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(bounds.viewportLeft - 1);
  expect(bounds.right).toBeLessThanOrEqual(bounds.viewportRight + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("grid-mobile.png"), fullPage: true });
});
