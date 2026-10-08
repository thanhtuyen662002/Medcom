# One-shot SQL connection diagnostic

The API executable supports one explicit diagnostic invocation:

```sh
dotnet Medcom.Api.dll --probe-database
```

Run only after separately authorized deployment and SQL access, in the target
backend runtime with its existing privately provisioned environment. Do not put
credentials in the command line, logs, images, GitHub or this document. Do not
replace the service's normal start command with this one-shot command.

The switch must be the sole argument. Without it the existing API startup is
unchanged. With it, execution exits before building the host: no HTTP listener,
Data Protection setup, legacy health monitor, authentication, private DLL or
business provider is initialized. This is not an HTTP endpoint or startup check.

Configuration is loaded from process environment only. The existing
ServerConfiguration.ResolveConnectionString policy selects ConnectionStrings__Medcom
(or its existing Legacy__ConnectionString alias), rejects conflicts and validates
the target/TLS settings. No private configuration files are read. This diagnostic
requires explicit SQL user/password authentication. Missing or blank credentials,
the exact password placeholder REPLACE_PASSWORD_HERE, integrated authentication
and other authentication methods fail before creating a SQL connection.

Default TLS validation remains unchanged. An existing, explicitly configured
Medcom__SqlDevelopmentTestTls permission remains scoped to its exact server and
database by the existing resolver. This command never sets or enables it and
never turns off encryption. Likewise no Legacy flag is changed.

The connection uses the API's existing Microsoft.Data.SqlClient 7.0.3 dependency
and .NET 10 runtime, rather than another driver's successful connection as a
proxy. The probe opens one nonpooled connection with a 10-second connection timeout,
no connect retries and a 20-second cancellation budget, executes only SELECT 1
with a 5-second command timeout, checks that its scalar equals one and disposes
the connection. Cancellation is cooperative; the operating runtime/provider owns
final cancellation timing. There are no business table reads, stored procedure
calls, transactions, writes or retries.

One JSON record reports only provider name/assembly version, runtime version,
a fixed stage/code and optional numeric SqlException.Number. It never emits
connection strings, credentials, SQL exception messages, server/database names,
stack traces or returned database values. Exit 0 means open plus SELECT 1 passed;
nonzero means invalid arguments/configuration, missing credentials, or failure.
Exit 4 means the output sink failed; no error details or retry are emitted, and
a successful SQL check is not reported as a successful process in that case.
The numeric SQL code alone may not distinguish certificate, network and server
causes. Do not enable verbose provider tracing to work around redaction.

This diagnostic does not establish authentication/password-worker compatibility,
ERP schema/permissions, business correctness, application readiness or production
acceptance. Record the actual deployment/source revision and observed outcome
separately. A prepared candidate or a synthetic test is not target DB evidence.

## Source-free validation

Run the existing backend workflow with the repository-pinned SDK and lockfiles:

```sh
dotnet restore Medcom.slnx --locked-mode
dotnet build Medcom.slnx --configuration Release --no-restore
dotnet test Medcom.slnx --configuration Release --no-build --filter 'Category!=LegacyRuntime'
```

DatabaseConnectionProbeTests uses only in-memory configuration and fake sessions;
it never opens a real SQL connection. It covers default-off dispatch, command-line
rejection, absent/malformed configuration, password-placeholder failure,
unchanged default/scoped TLS policy, unchanged Legacy flags, bounded connection
settings, disposal, cancellation, success and error/value redaction. Broken-output
tests cover arguments, configuration failure and synthetic success without throws
or repeated writes. A disposal-failure test verifies that success is not emitted. Production provider/network
execution must be reported separately and requires the authorized target runtime.
