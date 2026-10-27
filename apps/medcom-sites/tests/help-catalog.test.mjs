import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdir,readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(app,'.test-runtime/help-catalog');
await mkdir(output,{recursive:true});
await build({entryPoints:[path.join(app,'lib/help/guides.ts')],outfile:path.join(output,'guides.cjs'),bundle:true,platform:'node',format:'cjs',logLevel:'warning'});
const {helpGuides,helpGroups,groupGuideIds,searchGuides}=createRequire(import.meta.url)(path.join(output,'guides.cjs'));
await build({entryPoints:[path.join(app,'lib/help/screen-guides.ts')],outfile:path.join(output,'screen-guides.cjs'),bundle:true,platform:'node',format:'cjs',logLevel:'warning'});
const {screenGuideIds,screenGuideId}=createRequire(import.meta.url)(path.join(output,'screen-guides.cjs'));

test('help is embedded per screen: every ready guide belongs to a screen and no global help link remains',async()=>{
 const ready=helpGuides.filter(guide=>guide.available).map(guide=>guide.id).sort();
 assert.deepEqual([...Object.values(screenGuideIds)].sort(),ready);
 assert.equal(screenGuideId('purchase-requests'),'purchase-requests');
 assert.equal(screenGuideId('inbound-requests'),undefined);assert.equal(screenGuideId('toString'),undefined);
 const header=await readFile(path.join(app,'components/app/screen-header.tsx'),'utf8');
 assert.match(header,/<ScreenHelp screen=\{helpScreen\}/);
 assert.match(await readFile(path.join(app,'components/untitledui/tab-erp-screen.tsx'),'utf8'),/helpScreen=\{module\}/);
 for(const file of ['components/untitledui/desktop-sidebar.tsx','components/untitledui/sidebar-drawer.tsx','components/untitledui/desktop-header.tsx','components/app/app-navigation.tsx'])
  assert.doesNotMatch(await readFile(path.join(app,file),'utf8'),/href=["{`]\/help|SalesFeatureLinks/,file);
 assert.match(await readFile(path.join(app,'app/help/page.tsx'),'utf8'),/redirect\("\/"\)/);
});

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

test('every ready guide has current desktop/mobile evidence and obsolete images are removed',async()=>{
 const manifest=JSON.parse(await readFile(path.join(app,'public/help/images/manifest.json'),'utf8'));
 assert.equal(manifest.kind,'production-components-with-synthetic-offline-transport');
 assert.equal(manifest.realErpData,false);assert.equal(manifest.backendRequests,false);assert.equal(manifest.businessWrites,false);assert.deepEqual(manifest.errors,[]);
 const expected=new Set();
 for(const guide of helpGuides.filter(guide=>guide.available)){
  assert.ok(guide.sections.filter(section=>section.images).length>=2,guide.id+' needs illustrations');
  for(const section of guide.sections.filter(section=>section.images))for(const device of ['desktop','mobile']){
   const picture=section.images[device];expected.add(picture.src);
   const evidence=manifest.images.find(row=>row.src===picture.src);
   assert.ok(evidence,`Missing capture evidence: ${picture.src}`);assert.equal(evidence.device,device);
   assert.equal(picture.width,evidence.width);assert.equal(picture.height,evidence.height);assert.ok(evidence.annotations>0);
   const bytes=await readFile(path.join(app,'public',picture.src));
   assert.equal(createHash('sha256').update(bytes).digest('hex'),evidence.sha256);
   assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
  }
 }
 assert.equal(expected.size,58);assert.equal(manifest.images.length,58);
 const files=(await readdir(path.join(app,'public/help/images'))).filter(name=>name!=='manifest.json').map(name=>'/help/images/'+name);
 assert.deepEqual([...files].sort(),[...expected].sort(),'No obsolete or unreferenced screenshots');
 for(const file of ['lib/help/guides.ts','lib/help/sales-guides.ts','components/help/guide-article.tsx','components/help/screen-help.tsx']){
  const source=await readFile(path.join(app,file),'utf8');assert.doesNotMatch(source,/\p{Extended_Pictographic}/u);
  assert.doesNotMatch(source,/Đọc ngay khi thao tác|Mở hướng dẫn ở một tab khác/);
 }
});
