#!/usr/bin/env python3
"""Independently rerun the routed L09 validator-gap mutations on local copies."""
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[3]
L09 = ROOT / "preparations/L09/20261002"
VALIDATOR = L09 / "validate_preparation.py"
JSONS = sorted(L09.glob("*.json"))

CASES = [
    ("QX-R1-01", "R1_EXTERNAL_WRITE_FRESHNESS_GATE.json", lambda d: d["requirements"][1].__setitem__("requirement", "placeholder"), "R1X exact requirement semantics"),
    ("QX-R1-02", "R1_EXTERNAL_WRITE_FRESHNESS_GATE.json", lambda d: d["state_machine"].__setitem__("admission_rule", "admit without exact-head verification"), "R1X exact admission rule"),
    ("QX-R1-03", "R1_EXTERNAL_WRITE_FRESHNESS_GATE.json", lambda d: d["state_machine"].__setitem__("drift_rule", "none"), "R1X exact drift rule"),
    ("QX-R1-04", "R1_EXTERNAL_WRITE_FRESHNESS_GATE.json", lambda d: d["cases"][0].__setitem__("id", "R1X-99"), "R1X exact case set"),
    ("QX-R1-05", "R1_EXTERNAL_WRITE_FRESHNESS_GATE.json", lambda d: d["cases"][0].__setitem__("required_evidence_to_pass", "ok"), "R1X exact evidence obligations"),
    ("QX-OPS-01", "R2_REPORT_EXPORT_EVIDENCE_FIXTURES.json", lambda d: d["eligibility"].__setitem__("graph_status", "READY"), "R2 eligibility weakened"),
    ("QX-OPS-02", "R2_ASYNC_JOB_SCOPE_FIXTURES.json", lambda d: d["job_envelope"]["browser_inputs"].remove("registered_report_id"), "R2J browser input boundary"),
    ("QX-OPS-03", "R4_ISOLATED_RECOVERY_CHECKLIST.json", lambda d: d["required_rehearsal_record"].remove("cleanup/retention outcome and reviewer sign-off"), "R4 rehearsal evidence record"),
    ("QX-OPS-04", "R5_COEXISTENCE_ROLLBACK_FIXTURES.json", lambda d: d["eligibility"]["dependencies"].remove("R4"), "R5 bounded readiness dependencies"),
]


def main() -> int:
    if not VALIDATOR.is_file() or not JSONS:
        print("FAIL missing L09 local preparation", file=sys.stderr)
        return 1
    for case_id, name, mutate, expected in CASES:
        with tempfile.TemporaryDirectory() as td:
            dest = pathlib.Path(td)
            for source in JSONS:
                shutil.copy2(source, dest / source.name)
            target = dest / name
            data = json.loads(target.read_text(encoding="utf-8"))
            mutate(data)
            target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            result = subprocess.run(
                [sys.executable, str(VALIDATOR), str(dest)],
                capture_output=True,
                text=True,
                cwd=ROOT,
            )
            if result.returncode == 0 or expected not in result.stderr:
                print(f"FAIL {case_id}: rc={result.returncode} stderr={result.stderr.strip()}", file=sys.stderr)
                return 1
    print("PASS independent_L09_repair_review cases=9 product_runtime=NOT_RUN durability=LOCAL_ONLY")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
