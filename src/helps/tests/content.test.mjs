import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const context=vm.createContext({window:{}});
vm.runInContext(await readFile(path.join(root,'assets/core.js'),'utf8'),context);
vm.runInContext(await readFile(path.join(root,'assets/content.generated.js'),'utf8'),context);
const core=context.HelpCore,docs=context.window.MEDCOM_DOCS;
test('all seven supplied manuals are represented, with technical companions',()=>{
  assert.equal(new Set(docs.articles.filter(a=>a.id!=='overview').map(a=>a.source)).size,7);
  assert.equal(docs.articles.length,9);
  for(const a of docs.articles){assert.ok(a.guide.length>1000,a.id);assert.ok(a.technical.length>800,a.id);assert.ok(a.flow.startsWith('flowchart '));assert.equal(a.stages.length,4);}
});
test('Vietnamese accent-insensitive search and technical object search',()=>{
  assert.equal(core.fold('Điều chuyển NỘI BỘ'),'dieu chuyen noi bo');
  assert.equal(core.search('gui thu kho',docs.articles)[0].article.id,'inbound');
  const matches=core.search('BatchReceiveStp',docs.articles);assert.equal(matches.length,1);assert.equal(matches[0].article.id,'internal-transfer');assert.equal(matches[0].technical,true);
  assert.equal(core.search('tukhoa-khong-ton-tai',docs.articles).length,0);
});
test('routes handle copied deep links and unknown input safely',()=>{
  assert.equal(core.route('#internal-transfer/flow',docs).tab,'flow');
  assert.equal(core.route('#internal-transfer/flow',docs).id,'internal-transfer');
  assert.equal(core.route('#no-such-article/unsafe',docs).id,'inbound');
  assert.equal(core.route('#inbound/unsafe',docs).tab,'guide');
});
test('Markdown escapes raw HTML and disallows executable link schemes',()=>{
  const html=core.markdown('## Test\n\n<img src=x onerror=alert(1)>\n\n[run](javascript:alert) **safe** `</script>`');
  assert.ok(!html.includes('<img'));assert.ok(!html.includes('href="javascript'));assert.ok(!html.includes('</script>'));assert.ok(html.includes('<strong>safe</strong>'));
  assert.ok(core.inline('[good](#inbound)').includes('href="#inbound"'));
});
test('generated content is current and article links resolve',async()=>{
  const catalog=JSON.parse(await readFile(path.join(root,'content/catalog.json'),'utf8'));
  for(const a of catalog.articles){const generated=docs.articles.find(b=>a.id===b.id);assert.equal(generated.guide,(await readFile(path.join(root,'content',a.guide),'utf8')).replace(/\r\n?/g,'\n'));assert.equal(generated.technical,(await readFile(path.join(root,'content',a.technical),'utf8')).replace(/\r\n?/g,'\n'));}
  for(const a of docs.articles)for(const m of (a.guide+a.technical).matchAll(/\]\(#([a-z-]+)\)/g))assert.ok(docs.articles.some(b=>b.id===m[1]),m[1]);
});
test('public payload has no connections, credentials or real customer identifiers',()=>{
  const payload=JSON.stringify(docs);
  assert.ok(!/Data Source=|Password=|zmc\.bms79|hienlt@|DN1026|PO_NGL|VT0008NIGA|BỆNH VIỆN/i.test(payload));
});
test('locally vendored Mermaid matches recorded SHA-256',async()=>{
  const manifest=JSON.parse(await readFile(path.join(root,'assets/vendor/manifest.json'),'utf8'));
  for(const [file,expected]of Object.entries(manifest.files))assert.equal(createHash('sha256').update(await readFile(path.join(root,'assets/vendor',file))).digest('hex'),expected);
});
test('all static entry points have relative assets and correct modes',async()=>{
  for(const [file,mode]of [['index.html','guide'],['HDSD-ERP/index.html','guide'],['TLKT/index.html','technical']]){
    const html=await readFile(path.join(root,file),'utf8');assert.ok(html.includes(`data-mode="${mode}"`));assert.ok(!html.includes('{{'));assert.ok(!/src="https?:/.test(html));
    for(const match of html.matchAll(/(?:src|href)="([^"#]+\.(?:js|css|svg))"/g))assert.ok((await readFile(path.resolve(root,path.dirname(file),match[1]))).length);
  }
});
test('technical references are tied to sanitized current metadata evidence',async()=>{
  const evidence=JSON.parse(await readFile(path.join(root,'content/evidence.json'),'utf8'));
  for(const article of docs.articles){
    const row=evidence.articles.find(a=>a.id===article.id);assert.ok(row);
    for(const name of article.objects){const obj=row.objects.find(o=>o.name===name);assert.ok(obj,name);assert.match(obj.definitionSha256,/^[a-f0-9]{64}$/);}
    for(const form of article.forms)assert.ok(row.forms.some(f=>f.id===form));
  }
  assert.ok(evidence.uiObservations.some(o=>o.status==='UNKNOWN'));
  assert.ok(evidence.articles.find(a=>a.id==='inbound').forms.find(f=>f.id==='IV_InboundRequestFrm').buttons.includes('Gửi Thủ kho'));
  assert.ok(evidence.articles.find(a=>a.id==='internal-transfer').forms.find(f=>f.id==='IV_InternalTransferBatchFrm').buttons.includes('Gửi TP SA'));
});
test('current business corrections are present and payment due is not arrival due',()=>{
  const by=id=>docs.articles.find(a=>a.id===id);
  assert.ok(by('inbound').guide.includes('SL lấy đợt này'));
  assert.ok(by('inbound').guide.includes('Hãng sản xuất'));
  assert.ok(by('internal-transfer').guide.includes('Không nhập tay ActualReceiveQty'));
  assert.ok(by('internal-transfer').guide.includes('Gửi TP SA'));
  assert.ok(by('bptm').guide.includes('Nhập hạn thanh toán'));
  assert.ok(!by('bptm').guide.includes('Hạn hàng về'));
  assert.ok(by('machine-lifecycle').guide.includes('tình trạng gốc theo Excel'));
});
