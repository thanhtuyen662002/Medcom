// Actual Next UI and Tailwind stylesheet; every ERP request uses synthetic data.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const {chromium}=(process.env.MEDCOM_BROWSER_TOOLCHAIN?createRequire(path.join(path.resolve(process.env.MEDCOM_BROWSER_TOOLCHAIN),'package.json')):require)('playwright');
const origin=process.env.MEDCOM_COMMERCE_PREVIEW??'http://localhost:3000';
assert.match(origin,/^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const output=path.join(app,'.test-runtime/commerce-table-tailwind');
const modules=[['purchase-requests','Đề nghị mua hàng (PR)'],['purchase-approvals','Duyệt đề nghị mua'],['purchase-orders','Đặt mua hàng'],['sales-orders','Quản lý đơn hàng'],['sales-order-pm','PM xử lý đơn hàng'],['sales-order-sa','SA xử lý đơn hàng']];
const rows=Array.from({length:14},(_,index)=>({documentId:`QA-2026/${String(index+1).padStart(4,'0')}`,header:{documentDate:'2026-10-18T00:00:00',objectName:`Đối tượng kiểm thử ${index+1}`,personSuggest:'Người lập kiểm thử',statusId:index%2?2:1,statusName:index%2?'Chờ duyệt':'Mới lập',isLocked:false,memo:index===1?'Nội dung dài '.repeat(30):'Nội dung kiểm thử'}}));
const pagedRows=Array.from({length:55},(_,index)=>({...rows[index%rows.length],documentId:`QA-2026/${String(index+1).padStart(4,'0')}`}));
const headers={'X-Medcom-Read-Scope':'a'.repeat(64),'X-Medcom-Session-Scope':'b'.repeat(64)};

test('Tailwind commerce tables keep mobile cards and existing document reads',{timeout:150000},async()=>{
 await mkdir(output,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.MEDCOM_EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const errors=[],calls=[],results=[],detailResults=[],reviewResults=[],paginationResults=[];let page,paginationMode=false,failNextPage=false;
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.addInitScript(()=>{
   localStorage.setItem('medcom.auth.user',JSON.stringify({username:'qa-synthetic',displayName:'Tài khoản kiểm thử',role:'Kiểm thử',branchId:'MB',companyName:'Môi trường kiểm thử'}));
   localStorage.setItem('medcom.auth.remember','false');localStorage.setItem('medcom.layout.mode','vertical');localStorage.setItem('medcom.theme.dark','false');
  });
  await context.route('**/api/erp/**',async route=>{
   const request=route.request(),url=new URL(request.url());calls.push({path:url.pathname,query:Object.fromEntries(url.searchParams),method:request.method()});
   assert.equal(request.method(),'GET','No real or synthetic business write belongs to this test');
   const reply=(body,status=200)=>route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(body)});
   if(url.pathname.endsWith('/auth/session'))return reply({displayName:'Tài khoản kiểm thử',tenantId:'QA',companyId:'QA',companyName:'Kiểm thử',authorityVersion:1,idleExpiresAt:'2099-01-01T00:00:00Z',absoluteExpiresAt:'2099-01-01T00:00:00Z',capabilities:[]});
   if(url.pathname.endsWith('/lookups/branches'))return reply({items:[{branchId:'MB',branchName:'Chi nhánh kiểm thử'}],hasMore:false});
   if(url.pathname.endsWith('/erp/permissions'))return reply({branchId:'MB',screens:modules.map(([module,caption])=>({module,caption,canView:true,crud:{canRead:true,canCreate:false,canUpdate:false,canDelete:false},actions:[]}))});
   const module=modules.find(([id])=>url.pathname.includes(`/api/erp/${id}`));
   if(module){
    if(url.pathname.endsWith('/screen'))return reply({id:module[0],caption:module[1],menuId:'QA',formId:'QA',fields:{},actions:[],lookups:[],evidence:'synthetic-test-only'});
    if(url.pathname.endsWith('/actions'))return reply([]);
    if(url.pathname.endsWith('/detail'))return reply({documentId:url.searchParams.get('documentId'),branchId:'MB',header:{...rows[0].header,purchaseDate:'2026-10-18T00:00:00',objectId:'QA-CUSTOMER',purposeId:1,price:'2.00',currencyId:'EUR',rateExchange:26700,department:'Bộ phận kiểm thử',purposeName:'Mục đích kiểm thử',personSuggest:'Người lập kiểm thử A, Người lập kiểm thử B'},lines:{rows:[{lineId:'QA-LINE',fields:{itemId:'QA-ITEM',itemName:'Mặt hàng kiểm thử 200g/l',unit:'Lọ',model:'QA-MODEL',budgetDisplay:'2.323 EUR',timeRequired:'Trong tháng 10',quantity:'1',unitPrice:'1',amount:'1'}}],page:1,pageSize:50,hasMore:false},stateToken:'a'.repeat(64),actions:module[0]==='purchase-requests'?[{id:'save',caption:'Lưu',visible:true,enabled:true,requiresSavedDocument:true}]:[]});
    if(url.pathname===`/api/erp/api/erp/${module[0]}`){
     let selected=paginationMode?pagedRows:rows;const search=url.searchParams.get('search'),status=url.searchParams.get('statusId');
     if(search)selected=selected.filter(row=>row.documentId.includes(search));if(status)selected=selected.filter(row=>row.header.statusId===Number(status));
     const requestedPage=Number(url.searchParams.get('page')??1),pageSize=Number(url.searchParams.get('pageSize')??20),offset=(requestedPage-1)*pageSize;
     if(paginationMode&&failNextPage&&requestedPage===2){failNextPage=false;return reply({code:'backend_unavailable'},503);}
     return reply({rows:selected.slice(offset,offset+pageSize),page:requestedPage,pageSize,hasMore:offset+pageSize<selected.length});
    }
   }
   return reply({code:'backend_unavailable'},503);
  });
  page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  assert.equal((await page.goto(origin)).status(),200);
  await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
  const sidebar=page.locator('aside:visible');
  for(const [module,label]of modules){
   await page.setViewportSize({width:1440,height:1000});await sidebar.getByRole('button',{name:label,exact:true}).click();
   const table=page.locator('[data-document-table]:visible');
   await table.getByRole('button',{name:'Mở chứng từ QA-2026/0001',exact:true}).waitFor();
   assert.equal(await table.locator('tbody tr').count(),14);
   for(const dark of [false,true]){
    await page.evaluate(value=>{localStorage.setItem('medcom.theme.dark',String(value));window.dispatchEvent(new Event('focus'));},dark);
    await page.waitForFunction(value=>document.documentElement.classList.contains('dark')===value,dark);
    for(const width of [320,390,768,1024,1440,1920]){
     await page.setViewportSize({width,height:1000});
     assert.equal(await page.locator('[data-document-table]:visible').count(),width>=1024?1:0);
     assert.equal(await page.locator('[data-document-cards]:visible').count(),width<1024?1:0);
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${module}: no page overflow at ${width}`);
     if(width>=1024){
      assert.ok(await table.locator('tbody tr').first().evaluate(node=>node.getBoundingClientRect().height)<=72,'Rows remain compact');
      assert.ok(await table.locator('th').evaluateAll(nodes=>nodes.slice(1).every(node=>getComputedStyle(node).whiteSpace==='nowrap')));
      const region=table.getByRole('region');await region.evaluate(node=>{node.scrollTop=240;node.scrollLeft=200;});
      assert.ok(await table.locator('thead').evaluate(node=>Math.abs(node.getBoundingClientRect().top-node.closest('[role=region]').getBoundingClientRect().top)<2));
      const geometry=await table.locator('tbody tr').first().locator('button').evaluate(node=>{const rect=node.getBoundingClientRect(),region=node.closest('[role=region]').getBoundingClientRect();return{right:rect.right,edge:region.right};});
      assert.ok(geometry.right<=geometry.edge,'Detail button remains inside horizontal viewport');
      await region.evaluate(node=>{node.scrollTop=0;node.scrollLeft=0;});
     }
     results.push({module,width,dark});
    }
   }
  }
  await page.setViewportSize({width:1440,height:1000});await sidebar.getByRole('button',{name:'Đề nghị mua hàng (PR)',exact:true}).click();
  const active=page.locator('main > div:visible'),table=active.locator('[data-document-table]');
  await active.getByRole('button',{name:/^Chờ duyệt/}).click();await table.getByText('Đang hiển thị 7 chứng từ',{exact:true}).waitFor();
  await active.getByRole('button',{name:/^Tất cả/}).click();await table.getByText('Đang hiển thị 14 chứng từ',{exact:true}).waitFor();
  const search=active.getByRole('textbox');await search.fill('0003');await search.press('Enter');await table.getByText('Đang hiển thị 1 chứng từ',{exact:true}).waitFor();
  const open=table.getByRole('button',{name:'Mở chứng từ QA-2026/0003',exact:true});await open.focus();await page.keyboard.press('Enter');
  await page.getByRole('dialog').waitFor();assert.ok(calls.some(call=>call.path.endsWith('/purchase-requests/detail')&&call.query.documentId==='QA-2026/0003'));
  await page.getByRole('dialog').getByRole('button',{name:'Đóng',exact:true}).click();
  await search.fill('');await search.press('Enter');await table.getByText('Đang hiển thị 14 chứng từ',{exact:true}).waitFor();
  await page.evaluate(()=>{localStorage.setItem('medcom.theme.dark','false');window.dispatchEvent(new Event('focus'));});
  await page.waitForFunction(()=>!document.documentElement.classList.contains('dark'));
  await page.screenshot({path:path.join(output,'desktop.png')});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'mobile.png')});
  await page.locator('[data-document-cards]:visible').getByText('QA-2026/0001',{exact:true}).click();await page.getByRole('dialog').waitFor();
  assert.ok(calls.some(call=>call.path.endsWith('/purchase-requests/detail')&&call.query.documentId==='QA-2026/0001'));
  const dialog=page.getByRole('dialog');
  await dialog.getByText('Người lập kiểm thử A, Người lập kiểm thử B',{exact:true}).waitFor();
  for(const dark of [false,true]){
   await page.evaluate(value=>{localStorage.setItem('medcom.theme.dark',String(value));window.dispatchEvent(new Event('focus'));},dark);
   await page.waitForFunction(value=>document.documentElement.classList.contains('dark')===value,dark);
   for(const width of [320,390,768,1024,1440,1920]){
    await page.setViewportSize({width,height:1000});
    const rect=await dialog.boundingBox(),body=dialog.locator('[data-document-detail-body]');
    assert.ok(rect.x>=0&&rect.x+rect.width<=width+1&&rect.y>=0&&rect.y+rect.height<=1001,'Dialog remains inside viewport');
    assert.ok(await body.evaluate(node=>node.scrollWidth<=node.clientWidth+1),'Wide tables scroll within their own region');
    assert.match(await dialog.evaluate(node=>getComputedStyle(node).fontFamily),/Segoe UI/);
    assert.equal(await dialog.getByText('Người đề nghị',{exact:true}).evaluate(node=>parseFloat(getComputedStyle(node).fontSize)),14);
    const person=dialog.getByText('Người lập kiểm thử A, Người lập kiểm thử B',{exact:true});
    assert.equal(await person.evaluate(node=>parseFloat(getComputedStyle(node).fontSize)),16);
    assert.equal(await person.evaluate(node=>getComputedStyle(node).color),dark?'rgb(255, 255, 255)':'rgb(0, 0, 0)');
    assert.equal(await dialog.evaluate(node=>getComputedStyle(node).backgroundColor==='rgb(255, 255, 255)'),!dark,'Open portal follows theme changes');
    if(width>=1024){
     assert.ok(rect.width>=(width>=1440?1370:950),'Desktop form uses the available width');
     const detailTable=dialog.locator('[data-document-detail-table]:visible');
     assert.equal(await detailTable.count(),1);
     assert.ok(await detailTable.locator('th').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).whiteSpace==='nowrap'&&parseFloat(getComputedStyle(node).fontSize)>=14)));
     assert.ok(await detailTable.locator('td').evaluateAll(nodes=>nodes.every(node=>parseFloat(getComputedStyle(node).fontSize)>=16)));
    }else if(width<768){assert.ok(Math.abs(rect.height-1000)<2,'Phone form fills screen');}
    const close=await dialog.getByRole('button',{name:'Đóng',exact:true}).boundingBox();assert.ok(close.height>=44&&close.y>=0&&close.y+close.height<=1000);
    if([390,1440].includes(width)){await body.evaluate(node=>node.scrollTop=node.scrollHeight);await page.screenshot({path:path.join(output,`detail-${width}-${dark?'dark':'light'}.png`)});}
    detailResults.push({width,dark,dialogWidth:rect.width});
   }
  }
  await page.setViewportSize({width:1440,height:1000});
  await dialog.getByRole('button',{name:'Thao tác chứng từ',exact:true}).click();
  await dialog.getByRole('button',{name:'Sửa thông tin',exact:true}).click();
  const edit=page.getByRole('dialog');
  await edit.getByRole('heading',{name:'Sửa đề nghị mua hàng',exact:true}).waitFor();
  await edit.getByLabel('Ghi chú',{exact:true}).fill('Ghi chú kiểm thử cập nhật');
  for(const dark of [false,true]){
   await page.evaluate(value=>{localStorage.setItem('medcom.theme.dark',String(value));window.dispatchEvent(new Event('focus'));},dark);
   await page.waitForFunction(value=>document.documentElement.classList.contains('dark')===value,dark);
   for(const width of [1440,1920,768,390,320]){
    await page.setViewportSize({width,height:1000});
    const review=edit.locator('[data-purchase-review]');
    if(width<768&&!await review.isVisible()){
     await edit.getByRole('button',{name:'Tiếp: Chi tiết',exact:true}).click();
     await edit.getByRole('button',{name:'Xem lại',exact:true}).click();
    }
    await review.waitFor();
    assert.ok(await review.innerText().then(value=>value.includes('Ghi chú kiểm thử cập nhật')),'Draft notes stay in review across responsive/theme changes');
    assert.ok(await edit.locator('[data-document-detail-body]').evaluate(node=>node.scrollWidth<=node.clientWidth+1));
    assert.ok(await review.locator('dt').evaluateAll(nodes=>nodes.every(node=>parseFloat(getComputedStyle(node).fontSize)>=14)));
    assert.ok(await review.locator('dd').evaluateAll(nodes=>nodes.every(node=>parseFloat(getComputedStyle(node).fontSize)>=16)));
    if(width>=1024){assert.ok((await edit.boundingBox()).width>=1370);assert.ok(await review.locator('th').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).whiteSpace==='nowrap')));}
    if([1440,390].includes(width)){await review.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,`review-${width}-${dark?'dark':'light'}.png`)});}
    reviewResults.push({width,dark});
   }
  }
  await edit.getByRole('button',{name:'Đóng',exact:true}).click();
  await page.getByRole('heading',{name:'Sửa đề nghị mua hàng',exact:true}).waitFor({state:'hidden'});
  // Cancelling edit returns to the existing read-only detail, then close it.
  await page.getByRole('dialog').getByRole('button',{name:'Đóng',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  paginationMode=true;
  for(const [module,label]of modules){
   await page.setViewportSize({width:1440,height:1000});
   await sidebar.getByRole('button',{name:label,exact:true}).click();
   const nav=page.locator('[data-document-pagination]:visible'),list=page.locator('[data-document-table]:visible');
   if(module==='purchase-requests')await page.locator('main > div:visible').getByRole('button',{name:'Làm mới danh sách',exact:true}).click();
   await nav.getByRole('status').filter({hasText:'20 chứng từ'}).waitFor();
   assert.equal(await nav.getByRole('button',{name:'Trang trước',exact:true}).isDisabled(),true);
   await nav.getByRole('button',{name:'Trang sau',exact:true}).click();
   await list.getByRole('button',{name:'Mở chứng từ QA-2026/0021',exact:true}).waitFor();
   assert.equal(await list.locator('tbody tr').first().locator('td').first().innerText(),'21');
   await nav.getByRole('button',{name:'Trang sau',exact:true}).click();
   await list.getByRole('button',{name:'Mở chứng từ QA-2026/0041',exact:true}).waitFor();
   assert.equal(await nav.getByRole('button',{name:'Trang sau',exact:true}).isDisabled(),true);
   await nav.getByRole('button',{name:'Trang trước',exact:true}).click();
   await list.getByRole('button',{name:'Mở chứng từ QA-2026/0021',exact:true}).waitFor();
   await nav.getByRole('button',{name:'Đến trang 1',exact:true}).click();
   await list.getByRole('button',{name:'Mở chứng từ QA-2026/0001',exact:true}).waitFor();
   await nav.getByRole('combobox',{name:'Số dòng mỗi trang',exact:true}).selectOption('50');
   await nav.getByRole('status').filter({hasText:'50 chứng từ'}).waitFor();
   assert.equal(await list.locator('tbody tr').count(),50);
   await nav.getByRole('button',{name:'Trang sau',exact:true}).click();
   await list.getByRole('button',{name:'Mở chứng từ QA-2026/0051',exact:true}).waitFor();
   await nav.getByRole('combobox',{name:'Số dòng mỗi trang',exact:true}).selectOption('100');
   await nav.getByRole('status').filter({hasText:'55 chứng từ'}).waitFor();
   assert.equal(await nav.getByRole('button',{name:'Trang sau',exact:true}).isDisabled(),true);
   await nav.getByRole('combobox',{name:'Số dòng mỗi trang',exact:true}).selectOption('20');
   await nav.getByRole('status').filter({hasText:'20 chứng từ'}).waitFor();
   paginationResults.push({module,pages:3,pageSizes:[20,50,100]});
  }
  await sidebar.getByRole('button',{name:'Đề nghị mua hàng (PR)',exact:true}).click();
  const nav=page.locator('[data-document-pagination]:visible'),list=page.locator('[data-document-table]:visible');
  await list.getByRole('button',{name:'Mở chứng từ QA-2026/0001',exact:true}).waitFor();
  await nav.getByRole('button',{name:'Trang sau',exact:true}).click();
  await list.getByRole('button',{name:'Mở chứng từ QA-2026/0021',exact:true}).waitFor();
  await page.locator('main > div:visible').getByRole('button',{name:/^Chờ duyệt/}).click();
  await nav.getByRole('button',{name:'Trang trước',exact:true}).waitFor({state:'visible'});
  await list.getByRole('button',{name:'Mở chứng từ QA-2026/0002',exact:true}).waitFor();
  assert.equal(await nav.locator('[aria-current="page"]').innerText(),'1');
  await page.locator('main > div:visible').getByRole('button',{name:/^Tất cả/}).click();
  await list.getByRole('button',{name:'Mở chứng từ QA-2026/0001',exact:true}).waitFor();
  await nav.getByRole('button',{name:'Trang sau',exact:true}).click();
  await list.getByRole('button',{name:'Mở chứng từ QA-2026/0021',exact:true}).waitFor();
  const pagingSearch=page.locator('main > div:visible').getByRole('textbox');
  await pagingSearch.fill('0055');await pagingSearch.press('Enter');
  await list.getByRole('button',{name:'Mở chứng từ QA-2026/0055',exact:true}).waitFor();
  assert.equal(await nav.getByRole('button',{name:'Trang trước',exact:true}).isDisabled(),true);
  await pagingSearch.fill('NO-MATCH');await pagingSearch.press('Enter');
  await nav.getByRole('status').filter({hasText:'0 chứng từ'}).waitFor();
  assert.equal(await nav.getByRole('button',{name:'Trang sau',exact:true}).isDisabled(),true);
  await pagingSearch.fill('');await pagingSearch.press('Enter');
  await list.getByRole('button',{name:'Mở chứng từ QA-2026/0001',exact:true}).waitFor();
  failNextPage=true;await nav.getByRole('button',{name:'Trang sau',exact:true}).click();
  await page.getByText('Không thể tải danh sách bản ghi từ máy chủ ERP.',{exact:true}).waitFor();
  assert.equal(await nav.locator('[aria-current="page"]').innerText(),'1');
  await nav.getByRole('button',{name:'Trang sau',exact:true}).click();
  await list.getByRole('button',{name:'Mở chứng từ QA-2026/0021',exact:true}).waitFor();
  for(const dark of [false,true]){
   await page.evaluate(value=>{localStorage.setItem('medcom.theme.dark',String(value));window.dispatchEvent(new Event('focus'));},dark);
   await page.waitForFunction(value=>document.documentElement.classList.contains('dark')===value,dark);
   for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:1000});await nav.scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Pagination must fit mobile width');
    assert.ok(await nav.locator('button:visible,select').evaluateAll(nodes=>nodes.every(node=>node.getBoundingClientRect().height>=44)));
    if([390,1440].includes(width))await page.screenshot({path:path.join(output,`pagination-${width}-${dark?'dark':'light'}.png`)});
   }
  }
  await page.setViewportSize({width:390,height:1000});await nav.getByRole('button',{name:'Trang trước',exact:true}).click();
  await page.locator('[data-document-cards]:visible').getByText('QA-2026/0001',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);await writeFile(path.join(output,'evidence.json'),JSON.stringify({status:'PASS',results,detailResults,reviewResults,paginationResults,calls,errors,syntheticDataOnly:true,browser:browser.version()},null,2));
  await context.close();
 }catch(error){if(page){await page.screenshot({path:path.join(output,'failure.png')});await writeFile(path.join(output,'failure.json'),JSON.stringify({calls,errors,text:await page.locator('body').innerText()},null,2));}throw error;}
 finally{await browser.close();}
});
