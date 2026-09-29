# Evidence standards

Use four evidence levels:
- VERIFIED: directly observed in authoritative source.
- CORROBORATED: observed independently in ERP and DB or multiple artifacts.
- INFERRED: technically plausible inference, clearly labeled with supporting evidence.
- UNKNOWN: not provable from current baseline.

Every inventory row should carry source artifact/path/object, evidence level, and notes. Do not convert INFERRED/UNKNOWN into VERIFIED without new evidence.

For generated inventories, preserve stable identifiers:
- ERP form: ERP-FRM-<name>
- ERP report: ERP-RPT-<name>
- ERP config/layout: ERP-CFG-<name>
- DB object: DB-<type>-<schema>.<name>
- Web capability: WEB-<domain>-<name>
- Risk: RISK-<domain>-<sequence>

Traceability must reference these IDs so later C# verification can confirm or overturn specific conclusions.
