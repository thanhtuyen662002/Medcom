import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
const result=await build({stdin:{contents:'export {statusColorStyle,statusColorsFrom} from "./lib/erp/status-colors";',resolveDir:process.cwd(),loader:"ts"},bundle:true,write:false,platform:"node",format:"esm"});
const {statusColorStyle,statusColorsFrom}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
test("BE opaque #RRGGBB pairs become text and background styles",()=>{
  assert.deepEqual(statusColorStyle("#000000","#FFFFFF"),{color:"#000000",backgroundColor:"#FFFFFF"});
  assert.deepEqual(statusColorStyle("#0a1B2c","#abcdef"),{color:"#0a1B2c",backgroundColor:"#abcdef"});
  assert.deepEqual(statusColorStyle("  #123456  ","#654321"),{color:"#123456",backgroundColor:"#654321"});
});
test("a single resolvable colour still styles its own channel",()=>{
  assert.deepEqual(statusColorStyle("#112233",null),{color:"#112233"});
  assert.deepEqual(statusColorStyle(null,"#445566"),{backgroundColor:"#445566"});
});
test("missing, null or malformed colours leave the interface default",()=>{
  for(const value of [null,undefined,"","   ",0,"#000","#GGGGGG","rgb(0,0,0)","red","##000000","#0000000"]){
    assert.equal(statusColorStyle(value,value),undefined);
    assert.equal(statusColorStyle("#000000",value)?.backgroundColor,undefined);
    assert.equal(statusColorStyle(value,"#000000")?.color,undefined);
  }
  assert.equal(statusColorStyle(null,null),undefined);
});
test("statusColorsFrom reads the documented BE field names and ignores other shapes",()=>{
  assert.deepEqual(statusColorsFrom({statusForeColor:"#010203",statusBackColor:"#040506"}),{color:"#010203",backgroundColor:"#040506"});
  assert.deepEqual(statusColorsFrom({deliveryStatusForeColor:"#0a0b0c",deliveryStatusBackColor:"#0d0e0f"},"deliveryStatusForeColor","deliveryStatusBackColor"),{color:"#0a0b0c",backgroundColor:"#0d0e0f"});
  for(const source of [null,undefined,"Nháp",42,[]])assert.equal(statusColorsFrom(source),undefined);
  assert.equal(statusColorsFrom({}),undefined);
  assert.deepEqual(statusColorsFrom({statusForeColor:"#123456",statusBackColor:"no"}),{color:"#123456"});
});
