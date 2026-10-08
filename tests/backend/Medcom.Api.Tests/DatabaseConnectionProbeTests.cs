using System.Text.Json;
using Medcom.Api;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class DatabaseConnectionProbeTests
{
    private const string Connection = "Server=sql.example.invalid,1433;Database=ProbeFixture;User ID=synthetic;Password=synthetic-secret;Encrypt=True;TrustServerCertificate=False";

    [Fact]
    public void OptInIsExactAndAbsentByDefault()
    {
        Assert.False(DatabaseConnectionProbe.IsRequested([]));
        Assert.False(DatabaseConnectionProbe.IsRequested(["--urls", "http://localhost:8080"]));
        Assert.False(DatabaseConnectionProbe.IsRequested(["--probe-database=true"]));
        Assert.True(DatabaseConnectionProbe.IsRequested(["--probe-database"]));
    }

    [Fact]
    public async Task ArgumentsCannotSupplySecretsOrStartTheHost()
    {
        using var output = new StringWriter();
        Assert.Equal(2, await DatabaseConnectionProbe.RunAsync(
            [DatabaseConnectionProbe.Switch, "Password=synthetic-secret"], output));
        Assert.Contains("invalid_arguments", output.ToString());
        Assert.DoesNotContain("synthetic-secret", output.ToString());
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("not-a-connection-string")]
    public async Task MissingOrMalformedConfigurationNeverCreatesSession(string? value)
    {
        using var config = Configuration(value);
        using var output = new StringWriter();
        var called = false;
        var exit = await DatabaseConnectionProbe.RunCoreAsync(config, output, () =>
        {
            called = true;
            return new FakeSession();
        });
        Assert.NotEqual(0, exit);
        Assert.False(called);
        Assert.Contains("invalid_configuration", output.ToString());
    }

    [Theory]
    [InlineData("")]
    [InlineData("REPLACE_PASSWORD_HERE")]
    public async Task MissingPasswordNeverCreatesSession(string password)
    {
        using var config = Configuration(Connection.Replace("synthetic-secret", password));
        using var output = new StringWriter();
        var called = false;
        Assert.Equal(2, await DatabaseConnectionProbe.RunCoreAsync(config, output, () =>
        {
            called = true;
            return new FakeSession();
        }));
        Assert.False(called);
        Assert.Contains("missing_sql_password", output.ToString());
    }

    [Theory]
    [InlineData("Encrypt=False;TrustServerCertificate=False")]
    [InlineData("Encrypt=True;TrustServerCertificate=True")]
    public async Task DefaultTlsPolicyCannotBeRelaxed(string tls)
    {
        using var config = Configuration(Connection.Replace("Encrypt=True;TrustServerCertificate=False", tls));
        using var output = new StringWriter();
        Assert.NotEqual(0, await DatabaseConnectionProbe.RunCoreAsync(config, output,
            () => throw new Exception("Session factory must not be reached")));
        Assert.Contains("configuration", output.ToString());
    }

    [Fact]
    public async Task SuccessPreservesTlsAndFlagsAndUsesBoundedSession()
    {
        using var config = Configuration(Connection);
        config["Legacy:Enabled"] = "false";
        config["Legacy:EnableReadOnlyPilots"] = "false";
        using var output = new StringWriter();
        var session = new FakeSession();
        Assert.Equal(0, await DatabaseConnectionProbe.RunCoreAsync(config, output, () => session));
        var settings = new SqlConnectionStringBuilder(session.Connection);
        Assert.Equal(SqlConnectionEncryptOption.Mandatory, settings.Encrypt);
        Assert.False(settings.TrustServerCertificate);
        Assert.False(settings.PersistSecurityInfo);
        Assert.False(settings.Pooling);
        Assert.Equal(10, settings.ConnectTimeout);
        Assert.Equal(0, settings.ConnectRetryCount);
        Assert.Equal(1, session.OpenCalls);
        Assert.Equal(1, session.SelectCalls);
        Assert.True(session.Disposed);
        Assert.Equal("false", config["Legacy:Enabled"]);
        Assert.Equal("false", config["Legacy:EnableReadOnlyPilots"]);
        Assert.Null(config["Medcom:SqlDevelopmentTestTls:Enabled"]);
        AssertSafe(output.ToString(), "complete", "ok");
    }

    [Fact]
    public async Task ExistingExplicitScopedTlsExceptionIsPreservedWithoutEnablingIt()
    {
        using var config = Configuration(Connection);
        config["Medcom:SqlDevelopmentTestTls:Enabled"] = "true";
        config["Medcom:SqlDevelopmentTestTls:Server"] = "sql.example.invalid,1433";
        config["Medcom:SqlDevelopmentTestTls:Database"] = "ProbeFixture";
        using var output = new StringWriter();
        var session = new FakeSession();
        Assert.Equal(0, await DatabaseConnectionProbe.RunCoreAsync(config, output, () => session));
        Assert.True(new SqlConnectionStringBuilder(session.Connection).TrustServerCertificate);
        config["Medcom:SqlDevelopmentTestTls:Database"] = "wrong-target";
        var reached = false;
        Assert.NotEqual(0, await DatabaseConnectionProbe.RunCoreAsync(config, output, () =>
        {
            reached = true;
            return new FakeSession();
        }));
        Assert.False(reached);
    }

    [Theory]
    [InlineData(true, "open")]
    [InlineData(false, "select_one")]
    public async Task FailureDetailsAndDatabaseValuesAreNeverPrinted(bool failOpen, string stage)
    {
        using var config = Configuration(Connection);
        using var output = new StringWriter();
        var session = new FakeSession { FailOpen = failOpen, FailSelect = !failOpen };
        Assert.Equal(3, await DatabaseConnectionProbe.RunCoreAsync(config, output, () => session));
        Assert.True(session.Disposed);
        AssertSafe(output.ToString(), stage, "probe_failed");
        Assert.Equal(failOpen ? 0 : 1, session.SelectCalls);
    }

    [Fact]
    public async Task UnexpectedScalarIsFailureAndNotSerialized()
    {
        using var config = Configuration(Connection);
        using var output = new StringWriter();
        var session = new FakeSession { Result = false };
        Assert.Equal(3, await DatabaseConnectionProbe.RunCoreAsync(config, output, () => session));
        AssertSafe(output.ToString(), "select_one", "unexpected_scalar");
    }

    [Theory]
    [InlineData("arguments", false)]
    [InlineData("configuration", false)]
    [InlineData("success", false)]
    [InlineData("arguments", true)]
    [InlineData("configuration", true)]
    [InlineData("success", true)]
    public async Task BrokenOutputIsNonThrowingNonzeroAndNeverRetried(string path, bool asynchronous)
    {
        using var output = new ThrowingTextWriter { Asynchronous = asynchronous };
        using var config = Configuration(path == "configuration" ? null : Connection);
        var session = new FakeSession();
        var exit = path == "arguments"
            ? await DatabaseConnectionProbe.RunAsync([DatabaseConnectionProbe.Switch, "invalid"], output)
            : await DatabaseConnectionProbe.RunCoreAsync(config, output, () => session);
        Assert.Equal(4, exit);
        Assert.Equal(1, output.Attempts);
        Assert.Equal(path == "success" ? 1 : 0, session.OpenCalls);
        if (path == "success") Assert.True(session.Disposed);
    }

    [Theory]
    [InlineData(true, "open")]
    [InlineData(false, "select_one")]
    public async Task CancellationIsRedactedAndSessionIsDisposed(bool cancelOpen, string stage)
    {
        using var config = Configuration(Connection);
        using var output = new StringWriter();
        var session = new FakeSession { CancelOpen = cancelOpen, CancelSelect = !cancelOpen };
        Assert.Equal(3, await DatabaseConnectionProbe.RunCoreAsync(config, output, () => session));
        Assert.True(session.Disposed);
        AssertSafe(output.ToString(), stage, "timeout");
        Assert.Equal(cancelOpen ? 0 : 1, session.SelectCalls);
    }

    [Fact]
    public async Task DisposalFailureIsRedactedAndCannotReportSuccess()
    {
        using var config = Configuration(Connection);
        using var output = new StringWriter();
        var session = new FakeSession { FailDispose = true };
        Assert.Equal(3, await DatabaseConnectionProbe.RunCoreAsync(config, output, () => session));
        Assert.True(session.Disposed);
        AssertSafe(output.ToString(), "select_one", "probe_failed");
        Assert.Single(output.ToString().Split('\n', StringSplitOptions.RemoveEmptyEntries));
    }

    private sealed class ThrowingTextWriter : StringWriter
    {
        public int Attempts { get; private set; }
        public bool Asynchronous { get; init; }
        public override Task WriteLineAsync(string? value)
        {
            Attempts++;
            var exception = new IOException("synthetic-secret Password=synthetic-secret private-row");
            if (Asynchronous) return Task.FromException(exception);
            throw exception;
        }
    }

    private static ConfigurationManager Configuration(string? connection)
    {
        var config = new ConfigurationManager();
        config["ConnectionStrings:Medcom"] = connection;
        return config;
    }

    private static void AssertSafe(string output, string stage, string code)
    {
        using var json = JsonDocument.Parse(output);
        Assert.Equal(stage, json.RootElement.GetProperty("stage").GetString());
        Assert.Equal(code, json.RootElement.GetProperty("code").GetString());
        Assert.Equal(6, json.RootElement.EnumerateObject().Count());
        foreach (var value in new[] { "sql.example.invalid", "ProbeFixture", "synthetic-secret",
                     "synthetic", "private-row", "Password=", "Server=" })
            Assert.DoesNotContain(value, output);
    }

    private sealed class FakeSession : DatabaseConnectionProbe.IProbeSession
    {
        public string Connection { get; private set; } = "";
        public bool FailOpen { get; init; }
        public bool FailSelect { get; init; }
        public bool Result { get; init; } = true;
        public bool CancelOpen { get; init; }
        public bool CancelSelect { get; init; }
        public bool FailDispose { get; init; }
        public int OpenCalls { get; private set; }
        public int SelectCalls { get; private set; }
        public bool Disposed { get; private set; }
        public Task OpenAsync(string connectionString, CancellationToken cancellationToken)
        {
            Connection = connectionString;
            OpenCalls++;
            Assert.True(cancellationToken.CanBeCanceled);
            if (CancelOpen) throw new OperationCanceledException(Connection + " private-row");
            if (FailOpen) throw new InvalidOperationException(Connection + " private-row");
            return Task.CompletedTask;
        }
        public Task<bool> SelectOneAsync(CancellationToken cancellationToken)
        {
            SelectCalls++;
            if (CancelSelect) throw new OperationCanceledException(Connection + " private-row");
            if (FailSelect) throw new InvalidOperationException(Connection + " private-row");
            return Task.FromResult(Result);
        }
        public ValueTask DisposeAsync()
        {
            Disposed = true;
            if (FailDispose) throw new IOException(Connection + " private-row");
            return ValueTask.CompletedTask;
        }
    }
}
