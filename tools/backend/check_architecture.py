#!/usr/bin/env python3
"""Enforce compile-time boundary direction before restoring any package."""
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
ALLOWED = {
    'Medcom.Contracts': set(),
    'Medcom.Application': {'Medcom.Contracts'},
    'Medcom.Infrastructure': {'Medcom.Application', 'Medcom.Contracts'},
    'Medcom.Api': {'Medcom.Application', 'Medcom.Contracts', 'Medcom.Infrastructure'},
    'Medcom.LegacyPasswordWorker': set(),
}
errors = []
for name, expected in ALLOWED.items():
    path = ROOT / 'src/backend' / name / (name + '.csproj')
    tree = ET.parse(path)
    actual = {Path(node.attrib['Include']).stem for node in tree.findall('.//ProjectReference')}
    if actual != expected:
        errors.append(f'{name}: invalid project reference direction {actual}')
    packages = {(node.attrib['Include'], node.attrib.get('Version')) for node in tree.findall('.//PackageReference')}
    allowed_packages = {('Microsoft.Data.SqlClient', '7.0.3')} if name == 'Medcom.Infrastructure' else set()
    if packages != allowed_packages or tree.findall('.//Reference'):
        errors.append(f'{name}: unexpected package or legacy assembly reference')
for name in ('Medcom.Contracts', 'Medcom.Application'):
    for path in (ROOT / 'src/backend' / name).glob('**/*.cs'):
        if 'obj' in path.parts or 'bin' in path.parts:
            continue
        text = path.read_text()
        if any(token in text for token in ('Microsoft.AspNetCore', 'System.Data.SqlClient',
                                         'Microsoft.Data.SqlClient', 'Medcom.Infrastructure', 'Tool.dll')):
            errors.append(f'{path.relative_to(ROOT)}: forbidden platform coupling')
if errors:
    print('\n'.join(errors), file=sys.stderr)
    sys.exit(1)
print('PASS: five project boundaries; SQL dependency restricted to Infrastructure')
