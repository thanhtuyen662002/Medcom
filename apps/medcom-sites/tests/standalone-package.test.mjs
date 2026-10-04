import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ADMISSION, MANIFEST, assertRealDirectory, assertReleaseInputs, physicallyContained, sameFilesystemObject, copyTree, packageStandalone, rebuildAndPackage, validatePath } from '../scripts/package-standalone.mjs';
import { verifyStandalone } from '../scripts/verify-standalone.mjs';

const revision = 'a'.repeat(40);
async function fixture(t) {
  // Windows runner TEMP may be an alias or junction. Use its canonical
  // location for ordinary fixtures; dedicated tests retain link rejection.
  const tempRoot = await fs.realpath(os.tmpdir());
  const dir = await fs.mkdtemp(path.join(tempRoot, 'medcom-package-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const appRoot = path.join(dir, 'app');
  const outputRoot = path.join(dir, 'artifacts');
  for (const [name, value] of [['.next/standalone/server.js', '// standalone fixture'], ['.next/static/chunks/app.js', 'exact static bytes\r\n'], ['public/medcom-logo.png', Buffer.from([0, 1, 128, 255])]]) {
    const target = path.join(appRoot, name);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, value);
  }
  return { dir, appRoot, outputRoot, sourceRevision: revision, sourceState: 'CLEAN_CHECKED_OUT_REVISION' };
}

test('assembles byte-exact package and verifies blocked metadata', async t => {
  const options = await fixture(t);
  const { output, manifest } = await packageStandalone(options);
  assert.equal(manifest.admission, ADMISSION);
  assert.equal(manifest.sourceRevision, revision);
  assert.equal(manifest.files.length, 3);
  assert.deepEqual(await fs.readFile(path.join(output, 'public/medcom-logo.png')), Buffer.from([0, 1, 128, 255]));
  assert.equal((await verifyStandalone(output, { expectedRevision: revision })).productionAuthorized, false);
  await assert.rejects(verifyStandalone(output, { expectedRevision: 'b'.repeat(40) }), /revision/);
  await assert.rejects(packageStandalone(options), /already exists/);
});

for (const mutation of ['missing', 'extra', 'changed']) test(`rejects ${mutation} package content`, async t => {
  const { output } = await packageStandalone(await fixture(t));
  if (mutation === 'missing') await fs.unlink(path.join(output, 'server.js'));
  if (mutation === 'extra') await fs.writeFile(path.join(output, 'extra.js'), 'extra');
  if (mutation === 'changed') await fs.writeFile(path.join(output, 'server.js'), 'changed');
  await assert.rejects(verifyStandalone(output), /Missing|Extra|mismatch/);
});

for (const file of ['.env.production', 'private.key', 'wrangler.jsonc', 'appsettings.Production.json', 'Tools.dll', 'Tool.dll', '.openai', '.sites-runtime', 'cloudflare-env.d.ts']) test(`rejects private or cloud-only content ${file}`, async t => {
  const options = await fixture(t);
  await fs.writeFile(path.join(options.appRoot, '.next/standalone', file), 'synthetic');
  await assert.rejects(packageStandalone(options), /Disallowed/);
});

test('rejects traversal and Windows alternate-stream or ambiguous paths', () => {
  for (const value of ['../outside', '/absolute', 'a\\b', 'a/../b', 'file:stream', 'CON.txt', 'aux', 'a./b', 'a /b', 'a//b', './a', 'a\u0000b']) assert.throws(() => validatePath(value));
});

test('rejects malicious manifest metadata and paths', async t => {
  const { output } = await packageStandalone(await fixture(t));
  const name = path.join(output, MANIFEST);
  const original = JSON.parse(await fs.readFile(name, 'utf8'));
  for (const mutate of [m => { m.files[0].path = '../outside'; }, m => { m.files.push(m.files[0]); }, m => { m.admission = 'APPROVED'; }, m => { m.server = '../server.js'; }]) {
    const manifest = structuredClone(original);
    mutate(manifest);
    await fs.writeFile(name, JSON.stringify(manifest));
    await assert.rejects(verifyStandalone(output));
  }
});

test('materializes contained pnpm directory junctions and rejects escapes/cycles', async t => {
  const { dir } = await fixture(t);
  const source = path.join(dir, 'source');
  await fs.mkdir(path.join(source, '.pnpm/pkg'), { recursive: true });
  await fs.writeFile(path.join(source, '.pnpm/pkg/index.js'), 'module');
  await fs.symlink(path.join(source, '.pnpm/pkg'), path.join(source, 'pkg'), process.platform === 'win32' ? 'junction' : 'dir');
  await copyTree(source, path.join(dir, 'safe'));
  assert.equal((await fs.lstat(path.join(dir, 'safe/pkg'))).isSymbolicLink(), false);
  assert.equal(await fs.readFile(path.join(dir, 'safe/pkg/index.js'), 'utf8'), 'module');
  await fs.symlink(dir, path.join(source, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(copyTree(source, path.join(dir, 'escaped')), /escapes/);
  await fs.unlink(path.join(source, 'escape'));
  await fs.symlink(source, path.join(source, 'cycle'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(copyTree(source, path.join(dir, 'cycled')), /Cyclic/);
});

test('verifier rejects package junctions', async t => {
  const { output } = await packageStandalone(await fixture(t));
  await fs.symlink(path.join(output, 'public'), path.join(output, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(verifyStandalone(output), /link/);
});

test('rejects source root junction and cross-platform target claims', async t => {
  const options = await fixture(t);
  await assert.rejects(packageStandalone({ ...options, platform: process.platform === 'win32' ? 'linux' : 'win32' }), /actual target/);
  const source = path.join(options.appRoot, '.next/standalone');
  const other = path.join(options.dir, 'other');
  await fs.rename(source, other);
  await fs.symlink(other, source, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(packageStandalone(options), /real directory/);
});

test('smoke serves packaged bytes with no inherited backend configuration and tears down', async t => {
  const options = await fixture(t);
  const source = `const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
http.createServer((req, res) => {
  if (req.url === '/') return res.end('<html><body>synthetic</body></html>');
  if (req.url === '/api/erp/api/workspace') { res.statusCode = 503; res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ code: process.env.MEDCOM_API_ORIGIN ? 'unsafe_environment' : 'backend_not_configured' })); }
  const file = req.url === '/medcom-logo.png' ? 'public/medcom-logo.png' : '.next/static/chunks/app.js';
  res.end(fs.readFileSync(path.join(__dirname, file)));
}).listen(Number(process.env.PORT), process.env.HOSTNAME);`;
  await fs.writeFile(path.join(options.appRoot, '.next/standalone/server.js'), source);
  const { output } = await packageStandalone(options);
  const { smokeStandalone } = await import('../scripts/smoke-standalone.mjs');
  const old = process.env.MEDCOM_API_ORIGIN;
  process.env.MEDCOM_API_ORIGIN = 'http://127.0.0.1:1';
  try { assert.equal((await smokeStandalone(output, { expectedRevision: revision })).unconfiguredBff, true); }
  finally { if (old === undefined) delete process.env.MEDCOM_API_ORIGIN; else process.env.MEDCOM_API_ORIGIN = old; }
});

test('rejects extra empty directories and build caches', async t => {
  const options = await fixture(t);
  const { output } = await packageStandalone(options);
  await fs.mkdir(path.join(output, 'unexpected-empty'));
  await assert.rejects(verifyStandalone(output), /extra package directory/);
  assert.throws(() => validatePath('.next/cache/example'), /Build caches/);
});

test('materialized pnpm packages retain traced hoisted dependency resolution', async t => {
  const { dir } = await fixture(t);
  const source = path.join(dir, 'pnpm-source');
  const a = path.join(source, 'node_modules/.pnpm/a@1/node_modules/a');
  const b = path.join(source, 'node_modules/.pnpm/b@1/node_modules/b');
  await fs.mkdir(a, { recursive: true });
  await fs.mkdir(b, { recursive: true });
  await fs.mkdir(path.join(source, 'node_modules/.pnpm/node_modules'), { recursive: true });
  await fs.writeFile(path.join(a, 'package.json'), JSON.stringify({ name: 'a', main: 'index.js', dependencies: { b: '1' } }));
  await fs.writeFile(path.join(a, 'index.js'), "module.exports = require('b');");
  await fs.writeFile(path.join(b, 'package.json'), JSON.stringify({ name: 'b', main: 'index.js' }));
  await fs.writeFile(path.join(b, 'index.js'), "module.exports = 'traced-dependency';");
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  await fs.symlink(a, path.join(source, 'node_modules/a'), linkType);
  await fs.symlink(b, path.join(source, 'node_modules/.pnpm/node_modules/b'), linkType);
  const output = path.join(dir, 'pnpm-output');
  await copyTree(source, output);
  const { createRequire } = await import('node:module');
  assert.equal(createRequire(path.join(output, 'entry.cjs'))('a'), 'traced-dependency');
  assert.equal((await fs.lstat(path.join(output, 'node_modules/a/node_modules/b'))).isSymbolicLink(), false);
});

test('local assembly is explicitly unverified and cannot pass exact-revision verification', async t => {
  const options = await fixture(t);
  delete options.sourceState;
  const { output, manifest } = await packageStandalone(options);
  assert.equal(manifest.sourceState, 'UNVERIFIED_LOCAL');
  assert.equal((await verifyStandalone(output)).integrityVerified, true);
  await assert.rejects(verifyStandalone(output, { expectedRevision: revision }), /unverified local/);
});


test('release packaging rebuilds stale output between source fences', async t => {
  const options = await fixture(t);
  const events = [];
  const { output, manifest } = await rebuildAndPackage(options, {
    assertClean: () => { events.push('fence'); },
    build: async () => {
      events.push('build');
      await fs.writeFile(path.join(options.appRoot, '.next/standalone/server.js'), '// newly built from checked source');
    },
  });
  assert.deepEqual(events, ['fence', 'build', 'fence', 'fence']);
  assert.equal(await fs.readFile(path.join(output, 'server.js'), 'utf8'), '// newly built from checked source');
  assert.equal(manifest.sourceState, 'CLEAN_CHECKED_OUT_REVISION');
});

for (const failAt of [1, 2, 3]) test(`source fence ${failAt} blocks release output`, async t => {
  const options = await fixture(t);
  let fences = 0;
  let builds = 0;
  await assert.rejects(rebuildAndPackage(options, {
    assertClean: () => { if (++fences === failAt) throw new Error('Changed source or HEAD'); },
    build: () => { builds++; },
  }), /Changed source/);
  assert.equal(builds, failAt === 1 ? 0 : 1);
  await assert.rejects(fs.access(path.join(options.outputRoot, `medcom-frontend-${process.platform}-${process.arch}`)));
});

test('failed native build never falls back to stale standalone output', async t => {
  const options = await fixture(t);
  await assert.rejects(rebuildAndPackage(options, {
    assertClean: () => {},
    build: () => { throw new Error('Build failed'); },
  }), /Build failed/);
  await assert.rejects(fs.access(path.join(options.outputRoot, `medcom-frontend-${process.platform}-${process.arch}`)));
});

test('legitimate traced native npm DLL names remain permitted', () => {
  assert.equal(validatePath('node_modules/@img/example/native-library.dll'), 'node_modules/@img/example/native-library.dll');
});


async function trackedInputFixture(t) {
  const options = await fixture(t);
  const { execFileSync } = await import('node:child_process');
  const git = args => execFileSync('git', args, { cwd: options.appRoot, encoding: 'utf8' });
  await fs.writeFile(path.join(options.appRoot, '.gitignore'), '**/bin/\n.env*\n!.env.example\n.next/\n');
  await fs.writeFile(path.join(options.appRoot, '.env.example'), 'EXAMPLE_ONLY=\n');
  git(['init', '--quiet']);
  git(['add', '.']);
  return { ...options, git };
}

test('release inputs allow tracked public files and tracked dotenv example', async t => {
  const { appRoot } = await trackedInputFixture(t);
  await assertReleaseInputs(appRoot);
});

test('release inputs reject git-ignored public/bin/private.json', async t => {
  const { appRoot, git } = await trackedInputFixture(t);
  await fs.mkdir(path.join(appRoot, 'public/bin'));
  await fs.writeFile(path.join(appRoot, 'public/bin/private.json'), '{"synthetic":"private"}');
  assert.equal(git(['ls-files', '--others', '--exclude-standard']).trim(), '');
  await assert.rejects(assertReleaseInputs(appRoot), /not a tracked file: public\/bin\/private.json/);
});

for (const name of ['.env.local', '.env.production.local', '.env.production', '.env']) test(`release inputs reject ignored ${name}`, async t => {
  const { appRoot, git } = await trackedInputFixture(t);
  await fs.writeFile(path.join(appRoot, name), 'SYNTHETIC_TEST_VALUE=ignored\n');
  assert.equal(git(['ls-files', '--others', '--exclude-standard']).trim(), '');
  await assert.rejects(assertReleaseInputs(appRoot), /Local environment input is forbidden/);
});


test('release inputs reject ignored discoverable Next routes', async t => {
  const { appRoot, git } = await trackedInputFixture(t);
  await fs.mkdir(path.join(appRoot, 'app/bin'), { recursive: true });
  await fs.writeFile(path.join(appRoot, 'app/bin/page.tsx'), 'export default function Page() { return null; }');
  assert.equal(git(['ls-files', '--others', '--exclude-standard']).trim(), '');
  await assert.rejects(assertReleaseInputs(appRoot), /not a tracked file: app\/bin\/page.tsx/);
});

test('release inputs reject ignored root build configuration', async t => {
  const { appRoot, git } = await trackedInputFixture(t);
  await fs.appendFile(path.join(appRoot, '.gitignore'), 'next.config.ts\n');
  git(['add', '.gitignore']);
  await fs.writeFile(path.join(appRoot, 'next.config.ts'), 'export default {};');
  assert.equal(git(['ls-files', '--others', '--exclude-standard']).trim(), '');
  await assert.rejects(assertReleaseInputs(appRoot), /not a tracked file: next\.config\.ts/);
});


test('release guard allows normal generated Next declaration and TypeScript build info', async t => {
  const { appRoot, git } = await trackedInputFixture(t);
  await fs.appendFile(path.join(appRoot, '.gitignore'), 'next-env.d.ts\n*.tsbuildinfo\n');
  git(['add', '.gitignore']);
  await fs.writeFile(path.join(appRoot, 'next-env.d.ts'), '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n');
  await fs.writeFile(path.join(appRoot, 'tsconfig.tsbuildinfo'), '{}');
  assert.equal(git(['ls-files', '--others', '--exclude-standard']).trim(), '');
  await assertReleaseInputs(appRoot);
});


function syntheticStat(ino, { link = false, directory = true } = {}) {
  return { dev: 1n, ino: BigInt(ino), isDirectory: () => directory, isSymbolicLink: () => link };
}

test('Windows canonical spelling differences use file identity without case folding', async () => {
  const requested = String.raw`c:\Users\RUNNER~1\Temp\package`;
  const canonical = String.raw`C:\Users\runneradmin\Temp\package`;
  const filesystem = {
    realpath: async () => canonical,
    lstat: async value => syntheticStat(value === requested || value === canonical ? 42 : 1),
  };
  await assertRealDirectory(requested, { filesystem, pathApi: path.win32 });
  await assert.rejects(assertRealDirectory(requested, {
    filesystem: { ...filesystem, lstat: async value => syntheticStat(value === canonical ? 43 : 42) },
    pathApi: path.win32,
  }), /real directory/);
  assert.equal(sameFilesystemObject(syntheticStat(42), syntheticStat(43)), false);
});

test('Windows identity normalization still rejects a junction ancestor', async () => {
  const root = String.raw`C:\parent\junction\package`;
  await assert.rejects(assertRealDirectory(root, {
    filesystem: {
      realpath: async () => root,
      lstat: async value => syntheticStat(42, { link: value === String.raw`C:\parent\junction` }),
    },
    pathApi: path.win32,
  }), /real directory/);
});

test('physical Windows containment rejects distinct case-sensitive sibling identity', async () => {
  const root = String.raw`C:\source\CaseRoot`;
  const sibling = String.raw`C:\source\CASEROOT`;
  const candidate = `${sibling}\\private.js`;
  const identities = new Map([[root, 10], [sibling, 20], [candidate, 30], [String.raw`C:\source`, 2], ['C:\\', 1]]);
  const filesystem = { lstat: async value => syntheticStat(identities.get(value), { directory: value !== candidate }) };
  assert.equal(path.win32.relative(root, candidate), 'private.js');
  assert.equal(await physicallyContained(root, candidate, { filesystem, pathApi: path.win32 }), false);
  assert.equal(await physicallyContained(root, `${root}\\asset.js`, {
    filesystem: { lstat: async value => syntheticStat(value === root ? 10 : 40, { directory: value === root }) },
    pathApi: path.win32,
  }), true);
});

test('real directory validation rejects a linked ancestor', async t => {
  const { dir } = await fixture(t);
  const real = path.join(dir, 'real');
  const link = path.join(dir, 'linked');
  await fs.mkdir(path.join(real, 'nested'), { recursive: true });
  await fs.symlink(real, link, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(assertRealDirectory(path.join(link, 'nested')), /real directory/);
  await assertRealDirectory(path.join(real, 'nested'));
});

if (process.platform === 'win32') test('Windows runtime accepts canonical drive-letter spelling aliases', async t => {
  const { dir } = await fixture(t);
  const canonical = await fs.realpath(dir);
  await assertRealDirectory(canonical);
  const alternateDrive = canonical.replace(/^[a-z]:/i, drive => drive[0] === drive[0].toUpperCase() ? drive.toLowerCase() : drive.toUpperCase());
  await assertRealDirectory(alternateDrive);
  assert.equal(await physicallyContained(alternateDrive, canonical), true);
});
