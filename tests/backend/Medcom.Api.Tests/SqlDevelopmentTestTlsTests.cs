using System.Data;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using Medcom.Api;
using Medcom.Application;
using Medcom.Infrastructure;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class SqlDevelopmentTestTlsTests
{
    private const string Server = "sql.example.invalid,1433";
    private const string Database = "MedcomSyntheticTest";
    private const string Prefix = "Medcom:SqlDevelopmentTestTls:";
    private const string Connection = "Server=sql.example.invalid,1433;Database=MedcomSyntheticTest;User ID=synthetic;Password=synthetic-secret-sentinel;Encrypt=True;TrustServerCertificate=True;Persist Security Info=True";

    [Theory]
    [InlineData(null)]
    [InlineData("false")]
    public void TestTargetsWithoutExplicitEnableDoNotRelaxDefaultPolicy(string? enabled)
    {
        var configuration = Configuration(Connection, enabled);
        // An environment name cannot grant the permission.
        configuration["ASPNETCORE_ENVIRONMENT"] = "Development";
        AssertSafeConfigurationError(configuration);
        Assert.Throws<ArgumentException>(() => new SqlLegacyUserStore(Connection));
        Assert.Throws<ArgumentException>(() => new SqlDocumentReader(Connection, Company()));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("false")]
    public void DefaultStillRequiresEncryptionAndTrustedCertificate(string? enabled)
    {
        var trusted = Connection.Replace("TrustServerCertificate=True", "TrustServerCertificate=False", StringComparison.Ordinal);
        var configuration = Configuration(trusted, enabled);
        var resolved = ServerConfiguration.ResolveConnectionString(configuration, out var target);
        Assert.Null(target);
        AssertSecureDefaults(new SqlConnectionStringBuilder(resolved));
        using var connection = ConnectionFrom(new SqlLegacyUserStore(resolved));
        Assert.Equal(ConnectionState.Closed, connection.State);
        AssertSecureDefaults(new SqlConnectionStringBuilder(connection.ConnectionString));
        configuration["ConnectionStrings:Medcom"] = trusted.Replace("Encrypt=True", "Encrypt=False", StringComparison.Ordinal);
        AssertSafeConfigurationError(configuration);
    }

    [Theory]
    [InlineData("True", "True")]
    [InlineData("False", "True")]
    [InlineData("Optional", "True")]
    [InlineData("Strict", "False")]
    [InlineData("True", "False")]
    public void MatchingOptInAlwaysProducesMandatoryEncryptionAndNoPersistedSecurityInfo(string encrypt, string trust)
    {
        var original = new SqlConnectionStringBuilder(Connection);
        original["Encrypt"] = encrypt;
        original.TrustServerCertificate = bool.Parse(trust);
        var configuration = Configuration(original.ConnectionString);
        var resolved = ServerConfiguration.ResolveConnectionString(configuration, out var target);
        Assert.NotNull(target);
        AssertTestTls(new SqlConnectionStringBuilder(resolved));

        // Both direct construction and the API-normalized string recheck the same target.
        foreach (var value in new[] { original.ConnectionString, resolved })
        {
            using var connection = ConnectionFrom(new SqlLegacyUserStore(value, developmentTestTlsTarget: target));
            Assert.Equal(ConnectionState.Closed, connection.State);
            AssertTestTls(new SqlConnectionStringBuilder(connection.ConnectionString));
            var documents = new SqlDocumentReader(value, Company(), developmentTestTlsTarget: target);
            using var documentConnection = ConnectionFrom(DocumentStore(documents));
            Assert.Equal(ConnectionState.Closed, documentConnection.State);
            AssertTestTls(new SqlConnectionStringBuilder(documentConnection.ConnectionString));
        }
        // Removing the target argument must not turn the normalized string into a blanket bypass.
        Assert.Throws<ArgumentException>(() => new SqlLegacyUserStore(resolved));
        Assert.Throws<ArgumentException>(() => new SqlDocumentReader(resolved, Company()));
    }

    [Theory]
    [InlineData("Server", null)]
    [InlineData("Server", "")]
    [InlineData("Server", " ")]
    [InlineData("Server", "other.example.invalid,1433")]
    [InlineData("Server", "sql.example.invalid,1434")]
    [InlineData("Server", "sql.example.invalid")]
    [InlineData("Server", "SQL.example.invalid,1433")]
    [InlineData("Server", "tcp:sql.example.invalid,1433")]
    [InlineData("Server", "*.example.invalid,1433")]
    [InlineData("Server", "sql.example.invalid,1433 ")]
    [InlineData("Database", null)]
    [InlineData("Database", "")]
    [InlineData("Database", " ")]
    [InlineData("Database", "OtherSyntheticTest")]
    [InlineData("Database", "medcomsynthetictest")]
    [InlineData("Database", "MedcomSyntheticTest*")]
    [InlineData("Database", "master")]
    public void MissingOrNonliteralTargetFailsClosed(string setting, string? value)
    {
        var configuration = Configuration(Connection);
        configuration[Prefix + setting] = value;
        AssertSafeConfigurationError(configuration);
    }

    [Theory]
    [InlineData("Server", "other.example.invalid,1433")]
    [InlineData("Server", "sql.example.invalid,1434")]
    [InlineData("Database", "OtherSyntheticTest")]
    public void InfrastructureRechecksTargetForEveryConstructedConsumer(string key, string value)
    {
        ServerConfiguration.ResolveConnectionString(Configuration(Connection), out var target);
        var changed = new SqlConnectionStringBuilder(Connection) { [key] = value };
        var error = Assert.Throws<ArgumentException>(() => new SqlLegacyUserStore(changed.ConnectionString,
            allowLoopbackTestCertificate: true, developmentTestTlsTarget: target));
        Assert.Null(error.InnerException);
        Assert.DoesNotContain(value, error.ToString());
        Assert.Throws<ArgumentException>(() => new SqlDocumentReader(changed.ConnectionString, Company(),
            allowLoopbackTestCertificate: true, developmentTestTlsTarget: target));
    }

    [Theory]
    [InlineData("Failover Partner=other.example.invalid")]
    [InlineData("ApplicationIntent=ReadOnly")]
    [InlineData("User Instance=False")]
    [InlineData("AttachDBFilename=synthetic-private.mdf")]
    public void TargetPermissionCannotRouteToAnAlternateDatabaseOrServer(string option)
    {
        var connection = Connection + ";" + option;
        AssertSafeConfigurationError(Configuration(connection));
        var target = new SqlDevelopmentTestTlsTarget(Server, Database);
        var error = Assert.Throws<ArgumentException>(() => new SqlLegacyUserStore(connection, developmentTestTlsTarget: target));
        Assert.Null(error.InnerException);
        Assert.DoesNotContain("synthetic-secret-sentinel", error.ToString());
        Assert.Throws<ArgumentException>(() => new SqlDocumentReader(connection, Company(), developmentTestTlsTarget: target));
    }

    [Theory]
    [InlineData("")]
    [InlineData("yes")]
    [InlineData("1")]
    [InlineData("invalid-secret-sentinel")]
    public void MalformedEnableValueIsRejectedWithoutDisclosure(string enabled)
        => AssertSafeConfigurationError(Configuration(Connection, enabled));

    [Fact]
    public void MalformedConnectionIsRejectedWithoutDisclosureAtBothBoundaries()
    {
        const string malformed = "malformed-secret-sentinel";
        AssertSafeConfigurationError(Configuration(malformed));
        var error = Assert.Throws<ArgumentException>(() => new SqlLegacyUserStore(malformed,
            developmentTestTlsTarget: new SqlDevelopmentTestTlsTarget(Server, Database)));
        Assert.Null(error.InnerException);
        Assert.DoesNotContain(malformed, error.ToString());
    }

    [Fact]
    public void LegacyConnectionKeyAndConflictDetectionStillApply()
    {
        var configuration = Configuration(Connection);
        configuration["ConnectionStrings:Medcom"] = null;
        configuration["Legacy:ConnectionString"] = Connection;
        AssertTestTls(new SqlConnectionStringBuilder(ServerConfiguration.ResolveConnectionString(configuration)));
        configuration["ConnectionStrings:Medcom"] = Connection;
        ServerConfiguration.ResolveConnectionString(configuration);
        configuration["ConnectionStrings:Medcom"] = Connection.Replace(Database, "OtherSyntheticTest", StringComparison.Ordinal);
        AssertSafeConfigurationError(configuration);
    }

    [Fact]
    public void ExistingLoopbackPermissionRemainsExplicitAndLoopbackOnly()
    {
        var loopback = Connection.Replace(Server, "127.0.0.1,1433", StringComparison.Ordinal)
            .Replace("Encrypt=True", "Encrypt=False", StringComparison.Ordinal);
        Assert.Throws<ArgumentException>(() => new SqlLegacyUserStore(loopback));
        Assert.Throws<ArgumentException>(() => new SqlLegacyUserStore(Connection, allowLoopbackTestCertificate: true));
        using var connection = ConnectionFrom(new SqlLegacyUserStore(loopback, allowLoopbackTestCertificate: true));
        AssertTestTls(new SqlConnectionStringBuilder(connection.ConnectionString));
        var documents = new SqlDocumentReader(loopback, Company(), allowLoopbackTestCertificate: true);
        using var documentConnection = ConnectionFrom(DocumentStore(documents));
        AssertTestTls(new SqlConnectionStringBuilder(documentConnection.ConnectionString));
        AssertSafeConfigurationError(Configuration(loopback, "false"));
    }

    [Fact]
    public async Task ConfigurationAndHostConstructionDoNotOpenSqlAndBothConsumersReceiveTarget()
    {
        // No SQL Server is used: any connection attempt would reach this listening socket.
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var server = "127.0.0.1," + ((IPEndPoint)listener.LocalEndpoint).Port;
        var original = Connection.Replace(Server, server, StringComparison.Ordinal);
        var configuration = Configuration(original);
        configuration[Prefix + "Server"] = server;
        var resolved = ServerConfiguration.ResolveConnectionString(configuration, out var target);
        var store = new SqlLegacyUserStore(resolved, developmentTestTlsTarget: target);
        var reader = new SqlDocumentReader(resolved, Company(), developmentTestTlsTarget: target);
        using var directConnection = ConnectionFrom(store);
        using var documentConnection = ConnectionFrom(DocumentStore(reader));
        Assert.Equal(ConnectionState.Closed, directConnection.State);
        Assert.Equal(ConnectionState.Closed, documentConnection.State);

        using var privateConfiguration = new PrivateConfigurationFixture();
        await using var app = ApiHost.Build(HostArguments(original, server, enabled: "true", privateConfigPath: privateConfiguration.FilePath));
        using var hostConnection = ConnectionFrom(app.Services.GetRequiredService<SqlLegacyUserStore>());
        var hostReader = Assert.IsType<SqlDocumentReader>(app.Services.GetRequiredService<IDocumentReader>());
        using var hostDocumentConnection = ConnectionFrom(DocumentStore(hostReader));
        Assert.Equal(ConnectionState.Closed, hostConnection.State);
        Assert.Equal(ConnectionState.Closed, hostDocumentConnection.State);
        AssertTestTls(new SqlConnectionStringBuilder(hostConnection.ConnectionString));
        AssertTestTls(new SqlConnectionStringBuilder(hostDocumentConnection.ConnectionString));
        Assert.False(listener.Pending());
        // Never start the app: the pre-existing health monitor is a separate runtime operation.
    }

    [Fact]
    public void DevelopmentHostNameAloneDoesNotEnableTestTls()
    {
        using var privateConfiguration = new PrivateConfigurationFixture();
        var error = Assert.Throws<InvalidOperationException>(() =>
            ApiHost.Build(HostArguments(Connection, Server, enabled: "false", privateConfigPath: privateConfiguration.FilePath)));
        Assert.Equal("A valid encrypted SQL Server connection is required.", error.Message);
        Assert.Null(error.InnerException);
    }

    [Fact]
    public async Task TestTlsSettingsDoNotActivateLegacyAdapters()
    {
        using var privateConfiguration = new PrivateConfigurationFixture();
        var args = HostArguments(Connection, Server, enabled: "true", privateConfigPath: privateConfiguration.FilePath)
            .Concat(new[] { "--Legacy:Enabled", "false" }).ToArray();
        await using var app = ApiHost.Build(args);
        Assert.Null(app.Services.GetService<SqlLegacyUserStore>());
        Assert.IsType<UnavailableDocumentReader>(app.Services.GetRequiredService<IDocumentReader>());
    }

    private static ConfigurationManager Configuration(string connection, string? enabled = "true")
    {
        var configuration = new ConfigurationManager();
        configuration["ConnectionStrings:Medcom"] = connection;
        configuration[Prefix + "Enabled"] = enabled;
        configuration[Prefix + "Server"] = Server;
        configuration[Prefix + "Database"] = Database;
        return configuration;
    }

    private static void AssertSafeConfigurationError(IConfiguration configuration)
    {
        SqlDevelopmentTestTlsTarget? target = new(Server, Database);
        var error = Assert.Throws<InvalidOperationException>(() => ServerConfiguration.ResolveConnectionString(configuration, out target));
        Assert.Null(target);
        Assert.Equal("A valid encrypted SQL Server connection is required.", error.Message);
        Assert.Null(error.InnerException);
        Assert.DoesNotContain("secret-sentinel", error.ToString());
        Assert.DoesNotContain(Server, error.ToString());
        Assert.DoesNotContain(Database, error.ToString());
    }

    private static void AssertSecureDefaults(SqlConnectionStringBuilder connection)
    {
        Assert.Equal(SqlConnectionEncryptOption.Mandatory, connection.Encrypt);
        Assert.False(connection.TrustServerCertificate);
        Assert.False(connection.PersistSecurityInfo);
    }

    private static void AssertTestTls(SqlConnectionStringBuilder connection)
    {
        Assert.Equal(SqlConnectionEncryptOption.Mandatory, connection.Encrypt);
        Assert.True(connection.TrustServerCertificate);
        Assert.False(connection.PersistSecurityInfo);
    }

    private static LegacyCompany Company() => new("synthetic-tenant", "synthetic-company", "Synthetic Test Company");

    private static SqlConnection ConnectionFrom(SqlLegacyUserStore store)
        => Assert.IsType<SqlConnection>(typeof(SqlLegacyUserStore).GetMethod("CreateConnection",
            BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(store, null));

    private static SqlLegacyUserStore DocumentStore(SqlDocumentReader reader)
        => Assert.IsType<SqlLegacyUserStore>(typeof(SqlDocumentReader).GetField("database",
            BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(reader));

    private static string[] HostArguments(string connection, string server, string enabled, string privateConfigPath) =>
    [
        "--environment", "Development",
        "--" + ServerConfiguration.PrivateConfigPathKey, privateConfigPath,
        "--Legacy:Enabled", "true", "--Legacy:EnableReadOnlyPilots", "true",
        "--Legacy:TenantId", "synthetic-tenant", "--Legacy:CompanyId", "synthetic-company",
        "--Legacy:CompanyName", "Synthetic Test Company", "--Legacy:ToolsPath", "synthetic-Tools.dll",
        "--ConnectionStrings:Medcom", connection,
        "--Medcom:SqlDevelopmentTestTls:Enabled", enabled,
        "--Medcom:SqlDevelopmentTestTls:Server", server,
        "--Medcom:SqlDevelopmentTestTls:Database", Database
    ];

    private sealed class PrivateConfigurationFixture : IDisposable
    {
        private readonly string directory = Path.Combine(Path.GetTempPath(), "MedcomSqlTlsTest-" + Guid.NewGuid().ToString("N"));
        public string FilePath { get; }

        public PrivateConfigurationFixture()
        {
            Directory.CreateDirectory(directory);
            FilePath = Path.Combine(directory, "appsettings.Private.json");
            File.WriteAllText(FilePath, "{}");
        }

        public void Dispose() => Directory.Delete(directory, recursive: true);
    }
}
