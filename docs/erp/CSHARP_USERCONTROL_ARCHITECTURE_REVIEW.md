# C# review summary — dynamic UserControl architecture

Status: supplemental C# review evidence supplied by the owner on 2026-09-30.

## Provenance and evidence handling

This is a sanitized synthesis of an owner-supplied technical review produced after another agent inspected the WinForms source. It does not contain the raw source files. Treat direct-source-only claims as `INFERRED` until the C# source is re-opened in this project; promote to `CORROBORATED` where the behavior agrees with independent ERP/DB/package evidence.

## 1. Dynamic UserControl model

The review describes a dynamic extension model centered on `ControlType = 22`.

Reported runtime behavior:
1. the layout engine encounters a metadata field configured as UserControl;
2. it resolves the control class dynamically;
3. it creates an instance;
4. it injects layout/controller/configuration context;
5. it calls initialization/binding hooks;
6. the control subscribes to form data lifecycle events.

This architecture explains why many business capabilities may be present without appearing as ordinary fixed WinForms fields.

## 2. Reflection and discovery

The review reports reflection-based discovery over loaded assemblies, with a naming convention based on classes containing a `Ctl` suffix/pattern.

It reports discovery of controls derived from WinForms control types and exposing descriptions for a design/configuration interface.

Migration implication: source-code class discovery must be inventoried during the C# round. A package-only form inventory can miss capabilities that are injected dynamically at runtime.

## 3. `LYT1` + `LYS1` configuration pair

The review describes a two-part configuration contract in `SY_FrmCfg`:

- `LYT1`: placement/presentation record for the control, using `ControlType = 22`;
- `LYS1`: per-control business properties.

Reported `LYS1` examples include identifiers for:
- button captions/actions;
- SQL or procedure command text;
- command parameters;
- target grid/table;
- hotkeys;
- serial/COM settings;
- file constraints;
- template names;
- target fields.

The review also describes a `PropertyUserControlX` abstraction that reads/writes these property values.

Architecture implication: Web configuration cannot model UserControls as presentation-only widgets. Their `LYS1` settings may encode business commands, data dependencies, integration endpoints, device settings, report templates, and security-sensitive operations.

## 4. Reported lifecycle injection

The review reports these injected runtime references:
- parent form controller;
- layout item metadata;
- per-control property object;
- read-only/enabled state.

It also describes lifecycle callbacks/events around new, changed, loaded, saved, and deleted states.

Migration implication:
- Web equivalents need explicit lifecycle/command contracts;
- read-only state must never replace server authorization;
- post-save/post-delete callbacks must be modeled as server-side domain effects or background jobs where appropriate;
- client components must not be trusted with arbitrary SQL execution.

## 5. Capability families discovered in the review

The review groups more than 35 specialized controls into eight broad capability families.

### 5.1 File and media
Examples include file/image/Word attachments and webcam capture.

Disposition:
- server-owned attachment service;
- allowlist content types and size;
- malware/content validation where applicable;
- document-level authorization;
- immutable audit for add/delete;
- browser camera access only with explicit user permission.

### 5.2 Fast input / import
Examples include barcode input, quick item entry, tax-code lookup, clipboard import, spreadsheet import, and batch file upload.

Disposition:
- barcode scanning may use keyboard-wedge/camera input, but lookup/insert semantics remain server-owned;
- imports require staging, validation, preview, bounded commit, partial-failure reporting, and idempotency;
- external tax lookup must be isolated behind an integration service with timeout/retry/audit.

### 5.3 Action / SQL controls
The review identifies a highly privileged action-button family able to execute stored procedures or configurable SQL with parameters.

This is a major migration/security boundary.

Required Web disposition:
- never expose stored SQL text or arbitrary command execution to the browser;
- translate each accepted action to a server-side allowlisted command ID;
- validate parameters by schema and authoritative context;
- re-check authorization at execution time;
- preserve transaction/idempotency semantics per command;
- log actor, document, command, correlation ID, outcome, and authoritative result;
- reject unresolved legacy dynamic SQL rather than attempting generic execution.

### 5.4 Hardware/device integration
The review includes serial/COM-based weighing controls.

Disposition:
- browser code cannot assume direct COM access;
- use a local signed bridge/service or supported browser-device API only after an explicit device architecture decision;
- bind readings to a document with source device, timestamp, actor, and validation;
- treat reconnect/duplicate reads as first-class failure modes.

### 5.5 Reporting, Office, and rich text
Reported controls cover printing, Word/Excel template merge, Office preview, and rich-text editing.

Disposition:
- report/template generation belongs on the backend or durable job worker;
- preserve editable Office output when business workflow requires it;
- sanitize rich HTML/RTF transformations;
- template/version/authorization/audit contracts must be explicit;
- physical print parity remains separate from browser preview parity.

### 5.6 Spreadsheet/grid extensions
The review reports embedded spreadsheet and advanced grid controls, including persisted workbook/binary content.

Disposition:
- do not silently flatten spreadsheet semantics into a normal grid;
- inventory formula support, named ranges, formatting, validation, and binary persistence;
- if a Web spreadsheet component is selected, migration must define exact compatible subset and export/round-trip tests.

### 5.7 Dashboard/link viewers
Reported controls include dashboard grids/cards, document-link viewers, and embedded web links.

Disposition:
- dashboard query definitions must become typed server queries;
- refresh policy must be explicit;
- document chains require stable authoritative identifiers;
- embedded external URLs require allowlisting and browser security controls.

### 5.8 ERP-specific controls
The review reports specialized customer/tax lookup and product-description/report controls in the business project.

Disposition:
- treat each as a distinct integration/domain capability, not a generic UI widget;
- C# round must enumerate every class and bind it to forms/configuration rows.

## 6. Stable analysis IDs for follow-up

Use configuration-oriented IDs until direct form bindings are fully enumerated:
- `ERP-CFG-UC-DynamicDiscovery`
- `ERP-CFG-UC-LYT1`
- `ERP-CFG-UC-LYS1`
- `ERP-CFG-UC-ActionCommand`
- `ERP-CFG-UC-Attachment`
- `ERP-CFG-UC-Barcode`
- `ERP-CFG-UC-Import`
- `ERP-CFG-UC-DeviceCOM`
- `ERP-CFG-UC-OfficeTemplate`
- `ERP-CFG-UC-Spreadsheet`
- `ERP-CFG-UC-Dashboard`
- `ERP-CFG-UC-ExternalIntegration`

Form-specific stable IDs should be added only after the C# source or authoritative metadata proves the actual binding.

## 7. Critical risks opened by this evidence

### RISK-UC-001 — metadata-driven command execution
Legacy metadata may carry SQL/procedure command definitions. A direct browser port would create authorization, injection, replay, and audit risks.

Mitigation: typed command registry / compatibility facade; server authorization; parameter schema; per-command transaction/idempotency rules.

### RISK-UC-002 — hidden side effects in lifecycle callbacks
Controls may react to save/delete/change events and mutate related state.

Mitigation: enumerate lifecycle handlers; move durable side effects to explicit server commands/events; test before/after state.

### RISK-UC-003 — device dependence
Serial/camera/scanner behavior may rely on Windows-only capabilities.

Mitigation: classify keyboard-wedge, browser-camera, and local-bridge paths separately; require offline/reconnect/device identity tests.

### RISK-UC-004 — file/template attack surface
Attachments, imports, Office templates, rich text, and binary spreadsheets introduce content-validation and resource-exhaustion risks.

Mitigation: content sniffing, size/row limits, sandboxed parsing where feasible, authorization, malware controls, background processing, audit.

### RISK-UC-005 — configuration privilege escalation
If users can edit `LYS1` command/config values, configuration editing may be equivalent to code execution.

Mitigation: separate presentation customization from executable business configuration; privileged change workflow; versioning; validation; audit; rollback.

## 8. Reported Web mapping — evidence boundary

The review proposes direct Web equivalents for attachment, barcode, action button, Office template, rich text, spreadsheet, and lookup controls and refers to a metadata migration path.

These proposed component mappings are design input, not accepted implementation facts. The current Medcom migration must independently choose components and persistence after:
- direct-source verification;
- authorization review;
- DB contract verification;
- performance/operational testing;
- confirmation that existing schema cannot safely represent required Web-only state before adding new config tables.

## 9. C# verification queue

During the direct source round, enumerate:
1. every discovered `*Ctl` class;
2. class/base type;
3. configuration keys in `LYS1`;
4. forms using the control;
5. data tables/views/procedures touched;
6. external endpoints/files/devices used;
7. lifecycle events handled;
8. authorization/read-only checks;
9. transaction/retry behavior;
10. failure/reconnect behavior;
11. report/template/file formats;
12. Web disposition and acceptance tests.

Until then, class existence and exact behavior from this review remain supplemental evidence rather than universal production truth.
