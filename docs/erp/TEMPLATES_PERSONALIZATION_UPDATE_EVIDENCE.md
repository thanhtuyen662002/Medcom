# Packaged template and deployment evidence

Evidence source: authoritative ERP package with the SHA-256 recorded in SOURCE_BASELINE.md. This document contains only sanitized package metadata.

## ERP-CFG-OfficeTemplateSurface — VERIFIED

The Reports directory contains 18 non-RPX Office template artifacts: 7 DOC, 5 DOCX, 2 XLS and 4 XLT files. Names indicate payment, tax schedule, contract/deposit and document-generation use cases.

The package also includes spreadsheet-processing libraries and ActiveReports export/runtime assemblies for multiple output formats.

### Proven
- RPX is not the complete report/document-generation surface.
- Word/Excel template fidelity is a migration concern.
- Spreadsheet and multi-format report-export capabilities are present in the deployed package.

### UNKNOWN
- Exact form/action invoking each template.
- Merge-field grammar and source query.
- Whether every bundled template remains reachable.
- Exact printer/copies/paper/duplex behavior.
- Library presence does not prove every available export format is exposed to users.

### Web disposition
Maintain separate report-rendering and Office-template generation contracts. Server/background workers should own expensive generation. Template identity/version, actor, parameters, authorization and audit must be explicit.

## ERP-CFG-UserLayoutState — VERIFIED package presence; semantics UNKNOWN

In addition to form DAT files, Layout contains two user-context DATA artifacts and one small remember-state artifact. Values are intentionally not reproduced because they are environment/user specific.

This proves that some packaged user-scoped state exists outside ordinary form DAT layouts. It does not prove whether that state is preference, remembered context, company/branch selection, permission, or another feature.

Web migration must therefore verify precedence among global layout, database metadata, company, role and user state before implementing overrides. Presentation personalization must remain separate from authorization/data scope.

## ERP-CFG-ClientUpdateHistory — VERIFIED

UpdateBK contains 11 dated snapshots between 2026-05-22 and 2026-09-16. Each observed snapshot contains the main ERP executable and shared Tools library.

This proves deployed application binaries changed over time and that historical errors may correspond to different executable versions.

UNKNOWN: update protocol, automatic/manual trigger, rollback mechanism, source revision for each binary and DB/layout compatibility rules.

Web disposition: use immutable/versioned deployment, compatibility gates, observable rollout and explicit rollback rather than reproducing desktop binary replacement semantics.

## Reporting domain signal

Filename-prefix analysis across 1,020 RPX files shows reports distributed across many naming families, with AR, AP, GJ, CS, IV, HR, FA, ER and GL among the largest. This is naming evidence only, not a proven menu/module taxonomy.

## Acceptance additions

Before ERP archaeology is complete, bind reachable Office templates to form/action/data contracts; classify editable versus fixed output; inventory merge fields safely; determine user-layout precedence; separate personalization from authorization; correlate historical errors with executable versions where possible; and keep printer/device-specific behavior UNKNOWN until direct source/runtime evidence resolves it.
