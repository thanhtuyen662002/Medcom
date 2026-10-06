using Microsoft.Data.SqlClient;

namespace Medcom.Infrastructure;

// Explicit, single-target development-test permission. Never inferred from the host environment.
public sealed class SqlDevelopmentTestTlsTarget
{
    private const string InvalidTargetError = "The development-test SQL TLS target is invalid.";
    private readonly string server;
    private readonly string database;

    public SqlDevelopmentTestTlsTarget(string server, string database)
    {
        if (string.IsNullOrWhiteSpace(server) || string.IsNullOrWhiteSpace(database)
            || server.Contains("(localdb)", StringComparison.OrdinalIgnoreCase)
            || database.Equals("master", StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException(InvalidTargetError);
        this.server = server;
        this.database = database;
    }

    public void ApplyTo(SqlConnectionStringBuilder connection)
    {
        ArgumentNullException.ThrowIfNull(connection);
        // Literal comparisons only: no hostname resolution, aliases, prefixes or wildcard matching.
        // An alternate failover/read-only routing target cannot inherit this permission.
        if (!server.Equals(connection.DataSource, StringComparison.Ordinal)
            || !database.Equals(connection.InitialCatalog, StringComparison.Ordinal)
            || connection.ShouldSerialize("User Instance") || connection.ShouldSerialize("AttachDBFilename")
            || !string.IsNullOrWhiteSpace(connection.FailoverPartner)
            || connection.ApplicationIntent != ApplicationIntent.ReadWrite)
            throw new ArgumentException(InvalidTargetError);
        connection.Encrypt = SqlConnectionEncryptOption.Mandatory;
        connection.TrustServerCertificate = true;
        connection.PersistSecurityInfo = false;
    }
}
