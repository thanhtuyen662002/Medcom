import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ADMISSION, MANIFEST, assertRealDirectory, inventory, isMain, validatePath } from './package-standalone.mjs';

export async function verifyStandalone(root, { expectedRevision, expectedPlatform, expectedArch } = {}) {
  root = path.resolve(root);
  await assertRealDirectory(root);
  const manifestPath = path.join(root, MANIFEST);
  const stat = await fs.lstat(manifestPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32 * 1024 * 1024) throw new Error('Invalid manifest file');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.artifact !== 'medcom-frontend' || manifest.admission !== ADMISSION || manifest.nodeMajor !== 24 || !['UNVERIFIED_LOCAL', 'CLEAN_CHECKED_OUT_REVISION'].includes(manifest.sourceState) || !/^[0-9a-f]{40}$/.test(manifest.sourceRevision ?? '') || !['win32', 'linux', 'darwin'].includes(manifest.platform) || !['x64', 'arm64'].includes(manifest.arch) || !Array.isArray(manifest.files) || !Array.isArray(manifest.directories)) throw new Error('Invalid package metadata or admission');
  for (const [expected, actual, label] of [[expectedRevision, manifest.sourceRevision, 'revision'], [expectedPlatform, manifest.platform, 'platform'], [expectedArch, manifest.arch, 'architecture']]) if (expected !== undefined && expected !== actual) throw new Error(`Unexpected package ${label}`);
  if (expectedRevision !== undefined && manifest.sourceState !== 'CLEAN_CHECKED_OUT_REVISION') throw new Error('Exact-revision verification rejects unverified local source');
  validatePath(manifest.server);
  const expectedFiles = new Map();
  const caseNames = new Set();
  for (const file of manifest.files) {
    validatePath(file.path);
    if (file.path === MANIFEST || expectedFiles.has(file.path) || caseNames.has(file.path.toLowerCase()) || !Number.isSafeInteger(file.size) || file.size < 0 || !/^[0-9a-f]{64}$/.test(file.sha256 ?? '')) throw new Error('Invalid or duplicate manifest entry');
    expectedFiles.set(file.path, file);
    caseNames.add(file.path.toLowerCase());
  }
  if (!expectedFiles.has(manifest.server) || !/(?:^|\/)server\.js$/.test(manifest.server) || manifest.server.split('/').includes('node_modules')) throw new Error('Missing application server');
  const contents = await inventory(root, { includeDirectories: true });
  const directories = new Set();
  for (const directory of manifest.directories) {
    validatePath(directory);
    if (directories.has(directory) || expectedFiles.has(directory)) throw new Error('Invalid manifest directory');
    directories.add(directory);
  }
  if (directories.size !== contents.directories.length || contents.directories.some(directory => !directories.has(directory))) throw new Error('Missing or extra package directory');
  for (const file of contents.files) {
    const expected = expectedFiles.get(file.path);
    if (!expected) throw new Error(`Extra package file: ${file.path}`);
    if (expected.size !== file.size || expected.sha256 !== file.sha256) throw new Error(`Hash or size mismatch: ${file.path}`);
    expectedFiles.delete(file.path);
  }
  if (expectedFiles.size) throw new Error(`Missing package file: ${expectedFiles.keys().next().value}`);
  return { manifest, integrityVerified: true, productionAuthorized: false };
}
if (isMain(import.meta.url)) {
  try {
    if (!process.argv[2]) throw new Error('Usage: node scripts/verify-standalone.mjs <package-directory> [expected-revision]');
    const result = await verifyStandalone(process.argv[2], { expectedRevision: process.argv[3] });
    console.log(`Verified ${result.manifest.files.length} file hashes; unsigned metadata is not provenance or production authority; admission remains ${ADMISSION}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
