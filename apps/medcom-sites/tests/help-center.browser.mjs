// Real /help route, native browser layout and interactions. No ERP data/requests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const {chromium}=(process.env.MEDCOM_BROWSER_TOOLCHAIN?createRequire(path.join(path.resolve(process.env.MEDCOM_BROWSER_TOOLCHAIN),'package.json')):require)('playwright');
const origin=process.env.MEDCOM_HELP_PREVIEW??'http://localhost:3000';
assert.ok(/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin));
const output=path.join(app,'.test-runtime/help-center');
await mkdir(output,{recursive:true});
await build({entryPoints:[path.join(app,'lib/help/guides.ts')],bundle:true,platform:'node',format:'cjs',outfile:path.join(output,'guides.cjs')});
const {helpGuides,helpGroups,groupGuideIds,searchGuides}=require(path.join(output,'guides.cjs'));

test('help catalog follows the owner sales and nested warehouse menus',async()=>{
  assert.equal(helpGuides.length,29);assert.equal(helpGuides.filter(item=>item.available).length,3);
  const ids=helpGroups.flatMap(groupGuideIds);assert.equal(new Set(ids).size,29);
  assert.deepEqual([...ids].sort(),helpGuides.map(guide=>guide.id).sort());
  assert.deepEqual(helpGroups.find(group=>group.id==='purchasing').guides,['purchase-requests','purchase-approvals','purchase-orders']);
  const warehouse=helpGroups.find(group=>group.id==='warehouse');
  assert.equal(warehouse.title,'Quản lý kho');
  assert.deepEqual(warehouse.guides,[]);
  assert.deepEqual(warehouse.sections.map(section=>section.title),['Đề nghị nhập hàng','Đề nghị điều chuyển nội bộ','Quét QR-Code']);
  assert.deepEqual(warehouse.sections.map(section=>section.guides.length),[7,8,2]);
  assert.ok(!helpGroups.some(group=>['inbound','transfers'].includes(group.id)));
  assert.deepEqual(warehouse.sections.find(section=>section.id==='qr').guides,['warehouse-qr','warehouse-sales-qr']);
  assert.deepEqual(helpGroups.find(group=>group.id==='sales').guides.map(id=>helpGuides.find(guide=>guide.id===id).title),[
    'Quản lý đơn hàng','Xác nhận đơn hàng','Duyệt đơn hàng','Xác nhận tình trạng hàng hoá','Duyệt, PXK và hoá đơn','Xuất hàng theo PXK',
  ]);
  const assets=helpGroups.find(group=>group.id==='equipment');
  assert.equal(assets.title,'Tài sản');
  assert.deepEqual(assets.guides.map(id=>helpGuides.find(guide=>guide.id===id).title),[
    'Phiếu di chuyển / bàn giao máy','Phiếu sửa chữa / bảo hành / bảo trì máy','Đăng ký QR / Serial linh kiện',
  ]);
  assert.ok(searchGuides('de nghi mua').some(item=>item.id==='purchase-requests'));
  assert.ok(searchGuides('ly do tu choi').some(item=>item.id==='purchase-approvals'));
  assert.deepEqual(searchGuides('   '),[]);assert.deepEqual(searchGuides('xyznonexistent'),[]);
  for(const guide of helpGuides.filter(item=>item.available)){
    assert.ok(guide.sections.length>=3);
    assert.equal(new Set(guide.sections.map(section=>section.id)).size,guide.sections.length);
    for(const section of guide.sections){if(section.image)await access(path.join(app,'public',section.image.src));}
  }
  const receipt=JSON.parse(await readFile(path.join(app,'public/help/images/manifest.json'),'utf8'));
  assert.equal(receipt.images.length,11);assert.equal(receipt.realErpData,false);assert.equal(receipt.backendRequests,false);assert.equal(receipt.businessWrites,false);assert.deepEqual(receipt.errors,[]);
});

test('help mobile/desktop navigation, search, deep links, image zoom and keyboard',{timeout:120000},async()=>{
  const browser=await chromium.launch({executablePath:process.env.MEDCOM_EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const results=[];const errors=[];const apiRequests=[];
  try{
    for(const width of [320,390,768,1440]){
      const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1,isMobile:width<768,hasTouch:width<768,reducedMotion:'reduce'});
      const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/'))apiRequests.push(request.url());});
      const response=await page.goto(origin+'/help');assert.equal(response.status(),200);
      // Keep preview-only Next dev controls out of product reference captures.
      await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
      await page.getByRole('heading',{name:'Đề nghị mua hàng',exact:true}).waitFor();
      await page.locator('img[src="/help/images/pr-list.png"]').waitFor();
      await page.waitForFunction(()=>Array.from(document.querySelectorAll('img[src*="/help/images/"]')).filter(img=>img.getBoundingClientRect().top<innerHeight).every(img=>img.complete&&img.naturalWidth>0));
      async function noOverflow(){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`No horizontal overflow at ${width}px`);}
      const themeControl=page.getByRole('button',{name:'Chuyển sang giao diện tối',exact:true});
      const themeBounds=await themeControl.boundingBox();assert.ok(themeBounds.width>=44&&themeBounds.height>=44);
      await noOverflow();await page.screenshot({path:path.join(output,'help-'+width+'.png'),fullPage:false});
      const search=page.getByRole('textbox',{name:'Tìm hướng dẫn'});
      await search.fill('ly do tu choi');await page.locator('#help-search-results').getByRole('link',{name:/Duyệt đề nghị mua hàng/}).click();
      await page.getByRole('heading',{name:'Duyệt đề nghị mua hàng',exact:true}).waitFor();assert.match(page.url(),/guide=purchase-approvals/);
      await page.goBack();await page.getByRole('heading',{name:'Đề nghị mua hàng',exact:true}).waitFor();
      await page.goForward();await page.getByRole('heading',{name:'Duyệt đề nghị mua hàng',exact:true}).waitFor();
      if(width<768){
        const opener=page.getByRole('button',{name:'Mở danh mục hướng dẫn'});await opener.click();
        const dialog=page.getByRole('dialog',{name:'Danh mục hướng dẫn'});await dialog.waitFor();
        assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden');
        await dialog.getByRole('link',{name:'Đặt mua hàng',exact:true}).click();
        assert.equal(await dialog.count(),0);await page.getByRole('heading',{name:'Đặt mua hàng',exact:true}).waitFor();
        await opener.click();await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
        assert.equal(await opener.evaluate(node=>node===document.activeElement),true,'Menu returns focus');
      }else{
        await page.locator('aside').first().getByRole('link',{name:'Đặt mua hàng',exact:true}).click();
        await page.getByRole('heading',{name:'Đặt mua hàng',exact:true}).waitFor();
      }
      assert.equal(await page.locator('[data-help-section]').count(),3);
      assert.equal(await page.getByRole('heading',{name:'Các thao tác đang được bổ sung',exact:true}).count(),0);
      assert.equal(await page.locator('a[href="#pham-vi-hien-tai"]').count(),0);
      await noOverflow();
      let menu;
      if(width<768){await page.getByRole('button',{name:'Mở danh mục hướng dẫn'}).click();menu=page.getByRole('dialog',{name:'Danh mục hướng dẫn'});}
      else menu=page.locator('aside').first();
      await menu.locator('summary').filter({hasText:'Quản lý kho'}).click();
      await menu.locator('summary').filter({hasText:'Quét QR-Code'}).click();
      await menu.getByRole('link',{name:'Xuất bán hàng Feature',exact:true}).click();
      await page.getByRole('heading',{name:'Xuất bán hàng',exact:true}).waitFor();
      assert.match(page.url(),/guide=warehouse-sales-qr/);
      assert.match(await page.locator('main').innerText(),/Quản lý kho.*Quét QR-Code/s);await noOverflow();
      await page.goto(origin+'/help?guide=warehouse-quality-confirmation');
      await page.getByRole('heading',{name:'Kiểm soát và xác nhận chất lượng hàng hóa',exact:true}).waitFor();
      assert.match(await page.locator('main').innerText(),/Quản lý kho.*Đề nghị nhập hàng/s);await noOverflow();
      if(width<768)await page.getByRole('button',{name:'Mở danh mục hướng dẫn'}).click();
      const warehouseNav=width<768?page.getByRole('dialog',{name:'Danh mục hướng dẫn'}):page.locator('aside').first();
      await warehouseNav.getByRole('link',{name:'Kiểm soát và xác nhận chất lượng hàng hóa Feature',exact:true}).waitFor({state:'visible'});
      await page.screenshot({path:path.join(output,'warehouse-'+width+'.png')});
      if(width<768)await page.keyboard.press('Escape');
      await page.goto(origin+'/help?guide=purchase-requests#them-dong-hang');
      await page.getByRole('heading',{name:'Đề nghị mua hàng',exact:true}).waitFor();
      const zoom=page.getByRole('button',{name:'Phóng to ảnh: Thêm và kiểm tra dòng hàng'});await zoom.scrollIntoViewIfNeeded();await zoom.click();
      const imageDialog=page.getByRole('dialog',{name:'Ảnh hướng dẫn phóng to'});await imageDialog.waitFor();
      await page.waitForFunction(()=>document.querySelector('dialog img')?.naturalWidth>0);
      assert.ok(await imageDialog.locator('img').evaluate(img=>img.getBoundingClientRect().width>250));
      await imageDialog.getByRole('button',{name:'Phóng to để đọc rõ'}).click();
      assert.equal(await imageDialog.locator('img').evaluate(img=>img.getBoundingClientRect().width),660);
      await imageDialog.getByRole('button',{name:'Thu vừa màn hình'}).click();
      await noOverflow();await page.screenshot({path:path.join(output,'zoom-'+width+'.png')});
      await page.keyboard.press('Escape');assert.equal(await imageDialog.count(),0);assert.equal(await zoom.evaluate(node=>node===document.activeElement),true);
      assert.notEqual(await page.evaluate(()=>document.body.style.overflow),'hidden');
      await page.getByText('Vì sao không thấy hoặc không bấm được Tạo mới?',{exact:true}).click();
      assert.equal(await page.locator('details').filter({has:page.getByText('Vì sao không thấy hoặc không bấm được Tạo mới?',{exact:true})}).getAttribute('open'),'');
      await page.goto(origin+'/help?guide=machine-repairs');await page.getByRole('heading',{name:'Phiếu sửa chữa / bảo hành / bảo trì máy',exact:true}).waitFor();
      assert.match(await page.locator('main').innerText(),/Hướng dẫn đang được chuẩn bị/);await noOverflow();await page.screenshot({path:path.join(output,'feature-'+width+'.png')});
      await page.getByRole('textbox',{name:'Tìm hướng dẫn'}).fill('xyznonexistent');await page.getByText('Chưa tìm thấy hướng dẫn',{exact:true}).waitFor();await noOverflow();
      await page.getByRole('link',{name:'Medcom — Trung tâm hướng dẫn'}).click();await page.getByRole('heading',{name:'Đề nghị mua hàng',exact:true}).waitFor();
      await page.goto(origin+'/help?guide=does-not-exist');await page.getByRole('heading',{name:'Đề nghị mua hàng',exact:true}).waitFor();
      results.push({width,status:'PASS'});await context.close();
    }
    assert.deepEqual(errors,[]);assert.deepEqual(apiRequests,[],'Help must not fetch ERP records');
    await writeFile(path.join(output,'evidence.json'),JSON.stringify({status:'PASS',results,errors,apiRequests,browser:browser.version()},null,2)+'\n');
  }finally{await browser.close();}
});

test('help inherits main theme, updates across tabs and follows system only without a saved choice',{timeout:120000},async()=>{
  const browser=await chromium.launch({executablePath:process.env.MEDCOM_EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const results=[];const errors=[];
  try{
    for(const width of [390,1440]){
      const context=await browser.newContext({viewport:{width,height:900},colorScheme:'light',storageState:{cookies:[],origins:[{origin,localStorage:[{name:'medcom.theme.dark',value:'true'}]}]}});
      const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
      await page.goto(origin+'/help');await page.getByRole('heading',{name:'Đề nghị mua hàng',exact:true}).waitFor();
      async function expectTheme(dark){
        await page.waitForFunction(expected=>document.documentElement.classList.contains('dark')===expected&&document.body.classList.contains('dark')===expected,dark);
        assert.equal(await page.locator('main').evaluate(main=>getComputedStyle(main.parentElement.parentElement).backgroundColor),dark?'rgb(13, 20, 32)':'rgb(255, 255, 255)');
        assert.equal(await page.locator('main').evaluate(main=>getComputedStyle(main.parentElement.parentElement).colorScheme),dark?'dark':'light');
        await page.waitForFunction(expected=>{
          const logo=document.querySelector('img[data-medcom-logo]');
          const icon=document.querySelector('link[rel="icon"]');
          return logo?.dataset.medcomLogo===(expected?'dark':'light')&&logo.complete&&logo.naturalWidth>0&&new URL(icon.href).pathname===(expected?'/medcom-logo-dark.png':'/medcom-logo.png');
        },dark);
        const selected=await page.locator('img[data-medcom-logo]').first().evaluate(img=>{const url=new URL(img.currentSrc);return url.searchParams.get('url')??url.pathname;});
        assert.equal(selected,dark?'/medcom-logo-dark.png':'/medcom-logo.png');
        assert.equal(await page.locator('img[data-medcom-logo]').first().evaluate(img=>getComputedStyle(img).filter),'none');
      }
      await expectTheme(true);
      await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
      await page.screenshot({path:path.join(output,'dark-'+width+'.png')});
      const writer=await context.newPage();await writer.goto(origin+'/help?guide=purchase-orders');
      await writer.waitForFunction(()=>document.documentElement.classList.contains('dark'));
      const main=await context.newPage();
      // Exercise the actual main-page theme listener without real ERP access.
      await main.route('**/api/erp/**',route=>route.fulfill({status:401,contentType:'application/json',body:'{"code":"unauthenticated"}'}));
      await main.goto(origin+'/');await main.getByRole('button',{name:'Đăng nhập',exact:true}).waitFor();
      await main.waitForFunction(()=>document.documentElement.classList.contains('dark'));
      await main.waitForFunction(()=>document.querySelector('img[data-medcom-logo]')?.dataset.medcomLogo==='dark');
      await page.getByRole('button',{name:'Chuyển sang giao diện sáng',exact:true}).click();await expectTheme(false);
      await main.waitForFunction(()=>!document.documentElement.classList.contains('dark'));
      await main.waitForFunction(()=>document.querySelector('img[data-medcom-logo]')?.dataset.medcomLogo==='light');
      await writer.waitForFunction(()=>!document.documentElement.classList.contains('dark'));
      assert.equal(await page.evaluate(()=>localStorage.getItem('medcom.theme.dark')),'false');
      await page.reload();await expectTheme(false);
      await page.getByRole('button',{name:'Chuyển sang giao diện tối',exact:true}).click();await expectTheme(true);
      await main.waitForFunction(()=>document.documentElement.classList.contains('dark'));
      await main.waitForFunction(()=>document.querySelector('img[data-medcom-logo]')?.dataset.medcomLogo==='dark');
      await main.close();
      // Native same-origin storage events, as emitted by the main app's toggle.
      await writer.evaluate(()=>localStorage.setItem('medcom.theme.dark','false'));await expectTheme(false);
      await writer.evaluate(()=>localStorage.setItem('medcom.theme.dark','true'));await expectTheme(true);
      await page.getByRole('textbox',{name:'Tìm hướng dẫn'}).fill('duyet');
      assert.equal(await page.locator('#help-search-results').evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(17, 27, 43)');
      await page.getByRole('button',{name:'Xóa tìm kiếm'}).click();
      if(width<768){
        await page.getByRole('button',{name:'Mở danh mục hướng dẫn'}).click();
        const menu=page.getByRole('dialog',{name:'Danh mục hướng dẫn'});
        assert.equal(await menu.evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(17, 27, 43)');
        await page.screenshot({path:path.join(output,'dark-menu-'+width+'.png')});await page.keyboard.press('Escape');
      }
      await page.getByRole('button',{name:'Phóng to ảnh: Thêm và kiểm tra dòng hàng'}).click();
      const image=page.getByRole('dialog',{name:'Ảnh hướng dẫn phóng to'});await image.waitFor();
      assert.equal(await image.evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(15, 25, 40)');
      await page.screenshot({path:path.join(output,'dark-zoom-'+width+'.png')});
      await writer.evaluate(()=>localStorage.setItem('medcom.theme.dark','false'));await expectTheme(false);
      assert.equal(await image.evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(246, 248, 252)');
      await page.keyboard.press('Escape');await page.reload();await expectTheme(false);
      await writer.evaluate(()=>localStorage.removeItem('medcom.theme.dark'));await expectTheme(false);
      await page.emulateMedia({colorScheme:'dark'});await expectTheme(true);
      await writer.evaluate(()=>localStorage.setItem('medcom.theme.dark','false'));await expectTheme(false);
      await page.emulateMedia({colorScheme:'light'});await expectTheme(false);
      await writer.evaluate(()=>localStorage.setItem('medcom.theme.dark','true'));await expectTheme(true);
      await writer.evaluate(()=>localStorage.clear());await expectTheme(false);
      assert.equal(await page.evaluate(()=>localStorage.getItem('medcom.theme.dark')),null,'Help never writes an independent preference');
      results.push({width,status:'PASS',savedChoice:true,crossTab:true,mainPageSync:true,toggleButton:true,systemFallback:true,dialogs:true});await context.close();
    }
    assert.deepEqual(errors,[]);
    await writeFile(path.join(output,'theme-evidence.json'),JSON.stringify({status:'PASS',results,errors,browser:browser.version()},null,2)+'\n');
  }finally{await browser.close();}
});
