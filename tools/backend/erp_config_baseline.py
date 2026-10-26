"""Build the ERP configuration drift baseline from a snapshot run.

Run src/backend/Medcom.Infrastructure/Erp/ErpConfigSnapshot.sql read-only against MedData
(sqlcmd -s '|' -y 0, as the owner's SQL runner does) after the Web has been reconciled with
ERP, then:

    python tools/backend/erp_config_baseline.py <snapshot-output.txt> <YYYY-MM-DD>

It writes inventories/erp/<YYYYMMDD>/erp-config-baseline.json (hashes and names only, no SQL
text). Point the EmbeddedResource in Medcom.Infrastructure.csproj at the new file.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CATEGORIES = {"form", "control", "module", "trigger"}


def parse(text):
    items = []
    for raw in text.splitlines():
        line = raw.strip().lstrip("﻿")
        if not line or "|" not in line:
            continue
        category, rest = line.split("|", 1)
        if category not in CATEGORIES:
            continue
        key, hash_ = rest.rsplit("|", 1)
        hash_ = hash_.strip()
        items.append({"category": category, "key": key,
                      "hash": None if hash_ in ("", "NULL") else hash_.upper()})
    keys = [(i["category"], i["key"]) for i in items]
    if len(keys) != len(set(keys)):
        raise SystemExit("Duplicate snapshot keys; refusing to write a baseline.")
    if not any(i["category"] == "form" for i in items) or not any(i["category"] == "module" for i in items):
        raise SystemExit("Snapshot looks incomplete (no form or module rows).")
    return sorted(items, key=lambda i: (i["category"], i["key"]))


def main(source, captured_at):
    items = parse(Path(source).read_text(encoding="utf-8-sig"))
    target = ROOT / "inventories" / "erp" / captured_at.replace("-", "") / "erp-config-baseline.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps({"capturedAt": captured_at, "source": "MedData SY_FrmCfg + sys.sql_modules (read-only)",
                                  "items": items}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    counts = {c: sum(i["category"] == c for i in items) for c in sorted(CATEGORIES)}
    print(json.dumps({"written": str(target.relative_to(ROOT)), "items": len(items), **counts}))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
