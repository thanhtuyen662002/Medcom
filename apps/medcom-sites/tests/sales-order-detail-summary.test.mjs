import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(app,'.test-runtime','sales-order-detail-summary');
await mkdir(output,{recursive:true});
const outfile=path.join(output,'fixture.cjs');
await build({
  stdin:{contents:'export {SalesOrderDetailTabs} from "./components/erp/sales-order-detail-tabs";',resolveDir:app,loader:'tsx'},
  outfile,bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic',alias:{'@':app},logLevel:'warning',
});

const require=createRequire(import.meta.url),React=require('react'),{create,act}=require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {SalesOrderDetailTabs}=require(outfile);

const lines=[{lineId:'1',fields:{itemId:'SP01',itemName:'Sản phẩm kiểm thử',unit:'Hộp',quantity:'2',unitPrice:'550',amount:'1100',totalAmount:'1100'}}];
const text=node=>{const out=[];const walk=n=>{if(n==null)return;if(typeof n==='string'||typeof n==='number'){out.push(String(n));return;}if(Array.isArray(n)){n.forEach(walk);return;}if(n.children)walk(n.children);};walk(node);return out.join(' ');};
const summaryBlocks=renderer=>renderer.root.findAll(node=>node.props&&node.props['data-document-summary']!==undefined);

test('thẻ chi tiết đơn hàng hiển thị tổng toàn chứng từ từ data.summary',async()=>{
  let renderer;
  await act(async()=>{renderer=create(React.createElement(SalesOrderDetailTabs,{
    lines,history:[],currencyId:'VND',
    summary:{rowCount:12,amount:'1000',vATAmount:'100',totalAmount:'1100',totalAmountDisplay:'1.100 VND'},
  }));});
  const blocks=summaryBlocks(renderer);
  assert.equal(blocks.length,1,'khối tổng phải hiển thị khi BE trả data.summary');
  const body=text(blocks[0]);
  assert.match(body,/Số tiền/);
  assert.match(body,/Tiền thuế/);
  assert.match(body,/12\s+dòng toàn chứng từ/,'số dòng lấy toàn chứng từ, không phải số dòng đang tải');
  assert.match(body,/1\.100 VND/,'tổng tiền ưu tiên trường Display của BE');
  assert.equal(renderer.root.findAll(node=>node.props&&node.props['data-document-summary']!==undefined&&text(node).includes('Tổng tiền')).length,0,'không lặp lại tổng trong lưới số liệu');
  await act(async()=>renderer.unmount());
});

test('chưa có data.summary thì thẻ chi tiết giữ nguyên như trước',async()=>{
  let renderer;
  await act(async()=>{renderer=create(React.createElement(SalesOrderDetailTabs,{lines,history:[],currencyId:'VND'}));});
  assert.equal(summaryBlocks(renderer).length,0);
  assert.match(text(renderer.root),/\d+\s+dòng hàng đã tải/);
  await act(async()=>renderer.unmount());
});
