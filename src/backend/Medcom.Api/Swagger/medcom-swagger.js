/* Medcom documentation client. No credentials, scopes or responses in storage. */
(() => {
  "use strict";
  const root = new URL("../", new URL(".", window.location.href));
  const apiUrl = path => new URL(path, root).href;
  const csrfHeader = "X-CSRF-TOKEN";
  const scopeHeader = "X-Medcom-Read-Scope";
  const hasHeader = (headers, name) => Object.keys(headers).some(key =>
    key.toLowerCase() === name.toLowerCase() && Boolean(headers[key]));

  async function csrf() {
    const response = await fetch(apiUrl("api/auth/csrf"), { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error("Không lấy được token. Hãy tải lại trang.");
    const data = await response.json();
    if (typeof data.token !== "string" || !data.token) throw new Error("Token không hợp lệ.");
    return data.token;
  }

  async function prepareRequest(request) {
    let url = new URL(request.url, window.location.href);
    if (url.origin !== root.origin) throw new Error("Chỉ được gọi API của BE đang mở.");
    // The published contract uses server '/'. Preserve a mounted IIS PathBase
    // in this client without changing the canonical public contract.
    if (root.pathname !== "/" && /^\/(api|health)\//.test(url.pathname)) {
      url = new URL(url.pathname.slice(1) + url.search, root);
    }
    if (!url.pathname.startsWith(root.pathname)) throw new Error("Địa chỉ API không hợp lệ.");
    const path = url.pathname.slice(root.pathname.length);
    if (!/^(api|health)\//.test(path)) throw new Error("Địa chỉ API không hợp lệ.");
    request.url = url.href;
    request.credentials = "same-origin";
    request.headers = request.headers || {};
    const method = (request.method || "GET").toUpperCase();
    const writing = !["GET", "HEAD", "OPTIONS"].includes(method);
    if (writing && url.protocol !== "https:") throw new Error("Cần HTTPS để đăng nhập và ghi dữ liệu.");
    // Preserve a caller's explicit token/scope, including stale values which
    // the backend must reject. Never replay a command or replace its body/key.
    if (writing && !hasHeader(request.headers, csrfHeader)) request.headers[csrfHeader] = await csrf();
    if (path.startsWith("api/") && !path.startsWith("api/auth/")
      && !path.startsWith("api/contracts/") && path !== "api/workspace"
      && !hasHeader(request.headers, scopeHeader)) {
      const workspace = await fetch(apiUrl("api/workspace"), { credentials: "same-origin", cache: "no-store" });
      if (!workspace.ok) throw new Error("Phiên đăng nhập hoặc quyền đã thay đổi. Hãy đăng nhập lại.");
      const scope = workspace.headers.get(scopeHeader);
      if (!scope) throw new Error("Không lấy được phạm vi dữ liệu hiện tại.");
      request.headers[scopeHeader] = scope;
    }
    return request;
  }

  function responseInterceptor(response) {
    // Remove prior response/credential editor state when a session rotates or
    // ends. In particular, do not retain login payloads in Swagger's editor.
    const path = new URL(response.url, window.location.href).pathname;
    if (response.status >= 200 && response.status < 300
      && [apiUrl("api/auth/login"), apiUrl("api/auth/logout")].some(url => new URL(url).pathname === path)) {
      window.location.reload();
    }
    return response;
  }
  function groupDocument(document) {
    for (const [path, item] of Object.entries(document.paths || {})) {
      const segments = path.split("/").filter(Boolean);
      const tag = segments[0] === "health" ? "Hệ thống"
        : segments[1] === "auth" || segments[1] === "workspace" ? "Đăng nhập và phiên"
        : segments[1] === "notifications" ? "Thông báo"
        : segments[1] === "lookups" ? "Chi nhánh"
        : segments[1] === "erp" ? "ERP · " + segments[2]
        : segments[1] === "contracts" ? "Tài liệu API" : "Chứng từ và danh mục";
      for (const [method, operation] of Object.entries(item))
        if (["get", "post", "put", "patch", "delete", "head", "options"].includes(method)) {
          if (!operation.tags?.length) operation.tags = [tag];
          // Browser supplies Origin; interceptors supply CSRF/read scope after
          // Swagger's parameter validation. Keep their server requirements in
          // the canonical contract, rather than requiring manual copying here.
          if (operation.parameters) operation.parameters = operation.parameters.filter(parameter =>
            !(parameter.in === "header" && parameter.name.toLowerCase() === "origin"));
          for (const parameter of operation.parameters || [])
            if (parameter.in === "header" && [csrfHeader.toLowerCase(), scopeHeader.toLowerCase()].includes(parameter.name.toLowerCase()))
              parameter.required = false;
        }
    }
    return document;
  }
  window.MedcomSwagger = { prepareRequest, responseInterceptor, groupDocument };

  window.addEventListener("load", async () => {
    const status = document.getElementById("medcom-status");
    const form = document.getElementById("medcom-login");
    const password = document.getElementById("medcom-password");
    const logout = document.getElementById("medcom-logout");
    let busy = false;
    function setBusy(value) {
      busy = value;
      for (const button of form.querySelectorAll("button")) button.disabled = value;
    }
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (busy) return;
      setBusy(true);
      try {
        const intent = await prepareRequest({ url: apiUrl("api/auth/login"), method: "POST", headers: {} });
        const response = await fetch(intent.url, {
          method: "POST", credentials: "same-origin", cache: "no-store",
          headers: { ...intent.headers, "Content-Type": "application/json" },
          body: JSON.stringify({ username: document.getElementById("medcom-username").value, password: password.value })
        });
        password.value = "";
        if (response.ok) window.location.reload();
        else status.textContent = response.status === 401 ? "Tên đăng nhập hoặc mật khẩu không đúng."
          : "Đăng nhập chưa thành công. Kiểm tra dịch vụ ERP và kết nối HTTPS.";
      } catch { status.textContent = "Không đăng nhập được. Kiểm tra HTTPS và kết nối BE."; }
      finally { password.value = ""; setBusy(false); }
    });
    logout.addEventListener("click", async () => {
      if (busy) return;
      setBusy(true);
      try {
        const intent = await prepareRequest({ url: apiUrl("api/auth/logout"), method: "POST", headers: {} });
        const response = await fetch(intent.url, { method: "POST", credentials: "same-origin", cache: "no-store", headers: intent.headers });
        if (response.ok || response.status === 401) window.location.reload();
        else status.textContent = "Chưa đăng xuất được. Hãy thử lại.";
      } catch { status.textContent = "Không kết nối được BE."; }
      finally { setBusy(false); }
    });
    fetch(apiUrl("api/auth/session"), { credentials: "same-origin", cache: "no-store" })
      .then(async response => {
        if (response.ok) {
          const session = await response.json();
          status.textContent = "Đã đăng nhập: " + (session.displayName || "tài khoản ERP");
        }
      }).catch(() => { status.textContent = "Không kết nối được BE."; });

    try {
      const response = await fetch(apiUrl("api/contracts/openapi.json"), { credentials: "omit", cache: "no-store" });
      if (!response.ok) throw new Error("API contract unavailable");
      // Group only this view's copy and collapse large module/model trees until
      // selected. The public canonical contract and API schemas are unchanged.
      const spec = groupDocument(await response.json());
      window.ui = SwaggerUIBundle({
      spec, url: apiUrl("api/contracts/openapi.json"), dom_id: "#swagger-ui",
      presets: [SwaggerUIBundle.presets.apis], layout: "BaseLayout",
      deepLinking: true, filter: true, displayRequestDuration: true,
      docExpansion: "none", defaultModelsExpandDepth: -1,
      validatorUrl: null, queryConfigEnabled: false, persistAuthorization: false,
      withCredentials: true, requestInterceptor: prepareRequest,
      responseInterceptor
      });
    } catch { status.textContent = "Không tải được tài liệu API. Hãy kiểm tra kết nối BE."; }
  });
})();
