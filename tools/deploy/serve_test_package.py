#!/usr/bin/env python3
"""Browser-test-only TLS host; no ERP authentication provider is enabled."""
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix='medcom-test-tls-') as directory:
    cert, key = Path(directory) / 'cert.pem', Path(directory) / 'key.pem'
    subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
                    '-keyout', str(key), '-out', str(cert), '-subj', '/CN=localhost'],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    os.chmod(key, 0o600)
    environment = dict(os.environ, ASPNETCORE_ENVIRONMENT='Production',
                       ASPNETCORE_Kestrel__Certificates__Default__Path=str(cert),
                       ASPNETCORE_Kestrel__Certificates__Default__KeyPath=str(key))
    subprocess.run([os.environ.get('MEDCOM_DOTNET', 'dotnet'), str(ROOT / 'artifacts/server/Medcom.Api.dll'),
                    '--urls', 'https://127.0.0.1:5186', '--contentRoot', str(ROOT / 'artifacts/server')],
                   env=environment, check=True)
