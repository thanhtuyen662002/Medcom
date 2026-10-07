import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
const result=await build({stdin:{contents:'export {documentStatusLabel} from "./lib/erp/document-status"; export {rowSchema} from "./lib/erp/contracts";',resolveDir:process.cwd(),loader:"ts"},bundle:true,write:false,platform:"node",format:"esm"});
const {documentStatusLabel,rowSchema}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
test("ERP names are per document type and preserved exactly",()=>{
 for(const label of ["Đã duyệt","Đã sản xuất xong","Yêu cầu thủ kho xem lại"])assert.equal(documentStatusLabel(3,label),label);
 assert.equal(documentStatusLabel(0,"Nháp"),"Nháp");
 assert.equal(documentStatusLabel(0,"Chờ sản xuất"),"Chờ sản xuất");
 assert.equal(documentStatusLabel(1," Nháp ")," Nháp ");
});
test("null, unknown and invalid labels have readable explicit fallbacks",()=>{
 assert.equal(documentStatusLabel(null,"invented"),"Chưa có trạng thái");
 assert.equal(documentStatusLabel(undefined),"Chưa có trạng thái");
 for(const label of [null,undefined,"","  ","bad\0text","bad\ntext","x".repeat(101)])
   assert.equal(documentStatusLabel(999,label),"Trạng thái chưa xác định (mã 999)");
});
test("read contracts accept exact live labels, nullable labels, and older responses",()=>{
 const row={documentId:"SYNTHETIC",documentDate:"2026-10-07",branchId:"QA",statusId:3,isLocked:null};
 for(const statusName of ["Đã duyệt",null,undefined])assert.equal(rowSchema.parse({...row,statusName}).statusName,statusName);
 assert.equal(rowSchema.parse({...row,statusId:null,statusName:null}).statusId,null);
 assert.equal(rowSchema.safeParse({...row,statusName:42}).success,false);
 assert.equal(rowSchema.safeParse({...row,statusName:"x".repeat(101)}).success,false);
});
