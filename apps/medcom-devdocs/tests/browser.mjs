import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const {chromium}=(process.env.MEDCOM_BROWSER_TOOLCHAIN?createRequire(path.join(process.env.MEDCOM_BROWSER_TOOLCHAIN,'package.json')):require)('playwright');
const origin=process.env.MEDCOM_DOCS_PREVIEW||'http://127.0.0.1:3001';
assert.match(origin,/^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const output=path.join(root,'.test-runtime');await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.MEDCOM_EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const receipt={viewports:[],errors:[],apiRequests:[],staticDownloads:[]};
try{
 for(const width of [320,390,768,1440]){
  const context=await browser.newContext({viewport:{width,height:900},colorScheme:'light',reducedMotion:'reduce'});
  const page=await context.newPage();page.on('pageerror',e=>receipt.errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).hostname==='api-medcom.bms79.com')receipt.apiRequests.push(r.method()+' '+r.url())});
  const response=await page.goto(origin+'/');assert.equal(response.status(),200);await page.getByRole('heading',{level:1}).waitFor();await page.evaluate(()=>document.fonts.ready);
  async function noOverflow(label){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+' has no viewport overflow at '+width)}
  assert.match(await page.locator('body').evaluate(el=>getComputedStyle(el).fontFamily),/Segoe UI.*Roboto.*Arial.*sans-serif/);
  assert.equal(await page.locator('h1').evaluate(el=>getComputedStyle(el).color),'rgb(0, 0, 0)');
  assert.ok(!(await page.locator('main').innerText()).includes('AI Agents'));
  await noOverflow('Home');await page.screenshot({path:path.join(output,'home-'+width+'.png'),fullPage:false});
  await page.keyboard.press('Control+k');const dialog=page.getByRole('dialog',{name:'Tìm kiếm tài liệu'});await dialog.waitFor();
  await dialog.getByRole('textbox',{name:'Từ khóa tài liệu'}).fill('purchase_requests_create');
  await dialog.getByRole('link').filter({hasText:'POST /api/erp/purchase-requests/create'}).click();
  await page.getByRole('heading',{name:'POST /api/erp/purchase-requests/create',exact:true}).waitFor();
  await noOverflow('API doc');
  assert.equal(await page.getByRole('heading',{name:'Xác thực và phân quyền',exact:true}).count(),1);
  const visibleText=await page.locator('.operation-doc').innerText();assert.ok(!visibleText.includes('Source-backed ERP'));assert.ok(!visibleText.includes('Security & capability'));
  for(const selector of ['.operation-doc h2','.operation-purpose p','.field-type','.field-key']){const el=page.locator(selector).filter({visible:true}).first();assert.equal(await el.evaluate(el=>getComputedStyle(el).color),'rgb(0, 0, 0)',selector+' light');}assert.ok(await page.getByText('idempotencyKey',{exact:true}).count()>0);
  assert.match(await page.locator('.operation-purpose').innerText(),/Tạo phiếu|Thêm/);
  await page.getByRole('button',{name:'TypeScript fetch',exact:true}).click();assert.match(await page.locator('.operation-doc').innerText(),/credentials: 'include'/);
  await page.getByRole('button',{name:'Lỗi khác (default)',exact:true}).click();assert.match(await page.locator('.operation-doc').innerText(),/application\/problem\+json/);
  await page.getByRole('button',{name:'200',exact:true}).click();
  await page.screenshot({path:path.join(output,'operation-'+width+'.png'),fullPage:false});
  await page.goto(origin+'/api');await page.getByRole('textbox',{name:'Tìm API'}).fill('purchase-requests');await page.getByRole('combobox',{name:'Phương thức HTTP'}).selectOption('POST');
  const rows=page.locator('.endpoint-row');assert.ok(await rows.count()>0);for(const text of await rows.allTextContents()){assert.match(text,/POST/);assert.match(text,/purchase-requests/)}await noOverflow('API explorer');
  await page.getByRole('textbox',{name:'Tìm API'}).fill('does-not-exist-test');await page.getByRole('heading',{name:'Không tìm thấy API'}).waitFor();
  await page.getByRole('button',{name:'Xóa bộ lọc',exact:true}).click();assert.equal(await rows.count(),276);
  await page.goto(origin+'/docs/modules/purchase-requests-fields');await page.getByRole('heading',{level:1}).waitFor();assert.match(await page.locator('article').innerText(),/PurchaseDate/);await noOverflow('Field dictionary');
  await page.goto(origin+'/docs/modules/warehouse-sales-qr');assert.match(await page.locator('article').innerText(),/UNKNOWN/);await noOverflow('Feature');
  if(width<997){const menu=page.locator('.navbar__toggle');await menu.click();await page.locator('.navbar-sidebar').waitFor();assert.ok(await page.locator('.navbar-sidebar').getByText('Quản lý kho',{exact:true}).count()>0);await page.keyboard.press('Escape');}
  await page.goto(origin+'/docs/foundation/contracts');await page.getByRole('textbox',{name:'Tên cấu trúc hoặc trường'}).fill('ErpFieldDefinition');await page.getByRole('combobox',{name:/Cấu trúc/}).selectOption('ErpFieldDefinition');assert.ok(await page.locator('.schema-tree').getByText('sqlType',{exact:true}).count()>0);await noOverflow('Schema explorer');
  await page.goto(origin+'/');const toggle=page.locator('.navbar button[class*="toggleButton"]').first();
  if(width<997){await page.locator('.navbar__toggle').click();const mobileToggle=page.locator('.navbar-sidebar button[class*="toggleButton"]').first();await mobileToggle.click();if(await page.evaluate(()=>document.documentElement.dataset.theme!=='dark'))await mobileToggle.click();await page.keyboard.press('Escape');}else{await toggle.click();if(await page.evaluate(()=>document.documentElement.dataset.theme!=='dark'))await toggle.click();}
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');await noOverflow('Dark home');
  assert.equal(await page.locator('h1').evaluate(el=>getComputedStyle(el).color),'rgb(255, 255, 255)');
  await page.goto(origin+'/docs/api/purchase_requests_options');await page.getByRole('heading',{name:'Xác thực và phân quyền',exact:true}).waitFor();
  for(const selector of ['.operation-doc h2','.operation-purpose p','.field-type','.field-key']){const el=page.locator(selector).filter({visible:true}).first();assert.equal(await el.evaluate(el=>getComputedStyle(el).color),'rgb(255, 255, 255)',selector+' dark');}
  await noOverflow('Dark API');
  const logo=page.locator('.navbar__logo img').filter({visible:true});assert.ok(await page.locator('img[src*="medcom-logo-dark"]').count()>0);
  await page.screenshot({path:path.join(output,'dark-'+width+'.png'),fullPage:false});
  receipt.viewports.push({width,passed:true});await context.close();
 }
 for(const asset of ['/openapi.json','/llms.txt','/llms-full.txt','/context/modules.json','/context/provenance.json']){const r=await fetch(origin+asset);assert.equal(r.status,200,asset);receipt.staticDownloads.push({asset,status:r.status});}
 assert.deepEqual(receipt.errors,[]);assert.deepEqual(receipt.apiRequests,[]);
 receipt.status='passed';await fs.writeFile(path.join(output,'browser-receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}finally{await browser.close()}
