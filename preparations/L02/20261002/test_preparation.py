#!/usr/bin/env python3
import json,pathlib,shutil,subprocess,tempfile,sys
HERE=pathlib.Path(__file__).resolve().parent; VALIDATOR=HERE/'validate_preparation.py'; JSONS=sorted(HERE.glob('*.json'))
def run(p): return subprocess.run([sys.executable,str(VALIDATOR),'--package',str(p)],capture_output=True,text=True)
def bad(name,fn):
 with tempfile.TemporaryDirectory() as td:
  d=pathlib.Path(td)
  for p in JSONS: shutil.copy2(p,d/p.name)
  p=d/name; x=json.loads(p.read_text()); fn(x); p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
  r=run(d); assert r.returncode!=0,(name,r.stdout,r.stderr)
r=run(HERE); assert r.returncode==0,r.stderr
checks=[
('A1-bootstrap.json',lambda x:x.__setitem__('base_main','bad')),
('A1-bootstrap.json',lambda x:x['source_contracts'][0].__setitem__('sha256','0'*64)),
('A1-bootstrap.json',lambda x:x['source_contracts'][0].__setitem__('source_ref','8aa76dd1306b4d77a29a24d5ae70b18b1ee621cf')),
('A2-tenant.json',lambda x:x['cases'].pop()),
('A2-tenant.json',lambda x:x.__setitem__('foundation_dependencies',[])),
('A3-session.json',lambda x:x['cases'][6]['expected_assertions'].__setitem__(0,'allow')),
('A4-capability.json',lambda x:x['cases'][0]['expected_assertions'].__setitem__(0,'menu decides permission')),
('A4-capability.json',lambda x:x['cases'][6]['expected_assertions'].__setitem__(1,'no timing leak')),
('A6-audit.json',lambda x:x['cases'][5].__setitem__('defect_detected','logging')),
('A6-audit.json',lambda x:x['cases'][0].__setitem__('execution_status','passed'))]
for n,f in checks: bad(n,f)
print('PASS tests=11 baseline=1 negative=10')
