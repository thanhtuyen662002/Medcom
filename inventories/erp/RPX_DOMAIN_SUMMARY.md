# RPX candidate-current domain index

Authoritative source: `ERP_Medcom2026(4).zip`, SHA-256 `801cccb871fedce049ec3c446aeff819d7661ec94641a891d6013d4b86a0bd52`.

This is a sanitized, reviewable domain summary of the 786 RPX files outside `Reports/BackupRpt` and `Reports/BackupLast`. It records structural migration pressure without publishing report data, customer values, credentials or embedded script bodies. Stable report IDs remain `ERP-RPT-<basename>`.

## Evidence and interpretation

**VERIFIED:** 786 candidate-current packaged RPX files parse as described in `RPX_STRUCTURAL_EVIDENCE.md`. The domain below is the basename prefix before the first underscore; names without an underscore are grouped as `OTHER`. This prefix is a packaging/name taxonomy only. It is **not** proof of menu module ownership, reachability, permission or business ownership.

Columns:
- **Reports**: candidate-current packaged RPX count.
- **Script**: reports containing a non-empty embedded Script block.
- **Subreport parent**: reports containing at least one subreport control.
- **Image / Barcode / Chart**: reports containing at least one corresponding specialized control.
- **DataFields**: total control-level DataField bindings in the domain.

| Prefix | Reports | Script | Subreport parent | Image | Barcode | Chart | DataFields |
|---|---:|---:|---:|---:|---:|---:|---:|
| AR | 219 | 29 | 0 | 13 | 2 | 1 | 3,869 |
| GJ | 102 | 20 | 0 | 0 | 0 | 0 | 1,213 |
| CS | 92 | 0 | 0 | 39 | 0 | 0 | 1,347 |
| IV | 73 | 6 | 2 | 2 | 1 | 0 | 1,322 |
| AP | 49 | 11 | 1 | 8 | 2 | 0 | 760 |
| HR | 37 | 0 | 0 | 0 | 0 | 0 | 366 |
| ER | 27 | 3 | 0 | 0 | 0 | 0 | 522 |
| GL | 26 | 21 | 2 | 0 | 0 | 0 | 106 |
| FA | 19 | 4 | 0 | 0 | 0 | 0 | 288 |
| EM | 18 | 1 | 0 | 0 | 0 | 0 | 335 |
| EQ | 15 | 1 | 0 | 0 | 0 | 0 | 208 |
| OTHER | 14 | 4 | 2 | 0 | 1 | 0 | 184 |
| TN | 14 | 7 | 0 | 0 | 0 | 0 | 266 |
| CT | 13 | 1 | 1 | 0 | 0 | 0 | 170 |
| IC | 12 | 0 | 0 | 1 | 0 | 0 | 180 |
| PC | 10 | 2 | 0 | 0 | 0 | 0 | 138 |
| CL | 8 | 2 | 0 | 0 | 0 | 0 | 91 |
| CF | 7 | 0 | 0 | 1 | 0 | 0 | 83 |
| MR | 6 | 4 | 0 | 4 | 0 | 0 | 106 |
| TestReport | 5 | 0 | 0 | 0 | 0 | 0 | 18 |
| OF | 4 | 0 | 0 | 4 | 0 | 0 | 29 |
| WA | 4 | 0 | 0 | 0 | 0 | 0 | 76 |
| SY | 3 | 0 | 0 | 0 | 0 | 0 | 23 |
| CR | 2 | 0 | 0 | 0 | 0 | 0 | 8 |
| GN | 2 | 0 | 0 | 0 | 0 | 0 | 30 |
| POS | 2 | 0 | 0 | 1 | 0 | 0 | 39 |
| PR | 2 | 2 | 0 | 1 | 1 | 0 | 42 |
| B | 1 | 1 | 0 | 0 | 0 | 0 | 11 |
| **Total** | **786** | **119** | **8** | **74** | **7** | **1** | **11,830** |

## Migration-priority observations

**VERIFIED structural facts:** GL is unusually script-heavy (21/26 reports), while AR is the largest report family (219) and carries the only chart found in this candidate-current set. CS has 39 image-bearing reports. AP/AR/IV/PR contain the packaged barcode-bearing reports already enumerated in `RPX_STRUCTURAL_EVIDENCE.md`.

**INFERRED migration priority:** script-heavy families deserve early semantic verification because layout conversion alone cannot reproduce embedded report behavior. Image/barcode/chart families need explicit output and machine-readability acceptance. This is prioritization, not a claim that these reports are reachable in the current menu.

## Explicit UNKNOWNs

The package does not prove which of these 786 reports are reachable for a current user, exact runtime parameters for every report, authorization, printer/export options, or whether basename prefixes exactly equal business-module ownership. Those remain UNKNOWN until additional packaged evidence or the C# verification round proves them.

## Next reviewable slices

1. Per-domain report indexes should be generated only where they add traceability (stable ID, structural flags, dependency/data-call identifier), avoiding one monolithic 786-row review blob.
2. Prioritize GL embedded-script semantics, CS image-source behavior, and barcode/QR output contracts.
3. Join any structured RPX data-call identifiers to VERIFIED DB object IDs when DB Analysis publishes the matching object; do not infer matches from naming alone.
