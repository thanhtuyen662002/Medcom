using System.Text.Json;
using Medcom.Api;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class ServerConfigurationTests : IDisposable
{
    private readonly string directory = Path.Combine(Path.GetTempPath(), "MedcomConfigTest-" + Guid.NewGuid().ToString("N"));
    private const string SafeConnection = "Server=sql.example.invalid,1433;Database=MedcomTestOnly;User ID=synthetic;Password=not-a-real-secret;Encrypt=True;TrustServerCertificate=False";
    private string Selector => Path.Combine(directory, "selector.json");
    private string PrivateFile => Path.Combine(directory, "private", "appsettings.Private.json");
    private string ContentRoot => Path.Combine(directory, "public");

    public ServerConfigurationTests() => Directory.CreateDirectory(ContentRoot);

    [Fact]
    public void SelectorLoadsPrivateStandardConnectionWithoutChangingWriteGates()
    {
        Write(PrivateFile, new { ConnectionStrings = new { Medcom = SafeConnection }, Legacy = new { Enabled = false } });
        Write(Selector, new { Medcom = new { PrivateConfigPath = PrivateFile } });
        var config = new ConfigurationManager();
        ServerConfiguration.LoadPrivateConfiguration(config, ContentRoot, [], Selector);
        Assert.False(config.GetValue<bool>("Legacy:Enabled"));
        Assert.False(config.GetValue<bool>("Legacy:WritesEnabled"));
        var parsed = new SqlConnectionStringBuilder(ServerConfiguration.ResolveConnectionString(config));
        Assert.Equal("sql.example.invalid,1433", parsed.DataSource);
        Assert.Equal("MedcomTestOnly", parsed.InitialCatalog);
        Assert.False(parsed.PersistSecurityInfo);
    }

    [Fact]
    public void CommandLineOverridesSelectorAndPrivateSettings()
    {
        Write(PrivateFile, new { ConnectionStrings = new { Medcom = SafeConnection } });
        var other = Path.Combine(directory, "other.json");
        Write(other, new { ConnectionStrings = new { Medcom = SafeConnection.Replace("MedcomTestOnly", "OtherTestOnly") } });
        Write(Selector, new { Medcom = new { PrivateConfigPath = PrivateFile } });
        var args = new[] { "--Medcom:PrivateConfigPath", other };
        var config = new ConfigurationManager();
        config.AddCommandLine(args);
        ServerConfiguration.LoadPrivateConfiguration(config, ContentRoot, args, Selector);
        Assert.Equal("OtherTestOnly", new SqlConnectionStringBuilder(ServerConfiguration.ResolveConnectionString(config)).InitialCatalog);
        Assert.Equal(other, config[ServerConfiguration.PrivateConfigPathKey]);
    }

    [Fact]
    public void OptionalMissingDefaultDoesNotRequireCredentials()
    {
        var config = new ConfigurationManager();
        ServerConfiguration.LoadPrivateConfiguration(config, ContentRoot, [], Selector, PrivateFile);
        Assert.Null(config.GetConnectionString("Medcom"));
        Assert.False(config.GetValue<bool>("Legacy:Enabled"));
    }

    [Fact]
    public void ExplicitConfiguredPathIsRetainedAfterSelectorAndPrivateFileAreRead()
    {
        Write(PrivateFile, new { ConnectionStrings = new { Medcom = SafeConnection }, Medcom = new { PrivateConfigPath = "ignored-inner-value" } });
        Write(Selector, new { Medcom = new { PrivateConfigPath = Path.Combine(directory, "unselected.json") } });
        var config = new ConfigurationManager();
        config[ServerConfiguration.PrivateConfigPathKey] = PrivateFile;
        ServerConfiguration.LoadPrivateConfiguration(config, ContentRoot, [], Selector);
        Assert.Equal(PrivateFile, config[ServerConfiguration.PrivateConfigPathKey]);
        Assert.Equal("MedcomTestOnly", new SqlConnectionStringBuilder(ServerConfiguration.ResolveConnectionString(config)).InitialCatalog);
    }

    [Fact]
    public void ExplicitPathOverridesMalformedSelector()
    {
        Write(PrivateFile, new { ConnectionStrings = new { Medcom = SafeConnection } });
        File.WriteAllText(Selector, "{ invalid-selector-secret-sentinel");
        var config = new ConfigurationManager();
        config[ServerConfiguration.PrivateConfigPathKey] = PrivateFile;
        ServerConfiguration.LoadPrivateConfiguration(config, ContentRoot, [], Selector);
        Assert.Equal("MedcomTestOnly", new SqlConnectionStringBuilder(ServerConfiguration.ResolveConnectionString(config)).InitialCatalog);
    }

    [Theory]
    [InlineData("missing")]
    [InlineData("malformed-private")]
    [InlineData("malformed-selector")]
    [InlineData("public")]
    [InlineData("repository")]
    public void InvalidPrivateFilesFailWithoutPathOrSecretDisclosure(string scenario)
    {
        var path = scenario == "public" ? Path.Combine(ContentRoot, "private.json") : PrivateFile;
        if (scenario == "repository") path = Path.Combine(Directory.GetCurrentDirectory(), "private-secret-sentinel.json");
        if (scenario == "malformed-private")
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllText(path, "{ secret-sentinel-invalid-json");
        }
        if (scenario == "malformed-selector") File.WriteAllText(Selector, "{ secret-sentinel-invalid-json");
        else Write(Selector, new { Medcom = new { PrivateConfigPath = path } });
        var error = Assert.Throws<InvalidOperationException>(() => ServerConfiguration.LoadPrivateConfiguration(new ConfigurationManager(), ContentRoot, [], Selector));
        Assert.Equal("Private server configuration could not be loaded.", error.Message);
        Assert.Null(error.InnerException);
        Assert.DoesNotContain("secret-sentinel", error.ToString());
        Assert.DoesNotContain(path, error.ToString());
    }

    [Theory]
    [InlineData("Server=(localdb)\\MSSQLLocalDB;Database=Test;Encrypt=True")]
    [InlineData("Server=sql.example.invalid;Database=Test;User Instance=True;Encrypt=True")]
    [InlineData("Server=sql.example.invalid;Database=Test;AttachDBFilename=D:\\private.mdf;Encrypt=True")]
    [InlineData("Server=sql.example.invalid;Database=Test;Encrypt=False")]
    [InlineData("Server=sql.example.invalid;Database=Test;Encrypt=True;TrustServerCertificate=True")]
    [InlineData("Server=sql.example.invalid;Database=master;Encrypt=True")]
    [InlineData("malformed-secret-sentinel")]
    public void UnsafeConnectionsRejectWithoutEchoingInput(string value)
    {
        var config = new ConfigurationManager();
        config["ConnectionStrings:Medcom"] = value;
        var error = Assert.Throws<InvalidOperationException>(() => ServerConfiguration.ResolveConnectionString(config));
        Assert.Equal("A valid encrypted SQL Server connection is required.", error.Message);
        Assert.Null(error.InnerException);
        Assert.DoesNotContain(value, error.ToString());
    }

    [Fact]
    public void LegacyKeyRemainsCompatibleButConflictingDuplicateFails()
    {
        var config = new ConfigurationManager();
        config["Legacy:ConnectionString"] = SafeConnection;
        Assert.Equal("MedcomTestOnly", new SqlConnectionStringBuilder(ServerConfiguration.ResolveConnectionString(config)).InitialCatalog);
        config["ConnectionStrings:Medcom"] = SafeConnection;
        ServerConfiguration.ResolveConnectionString(config);
        config["ConnectionStrings:Medcom"] = SafeConnection.Replace("MedcomTestOnly", "DifferentTestOnly");
        Assert.Throws<InvalidOperationException>(() => ServerConfiguration.ResolveConnectionString(config));
    }

    [Fact]
    public void WindowsDefaultUsesOwnerSelectedDirectory()
    {
        Assert.Equal(@"D:\Config\appsettings.Private.json", ServerConfiguration.DefaultPrivateConfigPath);
    }

    private static void Write(string path, object value)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, JsonSerializer.Serialize(value));
    }

    public void Dispose() => Directory.Delete(directory, true);
}
