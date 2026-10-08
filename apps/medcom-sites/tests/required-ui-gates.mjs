// Required composed and focused browser gates. Run sequentially: each harness
// owns its output and may compile shared source. Missing browsers, skipped tests,
// failed child processes and absent/incomplete JSON evidence are hard failures.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {accessSync,constants,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(app,'.test-runtime','integrated-ui-gates');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const widths=values=>assert.deepEqual(values.map(value=>value.width).sort((a,b)=>a-b),[390,1280]);
const emptyErrors=value=>assert.deepEqual(value.errors,[],'Browser evidence must have no errors');
const nonempty=value=>assert.ok(typeof value==='string'&&value.length>0);
const gates=[
 {name:"record-dialog-i50",file:"record-dialog.browser.mjs",evidence:".test-runtime/i50-record-browser/evidence.json",validate(value){assert.equal(value.status,"PASS");emptyErrors(value);assert.deepEqual(value.results.map(result=>result.width),[390,1280]);assert.ok(value.results.every(result=>result.status==="PASS"));}},
 {name:'workspace-auth-gate',file:'workspace-auth-gate.browser.mjs',evidence:'.test-runtime/i44-browser/result.json',validate(value){
  assert.equal(value.status,'PASS');widths(value.evidence);value.evidence.forEach(emptyErrors);
 }},
 {name:'request-detail-dialog',file:'request-detail-dialog.browser.mjs',evidence:'.test-runtime/i43-detail-dialog/browser-evidence.json',validate(value){
  emptyErrors(value);assert.equal(value.results.length,13);assert.ok(value.results.every(result=>result.result==='PASS'));
 }},
 {name:'request-qr-search',file:'request-qr-search.browser.mjs',direct:true,evidence:'.test-runtime/i47-request-qr/browser-receipt.json',validate(value){
  assert.equal(value.passed,7);assert.equal(value.failed,0);nonempty(value.browser);nonempty(value.node);
  assert.ok(value.cameraCalls>0&&value.stops>0);assert.equal(value.physicalCameraAcceptance,'NOT_RUN');
 }},
 {name:'purchase-reference-context',file:'purchase-reference-context.browser.mjs',evidence:'.test-runtime/i48-browser/lifetime-call-count.json',validate(value){
  emptyErrors(value);widths(value.results);assert.ok(value.calls.length>0&&value.calls.every(call=>call.method==='GET'));
 }},
 {name:'workspace-auth-integration',file:'workspace-auth-integration.browser.mjs',evidence:'.test-runtime/workspace-auth-integration/browser-result.json',validate(value){
  assert.equal(value.passed,true);nonempty(value.browser);nonempty(value.node);
  assert.equal(value.results.length,52);assert.ok(value.results.every(result=>typeof result==='string'&&result.length>0));assert.ok(value.evidence.length>0);
 }},
 {name:'request-detail-history',file:'request-detail-history.browser.mjs',evidence:'.test-runtime/request-detail-history/evidence.json',validate(value){
  assert.equal(value.status,'passed');assert.equal(value.passed,true);emptyErrors(value);nonempty(value.browserVersion);
  assert.equal(value.results.length,28);assert.ok(value.results.every(result=>typeof result==='string'&&result.length>0));assert.ok(value.sourceHashes&&Object.keys(value.sourceHashes).length>0);assert.ok(Object.values(value.sourceHashes).every(hash=>/^[a-f0-9]{64}$/.test(hash)));
 }},
];
mkdirSync(output,{recursive:true});
const results=[];let failure=null;
try{
 // Clear required receipts before all preflight, including browser failure.
 for(const gate of gates)rmSync(path.join(app,gate.evidence),{force:true});
 assert.equal(process.versions.node.split('.')[0],'24','Required UI gates use the locked Node24 toolchain');
 const executable=process.env.MEDCOM_EDGE_PATH??(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':'/usr/bin/chromium');
 accessSync(executable,constants.X_OK);
 const env={...process.env,MEDCOM_EDGE_PATH:executable,QR_TEST_BROWSER:executable,
  I44_EVIDENCE_DIR:path.join(app,'.test-runtime/i44-browser'),I48_EVIDENCE_DIR:path.join(app,'.test-runtime/i48-browser'),
  MEDCOM_AUTH_EVIDENCE_DIR:path.join(app,'.test-runtime/workspace-auth-integration'),MEDCOM_HISTORY_EVIDENCE_DIR:path.join(app,'.test-runtime/request-detail-history'),
  REQUEST_QR_TEST_EVIDENCE_DIRECTORY:path.join(app,'.test-runtime/i47-request-qr')};
 // A preceding successful run is never evidence for the current source.
 for(const gate of gates)accessSync(path.join(app,'tests',gate.file),constants.R_OK);
 for(const gate of gates){
  const args=gate.direct?['tests/'+gate.file]:['--test','--test-reporter=tap','tests/'+gate.file];
  console.log(`Required UI gate: ${gate.name}`);
  const child=spawnSync(process.execPath,args,{cwd:app,env,encoding:'utf8',maxBuffer:64*1024*1024});
  process.stdout.write(child.stdout??'');process.stderr.write(child.stderr??'');
  if(child.error)throw child.error;
  assert.equal(child.signal,null,`${gate.name} was terminated`);
  assert.equal(child.status,0,`${gate.name} failed`);
  assert.doesNotMatch((child.stdout??'')+(child.stderr??''),/#\s*SKIP\b/i,`${gate.name} may not skip required tests`);
  const bytes=readFileSync(path.join(app,gate.evidence));gate.validate(JSON.parse(bytes));
  results.push({name:gate.name,status:'passed',entry:args,evidence:gate.evidence,evidenceSha256:digest(bytes),sourceSha256:digest(readFileSync(path.join(app,'tests',gate.file)))});
 }
 assert.equal(results.length,gates.length);
}catch(error){failure=String(error);throw error;}
finally{
 writeFileSync(path.join(output,'result.json'),JSON.stringify({status:failure?'failed':'passed',node:process.version,sourceRevision:process.env.SOURCE_REVISION??null,expectedGates:gates.length,completedGates:results.length,results,failure,scope:'Synthetic browser acceptance; not ERP, SQL, physical-camera or production acceptance'},null,2)+'\n');
}
