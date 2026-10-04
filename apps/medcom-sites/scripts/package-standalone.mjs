import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const MANIFEST = 'medcom-package.json';
export const ADMISSION = 'BLOCKED_BUSINESS_AND_RUNTIME_ACCEPTANCE';
const forbidden = /^(?:Tools\.dll|Tool\.dll|\.openai|\.sites-runtime|cloudflare-env\.d\.ts|\.env(?:\..*)?|\.git|\.cache|\.turbo|\.wrangler|\.open-next|\.dev\.vars(?:\..*)?|wrangler(?:\..*)?|web\.config|appsettings(?:\..*)?\.json|id_rsa|id_ed25519)$/i;
const sensitiveExtension = /\.(?:pfx|p12|key|pem|sqlite|sqlite3|bak|sql|zip|7z)$/i;

export function validatePath(relative) {
  if (typeof relative === 'string' && /(?:^|\/)\.next\/cache(?:\/|$)/i.test(relative)) throw new Error('Build caches are not package content');
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || path.posix.isAbsolute(relative)) throw new Error('Invalid package path');
  for (const segment of relative.split('/')) {
    if (!segment || segment === '.' || segment === '..' || /[\x00-\x1f\x7f:<>"|?*]/.test(segment) || /[. ]$/.test(segment) || /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(segment)) throw new Error(`Unsafe package path: ${relative}`);
    if (forbidden.test(segment) || sensitiveExtension.test(segment)) throw new Error(`Disallowed package content: ${relative}`);
  }
  return relative;
}

function contained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
export async function assertRealDirectory(root) {
  const stat = await fs.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || path.resolve(await fs.realpath(root)) !== path.resolve(root)) throw new Error('Source or package root must be a real directory');
}

// Materialize traced pnpm links only when their final target stays inside this tree.
export async function copyTree(source, destination) {
  const root = path.resolve(source);
  await assertRealDirectory(root);
  const caseNames = new Set();
  async function visit(current, relative, ancestors, relocated = false) {
    let stat = await fs.lstat(current);
    const wasLink = stat.isSymbolicLink();
    let actual = current;
    if (stat.isSymbolicLink()) {
      actual = await fs.realpath(current);
      if (!contained(root, actual)) throw new Error(`Link escapes source tree: ${relative}`);
      stat = await fs.lstat(actual);
    }
    if (relative) {
      validatePath(relative);
      const key = relative.toLowerCase();
      if (caseNames.has(key)) throw new Error(`Case-colliding package path: ${relative}`);
      caseNames.add(key);
    }
    if (stat.isDirectory()) {
      if (ancestors.has(actual)) throw new Error(`Cyclic source link: ${relative}`);
      const next = new Set(ancestors).add(actual);
      await fs.mkdir(path.join(destination, ...relative.split('/')), { recursive: true });
      for (const entry of (await fs.readdir(actual)).sort()) await visit(path.join(actual, entry), relative ? `${relative}/${entry}` : entry, next);
      // Node normally resolves a symlink at its physical pnpm location. A plain
      // copy loses that ancestor chain, so reproduce its declared resolution
      // locally, including pnpm's traced hoisted fallback. Never consult the
      // development node_modules outside the standalone tracing root.
      if (wasLink || relocated) {
        const metadata = path.join(actual, 'package.json');
        let pkg;
        try {
          const resolved = await fs.realpath(metadata);
          if (!contained(root, resolved)) throw new Error('Package metadata escapes source tree');
          pkg = JSON.parse(await fs.readFile(resolved, 'utf8'));
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
        const dependencies = Object.keys({ ...pkg?.dependencies, ...pkg?.optionalDependencies, ...pkg?.peerDependencies }).sort();
        for (const name of dependencies) {
          validatePath(name);
          if (!/^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/i.test(name)) throw new Error('Unsafe dependency name');
          const targetRelative = `${relative}/node_modules/${name}`;
          try { await fs.lstat(path.join(destination, ...targetRelative.split('/'))); continue; } catch (error) { if (error.code !== 'ENOENT') throw error; }
          let ancestor = actual;
          while (contained(root, ancestor)) {
            const candidate = path.join(ancestor, 'node_modules', ...name.split('/'));
            let found = false;
            try { await fs.lstat(candidate); found = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
            if (found) {
              await fs.mkdir(path.dirname(path.join(destination, ...targetRelative.split('/'))), { recursive: true });
              // Force dependency resolution preservation even for physical
              // packages reached through pnpm's hoisted fallback directories.
              await visit(candidate, targetRelative, next, true);
              break;
            }
            if (ancestor === root) break;
            ancestor = path.dirname(ancestor);
          }
        }
      }
    } else if (stat.isFile()) {
      await fs.copyFile(actual, path.join(destination, ...relative.split('/')));
      await fs.chmod(path.join(destination, ...relative.split('/')), stat.mode & 0o111 ? 0o755 : 0o644);
    } else throw new Error(`Unsupported filesystem entry: ${relative}`);
  }
  await visit(root, '', new Set());
}

export async function inventory(root, { includeDirectories = false } = {}) {
  await assertRealDirectory(root);
  const files = [];
  const directories = [];
  const names = new Set();
  async function visit(relative) {
    const current = path.join(root, ...relative.split('/'));
    for (const entry of (await fs.readdir(current)).sort()) {
      const rel = relative ? `${relative}/${entry}` : entry;
      validatePath(rel);
      const key = rel.toLowerCase();
      if (names.has(key)) throw new Error(`Case-colliding package path: ${rel}`);
      names.add(key);
      const absolute = path.join(root, ...rel.split('/'));
      const stat = await fs.lstat(absolute);
      if (stat.isSymbolicLink()) throw new Error(`Package contains a link: ${rel}`);
      if (stat.isDirectory()) { directories.push(rel); await visit(rel); }
      else if (stat.isFile()) {
        if (rel !== MANIFEST) files.push({ path: rel, size: stat.size, sha256: createHash('sha256').update(await fs.readFile(absolute)).digest('hex') });
      } else throw new Error(`Unsupported package entry: ${rel}`);
    }
  }
  await visit('');
  files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  directories.sort();
  return includeDirectories ? { files, directories } : files;
}

export async function packageStandalone({ appRoot, outputRoot, sourceRevision, sourceState = 'UNVERIFIED_LOCAL', platform = process.platform, arch = process.arch }) {
  if (!['UNVERIFIED_LOCAL', 'CLEAN_CHECKED_OUT_REVISION'].includes(sourceState)) throw new Error('Invalid source state');
  if (!/^[0-9a-f]{40}$/i.test(sourceRevision ?? '')) throw new Error('A full source commit revision is required');
  if (!['win32', 'linux', 'darwin'].includes(platform) || !['x64', 'arm64'].includes(arch)) throw new Error('Unsupported package target');
  if (platform !== process.platform || arch !== process.arch) throw new Error('Build the package on its actual target OS/architecture');
  const source = path.resolve(appRoot, '.next/standalone');
  const output = path.resolve(outputRoot, `medcom-frontend-${platform}-${arch}`);
  if (contained(source, output) || contained(output, source)) throw new Error('Source and output must not overlap');
  await fs.mkdir(path.resolve(outputRoot), { recursive: true });
  await assertRealDirectory(path.resolve(outputRoot));
  try { await fs.lstat(output); throw new Error('Output already exists; use a clean output directory'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const staging = `${output}.tmp-${randomUUID()}`;
  try {
    await copyTree(source, staging);
    const initial = await inventory(staging);
    const servers = initial.filter(file => /(?:^|\/)server\.js$/.test(file.path) && !file.path.split('/').includes('node_modules'));
    if (servers.length !== 1) throw new Error('Expected exactly one standalone application server.js');
    const server = servers[0].path;
    const runtime = path.dirname(path.join(staging, ...server.split('/')));
    for (const [from, to] of [['.next/static', '.next/static'], ['public', 'public']]) {
      const target = path.join(runtime, to);
      try { await fs.lstat(target); throw new Error(`Unexpected preexisting runtime asset directory: ${to}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      await copyTree(path.resolve(appRoot, from), target);
    }
    const contents = await inventory(staging, { includeDirectories: true });
    const manifest = { schemaVersion: 1, artifact: 'medcom-frontend', sourceRevision: sourceRevision.toLowerCase(), sourceState, platform, arch, nodeMajor: 24, admission: ADMISSION, integrityNotice: 'Hashes detect accidental changes only. This unsigned manifest does not authorize production use or prove source provenance.', server, ...contents };
    await fs.writeFile(path.join(staging, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o644 });
    await fs.rename(staging, output);
    return { output, manifest };
  } catch (error) { await fs.rm(staging, { recursive: true, force: true }); throw error; }
}

// Git status intentionally hides ignored files. These inputs must be checked
// independently because Next can consume local dotenv files and copies public
// files without consulting Git, including files under globally ignored bin/.
export async function assertReleaseInputs(appRoot) {
  appRoot = path.resolve(appRoot);
  const tracked = new Set(execFileSync('git', ['ls-files', '--cached', '-z', '--', '.'], { cwd: appRoot, encoding: 'utf8' }).split('\0').filter(Boolean));
  for (const entry of await fs.readdir(appRoot)) {
    if (/^\.env(?:\.|$)/i.test(entry) && !(entry === '.env.example' && tracked.has(entry))) throw new Error(`Local environment input is forbidden for release build: ${entry}`);
  }
  await assertRealDirectory(path.join(appRoot, 'public'));
  // Inspect all source/config inputs, not only public: an ignored app/bin/page.tsx
  // is still a discovered Next route. Only established generated/dependency
  // locations are excluded, and only at the application root.
  const generatedDirectories = new Set(['.git', '.next', 'node_modules', '.test-runtime']);
  async function visit(relative) {
    const absolute = path.join(appRoot, ...relative.split('/'));
    const stat = await fs.lstat(absolute);
    if (stat.isSymbolicLink()) throw new Error(`Release input must not be a link: ${relative}`);
    if (stat.isDirectory()) {
      for (const entry of await fs.readdir(absolute)) await visit(`${relative}/${entry}`);
    } else if (!stat.isFile() || !tracked.has(relative)) throw new Error(`Release input is not a tracked file: ${relative}`);
  }
  for (const entry of await fs.readdir(appRoot)) {
    if (generatedDirectories.has(entry) || entry === 'tsconfig.tsbuildinfo' || entry === 'next-env.d.ts') {
      const stat = await fs.lstat(path.join(appRoot, entry));
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error(`Generated root must not be a link or special entry: ${entry}`);
      continue;
    }
    await visit(entry);
  }
}

// Release assembly always rebuilds after the source fence. Existing ignored
// .next output is never evidence that it came from the checked-out revision.
export async function rebuildAndPackage(options, { assertClean, build } = {}) {
  if (typeof assertClean !== 'function') throw new Error('A source provenance fence is required');
  await assertClean();
  if (build) await build();
  else {
    if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('Packaging requires Node 24');
    const nextBinary = path.resolve(options.appRoot, 'node_modules/next/dist/bin/next');
    execFileSync(process.execPath, [nextBinary, 'build'], {
      cwd: path.resolve(options.appRoot),
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
      windowsHide: true,
    });
  }
  await assertClean();
  const result = await packageStandalone({ ...options, sourceState: 'CLEAN_CHECKED_OUT_REVISION' });
  try { await assertClean(); }
  catch (error) { await fs.rm(result.output, { recursive: true, force: true }); throw error; }
  return result;
}

export function isMain(url) { return !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(url); }
if (isMain(import.meta.url)) {
  const appRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  try {
    const repo = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: appRoot, encoding: 'utf8' }).trim();
    const git = args => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
    const sourceRevision = git(['rev-parse', 'HEAD']);
    if (process.env.SOURCE_REVISION && process.env.SOURCE_REVISION !== sourceRevision) throw new Error('SOURCE_REVISION must equal checked-out HEAD');
    const sourcePath = path.relative(repo, appRoot).split(path.sep).join('/');
    const assertClean = async () => {
      if (git(['rev-parse', 'HEAD']) !== sourceRevision || git(['status', '--porcelain', '--untracked-files=all', '--', sourcePath])) throw new Error('Packaging requires an unchanged HEAD and clean committed frontend source tree');
      await assertReleaseInputs(appRoot);
    };
    const result = await rebuildAndPackage({ appRoot, outputRoot: path.join(repo, 'artifacts'), sourceRevision }, { assertClean });
    console.log(`Packaged ${result.output}; admission remains ${ADMISSION}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
