"""Apply reviewed current metadata deltas without rewriting historical inventories."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = "inventories/backend/20261019/schema-evolution.json"
CHANGES = {(c["table"], c["column"]): c for c in json.loads((ROOT / EVIDENCE).read_text(encoding="utf-8"))["changes"]}


def nullable(table, column, historical):
    change = CHANGES.get((table, column))
    if change is None:
        return historical
    if change["previousNullable"] is not historical:
        raise ValueError("Schema evolution baseline mismatch")
    return change["nullable"]


def evolve_screen(screen):
    for section, fields in screen["fields"].items():
        table = screen["tables"][section] if "tables" in screen else screen[section + "Table" if section != "lines" else "lineTable"]
        for field in fields:
            field["nullable"] = nullable(table, field["column"], field["nullable"])
    return screen
