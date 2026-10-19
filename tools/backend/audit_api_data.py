#!/usr/bin/env python3
"""Reconcile every registered API and full source field; never attest live rows."""
import argparse
from functools import lru_cache
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/source"))
from schema_evolution import nullable as current_nullable
OPENAPI = "docs/backend/medcom-openapi.json"
FIELDS = "docs/backend/document-field-contract.json"
ERP_FIELDS = "inventories/erp/20261010/six-screen-catalog.json"
ERP_WORKFLOWS = "inventories/erp/20261011/cud-workflow-catalog.json"
VISIBILITY = "inventories/erp/20261019/visible-fields.json"


@lru_cache(maxsize=1)
def visibility_policy():
    return json.loads((ROOT / VISIBILITY).read_text(encoding="utf-8"))


def hidden_field(module, section, name):
    # Separate pinned native configuration; never infer hiding from an omitted schema.
    policy = visibility_policy()
    protocol = {"documentid", "purchaserequestid", "batchid", "userautoid", "lineid", "branchid", "statusid", "islock", "islocked"}
    native = {field.lower() for screen in policy["screens"] if screen["module"] == module
              for part in screen["sections"] if part["section"] == section for field in part["fields"]}
    po = module == "purchase-orders" and section == "lines" and name.lower() in {"property", "property2", "parentid", "sourceamount", "quantity2", "amount"}
    return po or name.lower() in native and name.lower() not in protocol


def absent_schema(api, body, member):
    parent, name = member.rsplit(".", 1)
    schema = at_schema(api, body, parent)
    require(name not in schema.get("properties", {}) and name not in schema.get("required", []), "ERP hidden column leaked: " + member)
SOURCE_TABLES = {
    "owner-attachment-20261002": "inventories/source/20261002/table-*.json",
    "owner-live-meddata-20261010": "inventories/source/20261010/document-read-tables.json",
}


def load_source_tables(mapping, root=ROOT):
    pattern = SOURCE_TABLES.get(mapping.get("sourceSet"))
    require(pattern is not None, "Unknown source set; no inferred catalog substitution")
    files = sorted(root.glob(pattern))
    require(bool(files), "Source catalog unavailable")
    return [obj for file in files for obj in json.loads(file.read_text(encoding="utf-8"))["objects"]]


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


def audit(api, mapping, tables, erp_catalog=None):
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
                        and field["nullable"] is current_nullable(contract["table"], column["name"], column["nullable"]), "Source type/nullability mismatch")
                for route_base in bases:
                    for path, field_path in ((route_base, field["listJsonPath"]), (route_base + "/detail", field["jsonPath"])):
                        if field_path is None:
                            require(group == "lines", "Missing list header field")
                            continue
                        operation = api["paths"][path]["get"]
                        require(operation["x-medcom-data-projection"] == "full"
                                and operation["x-medcom-full-data-path"] == path, "Full route projection mismatch")
                        body = operation["responses"]["200"]["content"]["application/json"]["schema"]
                        if hidden_field(kind, group, field_path.split(".")[-1]):
                            absent_schema(api, body, field_path)
                            continue
                        schema = at_schema(api, body, field_path)
                        alternatives = schema.get("anyOf", [schema])
                        require(any(s.get("type") == "null" for s in alternatives) is field["nullable"], "Wire nullability mismatch")
                        require(any(s.get("type") == field["jsonType"] for s in alternatives), "Wire primitive mismatch")
                        require(schema.get("x-medcom-source-column") == field["column"]
                                and schema.get("x-medcom-sql-type") == field["sqlType"], "Wire source provenance mismatch")
        modules[kind] = {"list": base, "detail": base + "/detail", "v2_alias_list": bases[1], "v2_alias_detail": bases[1] + "/detail", "source_fields": counts,
                         "evidence": [FIELDS, SOURCE_TABLES[mapping["sourceSet"]],
                                      "tests/backend/Medcom.Api.Tests/DocumentFullFieldTests.cs"]}
    erp_catalog = erp_catalog if erp_catalog is not None else {"screens":
        json.loads((ROOT / ERP_FIELDS).read_text(encoding="utf-8"))["screens"]
        + json.loads((ROOT / ERP_WORKFLOWS).read_text(encoding="utf-8"))["screens"]}
    erp_modules = {}
    erp_read_paths = set()
    for screen in erp_catalog["screens"]:
        base = "/api/erp/" + screen["id"]
        header_key = screen.get("headerKey", "PurchaseRequestID" if screen["id"] == "purchase-requests" else "DocumentID")
        identity = next(field["name"] for field in screen["fields"]["header"] if field["column"] == header_key)
        def canonical(name, fields):
            separate_document = any(f["name"] == "documentId" for f in fields)
            return "documentId" if name == identity and (identity == "purchaseRequestId" or not separate_document) else "lineId" if name == "userAutoId" else "isLocked" if name == "isLock" else name
        counts = {}
        for section, fields in screen["fields"].items():
            require(len(fields) == len({f["name"] for f in fields}), "Duplicate ERP source field")
            counts[section] = len(fields)
            for field in fields:
                field_path = "data.header." + canonical(field["name"], fields) if section == "header" else "data." + ("sections." if section not in ("lines", "history", "comparison") else "") + section + ".rows[]." + canonical(field["name"], fields)
                routes = [(base + "/detail", field_path)]
                if section == "header":
                    routes.append((base, "data.rows[]." + canonical(field["name"], fields)))
                for path, member in routes:
                    body = api["paths"][path]["get"]["responses"]["200"]["content"]["application/json"]["schema"]
                    if hidden_field(screen["id"], section, field["name"]):
                        absent_schema(api, body, member)
                        continue
                    schema = at_schema(api, body, member)
                    alternatives = schema.get("anyOf", [schema])
                    expected_type = {"bit": "boolean", "int": "integer", "smallint": "integer", "tinyint": "integer", "bigint": "integer", "float": "number", "real": "number"}.get(field["type"], "string")
                    table = screen["tables"][section] if "tables" in screen else screen[section + "Table" if section != "lines" else "lineTable"]
                    require(any(s.get("type") == "null" for s in alternatives) is current_nullable(table, field["column"], field["nullable"]), "ERP wire nullability mismatch")
                    require(any(s.get("type") == expected_type for s in alternatives), "ERP wire primitive mismatch")
                    require(schema.get("x-medcom-source-column") == field["column"] and schema.get("x-medcom-sql-type") == field["type"]
                            and schema.get("x-medcom-sql-type-arguments") == field.get("typeArguments"), "ERP wire source provenance mismatch")
        erp_modules[screen["id"]] = {"form": screen["formId"], "source_fields": counts, "evidence": [ERP_WORKFLOWS if "directEditing" in screen else ERP_FIELDS, OPENAPI]}
        erp_read_paths.update([base, base + "/detail"])
    require(len(erp_modules) == 19 and len(erp_read_paths) == 38, "Incomplete ERP form set")
    operations = []
    for path, item in api["paths"].items():
        for method, operation in item.items():
            projection = operation.get("x-medcom-data-projection")
            category = ("erp-full-source-fields" if method == "get" and path in erp_read_paths else "full-source-fields" if projection == "full" else "legacy-summary" if projection == "summary"
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
    require(api["info"]["version"] == "3.0.0" and mapping["contractVersion"] == 3, "Response contract version mismatch")
    def canonical_schema(schema, seen):
        if "$ref" in schema:
            ref = schema["$ref"]
            if ref in seen: return
            seen.add(ref)
            canonical_schema(resolve(api, schema), seen)
        for key, member in schema.get("properties", {}).items():
            require(key not in ("fields", "sourceFields", "purchaseOrderHeader", "inboundRequestHeader", "itemDisplayContext")
                    and not key.endswith("DisplayData"), "Duplicate business record wrapper: " + key)
            require(not (key == "label" and "id" in schema["properties"]), "Duplicated choice name")
            canonical_schema(member, seen)
        for key in ("items", "additionalProperties"):
            if isinstance(schema.get(key), dict): canonical_schema(schema[key], seen)
        for alternative in schema.get("anyOf", []): canonical_schema(alternative, seen)
    for path, item in api["paths"].items():
        if path.endswith(("/screen", "-contract")): continue
        for operation in item.values():
            response = operation["responses"].get("200", {}).get("content", {}).get("application/json", {}).get("schema")
            if response: canonical_schema(response, set())
    return {"format": 3, "source_set": mapping["sourceSet"], "static_reconciliation": "PASS",
            "registered_operations": len(operations), "complete_source_columns": sum(sum(m["source_fields"].values()) for m in modules.values()),
            "erp_screen_source_columns": sum(sum(m["source_fields"].values()) for m in erp_modules.values()),
            "erp_modules": erp_modules, "modules": modules, "operations": operations, "actual_SQL_rows": "NOT_RUN",
            "response_visibility_source": VISIBILITY,
            "production_accepted": False, "FE_adoption": "UNKNOWN;visible business fields plus protocol identities and state metadata"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    api = json.loads((ROOT / OPENAPI).read_text(encoding="utf-8"))
    fields = json.loads((ROOT / FIELDS).read_text(encoding="utf-8"))
    tables = load_source_tables(fields)
    report = audit(api, fields, tables)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({key: report[key] for key in ("static_reconciliation", "registered_operations", "complete_source_columns", "erp_screen_source_columns", "actual_SQL_rows", "production_accepted")}))


if __name__ == "__main__":
    main()
