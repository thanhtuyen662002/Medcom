// This module is substituted only by capture-help-images.mjs, never by the app.
// All identities and records below are synthetic. Every write is rejected.
export const titles = {
  'purchase-requests': 'Đề nghị mua hàng', 'purchase-approvals': 'Duyệt đề nghị mua hàng', 'purchase-orders': 'Đặt mua hàng',
  'sales-orders': 'Quản lý đơn hàng', 'sales-order-pm': 'PM xử lý đơn hàng', 'sales-order-sa': 'SA xử lý đơn hàng', 'sales-qr': 'Xuất hàng theo PXK',
};
const action = (id, caption) => ({ id, caption, visible: true, enabled: true, reason: null, requiresSavedDocument: true, route: null });
const statuses = [{ id: '-1', label: 'Mới lập' }, { id: '11', label: 'Yêu cầu NVKD xem lại' }, { id: '12', label: 'Chờ PM xác nhận' }, { id: '14', label: 'Chờ SA xử lý' }];
const documentId = module => module === 'sales-qr' ? 'PXK-MINH-HOA-001' : module.startsWith('sales-') ? 'DH-MINH-HOA-001' : module === 'purchase-orders' ? 'PO-MINH-HOA-001' : 'PR-MINH-HOA-001';
const header = module => ({ documentDate: '2026-10-19', purchaseDate: '2026-10-19', documentDateDisplay: '19/10/2026',
  branchId: 'DEMO', branchName: 'Chi nhánh minh họa', personSuggest: 'Người đề nghị minh họa', department: 'Bộ phận minh họa',
  objectId: 'KH-DEMO', objectName: module === 'purchase-orders' ? 'Nhà cung cấp minh họa' : 'Khách hàng minh họa', address: 'Địa chỉ minh họa',
  employeeId: 'NV-DEMO', employeeName: 'Nhân viên minh họa', managerId: 'QL-DEMO', managerName: 'Quản lý minh họa', contractId: 'HD-DEMO', contractName: 'Hợp đồng minh họa',
  currencyId: 'VND', rateExchange: '1', purposeName: 'Mua vật tư minh họa', statusId: module === 'purchase-approvals' ? 2 : module === 'sales-order-pm' ? 12 : module === 'sales-order-sa' ? 14 : module === 'sales-orders' ? -1 : 1,
  statusName: module === 'purchase-approvals' ? 'Chờ duyệt' : module === 'sales-order-pm' ? 'Chờ PM xác nhận' : module === 'sales-order-sa' ? 'Chờ SA xử lý' : 'Mới lập',
  isLocked: false, memo: 'Kiểm tra thời gian giao và thông tin hàng hóa trước khi chuyển bước.', ghiChuDonHang: 'Nội dung hướng dẫn; dữ liệu minh họa.', deliverDate: '2026-10-26', userCreate: 'TAI-KHOAN-DEMO' });
const line = { lineId: 'DEMO-LINE-1', fields: { itemId: 'HH-DEMO-01', itemCode: 'HH-DEMO-01', itemName: 'Vật tư xét nghiệm minh họa', unit: 'Hộp', unit2: 'Hộp', model: 'MODEL-DEMO',
  budget: '500000', timeRequired: '7', quantity: '2', quantity2: '2', unitPrice: '150000', amount: '300000', totalPrice: '300000', totalAmount: '300000', coefficient: '1', discountPercent: '0', discountAmount: '0', vATPercent: '0', vATAmount: '0', notes: 'Hàng hóa minh họa', barcode: 'QR-DEMO-001' } };
const actions = module => module === 'purchase-approvals' ? [action('approve', 'Duyệt'), action('reject', 'Không duyệt')]
  : module === 'sales-order-pm' ? [action('send-sa', 'Gửi SA'), action('reject', 'Trả lại')]
  : module === 'sales-order-sa' ? [action('send-accounting', 'Gửi Kế toán'), action('send-tech', 'Gửi Kỹ thuật'), action('return-step', 'Gửi về bước trước'), action('reject', 'Trả lại')]
  : module === 'sales-qr' ? [action('scan-add', 'Quét thêm mã QR'), action('scan-delete', 'Quét xóa mã QR')]
  : module === 'sales-orders' ? [action('save', 'Sửa'), action('send-pm', 'Gửi PM'), action('recall', 'Thu hồi để sửa'), action('delete', 'Xóa đơn hàng')]
  : [action('save', 'Sửa thông tin'), action('submit', 'Gửi đề nghị'), action('send-purchase-order', 'Gửi đặt mua hàng'), action('delete', 'Xóa chứng từ')];
export const blockedWrite = async () => { globalThis.__helpWrites = (globalThis.__helpWrites ?? 0) + 1; throw Error('Guide capture cannot perform writes'); };
export const erpClient = {
  async getScreenMetadata(module) { return { id: module, caption: titles[module], fields: {}, lookups: [], actions: [], evidence: 'synthetic-guide-fixture' }; },
  async getErpModuleActions(module) { return ['purchase-requests', 'sales-orders'].includes(module) ? [action('create', 'Tạo mới')] : []; },
  async getErpModuleList(module, query) { return { rows: [0, 1, 2].map(index => ({ documentId: index ? documentId(module).replace('001', '00' + (index + 1)) : documentId(module), branchId: 'DEMO', header: header(module) })), page: query.page ?? 1, pageSize: query.pageSize ?? 20, hasMore: false }; },
  async getErpModuleDetail(module, query) { return { documentId: query.documentId, branchId: 'DEMO', stateToken: 'synthetic-only', header: header(module), lines: { rows: [line], page: 1, hasMore: false },
    history: { rows: [{ lineId: 'LOG-DEMO-001', fields: { userName: 'Người gửi minh họa', sendTo: 'PM minh họa', thoiGianDisplay: '19/10/2026 09:30', statusId: 12, statusName: 'Chờ PM xác nhận', notes: 'Vui lòng kiểm tra nội dung trước khi chuyển SA.' } }], page: 1, hasMore: false },
    comparison: module === 'sales-qr' ? { rows: [{ lineId: 'COMPARE-DEMO', fields: { itemId: 'HH-DEMO-01', itemName: 'Vật tư xét nghiệm minh họa', quantity: '2', scannedQuantity: '1' } }], page: 1, hasMore: false } : null, sections: null, actions: actions(module) }; },
  async getLookupOptions(module, query) {
    const id = query.lookupId;
    if (id === 'header.StatusID') return { items: statuses.map(value => ({ ...value, fields: { StatusID: value.id, StatusName: value.label } })), page: 1, hasMore: false, requiredParameters: [] };
    const choice = id.includes('PersonSuggest') ? { id: 'NGUOI-DEMO', label: 'Người đề nghị minh họa' }
      : id.includes('Department') ? { id: 'BP-DEMO', label: 'Bộ phận minh họa' }
      : id.includes('ObjectID') ? { id: 'KH-DEMO', label: 'Khách hàng minh họa', fields: { ObjectName: 'Khách hàng minh họa', Address: 'Địa chỉ minh họa', TaxCode: 'MA-SO-MINH-HOA' } }
      : id.includes('ContractID') ? { id: 'HD-DEMO', label: 'Hợp đồng minh họa', fields: { ContractName: 'Hợp đồng minh họa', ObjectID: 'KH-DEMO', EmployeeID: 'NV-DEMO' } }
      : id.includes('EmployeeID') ? { id: 'NV-DEMO', label: 'Nhân viên minh họa', fields: { EmployeeName: 'Nhân viên minh họa' } }
      : id.includes('ManagerID') ? { id: 'QL-DEMO', label: 'Quản lý minh họa' }
      : id.includes('CurrencyID') ? { id: 'VND', label: 'Việt Nam đồng', fields: { RateExchange: 1 } }
      : id.includes('ItemID') ? { id: 'HH-DEMO-01', label: 'Vật tư xét nghiệm minh họa', fields: { ItemID: 'HH-DEMO-01', ItemCode: 'HH-DEMO-01', ItemName: 'Vật tư xét nghiệm minh họa', Unit: 'Hộp', Unit2: 'Hộp', Coefficient: '1', Price: '150000', UnitPrice: '150000' } }
      : { id: 'MD-DEMO', label: 'Mục đích minh họa' };
    return { items: [choice], page: 1, hasMore: false, requiredParameters: [] };
  },
  async getPmOptions() { return { items: [{ id: 'PM-DEMO', label: 'PM minh họa', fields: {} }], page: 1, hasMore: false, requiredParameters: [] }; },
  async getActionOptions() { return { items: [{ id: '12', label: 'Gửi về PM kiểm tra', fields: {} }], page: 1, hasMore: false, requiredParameters: [] }; },
  async getItemPrice() { return { unitPrice: '150000', currencyId: 'VND' }; },
  createDocument: blockedWrite, executeWorkflowAction: blockedWrite, saveDocument: blockedWrite, deleteDocument: blockedWrite, scanQr: blockedWrite, lookupCommand: blockedWrite,
};
