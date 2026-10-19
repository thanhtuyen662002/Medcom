import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
const result=await build({stdin:{contents:'export {readDocumentSummary,summaryDisplay} from "./lib/erp/document-summary";',resolveDir:process.cwd(),loader:"ts"},bundle:true,write:false,platform:"node",format:"esm"});
const {readDocumentSummary,summaryDisplay}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
test("đơn hàng bán: tổng tiền lấy từ trường Display của BE, không lặp lại trong lưới",()=>{
  const view=readDocumentSummary({rowCount:12,amount:"1000",vATAmount:"100",totalAmount:"1100",amountDisplay:"1.000 VND",vATAmountDisplay:"100 VND",totalAmountDisplay:"1.100 VND"});
  assert.equal(view.rowCount,12);
  assert.deepEqual(view.entries.map(e=>[e.key,e.display,e.fromServer]),[["amount","1.000 VND",true],["vATAmount","100 VND",true]]);
  assert.equal(view.total.key,"totalAmount");
  assert.equal(view.total.display,"1.100 VND");
  assert.equal(summaryDisplay(view.total,"VND"),"1.100 VND","số của BE đã có tiền tệ, không nối thêm");
});
test("phiếu sửa chữa: amount là tổng, công và vật tư ở lưới",()=>{
  const view=readDocumentSummary({rowCount:3,quantity:"5.5",laborAmount:"200000",partsAmount:"300000",amount:"500000"});
  assert.deepEqual(view.entries.map(e=>e.key),["quantity","laborAmount","partsAmount"]);
  assert.equal(view.total.key,"amount");
  assert.equal(summaryDisplay(view.total,"VND"),"500.000 VND","số FE định dạng được nối tiền tệ chứng từ");
  assert.equal(summaryDisplay(view.entries[0],"VND"),"5,5","số lượng không phải tiền nên không nối tiền tệ");
});
test("màn quét QR chỉ có số dòng và số lượng, không có tổng tiền",()=>{
  const view=readDocumentSummary({rowCount:7,quantity:"21"});
  assert.deepEqual(view.entries.map(e=>e.key),["quantity"]);
  assert.equal(view.total,null);
});
test("số thập phân dài giữ nguyên độ chính xác, không qua Number",()=>{
  const value="999999999999999999999999.1234";
  const view=readDocumentSummary({rowCount:1,totalAmount:value});
  assert.equal(view.total.display,"999.999.999.999.999.999.999.999,1234");
  assert.equal(view.total.fromServer,false);
  assert.equal(summaryDisplay(view.total,"USD"),"999.999.999.999.999.999.999.999,1234 USD");
});
test("không có số liệu đọc được thì trả null để giao diện dùng cách tính tại chỗ",()=>{
  for(const value of [null,undefined,"Tổng","",0,[],{}, {rowCount:"12"}, {amount:"1,234"}, {amount:"1e5"}, {amount:true}])
    assert.equal(readDocumentSummary(value),null);
  assert.deepEqual(readDocumentSummary({rowCount:0}),{rowCount:0,entries:[],total:null});
});
