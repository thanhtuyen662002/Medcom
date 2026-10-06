# Explicit single-target SQL TLS exception for development testing

This opt-in is disabled by default. It is only for a separately approved development test when the SQL server's certificate cannot yet be validated. Traffic remains encrypted, but the client does not authenticate the SQL server certificate. An attacker able to impersonate the configured SQL endpoint could intercept credentials and data. This is not production TLS acceptance.

## Private operator template

Merge this section into the existing private server configuration outside the repository and public content root. Replace the two placeholders locally with the intended connection's exact parsed `Data Source` and `Initial Catalog`. Do not copy real endpoints, databases, credentials or the private configuration into a repository, screenshot, log or support message.

```json
{
  "Medcom": {
    "SqlDevelopmentTestTls": {
      "Enabled": false,
      "Server": "<exact configured SQL Data Source, including any prefix, instance and port>",
      "Database": "<exact configured SQL Initial Catalog>"
    }
  }
}
```

Keep `Enabled` false until the bounded development test is approved. Set it to true only in the private configuration for that test. This document and code change do not change any deployed configuration or start a connection. Existing private connection-string loading through `ConnectionStrings:Medcom` and the compatible `Legacy:ConnectionString` key is unchanged; conflicting duplicate connection strings are still rejected.

The `Server` and `Database` values must both match the parsed connection string exactly, including case and the complete server prefix/instance/port. There is no wildcard, alias expansion, prefix match, host lookup or environment-name shortcut. `ASPNETCORE_ENVIRONMENT=Development` does not enable the exception. Invalid enable values or missing/mismatched enabled targets fail safely before a SQL connection is opened. Absent or false `Enabled` retains the default certificate/encryption validation; unused target values cannot enable the mode.

When the explicit opt-in and both values match, the API and each SQL consumer require `Encrypt=Mandatory` (equivalent to `Encrypt=True`), set `TrustServerCertificate=True`, and force `PersistSecurityInfo=False`. An original `Encrypt=False`/`Optional` value is upgraded, never retained; `Strict` is also normalized to `Mandatory` for this explicitly unverified test mode. Identity reads, document reads and purchase queries retain their common SQL connection policy. An enabled exception rejects `Failover Partner`, read-only routing (`ApplicationIntent=ReadOnly`), user-instance settings and attached-database files; another target cannot inherit the permission.

## Finish the test

Before production use, obtain a certificate chain and server identity that the deployment host trusts. Remove this test section or set `Enabled` to false, and keep the private connection string encrypted with `TrustServerCertificate=False`. The default API rejects `Encrypt=False` and `TrustServerCertificate=True`; disabling the exception is not enough if the original private string still requests those settings. Apply private configuration changes through the existing controlled host restart/update workflow and verify trusted TLS separately.

This option does not enable the legacy adapter or pilots, authorize a login, widen permissions, qualify a journal, activate writes, satisfy runtime/release gates, alter certificate stores or change SQL Server settings. Constructing/validating configuration performs no SQL I/O. Starting a configured host retains its existing health-monitor behavior and is a separate runtime operation.

## Verification boundaries

`SqlDevelopmentTestTlsTests` uses synthetic strings and a local listening socket, without a SQL Server. It covers default rejection, literal target matching, missing/wrong targets, mandatory encryption, secret-safe errors, security-info persistence, existing loopback test behavior, both host registrations and no connection opened during configuration/consumer construction. These tests do not establish a successful target handshake, SQL availability or production readiness. Build/xUnit and target runtime outcomes must be recorded from actual executions.
