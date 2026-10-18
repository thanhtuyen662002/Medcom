import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {descriptions,admissions,viDescription,viAdmission} from '../src/lib/vietnamese.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=async file=>JSON.parse(await fs.readFile(path.join(root,file),'utf8'));
const catalog=await read('src/data/catalog.json');
const coverage=await read('contracts/coverage.json');
test('all contract operations have unique reference pages and downloadable index',async()=>{
 const ops=catalog.operations;assert.equal(ops.length,coverage.operations);assert.equal(new Set(ops.map(o=>o.operationId)).size,ops.length);assert.equal(new Set(ops.map(o=>o.slug)).size,ops.length);
 const exported=await read('static/context/operations.json');assert.equal(exported.length,ops.length);
 for(const op of ops){const page=await fs.readFile(path.join(root,'docs/api',op.slug+'.mdx'),'utf8');assert.ok(page.includes(JSON.stringify(op.operationId)));assert.ok(catalog.spec.paths[op.path][op.method.toLowerCase()]);}
});
test('schema references resolve and preserve all request/response definitions',()=>{
 const visit=value=>{if(!value||typeof value!=='object')return;if(value.$ref){assert.ok(value.$ref.startsWith('#/'),'only bundled refs');let target=catalog.spec;for(const part of value.$ref.slice(2).split('/').map(p=>p.replaceAll('~1','/').replaceAll('~0','~')))target=target?.[part];assert.ok(target,'Missing '+value.$ref);}for(const value2 of Object.values(value))visit(value2)};visit(catalog.spec);
 assert.equal(Object.keys(catalog.spec.components.schemas).length,coverage.schemas);
});
test('help hierarchy coverage is exact and features do not invent API modules',async()=>{
 const ids=catalog.helpGroups.flatMap(g=>[...g.guides,...(g.sections||[]).flatMap(s=>s.guides)]);assert.deepEqual(new Set(catalog.modules.map(m=>m.id)),new Set(ids));assert.equal(ids.length,29);
 assert.equal(catalog.modules.filter(m=>m.available).length,19);assert.equal(catalog.modules.filter(m=>!m.available).length,10);
 for(const m of catalog.modules){assert.equal(m.operations.length,catalog.operations.filter(o=>o.module===m.id).length);if(!m.available){const page=await fs.readFile(path.join(root,'docs/modules',m.id+'.mdx'),'utf8');assert.match(page,/UNKNOWN/);assert.ok(!page.includes('Fields & DB'));}}
 assert.ok(!ids.includes('asset-disposal'));assert.ok(!ids.includes('stocktaking'));
 for(const id of ['sales-orders','sales-order-pm','sales-order-sa','sales-qr']){
  assert.notEqual(catalog.modules.find(module=>module.id===id).title,id,'Vietnamese title must survive split help sources');
  const page=await fs.readFile(path.join(root,'docs/modules',id+'.mdx'),'utf8');assert.match(page,/\/docs\/foundation\/sales-flow/);
 }
 const full=await fs.readFile(path.join(root,'static/llms-full.txt'),'utf8');assert.match(full,/SalesCommandSession/);
});
test('exact source hash and context exports match the documented snapshot',async()=>{
 const bytes=await fs.readFile(path.join(root,'contracts/openapi.json'));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),catalog.provenance.sha256);assert.deepEqual(bytes,await fs.readFile(path.join(root,'static/openapi.json')));
 const full=await fs.readFile(path.join(root,'static/llms-full.txt'),'utf8');for(const op of catalog.operations)assert.ok(full.includes('Operation ID: `'+op.operationId+'`'));assert.match(full,/expectedStateToken/);assert.match(full,/idempotencyKey/);assert.match(full,/OutcomeUnknown/);assert.match(full,/PurchaseDate/);
 const provenance=await read('static/context/provenance.json');assert.match(provenance.liveMetadata,/401/);assert.equal(provenance.sourceHashes.length,4);
});
test('technical pages contain no emoji and leave field semantics evidence-bounded',async()=>{
 async function walk(dir){const all=[];for(const entry of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())all.push(...await walk(file));else if(file.endsWith('.mdx'))all.push(file)}return all}
 for(const file of await walk(path.join(root,'docs'))){const text=await fs.readFile(file,'utf8');assert.ok(!/\p{Extended_Pictographic}/u.test(text),'Emoji in '+file);}
 const metadata=await fs.readFile(path.join(root,'docs/foundation/metadata.mdx'),'utf8');assert.match(metadata,/không hứa bao phủ toàn bộ database/);
});
test('all source descriptions and admission conditions have Vietnamese presentation text',()=>{
 const visit=value=>{if(!value||typeof value!=='object')return;if(typeof value.description==='string'){assert.ok(descriptions[value.description],'Missing translation: '+value.description);assert.notEqual(viDescription(value.description),value.description);}for(const nested of Object.values(value))visit(nested)};
 visit(catalog.spec);
 for(const op of catalog.operations){const condition=op['x-medcom-admission'];if(condition){assert.ok(admissions[condition],'Missing admission: '+condition);assert.notEqual(viAdmission(condition),condition);}}
});
test('home is a functional documentation index and does not contain audience slogans',async()=>{
 const home=await fs.readFile(path.join(root,'src/pages/index.jsx'),'utf8');
 for(const phrase of ['Hiểu hệ thống','Xây đúng giao diện','một điểm tham chiếu','AI Agents','DEVELOPER DOCUMENTATION'])assert.ok(!home.includes(phrase));
 assert.match(home,/Phân hệ nghiệp vụ/);assert.match(home,/catalog.helpGroups/);assert.match(home,/Danh mục API/);
 const css=await fs.readFile(path.join(root,'src/css/custom.css'),'utf8');assert.match(css,/"Segoe UI",Roboto,Arial,sans-serif/);assert.ok(!css.includes('@import "./inter.css"'));
});
