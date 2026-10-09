#!/usr/bin/env python3
"""Bounded HTTPS/contract smoke. No business POST, SQL, exports or private row output.

Optional real credentials are read only from MEDCOM_TEST_USERNAME/PASSWORD, never
CLI arguments. Login/logout affect only this verifier's own session. Ordinary TLS
verification is mandatory; redirects are rejected before credentials can move.
"""
import argparse
import http.cookiejar
import json
import math
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

CONTRACT = "/api/contracts/openapi.json"
MODULES = {
    "purchase-orders": ("/api/v2/documents/purchase-orders", 19, 12),
    "inbound-requests": ("/api/v2/documents/inbound-requests", 37, 25),
    "purchase-requests": ("/api/v2/purchase-requests", 14, 9),
}


class Failure(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise Failure("redirect_rejected")


def origin(value):
    try:
        parsed = urllib.parse.urlsplit(value)
        if (parsed.scheme != "https" or not parsed.hostname or parsed.username is not None
                or parsed.password is not None or parsed.path not in ("", "/")
                or parsed.query or parsed.fragment or any(c.isspace() for c in value)):
            raise ValueError()
        _ = parsed.port
    except (ValueError, TypeError):
        raise Failure("valid_https_origin_required") from None
    return value.rstrip("/")


def json_value(text):
    def bad_number(_):
        raise Failure("nonfinite_json")
    try:
        return json.loads(text, parse_constant=bad_number)
    except (ValueError, UnicodeError):
        raise Failure("invalid_json") from None


class Client:
    def __init__(self, base):
        self.base = origin(base)
        self.http = urllib.request.build_opener(NoRedirect(),
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def request(self, path, body=None, token=None):
        if not path.startswith("/") or path.startswith("//"):
            raise Failure("invalid_path")
        headers = {"Accept": "application/json"}
        payload = None
        if body is not None:
            # There is intentionally no generic command mode or caller-supplied method.
            if path not in ("/api/auth/login", "/api/auth/logout"):
                raise Failure("business_post_prohibited")
            payload = json.dumps(body, ensure_ascii=False, allow_nan=False).encode("utf-8")
            headers.update({"Content-Type": "application/json", "X-CSRF-TOKEN": token or "", "Origin": self.base})
        request = urllib.request.Request(self.base + path, data=payload, headers=headers)
        try:
            response = self.http.open(request, timeout=20)
        except urllib.error.HTTPError as error:
            response = error
        except (OSError, urllib.error.URLError):
            raise Failure("https_transport_failed") from None
        with response:
            raw = response.read(4_194_305)
            if len(raw) > 4_194_304:
                raise Failure("response_too_large")
            return response.status, json_value(raw) if raw else None


def object_fields(value, definitions):
    if not isinstance(value, dict):
        raise Failure("field_object_required")
    expected = {f["jsonPath"].split(".")[-1]: f for f in definitions}
    if set(value) != set(expected):
        raise Failure("incomplete_field_set")
    for name, field in expected.items():
        item = value[name]
        if item is None:
            if not field["nullable"]:
                raise Failure("unexpected_null")
            continue
        kind = field["jsonType"]
        valid = ((kind == "string" and isinstance(item, str))
                 or (kind == "boolean" and type(item) is bool)
                 or (kind == "integer" and type(item) is int)
                 or (kind == "number" and type(item) in (int, float) and math.isfinite(item)))
        if not valid:
            raise Failure("field_type_mismatch")
        if field.get("format") == "decimal-string" and re.fullmatch(r"-?[0-9]+(?:\.[0-9]+)?", item) is None:
            raise Failure("invalid_decimal_string")
        if field.get("format") == "sql-datetime-without-timezone" and re.fullmatch(
                r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}", item) is None:
            raise Failure("invalid_sql_wall_clock_datetime")


def at_path(value, path):
    for part in path.split("."):
        value = value[part]
    return value


def verify_module(client, kind):
    path, headers, lines = MODULES[kind]
    status, contract = client.request("/api/documents/field-contract?" + urllib.parse.urlencode({"kind": kind}))
    if status != 200 or not isinstance(contract, dict) or contract.get("contractVersion") != 2 or contract.get("kind") != kind:
        raise Failure("field_contract_unavailable")
    hf, lf = contract["header"]["fields"], contract["lines"]["fields"]
    if len(hf) != headers or len(lf) != lines:
        raise Failure("field_count_mismatch")
    status, page = client.request(path + "?page=1&pageSize=1")
    if status != 200:
        raise Failure("list_unavailable")
    data = page["data"] if kind == "purchase-requests" else page
    rows = data["rows"]
    if not isinstance(rows, list) or len(rows) > 1:
        raise Failure("list_paging_invalid")
    result = {"status": "PASS", "header_fields": headers, "line_fields": lines,
              "header_samples": len(rows), "line_samples": 0, "business_writes": 0}
    if not rows:
        result["observation"] = "authorized_list_empty;field_contract_verified;row_values_not_observed"
        return result
    list_path = hf[0]["listJsonPath"].split("[].", 1)[1].rsplit(".", 1)[0]
    object_fields(at_path(rows[0], list_path), hf)
    # A source document identifier is used only in the request; never put it in a report.
    query = {"documentId": rows[0]["documentId"]}
    if kind != "purchase-requests":
        query.update(page=1, pageSize=1)
    status, detail = client.request(path + "/detail?" + urllib.parse.urlencode(query))
    if status != 200:
        raise Failure("detail_unavailable")
    object_fields(at_path(detail, hf[0]["jsonPath"].rsplit(".", 1)[0]), hf)
    collection = lf[0]["jsonPath"].split("[]", 1)[0]
    children = at_path(detail, collection)
    after_array = lf[0]["jsonPath"].split("[].", 1)[1].rsplit(".", 1)[0] if "." in lf[0]["jsonPath"].split("[].", 1)[1] else ""
    if not isinstance(children, list) or len(children) > (500 if kind == "purchase-requests" else 1):
        raise Failure("detail_paging_invalid")
    for child in children:
        object_fields(at_path(child, after_array) if after_array else child, lf)
    result["line_samples"] = len(children)
    result["has_more"] = detail.get("hasMore", False)
    return result


def run(client, username=None, password=None):
    report = {"status": "HTTP_CONTRACT_VERIFIED", "origin": client.base,
              "business_release_accepted": False, "business_writes": 0, "private_rows_exported": False, "modules": {}}
    status, live = client.request("/health/live")
    if status != 200 or live != {"status": "healthy"}:
        raise Failure("liveness_failed")
    status, readiness = client.request("/health/ready")
    report["readiness_http"] = status
    report["readiness"] = readiness
    status, api = client.request(CONTRACT)
    if status != 200 or api.get("openapi") != "3.1.1":
        raise Failure("openapi_unavailable")
    operations = sum(len(item) for item in api["paths"].values())
    if operations != 33 or api.get("x-medcom-business-release") != "not-admitted":
        raise Failure("http_boundary_mismatch")
    report["http_operations"] = operations
    if not username and not password:
        report["authenticated_reads"] = "NOT_RUN;real_ERP_credentials_required"
        return report
    if not username or not password or len(username) > 100 or len(password) > 256:
        raise Failure("both_bounded_credentials_required")
    status, csrf = client.request("/api/auth/csrf")
    if status != 200:
        raise Failure("csrf_unavailable")
    status, session = client.request("/api/auth/login", {"username": username, "password": password}, csrf["token"])
    if status != 200:
        raise Failure("login_not_accepted")
    try:
        for kind in MODULES:
            if kind + ".read" not in session.get("capabilities", []):
                report["modules"][kind] = {"status": "NOT_RUN", "reason": "module_capability_absent"}
                continue
            try:
                report["modules"][kind] = verify_module(client, kind)
            except (Failure, KeyError, TypeError, IndexError) as error:
                report["modules"][kind] = {"status": "FAIL", "reason": str(error) if isinstance(error, Failure) else "invalid_response_shape"}
        report["status"] = "AUTHENTICATED_READS_VERIFIED" if all(v["status"] == "PASS" for v in report["modules"].values()) else "AUTHENTICATED_READS_INCOMPLETE"
    finally:
        status, csrf = client.request("/api/auth/csrf")
        if status == 200:
            status, _ = client.request("/api/auth/logout", {}, csrf["token"])
        report["own_session_retired"] = status == 204
        if not report["own_session_retired"]:
            report["status"] = "AUTHENTICATED_READS_INCOMPLETE"
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", required=True)
    args = parser.parse_args()
    try:
        report = run(Client(args.origin), os.environ.get("MEDCOM_TEST_USERNAME"), os.environ.get("MEDCOM_TEST_PASSWORD"))
        print(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False))
        return 0 if report["status"] in ("HTTP_CONTRACT_VERIFIED", "AUTHENTICATED_READS_VERIFIED") else 2
    except (Failure, KeyError, TypeError, IndexError, ValueError) as error:
        print(json.dumps({"status": "FAIL", "reason": str(error) if isinstance(error, Failure) else "invalid_response_shape",
                          "business_writes": 0, "private_rows_exported": False}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
