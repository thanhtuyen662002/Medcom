import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
const result=await build({stdin:{contents:'export {statusColorStyle,statusColorsFrom} from "./lib/erp/status-colors";',resolveDir:process.cwd(),loader:"ts"},bundle:true,write:false,platform:"node",format:"esm"});
const {statusColorStyle,statusColorsFrom}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
test("cặp màu BE đủ tương phản thì giữ nguyên chữ và nền",()=>{
  assert.deepEqual(statusColorStyle("#000000","#FFFFFF"),{color:"#000000",backgroundColor:"#FFFFFF"});
  assert.deepEqual(statusColorStyle("#FFFFFF","#000000"),{color:"#FFFFFF",backgroundColor:"#000000"});
  assert.deepEqual(statusColorStyle("#0a1B2c","#abcdef"),{color:"#0a1B2c",backgroundColor:"#abcdef"});
  assert.deepEqual(statusColorStyle("  #123456  ","  #FFFF00  "),{color:"#123456",backgroundColor:"#FFFF00"});
});
test("màu chữ của BE không đủ tương phản thì đổi sang đen/trắng theo độ sáng nền",()=>{
  // Trường hợp thực tế: ERP cấu hình chữ vàng đậm trên nền vàng, gần như tàng hình.
  assert.deepEqual(statusColorStyle("#FFC000","#FFFF00"),{color:"#000000",backgroundColor:"#FFFF00"});
  assert.deepEqual(statusColorStyle("#FFFF00","#FFFF00"),{color:"#000000",backgroundColor:"#FFFF00"});
  assert.deepEqual(statusColorStyle("#000080","#000000"),{color:"#FFFFFF",backgroundColor:"#000000"});
  assert.deepEqual(statusColorStyle("#EEEEEE","#DDDDDD"),{color:"#000000",backgroundColor:"#DDDDDD"});
});
test("BE thiếu màu chữ nhưng có màu nền thì badge vẫn phải đọc được",()=>{
  assert.deepEqual(statusColorStyle(null,"#FFFF00"),{color:"#000000",backgroundColor:"#FFFF00"});
  assert.deepEqual(statusColorStyle(null,"#000000"),{color:"#FFFFFF",backgroundColor:"#000000"});
  assert.deepEqual(statusColorStyle(undefined,"#445566"),{color:"#FFFFFF",backgroundColor:"#445566"});
  assert.deepEqual(statusColorStyle("","#e8f5e9"),{color:"#000000",backgroundColor:"#e8f5e9"});
});
test("chỉ có màu chữ thì giữ màu chữ, nhường nền cho giao diện",()=>{
  assert.deepEqual(statusColorStyle("#112233",null),{color:"#112233"});
  assert.deepEqual(statusColorStyle("#112233","#000"),{color:"#112233"});
  assert.deepEqual(statusColorStyle("#112233","nền xấu"),{color:"#112233"});
});
test("màu thiếu hoặc sai định dạng để giao diện dùng màu mặc định",()=>{
  for(const value of [null,undefined,"","   ",0,"#000","#GGGGGG","rgb(0,0,0)","red","##000000","#0000000",42,true]){
    assert.equal(statusColorStyle(value,value),undefined);
    assert.equal(statusColorStyle("#000000",value)?.backgroundColor,undefined);
    assert.equal(statusColorStyle(value,"#FFFF00")?.color,"#000000","nền hợp lệ thì vẫn chọn được màu chữ đọc được");
  }
  assert.equal(statusColorStyle(null,null),undefined);
});
test("statusColorsFrom đọc đúng tên trường BE cung cấp",()=>{
  assert.deepEqual(statusColorsFrom({statusForeColor:"#000000",statusBackColor:"#FFFFFF"}),{color:"#000000",backgroundColor:"#FFFFFF"});
  assert.deepEqual(statusColorsFrom({deliveryStatusForeColor:"#FFFFFF",deliveryStatusBackColor:"#00695C"},"deliveryStatusForeColor","deliveryStatusBackColor"),{color:"#FFFFFF",backgroundColor:"#00695C"});
  assert.deepEqual(statusColorsFrom({statusForeColor:"#123456",statusBackColor:"no"}),{color:"#123456"});
  for(const source of [null,undefined,"Nháp",42,[]])assert.equal(statusColorsFrom(source),undefined);
  assert.equal(statusColorsFrom({}),undefined);
});
