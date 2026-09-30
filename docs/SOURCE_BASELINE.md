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
These hashes identify the Phase 1 source set. A future C# source package supplied by the owner starts a new technical verification round; do not silently mix it into this baseline. Any newer Library file must be explicitly recorded here with a new hash before becoming authoritative.


## Supplemental C# review summaries

Received from the owner on 2026-09-30:
- `docs/erp/CSHARP_ENGINE_ARCHITECTURE_REVIEW.md`
- `docs/erp/CSHARP_USERCONTROL_ARCHITECTURE_REVIEW.md`

These are sanitized secondary review summaries produced after a prior agent inspected the WinForms source. They are useful for reconciliation and for narrowing the direct C# verification queue, but they are not a replacement for an authoritative raw C# source package. Claims unique to these summaries remain supplemental (`INFERRED` unless independently corroborated) until the corresponding source is opened directly in the C# verification round.
