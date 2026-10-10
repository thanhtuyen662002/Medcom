# Private legacy runtime verification

Raw owner DLLs/dumps stay outside the public checkout. Ordinary CI runs source-free product checks; the `LegacyRuntime` category requires explicit private fixtures and a disposable **loopback** SQL Server. Tests create/drop only a unique `medcom_test_<guid>` database and refuse a remote/pre-existing ERP database. They never restore raw dump data.

Build the frontend/server package and password worker first. With the source files available, prepare ten actual table DDLs and a synthetic hash using the pinned DLL:

```bash
python tools/legacy/prepare_fixture.py --dump /private/MedData-Data.sql --tools /private/Tools.dll --private-directory /private/medcom-fixture --dotnet /trusted/dotnet
```

Set `DOTNET_ROOT` for the test worker. Set `MEDCOM_TEST_SQL` privately to the disposable loopback SQL master connection (not in argv/logs), then run:

```bash
python tools/legacy/run_runtime_tests.py --private-directory /private/medcom-fixture --dotnet /trusted/dotnet
```

Tests require installed Playwright Chromium and frontend dependencies. They verify actual DLL valid/wrong/other-user/malformed checks, changed-DLL rejection, source schema, dependency probes, canonical SQL login, permission/credential/group revocation, typed scoped reads/pagination/literal wildcard search, real HTTPS browser login/Grid/search/other-branch denial/logout and retired-session rejection. A synthetic screenshot is written under ignored frontend test results. Missing private fixtures are explicitly skipped in general CI; these skips are not runtime acceptance.

The observed 2026-10-02 run used SQL Server 2025 Developer 17.0.4065.4 and .NET 10.0.12 on Linux, with zero real data restored. This proves the bounded password/identity/read-only subset, not the full Windows legacy engine or complete business/release acceptance.

Always verify the complete archive member before preparing fixtures. The prior incomplete extraction is superseded:

```bash
python tools/source/verify_source_archive.py /private/MedData-Data.zip /private/MedData-Data.sql
python tools/source/prepare_transfer_checks.py /private/MedData-Data.sql /private/fixture
```

Run prepare_transfer_checks after the base fixture. It adds three actual source table DDLs and eight actual check procedures to the optional private transfer fixture. The third private runtime test checks source assignment/status rules without enabling Web mutations. Raw SQL remains private.


Current read fixtures (I71, 2026-10-10): the generator retains the pinned historical dump/DLL and appends the two nullable `varchar(50)` read additions verified in `inventories/source/20261010/document-read-tables.json`: inbound header `LinkID` and line `ParentID`. These statements are generated only in the private fixture schema and run only through the existing disposable loopback test harness. The generator performs no target DB mutation. The new owner ERP binary hash is not admitted by this old-DLL test; no new legacy/runtime compatibility is claimed.
