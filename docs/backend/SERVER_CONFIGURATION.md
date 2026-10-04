# Private SQL Server configuration

Owner direction: default **`D:\Config\appsettings.Private.json`**, direct SQL Server, with a selectable server directory. This is backend installation configuration; it does not add a Sites/frontend screen or enable domain writes.

## Operator interface

Run on the **Windows machine hosting the backend**:

```powershell
powershell.exe -NoProfile -STA -File tools/deploy/Configure-MedcomServer.ps1
```

Use **Chon...** to select the private directory. Enter server/instance (or `host,port`), database and authentication. SQL authentication requires both user and password. The password field is masked. **Kiem tra ket noi** connects with TLS and executes only `SELECT 1`; it does not validate ERP procedures, permissions, transactions or audit. **Luu cau hinh** writes the file and selector; restart the backend to apply. Windows Authentication uses the operator identity during this check; the deployed service identity needs its own verified SQL access.

For a Windows service identity, start the tool with `-ServiceAccount 'DOMAIN\service-name'`. The operator, SYSTEM and local Administrators receive file access; the nominated service receives read access. Credentials stay in the private server file. Do not send them to GitHub, Sites, a browser, an issue or chat.

The private file uses the standard configuration key:

```json
{
  "ConnectionStrings": { "Medcom": "" },
  "Legacy": { "Enabled": false }
}
```

An empty connection is an unconfigured installation. Saving connection settings does not enable `Legacy:Enabled` or write actions. Existing settings are retained; moving to a new directory copies the previously selected configuration, then changes its connection setting. Selecting an existing destination retains that destination's other settings after confirmation. The old file remains for operator rollback; remove it securely after successful restart and verification.

## Path selection and precedence

The non-secret bootstrap file is `%ProgramData%\Medcom\backend\config-location.json`:

```json
{
  "Medcom": {
    "PrivateConfigPath": "D:\\Config\\appsettings.Private.json"
  }
}
```

Backend resolution: explicit process configuration (`Medcom__PrivateConfigPath` or `--Medcom:PrivateConfigPath`) overrides the selector; otherwise the selector overrides the default. Private settings override public appsettings; environment and command-line values retain higher priority. Explicit missing, malformed, linked, repository or public content paths fail startup with a generic error. An absent default is permitted while the legacy backend remains unconfigured. The default is optional on non-Windows foundation/test hosts.

The GUI restricts ACLs **before writing secret bytes**, writes a same-directory temporary file, and atomically replaces the private file. The selector is updated only after private-file persistence. If selector persistence fails, the previous selector remains active; inspect the selected path privately before restarting. Both files must be outside the repository and served content. Local drive paths are required; UNC, device paths, alternate data streams and symlinks/junctions are unsupported. Use a directory writable only by trusted server operators; the tool does not change permissions of an existing unrelated directory.

`ConnectionStrings:Medcom` is consumed by both `SqlLegacyUserStore` and `SqlDocumentReader` via `ApiHost`. `Legacy:ConnectionString` remains supported for existing installations; conflicting dual values fail startup. The tool removes that legacy duplicate from the private JSON when saving; process environment duplicates must be corrected separately. LocalDB, User Instance, attached database files, `master`, disabled encryption and `TrustServerCertificate=True` are rejected. SQL Server needs a trusted certificate matching its server name.

## Deployment status and remaining evidence

Evidence: `src/backend/Medcom.Api/ServerConfiguration.cs`, `ApiHost.cs`, `tools/deploy/Configure-MedcomServer.ps1`, `Test-MedcomServerConfiguration.ps1`, and `tests/backend/Medcom.Api.Tests/ServerConfigurationTests.cs`.

The tests use temporary files and synthetic connection strings. Target endpoint/database, service identity, remote SQL TLS connection, ERP schema/procedure permissions and runtime acceptance are **UNKNOWN** until supplied and verified. This configuration feature does not complete a transfer command, durable audit/idempotency, installation acceptance or production deployment. Native main review/CI and issue #45 remain applicable.
