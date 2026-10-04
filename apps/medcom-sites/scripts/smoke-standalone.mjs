import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { verifyStandalone } from './verify-standalone.mjs';
import { isMain } from './package-standalone.mjs';

async function freePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

export async function smokeStandalone(root, { expectedRevision, timeoutMs = 30_000 } = {}) {
  if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('Smoke requires Node 24');
  const { manifest } = await verifyStandalone(root, { expectedRevision, expectedPlatform: process.platform, expectedArch: process.arch });
  const port = await freePort();
  const env = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR']) if (process.env[key]) env[key] = process.env[key];
  Object.assign(env, { NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: String(port), NEXT_TELEMETRY_DISABLED: '1' });
  const serverPath = path.resolve(root, ...manifest.server.split('/'));
  const child = spawn(process.execPath, [serverPath], { cwd: path.dirname(serverPath), env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let exited = false;
  let spawnError;
  // Avoid emitting potentially sensitive arbitrary server output to CI logs.
  child.stdout.resume();
  child.stderr.resume();
  child.on('error', error => { spawnError = error; });
  const closed = new Promise(resolve => child.once('close', () => { exited = true; resolve(); }));
  const base = `http://127.0.0.1:${port}`;
  const get = url => fetch(`${base}${url}`, { redirect: 'error', signal: AbortSignal.timeout(3_000) });
  try {
    const deadline = Date.now() + timeoutMs;
    let home;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (exited) throw new Error('Standalone server exited before readiness');
      try { const response = await get('/'); if (response.ok) { home = await response.text(); break; } } catch { /* Still starting. */ }
      await delay(100);
    }
    if (!home || !/<html[\s>]/i.test(home)) throw new Error('Standalone root did not serve HTML before timeout');
    const prefix = manifest.server.includes('/') ? `${manifest.server.slice(0, manifest.server.lastIndexOf('/') + 1)}` : '';
    async function checkFile(relative, url) {
      const expected = manifest.files.find(file => file.path === `${prefix}${relative}`);
      if (!expected) throw new Error(`Missing smoke asset: ${relative}`);
      const response = await get(url);
      if (!response.ok) throw new Error(`Smoke asset request failed: ${url}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length !== expected.size || createHash('sha256').update(bytes).digest('hex') !== expected.sha256) throw new Error(`Served asset differs from package: ${relative}`);
    }
    await checkFile('public/medcom-logo.png', '/medcom-logo.png');
    const asset = manifest.files.find(file => file.path.startsWith(`${prefix}.next/static/`) && /\.(?:js|css)$/.test(file.path));
    if (!asset) throw new Error('No static JS or CSS asset in package');
    const relativeAsset = asset.path.slice(prefix.length);
    await checkFile(relativeAsset, `/_next/static/${relativeAsset.slice('.next/static/'.length).split('/').map(encodeURIComponent).join('/')}`);
    const response = await get('/api/erp/api/workspace');
    if (response.status !== 503 || (await response.json()).code !== 'backend_not_configured') throw new Error('BFF did not return safe unconfigured response');
    return { root: true, logo: true, staticAsset: true, unconfiguredBff: true, productionAuthorized: false };
  } finally {
    if (!exited) {
      child.kill('SIGTERM');
      await Promise.race([closed, delay(3_000, undefined, { ref: false })]);
      if (!exited) { child.kill('SIGKILL'); await Promise.race([closed, delay(3_000, undefined, { ref: false })]); }
      if (!exited) throw new Error('Could not confirm standalone process teardown');
    }
  }
}
if (isMain(import.meta.url)) {
  try {
    if (!process.argv[2]) throw new Error('Usage: node scripts/smoke-standalone.mjs <package-directory> [expected-revision]');
    console.log(JSON.stringify(await smokeStandalone(process.argv[2], { expectedRevision: process.argv[3] })));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
