import {test} from 'node:test';import assert from 'node:assert/strict';
import {getWorkspace,getDocuments,getDetail,login,ApiError} from '../.test-runtime/erp-tests/api.js';
const session={displayName:'Synthetic test user',tenantId:'test',companyId:'test',companyName:'Test only',authorityVersion:1,idleExpiresAt:'2026-10-04T03:00:00Z',absoluteExpiresAt:'2026-10-04T04:00:00Z',capabilities:['purchase-orders.read']};
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','X-Correlation-ID':'test-correlation'}});
test('workspace defaults branch array without inventing access',async()=>{const old=global.fetch;try{global.fetch=async()=>reply({session,navigation:[]});assert.deepEqual((await getWorkspace()).branchIds,[]);}finally{global.fetch=old;}});
test('login gets CSRF then sends exact credentials',async()=>{const old=global.fetch;const calls=[];try{global.fetch=async(url,init)=>{calls.push({url,init});return reply(calls.length===1?{token:'synthetic-csrf'}:session);};assert.equal((await login('test','synthetic-password')).companyId,'test');assert.equal(calls[0].url,'/api/erp/api/auth/csrf');assert.equal(calls[1].init.headers['X-CSRF-TOKEN'],'synthetic-csrf');assert.deepEqual(JSON.parse(calls[1].init.body),{username:'test',password:'synthetic-password'});assert.equal(calls[1].init.credentials,'same-origin');}finally{global.fetch=old;}});
test('denied and unconfigured replies never become data',async()=>{const old=global.fetch;try{for(const status of [401,403,503]){global.fetch=async()=>reply({code:status===503?'backend_not_configured':'denied'},status);await assert.rejects(getDocuments('purchase-orders',1,'',''),e=>e instanceof ApiError&&e.status===status&&e.correlationId==='test-correlation');}}finally{global.fetch=old;}});
test('malformed successful response fails closed',async()=>{const old=global.fetch;try{global.fetch=async()=>reply({rows:'not-an-array',page:1,pageSize:50,hasMore:false});await assert.rejects(getDocuments('purchase-orders',1,'',''),e=>e.code==='invalid_api_response');}finally{global.fetch=old;}});
test('query values roundtrip without parameter injection',async()=>{const old=global.fetch;try{global.fetch=async(url)=>{const u=new URL(url,'https://site.example');assert.equal(u.searchParams.get('search'),'A&B+?');assert.equal(u.searchParams.get('branchId'),'BR&1');assert.equal(u.searchParams.get('page'),'2');return reply({rows:[],page:2,pageSize:50,hasMore:false});};await getDocuments('purchase-orders',2,'A&B+?','BR&1');}finally{global.fetch=old;}});
test('SQL decimal remains a lossless string',async()=>{const old=global.fetch;try{const quantity='999999999999999999999999.1234';global.fetch=async()=>reply({document:{documentId:'test',documentDate:'2026-10-04',branchId:'test',statusId:1,isLocked:false},purchaseOrderLines:[{lineId:'1',itemId:'test',quantity,quantity2:null}],inboundRequestLines:[],page:1,pageSize:50,hasMore:false});assert.equal((await getDetail('purchase-orders','test',1)).purchaseOrderLines[0].quantity,quantity);}finally{global.fetch=old;}});

test('fresh detail must correlate with both requested document and page',async()=>{
 const old=global.fetch;
 const detail=(id,page)=>({document:{documentId:id,documentDate:'2026-10-04',branchId:'test',statusId:1,isLocked:false},purchaseOrderLines:[],inboundRequestLines:[],page,pageSize:50,hasMore:false});
 try{
  for(const kind of ['purchase-orders','inbound-requests']){
   for(const [id,page] of [['different-document',2],['selected-document',1],['different-document',1]]){
    global.fetch=async()=>reply(detail(id,page));
    await assert.rejects(getDetail(kind,'selected-document',2),e=>e instanceof ApiError&&e.status===502&&e.code==='invalid_api_response');
   }
   global.fetch=async()=>reply(detail('selected-document',2));
   assert.deepEqual(await getDetail(kind,'selected-document',2),detail('selected-document',2));
  }
 }finally{global.fetch=old;}
});
