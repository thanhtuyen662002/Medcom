import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SALES_ORDER_SAVE_KEYS,buildSalesOrderSaveHeader,toSaveDate,normBaseDate} from '../.test-runtime/erp-tests/sales-order-form.js';

const edit={documentDate:'2026-10-14',contractId:'HD01',managerId:'',employeeId:'NV01',objectId:'105020-007',deliverDate:'',memo:'Xuat ban',ghiChuDonHang:'',linkId:'',documentUrl:''};

test('save header carries the exact backend DTO key set',()=>{
 const header=buildSalesOrderSaveHeader({},edit);
 assert.deepEqual([...Object.keys(header)].sort(),[...SALES_ORDER_SAVE_KEYS].sort());
});

test('save header drops display companions and normalizes types',()=>{
 const base={documentId:'DMB1026/0050',branchId:'MB',statusId:2,statusName:'Don nhap',objectName:'BENH VIEN',isLocked:false,documentDate:'2026-10-14T00:00:00',rateExchange:'26700',isOrder:1,isVAT:0,minutesNumber:'',currencyId:'',baseTotal:'100.5'};
 const header=buildSalesOrderSaveHeader(base,edit);
 for(const key of ['documentId','branchId','statusId','statusName','objectName','isLocked'])assert.equal(key in header,false);
 assert.equal(header.documentDate,'2026-10-14T00:00:00.000');
 assert.equal(header.rateExchange,26700);
 assert.equal(header.isOrder,true);
 assert.equal(header.isVAT,false);
 assert.equal(header.minutesNumber,null);
 assert.equal(header.currencyId,'VND');
 assert.equal(header.objectId,'105020-007');
});

test('date helpers format exactly like the ERP wall clock',()=>{
 assert.equal(toSaveDate('2026-10-14'),'2026-10-14T00:00:00.000');
 assert.equal(toSaveDate(''),null);
 assert.equal(normBaseDate('2026-10-14T00:00:00'),'2026-10-14T00:00:00.000');
 assert.equal(normBaseDate(null),null);
});
