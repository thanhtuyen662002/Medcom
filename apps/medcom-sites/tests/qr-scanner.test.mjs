import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Standalone entry because the existing shared test runner is parent-owned.
await build({ entryPoints: ['lib/erp/qr-camera.ts', 'lib/erp/qr-decoder.ts'], outdir: '.test-runtime/qr-tests', bundle: true,
  platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
const { QrCamera, cameraFailure } = await import('../.test-runtime/qr-tests/qr-camera.js');
const { decodeQrFrame, validateQrText, MAX_FRAME_SIDE } = await import('../.test-runtime/qr-tests/qr-decoder.js');

// Fixed, synthetic version-1/L QR containing MEDCOM-TEST-001. Generated once
// with npm's qrcode-terminal generator; no generator dependency at test/runtime.
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
function fixture(inverted = false, rotate = false) {
  const side = 116, data = new Uint8ClampedArray(side * side * 4);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    let mx = Math.floor(x / 4) - 4, my = Math.floor(y / 4) - 4;
    if (rotate) [mx, my] = [my, 20 - mx];
    const black = matrix[my]?.[mx] === '1';
    const color = black !== inverted ? 0 : 255, at = (y * side + x) * 4;
    data[at] = data[at + 1] = data[at + 2] = color; data[at + 3] = 255;
  }
  return { data, width: side, height: side };
}
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness(overrides = {}) {
  const states = [], found = [], stopped = [0, 0], requests = [], frames = new Map(), cancelled = [];
  let nextId = 0, active = true;
  const stream = { getTracks: () => stopped.map((_, i) => ({ stop() { stopped[i]++; } })) };
  const video = { srcObject: null, videoWidth: 4000, videoHeight: 2000, readyState: 2, muted: false, playsInline: false, plays: 0,
    async play() { this.plays++; }, pause() {} };
  const surface = { width: 0, height: 0, getContext: () => ({ drawImage() {}, getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) }) };
  const camera = new QrCamera({ acquire: async constraints => { requests.push(constraints); return stream; },
    schedule: callback => { frames.set(++nextId, callback); return nextId; }, cancel: id => { frames.delete(id); cancelled.push(id); },
    active: () => active, canvas: () => surface, decode: async () => ({ kind: 'none' }), ...overrides });
  return { camera, states, found, stopped, requests, frames, cancelled, video, surface, stream,
    setActive(value) { active = value; }, start: () => camera.start(video, state => states.push(state), text => found.push(text)),
    async frame(time = 0) { const [id, callback] = frames.entries().next().value; frames.delete(id); await callback(time); } };
}

test('actual jsqr decodes upright, inverted and rotated synthetic QR without BarcodeDetector', async () => {
  for (const args of [[false, false], [true, false], [false, true]]) {
    const image = fixture(...args);
    assert.deepEqual(await decodeQrFrame(image.data, image.width, image.height), { kind: 'found', text: 'MEDCOM-TEST-001' });
  }
});
test('blank frame and invalid dimensions remain bounded', async () => {
  assert.deepEqual(await decodeQrFrame(new Uint8ClampedArray(400).fill(255), 10, 10), { kind: 'none' });
  for (const [w, h] of [[0, 10], [1.1, 1], [961, 1], [1, 961], [Infinity, 1]]) assert.equal((await decodeQrFrame(new Uint8ClampedArray(4), w, h)).kind, 'invalid');
});
test('text remains opaque; reject blank, controls and overlong payloads', () => {
  for (const value of ['', ' ', 'a\u0000b', 'a\nb', 'x'.repeat(1025)]) assert.equal(validateQrText(value), null);
  for (const value of ['https://example.invalid/untrusted', '<img src=x onerror=alert(1)>', ' Mã tổng hợp ']) assert.equal(validateQrText(value), value);
});
test('construction acquires nothing; Start requests rear video only and bounds frames/rate', async () => {
  const sizes = [], h = harness({ decode: async (_pixels, width, height) => { sizes.push([width, height]); return { kind: 'none' }; } });
  assert.equal(h.requests.length, 0); await h.start();
  assert.equal(h.requests[0].audio, false); assert.equal(h.requests[0].video.facingMode.ideal, 'environment');
  assert.equal(h.video.muted, true); assert.equal(h.video.playsInline, true);
  await h.frame(0); await h.frame(100); await h.frame(250);
  assert.deepEqual(sizes, [[MAX_FRAME_SIDE, 480], [MAX_FRAME_SIDE, 480]]); h.camera.stop();
});
test('detection releases every track, buffer and preview before one candidate callback', async () => {
  const h = harness({ decode: async () => ({ kind: 'found', text: 'synthetic-only' }) });
  await h.start(); await h.frame();
  assert.deepEqual(h.found, ['synthetic-only']); assert.deepEqual(h.stopped, [1, 1]);
  assert.equal(h.video.srcObject, null); assert.equal(h.surface.width, 0); assert.equal(h.frames.size, 0);
  h.camera.stop(); assert.deepEqual(h.stopped, [1, 1]);
});
test('late permission acquisition after close is immediately released', async () => {
  const pending = deferred(), h = harness({ acquire: () => pending.promise });
  const start = h.start(); h.camera.stop(); pending.resolve(h.stream); await start;
  assert.deepEqual(h.stopped, [1, 1]); assert.equal(h.video.plays, 0); assert.deepEqual(h.states, ['starting']); assert.deepEqual(h.found, []);
});
test('late old preview completion does not stop a newer scan', async () => {
  const pending = deferred(), h = harness();
  h.video.play = () => pending.promise;
  const old = h.start(); await tick();
  h.camera.stop(); h.video.play = async () => {};
  await h.start(); pending.resolve(); await old;
  assert.equal(h.video.srcObject, h.stream); assert.equal(h.frames.size, 1); assert.deepEqual(h.stopped, [1, 1]); h.camera.stop();
});
test('late old acquisition cannot replace a newer active stream', async () => {
  const pending = deferred(), h = harness(); let calls = 0;
  const newerStops = [0]; const newer = { getTracks: () => [{ stop() { newerStops[0]++; } }] };
  const camera = new QrCamera({ acquire: () => ++calls === 1 ? pending.promise : Promise.resolve(newer),
    schedule: () => 1, cancel: () => {}, canvas: () => h.surface, active: () => true });
  const old = camera.start(h.video, () => {}, () => {}); await camera.start(h.video, () => {}, () => {});
  pending.resolve(h.stream); await old;
  assert.deepEqual(h.stopped, [1, 1]); assert.equal(h.video.srcObject, newer); assert.deepEqual(newerStops, [0]); camera.stop();
});
test('stopping during decode fences candidates and releases tracks', async () => {
  const pending = deferred(), h = harness({ decode: () => pending.promise });
  await h.start(); const frame = h.frame(); h.camera.stop(); pending.resolve({ kind: 'found', text: 'stale' }); await frame;
  assert.deepEqual(h.found, []); assert.deepEqual(h.stopped, [1, 1]); assert.equal(h.frames.size, 0);
});
test('hidden start never requests a camera; becoming hidden during acquisition releases it', async () => {
  const h = harness(); h.setActive(false); await h.start(); assert.equal(h.requests.length, 0);
  const pending = deferred(), late = harness({ acquire: () => pending.promise });
  const start = late.start(); late.setActive(false); pending.resolve(late.stream); await start; assert.deepEqual(late.stopped, [1, 1]);
});
test('becoming hidden during decode drops the result and stops the stream', async () => {
  const pending = deferred(), h = harness({ decode: () => pending.promise });
  await h.start(); const frame = h.frame(); h.setActive(false); pending.resolve({ kind: 'found', text: 'hidden' }); await frame;
  assert.deepEqual(h.found, []); assert.deepEqual(h.stopped, [1, 1]);
});
test('decode errors and invalid QR do not expose exception details or produce a candidate', async () => {
  for (const decode of [async () => { throw new Error('synthetic-private-error'); }, async () => ({ kind: 'invalid' })]) {
    const h = harness({ decode }); await h.start(); await h.frame();
    assert.deepEqual(h.found, []); assert.deepEqual(h.stopped, [1, 1]); assert.ok(['failed', 'invalid'].includes(h.states.at(-1)));
  }
});
test('permission, missing-device and generic errors have finite user-facing classifications', async () => {
  assert.equal(cameraFailure(new DOMException('Synthetic denial', 'NotAllowedError')), 'denied');
  for (const [name, expected] of [['NotAllowedError', 'denied'], ['SecurityError', 'denied'], ['NotFoundError', 'unavailable'], ['NotReadableError', 'unavailable'], ['OverconstrainedError', 'unavailable'], ['NotSupportedError', 'unavailable'], ['Error', 'failed']]) {
    const error = Object.assign(new Error('not displayed'), { name });
    assert.equal(cameraFailure(error), expected);
    const h = harness({ acquire: async () => { throw error; } }); await h.start(); assert.equal(h.states.at(-1), expected); assert.deepEqual(h.found, []);
  }
});
