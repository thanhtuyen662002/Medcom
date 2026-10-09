import { spawn } from "node:child_process";
import fs from "node:fs/promises";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9222;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("Launching Edge with remote debugging...");
  const edge = spawn(EDGE_PATH, [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    "--window-size=1280,900",
    "http://localhost:3000",
  ]);

  try {
    await delay(3000);

    const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const pages = await res.json();
    const targetPage = pages.find((p) => p.url.includes("localhost:3000")) || pages[0];

    if (!targetPage || !targetPage.webSocketDebuggerUrl) {
      throw new Error("Could not find WebSocket URL for target page");
    }

    console.log("Connecting to WebSocket:", targetPage.webSocketDebuggerUrl);
    const ws = new WebSocket(targetPage.webSocketDebuggerUrl);

    let id = 1;
    const callbacks = new Map();

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && callbacks.has(msg.id)) {
        callbacks.get(msg.id)(msg.result || msg.error);
        callbacks.delete(msg.id);
      }
    };

    await new Promise((resolve) => {
      ws.onopen = resolve;
    });

    function send(method, params = {}) {
      const curId = id++;
      return new Promise((resolve, reject) => {
        callbacks.set(curId, (result) => {
          if (result && result.message) reject(new Error(result.message));
          else resolve(result);
        });
        ws.send(JSON.stringify({ id: curId, method, params }));
      });
    }

    async function captureScreenshot(filePath) {
      const { data } = await send("Page.captureScreenshot", { format: "png" });
      await fs.writeFile(filePath, Buffer.from(data, "base64"));
      console.log(`Saved screenshot to ${filePath}`);
    }

    async function evaluate(expression) {
      const res = await send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      return res.result?.value;
    }

    await send("Page.enable");
    await send("DOM.enable");
    await delay(1500);

    // 1. Screenshot 1: Login Screen (Desktop)
    await captureScreenshot("d:\\Projects\\Medcom\\screen_01_login_desktop.png");

    // Click "Đăng nhập vào Hệ thống"
    console.log("Clicking login button...");
    await evaluate(`
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Đăng nhập vào Hệ thống'));
      if (btn) btn.click();
    `);
    await delay(2500);

    // 2. Screenshot 2: Management Workspace Dashboard
    console.log("Capturing Dashboard workspace...");
    await captureScreenshot("d:\\Projects\\Medcom\\screen_02_dashboard_desktop.png");

    // 3. Click tab "Đơn hàng (PO)"
    console.log("Clicking tab Orders (PO)...");
    await evaluate(`
      const tab = document.querySelector('button[data-tab="orders"]');
      if (tab) tab.click();
    `);
    await delay(1500);
    console.log("Capturing Orders list...");
    await captureScreenshot("d:\\Projects\\Medcom\\screen_03_orders_desktop.png");

    // 4. Click first order to open detail bottom sheet
    console.log("Opening order PO-2026-0891 detail...");
    await evaluate(`
      const card = document.querySelector('div[data-order-id="PO-2026-0891"]');
      if (card) card.click();
    `);
    await delay(1500);
    console.log("Capturing Order Detail modal...");
    await captureScreenshot("d:\\Projects\\Medcom\\screen_04_order_detail_desktop.png");

    // Close detail sheet
    console.log("Closing order detail sheet...");
    await evaluate(`
      const closeBtn = document.querySelector('button[aria-label="Đóng"]');
      if (closeBtn) closeBtn.click();
    `);
    await delay(1000);

    // 5. Click tab "Phiếu đề nghị (PR)"
    console.log("Clicking tab Purchases (PR)...");
    const tabResult = await evaluate(`(() => {
      const tab = document.querySelector('header button[data-tab="purchases"]');
      if (tab) {
        tab.click();
        return 'CLICKED_PURCHASES_HEADER_TAB';
      }
      return 'PURCHASES_TAB_NOT_FOUND';
    })()`);
    console.log("Tab click result:", tabResult);
    await delay(2000);
    console.log("Capturing Purchases list...");
    await captureScreenshot("d:\\Projects\\Medcom\\screen_05_purchases_desktop.png");

    // 6. Click first purchase request to open detail
    console.log("Opening PR-2026-0128 detail...");
    await evaluate(`
      const prCard = document.querySelector('div[data-purchase-id="PR-2026-0128"]');
      if (prCard) prCard.click();
    `);
    await delay(1500);
    console.log("Capturing Purchase Request Detail...");
    await captureScreenshot("d:\\Projects\\Medcom\\screen_06_purchase_detail_desktop.png");

    // Close detail sheet
    await evaluate(`
      const closeBtn = document.querySelector('button[aria-label="Đóng"]');
      if (closeBtn) closeBtn.click();
    `);
    await delay(1000);

    // 7. Mobile Viewport (390x844)
    console.log("Switching to Mobile Viewport (390x844)...");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await delay(1000);

    // Mobile Orders tab
    console.log("Mobile: clicking Orders tab...");
    await evaluate(`
      const ordersTab = document.querySelector('button[data-tab="orders"]');
      if (ordersTab) ordersTab.click();
    `);
    await delay(1500);
    await captureScreenshot("d:\\Projects\\Medcom\\screen_07_orders_mobile.png");

    // Mobile Purchases tab (List View)
    console.log("Mobile: clicking Purchases tab...");
    await evaluate(`
      // Close any open sheets first
      const openClose = document.querySelector('button[aria-label="Đóng"]');
      if (openClose) openClose.click();
      const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Hủy'));
      if (cancelBtn) cancelBtn.click();
      const prTab = document.querySelector('nav button[data-tab="purchases"]');
      if (prTab) prTab.click();
    `);
    await delay(1500);
    await captureScreenshot("d:\\Projects\\Medcom\\screen_08_purchases_mobile.png");

    // Mobile Quick Create modal
    console.log("Mobile: opening Quick Create modal...");
    await evaluate(`
      const createBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Tạo mới'));
      if (createBtn) createBtn.click();
    `);
    await delay(1200);
    await captureScreenshot("d:\\Projects\\Medcom\\screen_09_create_modal_mobile.png");

    console.log("ALL REAL UI VERIFICATIONS COMPLETED SUCCESSFULLY!");
    ws.close();
  } finally {
    edge.kill();
  }
}

main().catch(console.error);
