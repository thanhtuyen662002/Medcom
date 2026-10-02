#!/usr/bin/env python3
"""Positive and mutation tests for the L04 local-preparation validator."""
from __future__ import annotations
import copy, importlib.util, json, tempfile
from pathlib import Path

HERE=Path(__file__).resolve().parent
REPO=HERE.parents[2]
spec=importlib.util.spec_from_file_location('l04_validator',HERE/'validate_preparation.py')
mod=importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)

def load_all():
 return {p.name:json.loads(p.read_text()) for p in HERE.glob('*.json')}

def run_mutation(label, mutate):
 docs=copy.deepcopy(load_all()); mutate(docs)
 with tempfile.TemporaryDirectory() as td:
  out=Path(td)
  for name,data in docs.items(): (out/name).write_text(json.dumps(data),encoding='utf-8')
  try: mod.validate(REPO,out)
  except ValueError: return
  raise AssertionError(f'negative mutation accepted: {label}')

result=mod.validate(REPO,HERE)
assert result['status']=='PASS_LOCAL_PREPARATION_ONLY'

tests=[
 ('durable-promotion',lambda d:d['T1_PROVENANCE_REGISTER.json'].__setitem__('artifact_status','durable')),
 ('execution-promotion',lambda d:d['T1_CONTROLLED_RUNTIME_PROTOCOL.json'].__setitem__('execution_status','PASS')),
 ('source-hash-drift',lambda d:d['T1_ADAPTER_DECISION_GATE.json']['source_contracts'][0].__setitem__('sha256','0'*64)),
 ('binary-hash-drift',lambda d:d['T1_PROVENANCE_REGISTER.json']['immutable_binary_identity'].__setitem__('sha256','0'*64)),
 ('source-build-promotion',lambda d:d['T1_PROVENANCE_REGISTER.json']['source_build_runtime_chain'].__setitem__('binary_match','VERIFIED')),
 ('runtime-precondition-drop',lambda d:d['T1_CONTROLLED_RUNTIME_PROTOCOL.json']['preconditions'].pop()),
 ('session-case-drop',lambda d:d['T1_SESSION_ISOLATION_MATRIX.json']['cases'].pop()),
 ('scope-case-drop',lambda d:d['B4_EFFECTIVE_SCOPE_MATRIX.json']['cases'].pop()),
 ('host-decision-promotion',lambda d:d['T1_ADAPTER_DECISION_GATE.json'].__setitem__('current_decision','DIRECT_LOAD_APPROVED')),
 ('automatic-fallback',lambda d:d['T1_ADAPTER_DECISION_GATE.json']['decision_state_machine'].__setitem__('automatic_fallback','ALLOWED')),
 ('startup-launch-promotion',lambda d:d['T1_STARTUP_DDL_LAUNCH_GATE.json'].__setitem__('launch_authorized',True)),
 ('startup-requirement-drop',lambda d:d['T1_STARTUP_DDL_LAUNCH_GATE.json']['requirements'].pop()),
 ('startup-evidence-promotion',lambda d:d['T1_STARTUP_DDL_LAUNCH_GATE.json']['requirements'][0].__setitem__('state','VERIFIED')),
]
for label,mutate in tests: run_mutation(label,mutate)
print(json.dumps({'status':'PASS','positive':1,'negative':len(tests),'total':1+len(tests)}))
