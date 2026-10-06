// Disposable Edge/Chromium interaction harness, using existing esbuild, React
// and Tailwind dependencies. Never invokes real getUserMedia or grants camera
// permissions. Run from apps/medcom-sites: node tests/qr-scanner.browser.mjs
// Set QR_TEST_BROWSER to an existing Edge/Chromium executable when necessary.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

const browser = process.env.QR_TEST_BROWSER ?? (process.platform === 'win32'
  ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : '/usr/bin/chromium');
if (!existsSync(browser)) throw new Error('An existing Edge/Chromium executable is required; no browser is installed by this test.');
const matrix = `111111101010101111111
100000100011001000001
101110101101001011101
101110101100101011101
101110101000101011101
100000100110001000001
111111101010101111111
000000000001000000000
111100101110010011101
011011001101010001100
110011100111001100011
111010000110000111000
110111110100100010111
000000001100111010001
111111100010000010000
100000100011110001111
101110100000111111010
101110101100110010010
101110101010111001000
100000101111011110001
111111101101000100000`.split('\n');
const bootstrap = `
window.qrFixture={mode:'normal',calls:[],stops:0,confirms:0,hidden:false,matrix:${JSON.stringify(matrix)}};
Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.qrFixture.hidden});
Object.defineProperty(window,'BarcodeDetector',{configurable:true,value:undefined});
function makeSyntheticStream(){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=116;
 const context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,116,116);context.fillStyle='black';
 if(window.qrFixture.mode!=='blank')window.qrFixture.matrix.forEach((row,y)=>[...row].forEach((cell,x)=>{if(cell==='1')context.fillRect((x+4)*4,(y+4)*4,4,4);}));
 const stream=canvas.captureStream(10);
 for(const track of stream.getTracks()){const stop=track.stop.bind(track);track.stop=()=>{window.qrFixture.stops++;stop();};}
 return stream;
}
Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async constraints=>{
 window.qrFixture.calls.push(constraints);
 if(window.qrFixture.mode==='denied')throw new DOMException('Synthetic denial','NotAllowedError');
 if(window.qrFixture.mode==='pending')return new Promise(resolve=>window.qrFixture.resolve=()=>resolve(makeSyntheticStream()));
 return makeSyntheticStream();
}}});
`;
const entry = `
import React,{useState,useLayoutEffect} from 'react';import{createRoot}from'react-dom/client';import{QrScanner}from'./components/erp/qr-scanner';
function App(){const[open,setOpen]=useState(false),[scope,setScope]=useState('synthetic-session-a'),[mounted,setMounted]=useState(true);
 window.qrFixture.scope=setScope;window.qrFixture.mount=setMounted;window.qrFixture.open=setOpen;
 useLayoutEffect(()=>{window.qrFixture.committed=true;return()=>{window.qrFixture.committed=false;};},[]);
 return <><button id="launch" onClick={()=>setOpen(true)}>Open synthetic scanner</button>
 {mounted&&<QrScanner open={open} scopeKey={scope} onOpenChange={value=>{if(!value&&window.qrFixture.holdClose)return;setOpen(value);}} onConfirm={text=>{window.qrFixture.confirms++;window.qrFixture.confirmed=text;}}/>}</>;
}createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);`;
const bundle = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true,
  write: false, platform: 'browser', format: 'iife', alias: { '@': process.cwd() }, jsx: 'automatic', logLevel: 'silent' });
const css = (await postcss([tailwind({ base: process.cwd() })]).process(await readFile('app/globals.css', 'utf8'), { from: path.resolve('app/globals.css') })).css;
const html = `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div><script>${bootstrap}</script><script src="/fixture.js"></script><link rel="stylesheet" href="/fixture.css"></body></html>`;
const requests = [];
const server = http.createServer((request, response) => {
  requests.push(request.url);
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'");
  response.setHeader('Content-Type', request.url === '/fixture.js' ? 'text/javascript' : request.url === '/fixture.css' ? 'text/css' : 'text/html; charset=utf-8');
  response.end(request.url === '/fixture.js' ? bundle.outputFiles[0].contents : request.url === '/fixture.css' ? css : html);
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(path.join(tmpdir(), 'medcom-qr-synthetic-'));
let child, socket, closed = false;
const errors = [], results = [];
let counter = 0; const pending = new Map();
async function cdp(method, params = {}) {
  const id = ++counter;
  const result = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout')); }, 10000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
  });
  socket.send(JSON.stringify({ id, method, params })); return result;
}
async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error('Synthetic browser evaluation failed');
  return result.result.value;
}
async function waitFor(expression, timeout = 7000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await evaluate(expression)) return; await delay(40); }
  console.error(JSON.stringify({state:await evaluate(`({calls:window.qrFixture?.calls.length,mode:window.qrFixture?.mode,status:document.querySelector('[role="status"]')?.textContent,readyState:document.readyState,committed:window.qrFixture?.committed,fonts:document.fonts?.status,focused:document.hasFocus(),activeElement:document.activeElement?.tagName,activeId:document.activeElement?.id,viewport:{width:innerWidth,height:innerHeight},pointer:window.qrFixture?.pointerSample,stylesheets:[...document.styleSheets].map(sheet=>sheet.href)})`),runtimeErrors:errors,requests:requests.slice(-10)}));
  throw new Error('Synthetic browser assertion timed out: ' + expression);
}
async function click(label) {
  await waitFor(`!document.querySelector('[role="dialog"]')?.getAnimations().some(animation=>animation.playState==='running')`);
  // Wait for committed, loaded layout and two stable target samples before
  // the same single real pointer click. Never retry a click or call .click().
  await evaluate('window.qrFixture.pointerSample=null');
  await waitFor(`(()=>{
    const label=${JSON.stringify(label)},b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);
    if(!b||b.disabled||document.readyState!=='complete'||!window.qrFixture.committed||document.fonts?.status==='loading')return false;
    const r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,style=getComputedStyle(b),hit=document.elementFromPoint(x,y),previous=window.qrFixture.pointerSample;
    const sample={label,x,y,width:r.width,height:r.height,hitTag:hit?.tagName,hitId:hit?.id,hitText:hit?.textContent?.trim().slice(0,100),hitTarget:hit===b||b.contains(hit)};
    window.qrFixture.pointerSample=sample;
    return r.width>0&&r.height>0&&x>=0&&y>=0&&x<innerWidth&&y<innerHeight&&style.visibility==='visible'&&style.display!=='none'&&style.pointerEvents!=='none'&&Number(style.opacity)>0
      &&sample.hitTarget&&previous?.label===label&&['x','y','width','height'].every(key=>Math.abs(previous[key]-sample[key])<0.5);
  })()`);
  const rect = await evaluate('({x:window.qrFixture.pointerSample.x,y:window.qrFixture.pointerSample.y})');
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...rect });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...rect });
}
async function open(mode = 'normal') {
  await evaluate(`window.qrFixture.mode=${JSON.stringify(mode)};window.qrFixture.hidden=false;window.qrFixture.mount(true);window.qrFixture.open(false);`);
  await waitFor(`!document.querySelector('[role="dialog"]')`);
  await click('Open synthetic scanner'); await waitFor(`!!document.querySelector('[role="dialog"]')`);
}
async function check(name, action) { await action(); results.push(name); console.log('PASS: ' + name); }
try {
  child = spawn(browser, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--disable-extensions',
    '--disable-background-networking', '--disable-component-update', '--disable-default-apps', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  child.on('error', () => { closed = true; }); child.on('exit', () => { closed = true; });
  let port; const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (closed) throw new Error('Disposable browser exited before debugging was ready');
    try { port = Number((await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); if (port) break; } catch { /* Starting. */ }
    await delay(50);
  }
  if (!port) throw new Error('Disposable browser debugging was unavailable');
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onclose = () => { for (const waiter of pending.values()) waiter.reject(new Error('CDP closed')); pending.clear(); };
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) { const waiter = pending.get(message.id); pending.delete(message.id); if (message.error) waiter?.reject(new Error('CDP failed')); else waiter?.resolve(message.result); }
    if (message.method === 'Runtime.exceptionThrown') errors.push('uncaught exception');
  };
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp('Page.bringToFront');
  await cdp('Page.navigate', { url: base }); await waitFor(`document.readyState==='complete'&&window.qrFixture?.committed===true&&!!window.qrFixture.open`);
  await check('explicit Start, rear video only, actual decoder, no native detector, confirmation once', async () => {
    await open(); assert.equal(await evaluate('window.qrFixture.calls.length'), 0);
    await click('Bắt đầu quét'); await waitFor(`document.body.textContent.includes('MEDCOM-TEST-001')`);
    assert.equal(await evaluate('window.qrFixture.confirms'), 0); assert.equal(await evaluate('window.qrFixture.stops'), 1);
    assert.equal(await evaluate('window.qrFixture.calls[0].audio'), false);
    assert.equal(await evaluate('window.qrFixture.calls[0].video.facingMode.ideal'), 'environment');
    await click('Dùng mã này'); await waitFor(`!document.querySelector('[role="dialog"]')`); assert.equal(await evaluate('window.qrFixture.confirms'), 1);
  });
  await check('denied permission gives accessible manual fallback and opaque escaped text', async () => {
    await open('denied'); await click('Bắt đầu quét'); await waitFor(`document.body.textContent.includes('Camera chưa được cho phép')`);
    await click('Nhập mã thủ công'); await waitFor(`document.activeElement?.tagName==='INPUT'`);
    await evaluate(`(()=>{const i=document.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'<img src=x onerror=alert(1)>');i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await waitFor(`![...document.querySelectorAll('button')].find(b=>b.textContent==='Dùng mã này').disabled`);
    assert.equal(await evaluate(`!!document.querySelector('img')`), false);
    await click('Dùng mã này'); await waitFor(`!document.querySelector('[role="dialog"]')`); assert.equal(await evaluate('window.qrFixture.confirms'), 2);
  });
  await check('closing pending permission stops late-acquired synthetic track', async () => {
    await open('pending'); const before = await evaluate('window.qrFixture.stops'); await click('Bắt đầu quét');
    await waitFor(`typeof window.qrFixture.resolve==='function'`); await click('Hủy'); await evaluate('window.qrFixture.resolve()');
    await waitFor(`window.qrFixture.stops===${before + 1}`); assert.equal(await evaluate('window.qrFixture.confirms'), 2);
  });
  await check('background stops stream; foreground requires fresh explicit Start', async () => {
    await open('blank'); await click('Bắt đầu quét'); await waitFor(`document.body.textContent.includes('Đưa mã QR')`);
    const before = await evaluate('window.qrFixture.stops'), calls = await evaluate('window.qrFixture.calls.length');
    await evaluate(`window.qrFixture.hidden=true;document.dispatchEvent(new Event('visibilitychange'));`); await waitFor(`window.qrFixture.stops===${before + 1}`);
    await evaluate(`window.qrFixture.hidden=false;document.dispatchEvent(new Event('visibilitychange'));`); await delay(300);
    assert.equal(await evaluate('window.qrFixture.calls.length'), calls); await click('Hủy');
  });
  await check('session scope replacement releases stream and clears candidate', async () => {
    await open('blank'); await click('Bắt đầu quét'); await waitFor(`document.body.textContent.includes('Đưa mã QR')`);
    const before = await evaluate('window.qrFixture.stops'); await evaluate(`window.qrFixture.scope('synthetic-session-b')`);
    await waitFor(`window.qrFixture.stops===${before + 1}`); assert.equal(await evaluate(`!!document.querySelector('video')?.srcObject`), false);
    await click('Hủy'); await open(); await click('Bắt đầu quét'); await waitFor(`document.body.textContent.includes('MEDCOM-TEST-001')`);
    await evaluate(`window.qrFixture.scope(null)`); await waitFor(`!document.querySelector('[role="dialog"]')`); assert.equal(await evaluate('window.qrFixture.confirms'), 2);
    await evaluate(`window.qrFixture.scope('synthetic-session-c');window.qrFixture.open(false);`);
  });
  await check('unmount and pagehide release their streams', async () => {
    await open('blank'); await click('Bắt đầu quét'); await waitFor(`document.body.textContent.includes('Đưa mã QR')`);
    let before = await evaluate('window.qrFixture.stops'); await evaluate('window.qrFixture.mount(false)'); await waitFor(`window.qrFixture.stops===${before + 1}`);
    await open('blank'); await click('Bắt đầu quét'); await waitFor(`document.body.textContent.includes('Đưa mã QR')`);
    before = await evaluate('window.qrFixture.stops'); await evaluate(`window.dispatchEvent(new Event('pagehide'))`); await waitFor(`window.qrFixture.stops===${before + 1}`); await click('Hủy');
  });
  await check('close request stops capture immediately even if caller delays closing', async () => {
    await open('blank'); await click('Bắt đầu quét'); await waitFor(`document.body.textContent.includes('Đưa mã QR')`);
    const before = await evaluate('window.qrFixture.stops'); await evaluate('window.qrFixture.holdClose=true'); await click('Hủy');
    await waitFor(`window.qrFixture.stops===${before + 1}`); assert.equal(await evaluate(`!!document.querySelector('[role="dialog"]')`), true);
    await evaluate('window.qrFixture.holdClose=false;window.qrFixture.open(false)');
  });
  await check('unsupported camera permits keyboard manual input; URL never navigates or submits', async () => {
    await evaluate(`window.qrFixture.media=navigator.mediaDevices;Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:undefined});`);
    await open(); await click('Bắt đầu quét'); await waitFor(`document.body.textContent.includes('Không có camera')`);
    await click('Nhập mã thủ công'); await waitFor(`document.activeElement?.tagName==='INPUT'`);
    await cdp('Input.insertText', { text: 'https://example.invalid/synthetic-only' });
    await click('Dùng mã này'); await waitFor(`!document.querySelector('[role="dialog"]')`);
    assert.equal(await evaluate('location.origin'), base); assert.equal(await evaluate('window.qrFixture.confirms'), 3);
    await evaluate(`Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:window.qrFixture.media})`);
  });
  await check('Cancel and Escape retire decoded candidates before delayed parent close; reopening starts empty', async () => {
    for (const method of ['cancel', 'escape']) {
      await open(); const calls = await evaluate('window.qrFixture.calls.length');
      await click('Bắt đầu quét'); await waitFor(`document.body.textContent.includes('MEDCOM-TEST-001')`);
      const confirms = await evaluate('window.qrFixture.confirms');
      await evaluate(`window.qrFixture.holdClose=true;window.qrFixture.staleConfirm=[...document.querySelectorAll('button')].find(b=>b.textContent==='Dùng mã này');void 0;`);
      if (method === 'cancel') await click('Hủy');
      else {
        await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      }
      await waitFor(`document.body.textContent.includes('Đã dừng quét. Đang đóng cửa sổ.')`);
      assert.equal(await evaluate(`!!document.querySelector('[role="dialog"]')`), true);
      assert.equal(await evaluate(`document.body.textContent.includes('MEDCOM-TEST-001')`), false);
      assert.equal(await evaluate(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Dùng mã này')`), false);
      await evaluate('window.qrFixture.staleConfirm.click()');
      assert.equal(await evaluate('window.qrFixture.confirms'), confirms);
      await evaluate('window.qrFixture.holdClose=false;window.qrFixture.open(false)'); await waitFor(`!document.querySelector('[role="dialog"]')`);
      await open(); await delay(300);
      assert.equal(await evaluate('window.qrFixture.calls.length'), calls + 1);
      assert.equal(await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Dùng mã này').disabled`), true);
      await click('Nhập mã thủ công'); await waitFor(`document.activeElement?.tagName==='INPUT'`);
      assert.equal(await evaluate(`document.querySelector('input').value`), '');
      await click('Hủy');
    }
  });
  await check('mobile controls fit viewport, touch size, Escape and focus restoration', async () => {
    await open();
    await waitFor(`!document.querySelector('[role="dialog"]').getAnimations().some(animation=>animation.playState==='running')`);
    assert.equal(await evaluate(`document.documentElement.scrollWidth<=390`), true);
    const sizes = await evaluate(`[...document.querySelector('[role="dialog"]').querySelectorAll('button')].filter(b=>b.textContent.trim()).map(b=>b.getBoundingClientRect().height)`);
    assert.ok(sizes.every(size => size >= 44));
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await waitFor(`!document.querySelector('[role="dialog"]')`); await waitFor(`document.activeElement?.id==='launch'`);
  });
  assert.deepEqual(errors, []); assert.ok(requests.every(url => ['/', '/fixture.js', '/fixture.css', '/favicon.ico'].includes(url)));
  console.log(JSON.stringify({ passed: results.length, failed: 0, realCameraActivated: false, realDeviceAcceptance: false,
    browser: (await cdp('Browser.getVersion')).product, node: process.version }));
} finally {
  if (socket?.readyState === WebSocket.OPEN) { try { await cdp('Browser.close'); } catch { /* Confirm teardown below. */ } socket.close(); }
  if (child && !closed) { child.kill(); for (let i = 0; i < 30 && !closed; i++) await delay(100); }
  await new Promise(resolve => server.close(resolve));
  const resolved = path.resolve(profile), parent = path.resolve(tmpdir());
  if (!resolved.startsWith(parent + path.sep) || !path.basename(resolved).startsWith('medcom-qr-synthetic-')) throw new Error('Unsafe disposable-profile cleanup target');
  if (closed) await rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  else throw new Error('Disposable browser teardown not confirmed');
}
