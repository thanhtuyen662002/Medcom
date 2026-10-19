import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),output=path.join(app,'.test-runtime/money');
await mkdir(output,{recursive:true});
await build({stdin:{contents:'export * from "./lib/erp/money";export {MoneyInput} from "./components/erp/money-input";export {salesOrderLineDisplay,emptySalesOrderLine,salesOrderLineInput} from "./lib/erp/sales-order-lines";',resolveDir:app,loader:'tsx'},outfile:path.join(output,'fixture.cjs'),bundle:true,platform:'node',format:'cjs',packages:'external',alias:{'@':app},jsx:'automatic',logLevel:'warning'});
const require=createRequire(import.meta.url),{formatMoney,moneyInputToRaw,moneyPasteToRaw,isMoneyField,multiplyMoney,sumMoney,MoneyInput,salesOrderLineDisplay,emptySalesOrderLine,salesOrderLineInput}=require(path.join(output,'fixture.cjs'));

test('Vietnamese money formatting preserves exact decimal strings and nulls',()=>{
 assert.equal(formatMoney('123456789012345678.9012'),'123.456.789.012.345.678,9012');
 assert.equal(formatMoney('-1000000.50'),'-1.000.000,5');
 assert.equal(formatMoney('0.00'),'0');assert.equal(formatMoney(null),'—');assert.equal(formatMoney('', ''),'');
 assert.equal(formatMoney(1e-7),'0,0000001');assert.equal(formatMoney(Infinity),'—');
 assert.equal(isMoneyField('lines.QA.unitPrice'),true);assert.equal(isMoneyField('vATAmountDisplay'),true);
 for(const key of ['vATPercent','quantity','documentId','statusId','rateExchange'])assert.equal(isMoneyField(key),false);
});
test('money entry normalizes Vietnamese decimals without changing precision',()=>{
 assert.equal(moneyInputToRaw('9.876.543,21'),'9876543.21');
 assert.equal(moneyInputToRaw('123456789012345678.9012'),'123456789012345678.9012');
 assert.equal(moneyInputToRaw('1.234.567'),'1234567');assert.equal(moneyInputToRaw('8,5'),'8.5');
 assert.equal(moneyPasteToRaw('1.234'),'1234');assert.equal(moneyPasteToRaw('1,234'),'1.234');assert.equal(moneyPasteToRaw('1234.50'),'1234.50');
 assert.equal(moneyInputToRaw('1000,'),'1000.');assert.equal(moneyInputToRaw(''),'');
 for(const value of ['1,2,3','1.23.456','1e6','NaN','abc'])assert.equal(moneyInputToRaw(value),null);
});
test('draft totals use exact decimal arithmetic instead of rounding money',()=>{
 assert.equal(multiplyMoney('0.1','0.2'),'0.02');
 assert.equal(sumMoney(['0.1','0.2',null]),'0.3');
 assert.equal(multiplyMoney('123456789012345678','2'),'246913578024691356');
 assert.equal(sumMoney(['-1.25','2.50']),'1.25');assert.equal(sumMoney([null,'']),null);
});
test('formatting the existing preview does not change tax arithmetic or raw API values',()=>{
 const line={...emptySalesOrderLine('QA'),itemId:'QA-ITEM',quantity:'2.5',unitPrice:moneyInputToRaw('1.000.000,50'),vATPercent:'8.5'};
 const values=salesOrderLineDisplay(line);
 assert.equal(values.amount,'2500001.25');assert.equal(values.vATAmount,'212500.10625');assert.equal(values.totalAmount,'2712501.35625');
 assert.equal(formatMoney(values.vATAmount),'212.500,10625');
 assert.equal(salesOrderLineInput(line).unitPrice,'1000000.50');assert.equal(salesOrderLineInput(line).vATPercent,'8.5');
 line.quantity='4';assert.equal(salesOrderLineDisplay(line).vATAmount,'340000.17');
});
test('auto-filled preview applies the owner ERP formulas including discount subtraction',()=>{
 const discounted={...emptySalesOrderLine('QA'),itemId:'QA-ITEM',quantity:'10',unitPrice:'1000',discountPercent:'10',vATPercent:'5'};
 const values=salesOrderLineDisplay(discounted);
 assert.equal(values.amount,'10000');
 assert.equal(values.discountAmount,'1000');
 assert.equal(values.vATAmount,'500');
 assert.equal(values.totalAmount,'9500');
 const bare={...emptySalesOrderLine('QA'),itemId:'QA-ITEM',quantity:'2',unitPrice:'1000'};
 const bareValues=salesOrderLineDisplay(bare);
 assert.equal(bareValues.amount,'2000');
 assert.equal(bareValues.discountAmount,'0');
 assert.equal(bareValues.vATAmount,'0');
 assert.equal(bareValues.totalAmount,'2000');
});

const React=require('react'),{create,act}=require('react-test-renderer');globalThis.IS_REACT_ACT_ENVIRONMENT=true;
test('money control formats on blur and emits only canonical values from actual edits',async()=>{
 const writes=[];let renderer;
 function Host(){const [value,setValue]=React.useState('123456789012345678.25');return React.createElement(MoneyInput,{value,onValueChange:next=>{writes.push(next);setValue(next);}});}
 try{
  await act(async()=>{renderer=create(React.createElement(Host));});
  const input=()=>renderer.root.findByType('input');
  assert.equal(input().props.value,'123.456.789.012.345.678,25');
  await act(async()=>input().props.onFocus({}));assert.equal(input().props.value,'123456789012345678.25');assert.deepEqual(writes,[]);
  await act(async()=>input().props.onChange({target:{value:'9.876.543,21'}}));assert.deepEqual(writes,['9876543.21']);
  await act(async()=>input().props.onBlur({}));assert.equal(input().props.value,'9.876.543,21');assert.equal(writes.length,1);
  await act(async()=>input().props.onChange({target:{value:'INVALID'}}));assert.equal(writes.length,1);
  await act(async()=>input().props.onFocus({}));
  await act(async()=>input().props.onPaste({clipboardData:{getData:()=> '1.234'},currentTarget:{selectionStart:0,selectionEnd:10},preventDefault(){}}));
  assert.equal(writes.at(-1),'1234');
  await act(async()=>renderer.update(React.createElement(MoneyInput,{value:'12',maxLength:3,onValueChange:next=>writes.push(next)})));
  const count=writes.length;
  await act(async()=>input().props.onPaste({clipboardData:{getData:()=> '123456'},currentTarget:{selectionStart:0,selectionEnd:2},preventDefault(){}}));
  assert.equal(writes.length,count,'oversized money cannot silently bypass the field budget on paste');
  await act(async()=>renderer.update(React.createElement(MoneyInput,{value:'12',disabled:true,onValueChange:next=>writes.push(next)})));
  await act(async()=>input().props.onChange({target:{value:'99'}}));assert.equal(writes.length,count);
 }finally{if(renderer)await act(async()=>renderer.unmount());}
});
