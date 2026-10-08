using System.Data;
using System.Net;
using System.Net.Http.Json;
using Medcom.Application;
using Medcom.Contracts;
using Medcom.Infrastructure;
using Xunit;

namespace Medcom.Api.Tests;

// Executes the production native resolver, identity authority and session lifecycle over
// a recording provider with synthetic rows. Not SQL Server/native-DLL runtime evidence.
public sealed class BranchSelectionMetadataTests
{
    [Fact]
    public async Task Native_resolution_flows_through_real_authentication_and_workspace_wire_contract()
    {
        var source = new PurchaseQuerySource { NativeBranch = null };
        var authority = new LegacyIdentityAuthority(new NativeUsers(source), new AcceptedPassword(), PurchaseQuerySource.Company);
        await using var server = await SecureTestServer.Start(identityAuthority: authority);
        using var login = await server.Post("/api/auth/login", new { username = "qa-user", password = "synthetic-password" }, await server.Csrf());
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        async Task<(string Session, string Read)> Workspace(BranchSelection? expected, string[] branches)
        {
            using var response = await server.Client.GetAsync("/api/workspace");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var body = await response.Content.ReadFromJsonAsync<WorkspaceView>();
            Assert.NotNull(body); Assert.Equal(expected, body.BranchSelection); Assert.Equal(branches, body.BranchIds);
            return (response.Headers.GetValues("X-Medcom-Session-Scope").Single(),
                response.Headers.GetValues("X-Medcom-Read-Scope").Single());
        }
        var all = await Workspace(new("all", null, false), ["QA-A", "QA-B"]);
        source.NativeBranch = "QA-A";
        var assigned = await Workspace(new("assigned", "QA-A", true), ["QA-A", "QA-B"]);
        Assert.Equal(all.Session, assigned.Session); Assert.NotEqual(all.Read, assigned.Read);
        source.NativeBranch = ""; source.CatalogBranches = [];
        var empty = await Workspace(null, []);
        Assert.Equal(all.Session, empty.Session); Assert.NotEqual(assigned.Read, empty.Read);
        source.CatalogBranches = ["QA-B", "QA-A"];
        Assert.Equal(all, await Workspace(new("all", null, false), ["QA-A", "QA-B"]));
    }

    private sealed class NativeUsers(PurchaseQuerySource source) : ILegacyUserStore
    {
        public int Resolutions;
        public async Task<LegacyUser?> FindAsync(string username, CancellationToken token)
        {
            Resolutions++;
            var user = new LegacyUser("qa-user", "Synthetic user", "synthetic-stored-value", false, "qa-group", true,
                ["purchase-orders.read"]);
            await using var connection = new QueryConnection(source);
            await connection.OpenAsync(token);
            await using var transaction = await connection.BeginTransactionAsync(IsolationLevel.Serializable, token);
            var scope = await SqlLegacyBranchScope.ResolveAsync(transaction, user, token);
            await transaction.RollbackAsync(token);
            return user with { BranchIds = scope.BranchIds, BranchSelection = scope.BranchSelection };
        }
    }

    private sealed class AcceptedPassword : ILegacyPasswordVerifier
    {
        public int Calls;
        public Task<PasswordOutcome> VerifyAsync(string username, string password, string hash, CancellationToken token)
        { Calls++; return Task.FromResult(PasswordOutcome.Accepted); }
    }

    [Fact]
    public async Task Fresh_native_semantics_replace_identity_without_rotating_session_or_changing_equal_grants()
    {
        var source = new PurchaseQuerySource { NativeBranch = null };
        var users = new NativeUsers(source); var passwords = new AcceptedPassword();
        var authority = new LegacyIdentityAuthority(users, passwords, PurchaseQuerySource.Company);
        var sessions = new LocalWebSessions(authority, TimeProvider.System, WebSessionPolicy.Default);
        var login = await authority.AuthenticateAsync("qa-user", "synthetic-password", default);
        Assert.Equal(IdentityOutcome.Success, login.Outcome);
        Assert.Equal(new BranchSelection("all", null, false), login.Identity!.BranchSelection);
        var initial = sessions.Create(login.Identity!)!;
        Assert.NotNull(initial);
        source.NativeBranch = "QA-A";
        var assigned = await sessions.ResolveAsync(initial.Token, false, default);
        Assert.NotNull(assigned);
        Assert.Equal(new BranchSelection("assigned", "QA-A", true), assigned.Identity.BranchSelection);
        Assert.Equal(initial.Identity.BranchIds, assigned.Identity.BranchIds);
        Assert.Equal(initial.Identity.Capabilities, assigned.Identity.Capabilities);
        Assert.Equal(initial.Identity.CredentialStamp, assigned.Identity.CredentialStamp);
        Assert.Equal(initial.Token, assigned.Token);
        Assert.Equal(initial.View.AbsoluteExpiresAt, assigned.View.AbsoluteExpiresAt);
        Assert.Equal(initial.View.IdleExpiresAt, assigned.View.IdleExpiresAt);
        Assert.True(assigned.Identity.AuthorityVersion > initial.Identity.AuthorityVersion);
        // Supplemental grants remain valid identity data while native UI selection is locked.
        Assert.Contains("QA-B", assigned.Identity.BranchIds!);
        source.NativeBranch = "QA-B";
        var reassigned = await sessions.ResolveAsync(initial.Token, false, default);
        Assert.Equal(new BranchSelection("assigned", "QA-B", true), reassigned!.Identity.BranchSelection);
        source.NativeBranch = "";
        var all = await sessions.ResolveAsync(initial.Token, false, default);
        Assert.Equal(new BranchSelection("all", null, false), all!.Identity.BranchSelection);
        Assert.Equal(initial.Identity.BranchIds, all.Identity.BranchIds);
        Assert.Equal(1, passwords.Calls); Assert.Equal(4, users.Resolutions);
    }

    [Theory]
    [InlineData("missing")] [InlineData("unavailable")] [InlineData("malformed")]
    [InlineData("catalog-unavailable")] [InlineData("catalog-invalid")]
    public async Task Failed_native_resolution_cannot_publish_all_or_an_identity(string failure)
    {
        var source = new PurchaseQuerySource { NativeBranch = null };
        switch (failure)
        {
            case "missing": source.NativeMissing = true; break;
            case "unavailable": source.NativeUnavailable = true; break;
            case "malformed": source.NativeBranch = " "; break;
            case "catalog-unavailable": source.CatalogUnavailable = true; break;
            default: source.CatalogBranches = ["QA-A "]; break;
        }
        var passwords = new AcceptedPassword();
        var authority = new LegacyIdentityAuthority(new NativeUsers(source), passwords, PurchaseQuerySource.Company);
        var result = await authority.AuthenticateAsync("qa-user", "synthetic-password", default);
        Assert.Equal(IdentityOutcome.Unavailable, result.Outcome); Assert.Null(result.Identity);
        Assert.Equal(0, passwords.Calls);
    }

    [Theory]
    [InlineData(null)] [InlineData("")] [InlineData("QA-A")]
    public async Task Empty_derived_data_retains_empty_grants_and_unavailable_metadata(string? native)
    {
        var source = new PurchaseQuerySource { NativeBranch = native, NativeBranches = [], CatalogBranches = [] };
        var authority = new LegacyIdentityAuthority(new NativeUsers(source), new AcceptedPassword(), PurchaseQuerySource.Company);
        var result = await authority.AuthenticateAsync("qa-user", "synthetic-password", default);
        Assert.Equal(IdentityOutcome.Success, result.Outcome);
        Assert.Empty(result.Identity!.BranchIds!); Assert.Null(result.Identity.BranchSelection);
    }

    private sealed class DerivedUsers : ILegacyUserStore
    {
        public LegacyUser User = new("qa-user", "Synthetic user", "synthetic-stored-value", false, "qa-group", true,
            ["purchase-orders.read"], ["QA-A", "QA-B"]);
        public Task<LegacyUser?> FindAsync(string username, CancellationToken token) => Task.FromResult<LegacyUser?>(User);
    }

    [Fact]
    public async Task Backward_identity_is_unavailable_and_revalidation_never_retains_old_metadata()
    {
        var users = new DerivedUsers();
        var authority = new LegacyIdentityAuthority(users, new AcceptedPassword(), PurchaseQuerySource.Company);
        var old = (await authority.AuthenticateAsync("qa-user", "synthetic-password", default)).Identity!;
        Assert.Null(old.BranchSelection); Assert.Equal(users.User.BranchIds, old.BranchIds);
        users.User = users.User with { BranchSelection = new("all", null, false) };
        var current = (await authority.RevalidateAsync(old, default)).Identity!;
        Assert.Equal(users.User.BranchSelection, current.BranchSelection);
        users.User = users.User with { BranchSelection = null };
        var unavailable = (await authority.RevalidateAsync(current, default)).Identity!;
        Assert.Null(unavailable.BranchSelection); Assert.Equal(current.BranchIds, unavailable.BranchIds);
        Assert.Equal(current.CredentialStamp, unavailable.CredentialStamp);
    }
}
