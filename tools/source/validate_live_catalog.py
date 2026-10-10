"""Validate the finite sanitized live metadata snapshot; never connect to SQL."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SNAPSHOT = "inventories/source/20261010"
SOURCE_SET = "owner-live-meddata-20261010"
MEMBERS = {
    "document-read-tables.json", "catalog-objects.json", "catalog-columns.json",
    "catalog-indexes.json", "catalog-foreignKeys.json", "catalog-checks.json",
    "catalog-parameters.json", "catalog-dependencies.json", "catalog-triggers.json",
    "erp-source-summary.json",
}


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def validate(root=ROOT):
    directory = root / SNAPSHOT
    source = json.loads((directory / "source-set.json").read_text(encoding="utf-8"))
    require(source["sourceSet"] == SOURCE_SET, "Wrong live source identity")
    require(set(source["members"]) == MEMBERS, "Missing/extra live metadata member")
    require(source["metadataViewDefinitionObserved"] is True, "Complete metadata visibility unknown")
    require(source["historicalBaselineRetained"] is True, "Historical baseline identity lost")
    require(all(status == "PASS" for status in source["queryStatuses"].values()), "Live query was not observed passing")
    require(source["productionAccepted"] is False and source["businessWritesPerformed"] is False,
            "Metadata promoted to business/release acceptance")
    for key in ("definitionBodiesExported", "credentialsExported", "transactionRowsExported"):
        require(source[key] == 0, "Private source or rows exported")
    packets = {}
    for name in sorted(MEMBERS):
        # Generated metadata hashes refer to canonical UTF-8/LF JSON. A Windows
        # Git checkout may use CRLF; raw owner binaries/archives are never normalized.
        data = (directory / name).read_bytes().replace(b"\r\n", b"\n")
        require(len(data) <= 16 * 1024 * 1024, "Metadata member too large")
        require(len(data) == source["members"][name]["bytes"]
                and hashlib.sha256(data).hexdigest() == source["members"][name]["sha256"],
                "Live metadata hash/size mismatch: " + name)
        packets[name] = json.loads(data)
    objects = packets["catalog-objects.json"]["objects"]
    identities = [(o["schema"], o["name"]) for o in objects]
    require(len(identities) == len(set(identities)), "Duplicate live object identity")
    require({kind: sum(o["type"] == kind for o in objects) for kind in source["objectCounts"]}
            == source["objectCounts"], "Live object count mismatch")
    columns = packets["catalog-columns.json"]["columns"]
    require(len(columns) == source["catalogColumnCount"], "Live column count mismatch")
    keys = [(c["schema"], c["object"], c["name"]) for c in columns]
    require(len(keys) == len(set(keys)), "Duplicate live column identity")
    lookup = {(c["schema"], c["object"], c["name"]): c for c in columns}
    tables = packets["document-read-tables.json"]["objects"]
    require(len(tables) == 6 and sum(len(t["columns"]) for t in tables) == source["currentDocumentSourceColumns"] == 118,
            "Current six-table field denominator mismatch")
    for table in tables:
        for column in table["columns"]:
            actual = lookup[(table["schema"], table["name"], column["name"])]
            require(all(actual[key] == value for key, value in column.items()), "Document slice differs from live catalog")
    return {"sourceSet": SOURCE_SET, "objects": len(objects), "columns": len(columns), "documentColumns": 118,
            "snapshotIntegrity": "PASS", "productionAccepted": False}


if __name__ == "__main__":
    print(json.dumps(validate()))
