# Source baseline

## Windows ERP
- Library file: `ERP_Medcom2026(4).zip`
- Library file id: `file_0000000035688207bef9da87828d6a6b`
- Size: 155,534,551 bytes
- SHA-256: `801cccb871fedce049ec3c446aeff819d7661ec94641a891d6013d4b86a0bd52`
- Archive inventory: 1,375 files, approximately 342.6 MiB uncompressed.
- Dominant artifacts: 1,020 `.rpx` report definitions, 232 `.dat` layout/config artifacts, 40 `.dll`, 39 `.txt`, 12 `.exe`, plus templates/documents/config resources.
- Root application includes `ERP.NET.exe`, Janus Windows UI/GridEX libraries, ActiveReports 6 libraries, EPPlus/Aspose and historical error logs.

## Database
- Library file: `Medcom-Data (3)(1).zip`
- Library file id: `file_000000002b1c82118e135924be565886`
- Size: 134,034,950 bytes
- SHA-256: `2d809c2e0d4c80700a1e8946c8f09db45a5840ec6735413bd46c3bd1d1ee1e0c`
- Contains one SQL script: `Medcom-Data.sql`, approximately 1,152.07 MiB uncompressed.

## Baseline discipline
These hashes identify the Phase 1 source set. A future raw legacy-source package supplied by the owner starts a new technical verification round; do not silently mix it into this baseline. Any newer Library file must be explicitly recorded here with a new hash before becoming authoritative.


## Supplemental legacy-source review summaries

Received from the owner on 2026-09-30:
- `docs/erp/CSHARP_ENGINE_ARCHITECTURE_REVIEW.md`
- `docs/erp/CSHARP_USERCONTROL_ARCHITECTURE_REVIEW.md`

These are sanitized secondary review summaries produced after a prior agent inspected the WinForms source. Their historical filenames are retained for stable references. The owner-supplied maintenance guide identifies `ERP.NET.vbproj` and `Tools2022.vbproj` as VB.NET projects; C# is the adopted Web backend language, not a verified description of all legacy source. Claims unique to summaries remain `INFERRED` unless independently corroborated against the approved build/database.

## Owner-supplied maintenance guide, received 2026-10-01

- Filename: `HUONG_DAN_BAO_TRI_ERP_WINFORMS.md`.
- SHA-256 of the supplied bytes: `f2d2b8dff8ebdf7f67495d22a1c17966f2959222ab4c7703eda2c1d4f61cf179`.
- Size: 115,810 bytes; 1,402 lines.
- Guide split date: 2026-09-30; original inventory/property/menu/database snapshot: 2026-09-26. Section 6.2 separately describes a static property review at the split date.
- Sanitized evidence/dispositions: `docs/erp/WINFORMS_SOURCE_GUIDE_EVIDENCE.md`; property/key index: `inventories/erp/WINFORMS_PROPERTY_KEY_INDEX.json`.
- This is a maintenance summary with source citations, not the raw solution, a complete Medcom catalog, an executed build or a runtime verification result. Its historical database is a different environment; its counts, menu flags and trigger list do not replace the approved Medcom baseline.
- In this run, materialization of the old baseline file IDs returned an account-access error; the selected Page archive references could not be materialized through the file interface. No raw ERP/SQL archive was opened or rehashed. This access result does not invalidate the previous evidence or prove that the archives are absent. B2/T1 retain source-access gates.

Any recovered archive must be hashed against the approved baseline before analysis. A changed build/database is a separate source set and needs a compatibility/disposition record, not silent replacement.

## Owner-attached source set, recovered 2026-10-02

The owner supplied accessible `ERP_Medcom2026.zip`, `MedData-Data.zip` and `Tools.dll` for the requested BE/FE continuation. This begins a new authoritative technical verification round; the old Phase 1 source set remains historical evidence and is not silently replaced.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| ERP_Medcom2026.zip | 162,176,322 | `d5fe49f8e58de89fc0b9972a116a6c8f673ab9f9b326c626708d0b5d01fc5783` |
| MedData-Data.zip | 134,249,929 | `6a74eb02dc747e9c6ab679f69ca515783a8724ad767f6702fcebd28f195b1144` |
| Tools.dll | 8,258,049 | `aa8910f3ba244fc405ccad2d322d142d40f938be3da94277ccd8d0814082dd61` |

The ERP ZIP contains the exact standalone DLL. The full SQL member is now verified at 1,212,595,716 bytes, CRC32 `16a9a7e6`, SHA-256 `61a8744c7a9a007b13ef37fbda26ea8c78af11fcc469963a528eba9469174096`. It declares 596 tables, 211 views, 109 functions, 609 procedures and two sequences (1,527 objects). A separate metadata inventory includes trigger definitions stored in data. The earlier zero-procedure claim used a truncated 1,015,021,568-byte extraction and is superseded; see `extraction-integrity.json`. All seven internal-transfer checks are present. Exact source identity and finite metadata are in `inventories/source/20261002/source-set.json` and `manifest.json`; verified findings and runtime limits are in `docs/erp/OWNER_SOURCE_RECOVERY_20261002.md`. Complete business/runtime/release acceptance remains open.

### Durable current-round recovery locators

The current source-set records the owner-attached Library and attachment IDs for all three exact hashed files. Scheduled sessions should use those locators through the Library skill, materialize privately and rerun the archive/member integrity verifier. Old Phase 1 attachment IDs are historical, not the current-round recovery path. An ID lookup does not prove future access; record a real access error precisely and continue independent eligible code. Never put raw sources in this public repository.
