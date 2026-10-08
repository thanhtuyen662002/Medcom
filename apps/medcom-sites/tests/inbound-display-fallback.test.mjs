// Actual decoder + complete production eligibility function; not a React/browser test.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const host=(await readFile('components/erp/inbound-request-screen.tsx','utf8')).replaceAll('\r\n','\n');
const start=host.indexOf('function commandReadUnavailable('),end=host.indexOf('\nconst defaultList',start);
assert.ok(start>=0&&end>start,'Complete production helper must be available');
const helper=host.slice(start,end);
assert.ok(helper.endsWith('\n}'),'Do not test a partial helper');
const output=path.resolve('.test-runtime/inbound-display-fallback');
await mkdir(output,{recursive:true});
const outfile=path.join(output,'production.mjs');
await build({stdin:{contents:`import {record,isInboundScope,inboundBodyLimit} from './lib/erp/inbound-request-api';
export {createInboundRequestApi} from './lib/erp/inbound-request-api';
export ${helper}`,resolveDir:process.cwd(),loader:'ts'},outfile,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'warning'});
const {createInboundRequestApi,commandReadUnavailable}=await import(pathToFileURL(outfile));
const wire=()=>({scopeKey:null,access:{canRead:false,canSave:false,canSend:false,available:false,maxCommandBytes:1048576},data:{outcome:'Unavailable',document:null}});
const decode=payload=>createInboundRequestApi(async()=>Response.json(payload,{headers:{'cache-control':'no-store'}})).read('DOC',null,new AbortController().signal);

test('actual unavailable decoder retains read-only fallback for old and supplemented envelopes',async()=>{
 const legacy=wire(),current=await decode(wire());
 assert.deepEqual(Object.keys(current).sort(),['access','data','itemDisplayContext','scopeKey']);
 assert.equal(current.itemDisplayContext,null);
 for(const scopeKey of [null,'a'.repeat(64)])for(const envelope of [legacy,current])
  assert.equal(commandReadUnavailable({...envelope,scopeKey}),true);
 const explicit=wire();explicit.data.itemDisplayContext=null;
 assert.deepEqual(await decode(explicit),current);
});

test('fallback still rejects authority, outcome, context and exact-shape violations',async()=>{
 const current=await decode(wire());
 const bad=[
  ...['Observed','Denied','NotFound','Conflict','Rejected','OutcomeUnknown'].map(outcome=>({...current,data:{outcome,document:null}})),
  ...['canRead','canSave','canSend','available'].map(key=>({...current,access:{...current.access,[key]:true}})),
  ...[0,-1,1048577,1.5,Number.MAX_SAFE_INTEGER+1].map(maxCommandBytes=>({...current,access:{...current.access,maxCommandBytes}})),
  ...[undefined,{},'',false,0,[]].map(itemDisplayContext=>({...current,itemDisplayContext})),
  {...current,scopeKey:'invalid'},{...current,extra:true},{...current,data:{...current.data,document:{}}},
  {...current,data:{...current.data,itemDisplayContext:null}},{...current,access:{...current.access,extra:true}}
 ];
 assert.equal(bad.length,26);
 for(const value of bad)assert.equal(commandReadUnavailable(value),false);
});
