import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {AuditTracker,auditText} from '../.test-runtime/erp-tests/audit-tracker.js';
import {proxyErpRequest,signClientRelay} from '../.test-runtime/erp-tests/proxy.js';
import {routeAllowed,erpScreenPostRoute} from '../.test-runtime/erp-tests/proxy-policy.js';

// Synthetic transport only: no backend, SQL or real user data.
function browser(){
 const previous={window:globalThis.window,document:globalThis.document};
 globalThis.window=new EventTarget();
 globalThis.document=Object.assign(new EventTarget(),{visibilityState:'visible'});
 return ()=>{globalThis.window=previous.window;globalThis.document=previous.document;};
}
function transport(statuses=[]){
 const calls=[];
 const fetch=async(url,init={})=>{
  calls.push({url,init});
  if(url.endsWith('/api/auth/csrf'))return new Response(JSON.stringify({token:'csrf-'+calls.length}),{status:200});
  const status=statuses.length?statuses.shift():202;
  return new Response(status===202?JSON.stringify({accepted:1,rejected:0}):JSON.stringify({code:'x'}),{status});
 };
 return {fetch,calls,posts:()=>calls.filter(c=>c.init.method==='POST')};
}

test('events carry screen context and the open document of that screen, never before start or after stop',async()=>{
 const restore=browser();
 try{
  const t=transport();const tracker=new AuditTracker(t.fetch);
  tracker.track('click',{target:'Lưu'});assert.equal(tracker.pending,0,'not signed in: nothing recorded');
  tracker.start();
  tracker.setContext({page:'sales-orders',module:'sales-orders',branchId:'MB'});
  tracker.setDocument('sales-orders','DMB0926/0030');
  tracker.track('click',{target:'Lưu',detail:{dialog:'Đơn hàng'}});
  tracker.setContext({page:'home',module:undefined});
  tracker.track('navigate');
  await tracker.flush();
  const post=t.posts()[0];
  assert.equal(post.url,'/api/erp/api/audit/events');
  assert.equal(post.init.headers['X-CSRF-TOKEN'],'csrf-1');
  const body=JSON.parse(post.init.body);
  assert.ok(Date.parse(body.sentAt));
  const [click,navigate]=body.events;
  assert.deepEqual({type:click.type,page:click.page,module:click.module,documentId:click.documentId,branchId:click.branchId,target:click.target,detail:click.detail},
   {type:'click',page:'sales-orders',module:'sales-orders',documentId:'DMB0926/0030',branchId:'MB',target:'Lưu',detail:{dialog:'Đơn hàng'}});
  assert.match(click.id,/^[0-9a-f-]{36}$/);
  assert.equal(navigate.page,'home');assert.equal('module' in navigate,false);assert.equal('documentId' in navigate,false);
  for(const event of body.events)assert.deepEqual(Object.keys(event).filter(k=>!['id','at','type','page','module','documentId','branchId','target','detail'].includes(k)),[]);
  await tracker.stop();
  tracker.track('click');assert.equal(tracker.pending,0);
 }finally{restore();}
});

test('temporary failures keep events for the next send; invalid or signed-out batches are dropped',async()=>{
 const restore=browser();
 try{
  const t=transport([503,403,202]);const tracker=new AuditTracker(t.fetch);tracker.start();
  tracker.track('print');
  await tracker.flush();assert.equal(tracker.pending,1,'503 keeps the event');
  await tracker.flush();assert.equal(tracker.pending,1,'403 keeps it and renews CSRF');
  await tracker.flush();assert.equal(tracker.pending,0);
  assert.equal(t.calls.filter(c=>c.url.endsWith('/api/auth/csrf')).length,2,'a rejected token is fetched again');
  const ids=t.posts().map(p=>JSON.parse(p.init.body).events[0].id);
  assert.equal(new Set(ids).size,1,'retries resend the same event id so the server stores it once');
  const dropped=transport([400]);const second=new AuditTracker(dropped.fetch);second.start();second.track('click');
  await second.flush();assert.equal(second.pending,0);
  await second.stop(false);await tracker.stop(false);
 }finally{restore();}
});

test('closing the page sends everything with keepalive, in batches of at most 50',async()=>{
 const restore=browser();
 try{
  const t=transport();const tracker=new AuditTracker(t.fetch);tracker.start();
  for(let i=0;i<120;i++)tracker.track('click',{target:'Nút '+i});
  await tracker.stop(true);
  const posts=t.posts();
  assert.equal(posts.at(-1).init.keepalive,true,'the final send survives page unload');
  assert.ok(posts.every(p=>JSON.parse(p.init.body).events.length<=50));
  assert.equal(posts.reduce((n,p)=>n+JSON.parse(p.init.body).events.length,0),120);
 }finally{restore();}
});

test('labels are bounded single-line text',()=>{
 assert.equal(auditText('  Gửi\n  PM  '),'Gửi PM');
 assert.equal(auditText(''),undefined);
 assert.equal(auditText('x'.repeat(200),10).length,10);
});

test('the BFF admits activity-log routes with command rules and signs the browser address for the API',async()=>{
 assert.equal(routeAllowed('api/audit/events','POST'),true);
 assert.equal(erpScreenPostRoute('api/audit/events'),true,'CSRF, same-origin and JSON rules apply');
 assert.equal(routeAllowed('api/audit/events','GET'),false);
 assert.equal(routeAllowed('api/audit/logs','GET'),true);
 assert.equal(routeAllowed('api/audit/logs/detail','GET'),true);
 assert.equal(routeAllowed('api/audit/logs','POST'),false);

 const key='k'.repeat(40);
 const request=new Request('https://site.example/api/erp/api/erp/sales-orders/save',{method:'POST',headers:{'x-forwarded-for':'203.0.113.7','user-agent':'Mozilla/5.0 (Test)'}});
 const headers=new Headers();
 signClientRelay(headers,request,'api/erp/sales-orders/save',key,1_800_000_000_000);
 const agent=encodeURIComponent('Mozilla/5.0 (Test)');
 assert.equal(headers.get('X-Medcom-Client-Address'),'203.0.113.7');
 assert.equal(headers.get('X-Medcom-Client-Agent'),agent);
 assert.equal(headers.get('X-Medcom-Client-Time'),'1800000000');
 const expected=createHmac('sha256',key).update(['1800000000','203.0.113.7',agent,'POST','/api/erp/sales-orders/save'].join('\n')).digest('hex');
 assert.equal(headers.get('X-Medcom-Client-Signature'),expected,'same message layout as the API (WebAuditRelay.Sign)');
 for(const [k,forwarded] of [[undefined,'203.0.113.7'],['short','203.0.113.7'],[key,'not an ip<script>']]){
  const none=new Headers();
  signClientRelay(none,new Request('https://site.example/x',{headers:{'x-forwarded-for':forwarded}}),'x',k);
  assert.equal(none.has('X-Medcom-Client-Signature'),false);
 }

 // End to end through the proxy: the browser cannot add its own relay headers.
 const previous=process.env.MEDCOM_AUDIT_RELAY_KEY;process.env.MEDCOM_AUDIT_RELAY_KEY=key;
 try{
  let sent;
  const r=await proxyErpRequest(new Request('https://site.example/api/erp/api/audit/logs?page=1',{headers:{'x-forwarded-for':'198.51.100.4','X-Medcom-Client-Address':'10.0.0.1'}}),
   ['api','audit','logs'],'https://erp.example.com','https://site.example',async(url,init)=>{sent=init.headers;return new Response('{}',{status:200,headers:{'Content-Type':'application/json'}});});
  assert.equal(r.status,200);
  assert.equal(sent.get('X-Medcom-Client-Address'),'198.51.100.4');
 }finally{if(previous===undefined)delete process.env.MEDCOM_AUDIT_RELAY_KEY;else process.env.MEDCOM_AUDIT_RELAY_KEY=previous;}
});
