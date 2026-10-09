"""Source-free Railway image contracts and opt-in Docker smoke checks.

python -m unittest discover -s tests/deploy -p 'test_*.py' -v
MEDCOM_CONTAINER_IMAGE=medcom-railway:test enables real Docker tests. The caller
builds that image first; runtime smoke has no network, SQL, secrets or ERP DLL.
"""
import io
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile
import tempfile
import time
import unittest
import uuid
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
DOCKERFILE = (ROOT / 'Dockerfile').read_text()
IGNORE = (ROOT / '.dockerignore').read_text()
API = 'src/backend/Medcom.Api/Medcom.Api.csproj'
WORKER = 'src/backend/Medcom.LegacyPasswordWorker/Medcom.LegacyPasswordWorker.csproj'
IMAGE = os.environ.get('MEDCOM_CONTAINER_IMAGE')
PUBLIC_ROOT = {'global.json', 'Directory.Build.props', 'Directory.Build.targets', 'NuGet.config'}

# Each forbidden family has source-shaped descendants in the real context test.
# Both the matching parent and all descendants must have final deny rules.
FORBIDDEN_CONTEXT_FAMILIES = {
    '**/[Bb][Ii][Nn]': ('bin', 'BiN'),
    '**/[Oo][Bb][Jj]': ('obj', 'ObJ'),
    '**/.[Gg][Ii][Tt]': ('.git', '.GiT'),
    '**/.[Ee][Nn][Vv]': ('.env', '.EnV'),
    '**/.[Ee][Nn][Vv].*': ('.env.staging', '.EnV.local'),
    '**/[Aa][Pp][Pp][Ss][Ee][Tt][Tt][Ii][Nn][Gg][Ss].*.[Jj][Ss][Oo][Nn]':
        ('appsettings.Production.json', 'AppSettings.Staging.JsOn'),
    '**/*[Pp][Rr][Ii][Vv][Aa][Tt][Ee]*': ('Private', 'private-data', 'PRIVATE', 'pRiVaTe-data'),
    '**/*[Ss][Ee][Cc][Rr][Ee][Tt]*': ('Secrets', 'secret-cache', 'SECRET', 'SeCrEt-cache'),
    '**/*[Cc][Rr][Ee][Dd][Ee][Nn][Tt][Ii][Aa][Ll]*':
        ('Credentials', 'credential-cache', 'CREDENTIAL', 'CrEdEnTiAl-cache'),
    '**/*.[Dd][Ll][Ll]': ('Tools.dll', 'Tools.DLL', 'payload.DlL'),
    '**/*.[Ee][Xx][Ee]': ('Program.exe', 'Program.EXE'),
    '**/*.[Zz][Ii][Pp]': ('ERP.zip', 'ERP.ZIP'),
    '**/*.[Ss][Qq][Ll]': ('Data.sql', 'Data.SQL'),
    '**/*.[Bb][Aa][Kk]': ('database.bak', 'database.BaK'),
    '**/*.[Mm][Dd][Ff]': ('database.mdf', 'database.MdF'),
    '**/*.[Ll][Dd][Ff]': ('database.ldf', 'database.LdF'),
    '**/*.[Pp][Ff][Xx]': ('certificate.pfx', 'certificate.PfX'),
    '**/*.[Pp]12': ('certificate.p12', 'certificate.P12'),
    '**/*.[Pp][Ee][Mm]': ('certificate.pem', 'certificate.PeM'),
    '**/*.[Kk][Ee][Yy]': ('server.key', 'server.KeY'),
}
FILE_ONLY_CONTEXT_SUFFIXES = ('cs', 'csproj', 'json', 'props', 'targets', 'config')


def instructions():
    joined = re.sub(r'\\\n\s*', ' ', DOCKERFILE)
    return [line for line in joined.splitlines() if line and not line.startswith('#')]


def docker(*args, **kwargs):
    return subprocess.run(['docker', *args], check=True, capture_output=True,
                          timeout=kwargs.pop('timeout', 120), **kwargs)


class ContainerContractTests(unittest.TestCase):
    def test_root_build_inputs_and_explicit_projects(self):
        copies = [line for line in instructions() if line.startswith('COPY ')]
        self.assertEqual(copies, [
            'COPY global.json Directory.Build.props Directory.Build.targets NuGet.config ./',
            'COPY src/backend/ ./src/backend/',
            'COPY --from=build /out/api/ ./',
            'COPY --from=build /out/password-worker/ ./password-worker/'])
        for project in (API, WORKER):
            self.assertIn(f'dotnet restore {project} --locked-mode', DOCKERFILE)
            self.assertRegex(DOCKERFILE, re.escape(f'dotnet publish {project}')
                             + r'\s*\\\n\s*--configuration Release --no-restore -p:UseAppHost=false')
        self.assertFalse(any(line.startswith(('ADD ', 'ARG ')) for line in instructions()))

    def test_pinned_sdk_and_runtime_match_target(self):
        version = json.loads((ROOT / 'global.json').read_text())['sdk']['version']
        self.assertIn(f'FROM mcr.microsoft.com/dotnet/sdk:{version}-noble AS build', DOCKERFILE)
        self.assertIn('FROM mcr.microsoft.com/dotnet/aspnet:10.0.12-noble AS runtime', DOCKERFILE)
        target = ET.parse(ROOT / 'Directory.Build.props').findtext('./PropertyGroup/TargetFramework')
        self.assertEqual(target, 'net10.0')

    def test_all_projects_retain_locked_dependencies(self):
        for project in (ROOT / 'src/backend').glob('*/*.csproj'):
            with self.subTest(project=project.name):
                self.assertTrue((project.parent / 'packages.lock.json').is_file())
        self.assertEqual(ET.parse(ROOT / 'Directory.Build.targets').findtext(
            './PropertyGroup/RestorePackagesWithLockFile'), 'true')

    def test_worker_is_published_separately(self):
        self.assertNotIn('Medcom.LegacyPasswordWorker', (ROOT / API).read_text())
        self.assertIn('--output /out/password-worker', DOCKERFILE)
        self.assertIn('"password-worker", "Medcom.LegacyPasswordWorker.dll"',
                      (ROOT / 'src/backend/Medcom.Api/ApiHost.cs').read_text())

    def test_context_exceptions_are_only_public_build_inputs(self):
        rules = [line for line in IGNORE.splitlines() if line and not line.startswith('#')]
        expected = {'!' + path for path in PUBLIC_ROOT} | {
            '!Dockerfile', '!.dockerignore', '!src/backend/**/*.cs',
            '!src/backend/**/*.csproj', '!src/backend/**/packages.lock.json',
            '!src/backend/Medcom.Api/appsettings.json'}
        self.assertEqual(rules[0], '**')
        self.assertEqual({rule for rule in rules if rule.startswith('!')}, expected)
        final_exclusion = max(i for i, rule in enumerate(rules) if rule.startswith('!'))
        forbidden_rules = set(FORBIDDEN_CONTEXT_FAMILIES)
        forbidden_rules |= {rule + '/**' for rule in FORBIDDEN_CONTEXT_FAMILIES}
        file_only_rules = {'**/*.' + ''.join(f'[{c.upper()}{c}]' for c in suffix) + '/**'
                           for suffix in FILE_ONLY_CONTEXT_SUFFIXES}
        file_only_rules |= {'Dockerfile/**', '.dockerignore/**'}
        self.assertEqual(set(rules[final_exclusion + 1:]), forbidden_rules | file_only_rules)
        for rule in forbidden_rules | file_only_rules:
            self.assertGreater(rules.index(rule), final_exclusion)

    def test_runtime_stays_unprivileged_and_unconfigured(self):
        self.assertIn('USER $APP_UID', DOCKERFILE)
        self.assertIn('EXPOSE 8080', DOCKERFILE)
        self.assertIn('Legacy__Enabled=false', DOCKERFILE)
        self.assertIn('Legacy__EnableReadOnlyPilots=false', DOCKERFILE)
        self.assertNotIn('ASPNETCORE_FORWARDEDHEADERS_ENABLED', DOCKERFILE)
        self.assertNotIn('AllowedHosts=', DOCKERFILE)
        public = json.loads((ROOT / 'src/backend/Medcom.Api/appsettings.json').read_text())
        self.assertEqual(public['AllowedHosts'], 'localhost;127.0.0.1')
        self.assertFalse(public.get('Legacy', {}).get('Enabled', False))

    @unittest.skipIf(os.name == 'nt', 'Entrypoint uses the Linux image shell')
    def test_entrypoint_quotes_port_and_executes_dotnet(self):
        line = next(line for line in instructions() if line.startswith('ENTRYPOINT '))
        entrypoint = json.loads(line[len('ENTRYPOINT '):])
        self.assertEqual(entrypoint[:2], ['sh', '-c'])
        self.assertTrue(entrypoint[2].startswith('exec dotnet '))
        with tempfile.TemporaryDirectory() as folder:
            stub = Path(folder) / 'dotnet'
            stub.write_text('#!/bin/sh\nprintf "<%s>\\n" "$@"\n')
            stub.chmod(0o755)
            for port in (None, '', '9123', '9123; echo unsafe'):
                env = dict(os.environ, PATH=folder + os.pathsep + os.environ['PATH'])
                env.pop('PORT', None)
                if port is not None:
                    env['PORT'] = port
                result = subprocess.run(entrypoint, env=env, check=True,
                                        capture_output=True, text=True, timeout=5)
                self.assertEqual(result.stdout.splitlines(), [
                    '<Medcom.Api.dll>', '<--urls>', f'<http://0.0.0.0:{port or "8080"}>'])

    def test_hosted_workflow_has_no_deploy_or_secret_access(self):
        import yaml  # Pinned by .github/requirements-ci.txt, as in existing CI.
        workflow = yaml.load((ROOT / '.github/workflows/railway-container.yml').read_text(),
                             Loader=yaml.BaseLoader)
        self.assertEqual(workflow['permissions'], {'contents': 'read'})
        self.assertEqual(set(workflow['on']), {'push', 'pull_request', 'workflow_dispatch'})
        job = workflow['jobs']['railway-container']
        self.assertEqual(job['runs-on'], 'ubuntu-latest')
        self.assertEqual(job['env']['DOCKER_BUILDKIT'], '1')
        self.assertNotIn('continue-on-error', job)
        serialized = json.dumps(workflow)
        for forbidden in ('secrets.', 'pull_request_target', 'docker push', 'railway up',
                          'vercel deploy', 'environment:'):
            self.assertNotIn(forbidden, serialized)
        self.assertIn('docker build --pull --tag medcom-railway:test .', serialized)
        self.assertIn('MEDCOM_CONTAINER_IMAGE', serialized)


@unittest.skipUnless(IMAGE, 'Set MEDCOM_CONTAINER_IMAGE after building the image to run Docker smoke')
class DockerSmokeTests(unittest.TestCase):
    def start_container(self, port=None):
        args = ['run', '--detach', '--network', 'none', '--cap-drop', 'ALL',
                '--security-opt', 'no-new-privileges',
                '--env', 'AllowedHosts=container.test;healthcheck.railway.app']
        if port is not None:
            args += ['--env', f'PORT={port}']
        container = docker(*args, IMAGE, text=True).stdout.strip()
        self.addCleanup(lambda: docker('rm', '--force', container))
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            try:
                status, _ = self.request(container, port or 8080, '/health/live')
                if status == 200:
                    return container
            except (subprocess.SubprocessError, ValueError):
                pass
            if docker('inspect', '--format', '{{.State.Running}}', container, text=True).stdout.strip() != 'true':
                break
            time.sleep(0.5)
        self.fail('Container did not become live: ' + docker('logs', container, text=True).stdout)

    @staticmethod
    def request(container, port, path, host='healthcheck.railway.app'):
        # No curl/package install or external networking. HTTP/1.0 avoids chunked
        # framing, and variables are positional shell arguments, never shell code.
        script = ('exec 3<>/dev/tcp/127.0.0.1/"$1"; '
                  'printf "GET %s HTTP/1.0\\r\\nHost: %s\\r\\nConnection: close\\r\\n\\r\\n" "$2" "$3" >&3; '
                  'cat <&3')
        raw = docker('exec', container, '/bin/bash', '-c', script, 'smoke',
                     str(port), path, host, timeout=5).stdout
        headers, body = raw.split(b'\r\n\r\n', 1)
        return int(headers.splitlines()[0].split()[1]), body

    def test_default_port_liveness_readiness_and_anonymous_boundary(self):
        container = self.start_container()
        status, body = self.request(container, 8080, '/health/live')
        self.assertEqual((status, json.loads(body)), (200, {'status': 'healthy'}))
        status, body = self.request(container, 8080, '/health/ready')
        self.assertEqual(status, 503)
        self.assertEqual(json.loads(body)['status'], 'not_ready')
        self.assertEqual(self.request(container, 8080, '/api/workspace')[0], 401)
        self.assertEqual(self.request(container, 8080, '/health/live', 'untrusted.invalid')[0], 400)
        uid = docker('exec', container, 'id', '-u', text=True).stdout.strip()
        self.assertNotEqual(uid, '0')
        command = docker('exec', container, 'cat', '/proc/1/comm', text=True).stdout.strip()
        self.assertEqual(command, 'dotnet')
        files = docker('exec', container, 'find', '/app', '-type', 'f', text=True).stdout.splitlines()
        self.assertIn('/app/Medcom.Api.dll', files)
        self.assertIn('/app/password-worker/Medcom.LegacyPasswordWorker.dll', files)
        self.assertIn('/app/password-worker/Medcom.LegacyPasswordWorker.runtimeconfig.json', files)
        for file in files:
            self.assertNotIn(Path(file).name.lower(), ('tools.dll', 'tool.dll', '.env', 'appsettings.private.json'))

    def test_railway_port_overrides_fallback(self):
        container = self.start_container(port=9123)
        self.assertEqual(self.request(container, 9123, '/health/live')[0], 200)
        self.assertEqual(self.request(container, 9123, '/health/ready')[0], 503)

    def test_public_http_contract_and_isolated_export_match_reviewed_source_without_private_configuration(self):
        container = self.start_container()
        status, body = self.request(container, 8080, '/api/contracts/openapi.json')
        self.assertEqual(status, 200)
        expected = json.loads((ROOT / 'docs/backend/medcom-openapi.json').read_text())
        self.assertEqual(json.loads(body), expected)
        exported = docker('exec', '--env', 'Legacy__Enabled=true',
                          '--env', 'Medcom__PrivateConfigPath=/unreadable/private-fixture.json',
                          container, 'dotnet', '/app/Medcom.Api.dll', '--print-api-contract', timeout=15).stdout
        self.assertEqual(json.loads(exported), expected)
        self.assertEqual(sum(len(item) for item in expected['paths'].values()), 33)
        self.assertEqual(expected['x-medcom-business-release'], 'not-admitted')
        self.assertEqual(self.request(container, 8080, '/api/workspace')[0], 401)

    def test_real_docker_context_accepts_future_source_and_rejects_private_neighbors(self):
        allowed = PUBLIC_ROOT | {
            'src/backend/Medcom.Api/appsettings.json',
            'src/backend/Medcom.Api/Medcom.Api.csproj',
            'src/backend/Medcom.Api/packages.lock.json',
            'src/backend/Medcom.Api/NewClass.cs',
            'src/backend/Medcom.Application/NewFeature/More/QueryContext.cs'}
        denied = {
            '.env', '.git/config', 'src/frontend/public/example.cs', 'docs/notes.cs',
            'src/backend/Medcom.Api/bin/Generated.cs',
            'src/backend/Medcom.Api/obj/Generated.cs',
            'src/backend/Medcom.Api/appsettings.Private.json',
            'src/backend/Medcom.Api/appsettings.Production.json',
            'src/backend/Medcom.Api/Private/Hidden.cs',
            'src/backend/Medcom.Api/Secrets.cs',
            'src/backend/Medcom.Api/pRiVaTeSettings.cs',
            'src/backend/Medcom.Api/SeCrEtSettings.cs',
            'src/backend/Medcom.Api/CrEdEnTiAlStore.cs',
            'src/backend/Medcom.Api/LooksLikeSource.cs/unexpected.json',
            'src/backend/Medcom.Api/LooksLikeProject.csproj/unexpected.txt',
            'src/backend/Medcom.Api/Nested/packages.lock.json/unexpected.txt',
            'src/backend/Medcom.Api/.env', 'src/backend/Medcom.Api/.env.staging',
            'src/backend/Medcom.Api/Tools.dll', 'src/backend/Medcom.Api/ERP.ZIP',
            'src/backend/Medcom.Api/data.sql', 'src/backend/Medcom.Api/data.bak',
            'src/backend/Medcom.Api/certificate.pfx', 'src/backend/Medcom.Api/private.key'}
        # Every forbidden parent must also deny otherwise-admissible source,
        # project and lockfile children, both directly and several levels down.
        # These remain synthetic; no private source or credentials are supplied.
        forbidden_directories = {directory for examples in FORBIDDEN_CONTEXT_FAMILIES.values()
                                 for directory in examples}
        forbidden_directories |= {f'LooksLikeFile.{variant}' for suffix in FILE_ONLY_CONTEXT_SUFFIXES
                                  for variant in (suffix, suffix.upper())}
        for directory in forbidden_directories:
            for depth in ('', 'Nested/More/'):
                for leaf in ('Hidden.cs', 'Hidden.csproj', 'packages.lock.json'):
                    denied.add(f'src/backend/Medcom.Application/NewFeature/{directory}/{depth}{leaf}')
        denied.add('Dockerfile/Hidden.cs')
        tag = 'medcom-context-test:' + uuid.uuid4().hex
        with tempfile.TemporaryDirectory() as folder:
            context = Path(folder)
            (context / '.dockerignore').write_text(IGNORE)
            for name in allowed | denied:
                file = context / name
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text('synthetic context fixture\n')
            docker('build', '--tag', tag, '--file', '-', folder,
                   input=b'FROM scratch\nCOPY . /context/\n', timeout=120)
            self.addCleanup(lambda: docker('image', 'rm', '--force', tag))
            container = docker('create', tag, '/never-executed', text=True).stdout.strip()
            try:
                archive = docker('export', container).stdout
                with tarfile.open(fileobj=io.BytesIO(archive)) as stream:
                    present = {member.name.removeprefix('context/') for member in stream
                               if member.isfile() and member.name.startswith('context/')}
                self.assertTrue(allowed <= present, f'Missing build inputs: {allowed - present}')
                self.assertFalse(denied & present, f'Unsafe build context: {denied & present}')
                self.assertFalse(present - allowed - {'.dockerignore'},
                                 f'Unexpected build context: {present - allowed}')
            finally:
                docker('rm', container)


if __name__ == '__main__':
    unittest.main()
