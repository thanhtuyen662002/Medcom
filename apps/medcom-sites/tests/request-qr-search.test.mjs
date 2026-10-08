import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
const require = createRequire(import.meta.url);
const React = require('react');
const { create, act } = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
await build({ entryPoints: ['lib/erp/request-qr-search.ts'], outdir: '.test-runtime/request-qr-search', bundle: true,
  platform: 'node', format: 'esm', logLevel: 'silent' });
const { validateRequestQrSearchText: validate } = await import('../.test-runtime/request-qr-search/request-qr-search.js');

test('bounded opaque text: exact 100, 101, malformed, whitespace, controls, inert literals', () => {
  for (const value of ['A'.repeat(100), ' A ', '😀'.repeat(50), 'https://example.invalid/a', '<img onerror=alert(1)>', '{"route":"/x"}']) {
    assert.deepEqual(validate(value), { ok: true, text: value });
  }
  for (const value of ['A'.repeat(101), '😀'.repeat(51), '', ' \t\n', 'x\n', 'x\0', '\x7f', 'x\x85', '\ud800', '\udc00', '\ud800x', null, {}, 42]) {
    assert.equal(validate(value).ok, false);
    assert.ok(validate(value).message.length > 0);
  }
});

// Exercise actual wrapper, scanner and camera. Only DOM presentation primitives
// are doubled for Node; native focus/Escape/layout are browser-only assertions.
const componentBuildOptions = { stdin: { contents: `export {RequestQrSearch} from './components/erp/request-qr-search';export {QrScanner} from './components/erp/qr-scanner';`, resolveDir: process.cwd(), loader: 'tsx' },
  outfile: '.test-runtime/request-qr-search/component.cjs', bundle: true, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic',
  alias: { '@': process.cwd() }, logLevel: 'silent', plugins: [{ name: 'dom-primitives', setup(builder) {
    builder.onResolve({ filter: /components\/ui\/(button|input|dialog)$/ }, args => ({ path: args.path.split('/').at(-1), namespace: 'dom-test' }));
    builder.onLoad({ filter: /.*/, namespace: 'dom-test' }, args => ({ loader: 'tsx', resolveDir: process.cwd(), contents: args.path === 'dialog'
      ? `import React from 'react';const C=React.createContext(false);export function Dialog({open,children}){return <C.Provider value={open}>{children}</C.Provider>};export function DialogContent({children}){return React.useContext(C)?<section role="dialog">{children}</section>:null};export const DialogHeader=({children})=><div>{children}</div>;export const DialogTitle=({children})=><h2>{children}</h2>;export const DialogDescription=({children})=><p>{children}</p>;`
      : args.path === 'button' ? `import React from 'react';export const Button=({variant,...props})=><button {...props}/>;`
      : `import React from 'react';export const Input=props=><input {...props}/>;` }));
  } }] };
await build(componentBuildOptions);
const { RequestQrSearch, QrScanner } = require('../.test-runtime/request-qr-search/component.cjs');

test('actual component in form: confirmation, rejection, repeats, reopen and lifetime fences', async () => {
  const events = new EventTarget();
  globalThis.document = { addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) };
  globalThis.window = { addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) };
  const delivered = []; const counters = { submit: 0, network: 0, navigation: 0, command: 0, branch: 0, filter: 0, page: 0, selection: 0 };
  let props = { scopeKey: 'session-a', disabled: false, presentationAllowed: true, onConfirmedSearchText: value => delivered.push(value) }, root;
  function Host({config}) {
    const [text, setText] = React.useState('');
    return React.createElement('form', { onSubmit: () => counters.submit++ },
      React.createElement('input', {id:'parent-search', value:text, onChange:event=>setText(event.target.value)}),
      React.createElement(RequestQrSearch, {...config,onConfirmedSearchText:value=>{config.onConfirmedSearchText(value);setText(value);}}));
  }
  const render = () => React.createElement(Host, {config:props});
  const manualInput = () => root.root.findByProps({role:'dialog'}).findByType('input');
  const button = label => root.root.findAllByType('button').find(b => b.children.join('') === label);
  const click = async label => { const b = button(label); assert.ok(b); assert.equal(b.props.type, 'button'); assert.ok(!b.props.disabled); await act(async () => b.props.onClick()); };
  const scanner = () => root.root.findByType(QrScanner);
  const manual = async value => { await click('Nhập mã thủ công'); await act(async () => manualInput().props.onChange({ target: { value } })); };
  const open = () => click('Quét QR vào ô tìm kiếm');
  const update = async change => { props = { ...props, ...change }; await act(async () => root.update(render())); };
  try {
    await act(async () => { root = create(render()); });
    await open(); await manual(' A '); assert.deepEqual(delivered, []);
    const old = scanner().props.onConfirm;
    await click('Dùng mã này'); await act(async () => old('duplicate')); assert.deepEqual(delivered, [' A ']); assert.equal(root.root.findByProps({id:'parent-search'}).props.value, ' A ');
    for (const value of ['A'.repeat(100), 'https://example.invalid/a', '<img onerror=alert(1)>', '{"route":"/x"}']) {
      await open(); await manual(value); await click('Dùng mã này'); assert.equal(delivered.at(-1), value); assert.equal(root.root.findByProps({id:'parent-search'}).props.value, value);
    }
    for (const value of ['A'.repeat(101), '\ud800', 'x\x85']) {
      const count = delivered.length; await open(); await manual(value); await click('Dùng mã này');
      assert.equal(delivered.length, count); assert.ok(root.root.findAllByProps({ role: 'status' }).length); assert.equal(scanner().props.open, false);
    }
    for (const value of ['', '   ', 'x\n']) {
      await open(); await manual(value); assert.equal(button('Dùng mã này').props.disabled, true); await click('Hủy');
    }
    await open(); await manual('cancelled'); const cancelled = scanner().props.onConfirm; await click('Hủy');
    await act(async () => cancelled('late')); assert.ok(!delivered.includes('late'));
    await open(); await act(async () => cancelled('old after reopen')); assert.ok(!delivered.includes('old after reopen')); await click('Hủy');
    for (const change of [{ scopeKey: 'session-b' }, { scopeKey: null }, { presentationAllowed: false }, { disabled: true }]) {
      await update({ scopeKey: 'session-a', presentationAllowed: true, disabled: false });
      await open(); await manual('late boundary'); const stale = scanner().props.onConfirm;
      await update(change); await act(async () => stale('late boundary')); assert.ok(!delivered.includes('late boundary'));
      if (change.scopeKey === 'session-b') assert.equal(scanner().props.open, false);
      else assert.equal(root.root.findAllByType(QrScanner).length, 0);
      await update({ scopeKey: 'session-a', presentationAllowed: true, disabled: false });
      assert.equal(scanner().props.open, false); await act(async () => stale('after recovery')); assert.ok(!delivered.includes('after recovery'));
    }
    await open(); await manual('fresh'); assert.equal(manualInput().props.value, 'fresh');
    await click('Hủy'); await open(); await click('Nhập mã thủ công'); assert.equal(manualInput().props.value, '');
    assert.ok(root.root.findAllByType('button').every(b => b.props.type === 'button'));
    assert.deepEqual(counters, { submit: 0, network: 0, navigation: 0, command: 0, branch: 0, filter: 0, page: 0, selection: 0 });
    const stale = scanner().props.onConfirm; await act(async () => root.unmount()); await act(async () => stale('unmounted'));
    assert.ok(!delivered.includes('unmounted'));
    console.log(JSON.stringify({ delivered: delivered.length, counters, actualScanner: true, lateDeliveries: 0 }));
  } finally { if (root) await act(async () => root.unmount()); delete globalThis.document; delete globalThis.window; }
});

test('browser readiness matches the actual initialized App and mounted scan button', async () => {
  const source = await readFile('tests/request-qr-search.browser.mjs', 'utf8');
  const entry = source.match(/const entry = `([\s\S]*?)`;/)?.[1];
  const condition = source.match(/await cdp\('Page.navigate', \{ url: base \}\); await waitFor\(`([^`]+)`\)/)?.[1];
  assert.ok(entry && condition, 'Read the actual browser fixture and initial readiness wait');
  assert.doesNotMatch(condition, /qrFixture(?:\?\.)?\.?open/);
  const mount = "createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);";
  assert.ok(entry.includes(mount));
  await build({ ...componentBuildOptions,
    stdin: {contents:entry.replace(mount, 'export {App};'),resolveDir:process.cwd(),loader:'tsx'},
    outfile: '.test-runtime/request-qr-search/browser-app.cjs' });
  const { App } = require('../.test-runtime/request-qr-search/browser-app.cjs');
  const events = new EventTarget();
  const fixture = {};
  let root;
  const document = {readyState:'complete',
    addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),
    querySelectorAll:selector=>{
      assert.equal(selector,'button');
      return root ? root.root.findAllByType('button').map(button=>({textContent:button.children.join(''),disabled:!!button.props.disabled})) : [];
    }};
  const window = {qrFixture:fixture,addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events)};
  globalThis.document = document;globalThis.window = window;
  const ready = () => runInNewContext(condition, {document,window});
  try {
    assert.equal(ready(),false);
    await act(async()=>{root=create(React.createElement(React.StrictMode,null,React.createElement(App)));});
    assert.equal(fixture.committed,true);
    assert.equal(Object.hasOwn(fixture,'open'),false);
    assert.ok(['scope','disabled','allowed'].every(key=>typeof fixture[key]==='function'));
    assert.equal(ready(),true);
    document.readyState='loading';assert.equal(ready(),false);document.readyState='complete';
    fixture.committed=false;assert.equal(ready(),false);fixture.committed=true;
    await act(async()=>fixture.disabled(true));assert.equal(ready(),false);
    await act(async()=>fixture.disabled(false));assert.equal(ready(),true);
    const query = document.querySelectorAll;document.querySelectorAll=()=>[];assert.equal(ready(),false);document.querySelectorAll=query;
    console.log(JSON.stringify({readinessMatchesInitializedApp:true,nonexistentOpenRequired:false,nativeBrowserExecuted:false}));
  } finally {
    if(root)await act(async()=>root.unmount());delete globalThis.document;delete globalThis.window;
  }
});
