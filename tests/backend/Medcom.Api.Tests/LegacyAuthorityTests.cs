using Medcom.Application;
using Medcom.Infrastructure;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class LegacyAuthorityTests
{
    private sealed class Users : ILegacyUserStore
    {
        public LegacyUser? User = new("Canonical", "Synthetic User", "synthetic-hash", false, "group", true);
        public string? Requested;
        public Task<LegacyUser?> FindAsync(string username, CancellationToken cancellationToken)
        { Requested = username; return Task.FromResult(User); }
    }
    private sealed class Passwords : ILegacyPasswordVerifier
    {
        public PasswordOutcome Outcome = PasswordOutcome.Accepted;
        public string? Username;
        public int Calls;
        public Task<PasswordOutcome> VerifyAsync(string username, string password, string storedHash, CancellationToken cancellationToken)
        { Calls++; Username = username; return Task.FromResult(Outcome); }
    }
    [Fact]
    public async Task DatabaseCanonicalIdentityControlsVerificationAndBrowserScope()
    {
        var users = new Users(); var passwords = new Passwords();
        var authority = new LegacyIdentityAuthority(users, passwords, new("tenant", "company", "Company"));
        var result = await authority.AuthenticateAsync(" alias ", "input", default);
        Assert.Equal(IdentityOutcome.Success, result.Outcome);
        Assert.Equal("alias", users.Requested); Assert.Equal("Canonical", passwords.Username);
        Assert.Equal("Canonical", result.Identity!.PrincipalId);
        Assert.Equal(["platform.status"], result.Identity.Capabilities);
        Assert.DoesNotContain("synthetic-hash", result.Identity.CredentialStamp!);
    }
    [Theory]
    [InlineData(true, false, false)]
    [InlineData(false, true, false)]
    [InlineData(false, false, true)]
    public async Task DisabledUserMissingGroupOrDisabledGroupNeverCallsPassword(bool disabled, bool missing, bool groupDisabled)
    {
        var users = new Users(); var passwords = new Passwords();
        users.User = users.User! with { Disabled = disabled, GroupId = missing ? null : "group", GroupEnabled = !groupDisabled };
        var authority = new LegacyIdentityAuthority(users, passwords, new("t", "c", "Company"));
        Assert.Equal(IdentityOutcome.Rejected, (await authority.AuthenticateAsync("alias", "input", default)).Outcome);
        Assert.Equal(0, passwords.Calls);
    }
    [Fact]
    public async Task CredentialAndGroupChangeRevokeExistingSession()
    {
        var users = new Users(); var passwords = new Passwords();
        var authority = new LegacyIdentityAuthority(users, passwords, new("t", "c", "Company"));
        var identity = (await authority.AuthenticateAsync("alias", "input", default)).Identity!;
        Assert.Equal(IdentityOutcome.Success,(await authority.RevalidateAsync(identity,default)).Outcome);
        users.User = users.User! with { StoredHash = "different" };
        Assert.Equal(IdentityOutcome.Rejected,(await authority.RevalidateAsync(identity,default)).Outcome);
        users.User = users.User with { StoredHash = "synthetic-hash", GroupId = "other" };
        Assert.Equal(IdentityOutcome.Rejected,(await authority.RevalidateAsync(identity,default)).Outcome);
        Assert.Equal(1,passwords.Calls);
    }

    [Fact]
    public async Task DerivedRestrictedAndAllBranchOutputsReplacePreviousIdentityScope()
    {
        // Synthetic, already-derived resolver outputs. These tests do not execute
        // SQL or establish which native BranchID values resolve to all branches.
        var users = new Users(); var passwords = new Passwords();
        users.User = users.User! with { Capabilities = ["purchase-orders.read"], BranchIds = ["QA-A"] };
        var authority = new LegacyIdentityAuthority(users, passwords, new("t", "c", "Company"));
        var restricted = (await authority.AuthenticateAsync("alias", "input", default)).Identity!;
        Assert.Equal(["QA-A"], restricted.BranchIds);

        users.User = users.User with { BranchIds = ["QA-A", "QA-B", "QA-C"] };
        var expanded = await authority.RevalidateAsync(restricted, default);
        Assert.Equal(IdentityOutcome.Success, expanded.Outcome);
        Assert.Equal(["QA-A", "QA-B", "QA-C"], expanded.Identity!.BranchIds);
        Assert.Equal(restricted.CredentialStamp, expanded.Identity.CredentialStamp);
        Assert.Equal(restricted.Capabilities, expanded.Identity.Capabilities);
        Assert.True(expanded.Identity.AuthorityVersion > restricted.AuthorityVersion);

        users.User = users.User with { BranchIds = ["QA-B"] };
        var narrowed = await authority.RevalidateAsync(expanded.Identity, default);
        Assert.Equal(IdentityOutcome.Success, narrowed.Outcome);
        Assert.Equal(["QA-B"], narrowed.Identity!.BranchIds);
        Assert.Equal(restricted.CredentialStamp, narrowed.Identity.CredentialStamp);
        Assert.Equal(restricted.Capabilities, narrowed.Identity.Capabilities);
        Assert.True(narrowed.Identity.AuthorityVersion > expanded.Identity.AuthorityVersion);
        Assert.Equal("Canonical", users.Requested);
        Assert.Equal(1, passwords.Calls);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task EmptyOrMissingDerivedScopeNeverRetainsPreviousBranchGrants(bool missing)
    {
        var users = new Users(); var passwords = new Passwords();
        users.User = users.User! with { Capabilities = ["purchase-orders.read"], BranchIds = ["QA-A", "QA-B"] };
        var authority = new LegacyIdentityAuthority(users, passwords, new("t", "c", "Company"));
        var identity = (await authority.AuthenticateAsync("alias", "input", default)).Identity!;

        users.User = users.User with { BranchIds = missing ? null : [] };
        var revalidated = await authority.RevalidateAsync(identity, default);
        Assert.Equal(IdentityOutcome.Success, revalidated.Outcome);
        Assert.Empty(revalidated.Identity!.BranchIds ?? []);
        Assert.Equal(identity.Capabilities, revalidated.Identity.Capabilities);
        var freshLogin = await authority.AuthenticateAsync("alias", "input", default);
        Assert.Equal(IdentityOutcome.Success, freshLogin.Outcome);
        Assert.Empty(freshLogin.Identity!.BranchIds ?? []);
    }

    [Fact]
    public async Task ExpandedDerivedScopeDoesNotRestoreRevokedFunctionalCapabilities()
    {
        var users = new Users(); var passwords = new Passwords();
        users.User = users.User! with { Capabilities = ["purchase-orders.read", "purchase-requests.read"], BranchIds = ["QA-A"] };
        var authority = new LegacyIdentityAuthority(users, passwords, new("t", "c", "Company"));
        var identity = (await authority.AuthenticateAsync("alias", "input", default)).Identity!;

        users.User = users.User with { Capabilities = [], BranchIds = ["QA-A", "QA-B"] };
        var revalidated = await authority.RevalidateAsync(identity, default);
        Assert.Equal(IdentityOutcome.Success, revalidated.Outcome);
        Assert.Equal(["QA-A", "QA-B"], revalidated.Identity!.BranchIds);
        Assert.Equal(["platform.status"], revalidated.Identity.Capabilities);
        Assert.Equal(identity.CredentialStamp, revalidated.Identity.CredentialStamp);
    }

    [Theory]
    [InlineData("credential")]
    [InlineData("missing-credential")]
    [InlineData("principal")]
    [InlineData("disabled-user")]
    [InlineData("group")]
    [InlineData("missing-group")]
    [InlineData("disabled-group")]
    public async Task ExpandedDerivedScopeCannotBypassIdentityOrGroupRevocation(string change)
    {
        var users = new Users(); var passwords = new Passwords();
        users.User = users.User! with { Capabilities = ["purchase-orders.read"], BranchIds = ["QA-A"] };
        var authority = new LegacyIdentityAuthority(users, passwords, new("t", "c", "Company"));
        var identity = (await authority.AuthenticateAsync("alias", "input", default)).Identity!;
        users.User = users.User with { BranchIds = ["QA-A", "QA-B"] };
        users.User = change switch
        {
            "credential" => users.User with { StoredHash = "changed-synthetic-hash" },
            "missing-credential" => users.User with { StoredHash = "" },
            "principal" => users.User with { Username = "Other" },
            "disabled-user" => users.User with { Disabled = true },
            "group" => users.User with { GroupId = "other-group" },
            "missing-group" => users.User with { GroupId = null },
            _ => users.User with { GroupEnabled = false }
        };

        var result = await authority.RevalidateAsync(identity, default);
        Assert.Equal(IdentityOutcome.Rejected, result.Outcome);
        Assert.Null(result.Identity);
        Assert.Equal(1, passwords.Calls);
    }

    [Fact]
    public async Task WorkerFailureAndInvalidPasswordDoNotCreateIdentity()
    {
        var users = new Users(); var passwords = new Passwords();
        var authority = new LegacyIdentityAuthority(users, passwords, new("t", "c", "Company"));
        foreach(var (outcome, expected) in new[] { (PasswordOutcome.Rejected, IdentityOutcome.Rejected), (PasswordOutcome.Unavailable, IdentityOutcome.Unavailable) })
        {
            passwords.Outcome = outcome;
            var result = await authority.AuthenticateAsync("alias","input",default);
            Assert.Equal(expected,result.Outcome); Assert.Null(result.Identity);
        }
    }
    [Fact]
    public void UnsafeSqlConfigurationIsRejectedBeforeConnecting()
    {
        Assert.Throws<ArgumentException>(() => new SqlLegacyUserStore("Server=remote;Database=master;Integrated Security=true"));
        Assert.Throws<ArgumentException>(() => new SqlLegacyUserStore("Server=remote;Database=erp;TrustServerCertificate=true;Integrated Security=true"));
        Assert.Throws<ArgumentException>(() => new SqlLegacyUserStore("Server=remote;Database=erp;TrustServerCertificate=true;Integrated Security=true",true));
    }
    [Fact]
    public async Task MissingWorkerIsUnavailableAndMalformedInputRejected()
    {
        var worker = new LegacyPasswordVerifier(new("dotnet","/nonexistent/worker.dll","/nonexistent/Tools.dll"));
        Assert.Equal(PasswordOutcome.Unavailable,await worker.VerifyAsync("user","input","hash",default));
        Assert.Equal(PasswordOutcome.Rejected,await worker.VerifyAsync("user","input","",default));
    }
}
