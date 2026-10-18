import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(app,'.test-runtime/help-catalog');
await mkdir(output,{recursive:true});
await build({entryPoints:[path.join(app,'lib/help/guides.ts')],outfile:path.join(output,'guides.cjs'),bundle:true,platform:'node',format:'cjs',logLevel:'warning'});
const {helpGuides,helpGroups,groupGuideIds,searchGuides}=createRequire(import.meta.url)(path.join(output,'guides.cjs'));

test('sales documentation covers supported screens and preserves unsupported Feature steps',()=>{
 const ids=helpGroups.flatMap(groupGuideIds);
 assert.equal(new Set(ids).size,29);assert.deepEqual([...ids].sort(),helpGuides.map(guide=>guide.id).sort());
 assert.equal(helpGuides.filter(guide=>guide.available).length,7);
 const sales=helpGroups.find(group=>group.id==='sales');
 assert.deepEqual(sales.guides,['sales-orders','sales-order-pm','sales-order-sa','sales-goods-status','sales-dispatch-invoices','sales-qr']);
 for(const id of sales.guides){
  const guide=helpGuides.find(guide=>guide.id===id);
  if(['sales-goods-status','sales-dispatch-invoices'].includes(id))assert.equal(guide.available,false);
  else{assert.equal(guide.available,true);assert.ok(guide.sections.length>=3);assert.equal(new Set(guide.sections.map(section=>section.id)).size,guide.sections.length);}
 }
 assert.ok(searchGuides('gui ke toan').some(guide=>guide.id==='sales-order-sa'));
 assert.ok(searchGuides('thu hoi').some(guide=>guide.id==='sales-orders'));
});
