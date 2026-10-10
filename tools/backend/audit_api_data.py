#!/usr/bin/env python3
"""Reconcile every registered API and full source field; never attest live rows."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OPENAPI = "docs/backend/medcom-openapi.json"
FIELDS = "docs/backend/document-field-contract.json"


def require(value, message):
    if not value:
        raise ValueError(message)


def resolve(api, schema):
    while "$ref" in schema:
        ref = schema["$ref"]
        require(ref.startswith("#/components/schemas/"), "Unsupported schema reference")
        schema = api["components"]["schemas"][ref.rsplit("/", 1)[1]]
    return schema


def at_schema(api, schema, path):
    for part in path.split("."):
        schema = resolve(api, schema)
        name = part.removesuffix("[]")
        require(name in schema.get("required", []), "Optional or omitted full field: " + path)
        schema = schema["properties"][name]
        if part.endswith("[]"):
            schema = resolve(api, schema)["items"]
    return resolve(api, schema)


def audit(api, mapping, tables):
    modules = {}
    for kind, groups in mapping["kinds"].items():
        suffix = kind if kind == "purchase-requests" else "documents/" + kind
        bases = ["/api/" + suffix, "/api/v2/" + suffix]
        base = bases[0]
        counts = {}
        for group in ("header", "lines"):
            contract = groups[group]
            candidates = [t for t in tables if t["schema"] == "dbo" and t["name"] == contract["table"]]
            require(len(candidates) == 1, "Ambiguous or missing source table")
            columns = {c["name"]: c for c in candidates[0]["columns"]}
            fields = contract["fields"]
            names = [f["column"] for f in fields]
            require(len(names) == len(set(names)) and set(names) == set(columns), "Missing/extra/duplicate source field")
            counts[group] = len(fields)
            for field in fields:
                column = columns[field["column"]]
                require(field["sqlType"] == column["type"] + (column.get("typeArguments") or "")
                        and field["nullable"] is column["nullable"], "Source type/nullability mismatch")
                for route_base in bases:
                    for path, field_path in ((route_base, field["listJsonPath"]), (route_base + "/detail", field["jsonPath"])):
                        if field_path is None:
                            require(group == "lines", "Missing list header field")
                            continue
                        operation = api["paths"][path]["get"]
                        require(operation["x-medcom-data-projection"] == "full"
                                and operation["x-medcom-full-data-path"] == path, "Full route projection mismatch")
                        body = operation["responses"]["200"]["content"]["application/json"]["schema"]
                        schema = at_schema(api, body, field_path)
                        alternatives = schema.get("anyOf", [schema])
                        require(any(s.get("type") == "null" for s in alternatives) is field["nullable"], "Wire nullability mismatch")
                        require(any(s.get("type") == field["jsonType"] for s in alternatives), "Wire primitive mismatch")
                        require(schema.get("x-medcom-source-column") == field["column"]
                                and schema.get("x-medcom-sql-type") == field["sqlType"], "Wire source provenance mismatch")
        modules[kind] = {"list": base, "detail": base + "/detail", "v2_alias_list": bases[1], "v2_alias_detail": bases[1] + "/detail", "source_fields": counts,
                         "evidence": [FIELDS, "inventories/source/20261002/table-*.json",
                                      "tests/backend/Medcom.Api.Tests/DocumentFullFieldTests.cs"]}
    operations = []
    for path, item in api["paths"].items():
        for method, operation in item.items():
            projection = operation.get("x-medcom-data-projection")
            category = ("full-source-fields" if projection == "full" else "legacy-summary" if projection == "summary"
                        else "business-provider-unavailable" if operation["x-medcom-admission"].startswith("default-provider-unavailable")
                        else "contract-specific-projection")
            operations.append({"method": method.upper(), "path": path, "operation_id": operation["operationId"],
                               "category": category, "admission": operation["x-medcom-admission"],
                               "capability": operation.get("x-medcom-capability"),
                               "full_data_path": operation.get("x-medcom-full-data-path"),
                               "evidence": [OPENAPI, "src/backend/Medcom.Api/ApiContractCatalog.cs"],
                               "real_authenticated_runtime": "NOT_RUN"})
    require(sum(o["category"] == "full-source-fields" for o in operations) == 12, "Incomplete full read route set")
    require(sum(o["category"] == "legacy-summary" for o in operations) == 0, "Current document route still strips source fields")
    return {"format": 2, "source_set": mapping["sourceSet"], "static_reconciliation": "PASS",
            "registered_operations": len(operations), "complete_source_columns": sum(sum(m["source_fields"].values()) for m in modules.values()),
            "modules": modules, "operations": operations, "actual_SQL_rows": "NOT_RUN",
            "production_accepted": False, "FE_adoption": "UNKNOWN;requires_parsers_to_retain_all_full_fields_on_current_routes"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    api = json.loads((ROOT / OPENAPI).read_text(encoding="utf-8"))
    fields = json.loads((ROOT / FIELDS).read_text(encoding="utf-8"))
    tables = [obj for file in sorted((ROOT / "inventories/source/20261002").glob("table-*.json"))
              for obj in json.loads(file.read_text(encoding="utf-8"))["objects"]]
    report = audit(api, fields, tables)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({key: report[key] for key in ("static_reconciliation", "registered_operations", "complete_source_columns", "actual_SQL_rows", "production_accepted")}))


if __name__ == "__main__":
    main()
