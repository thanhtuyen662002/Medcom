using Medcom.Application;
using Medcom.Infrastructure;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class SessionTests
{
    [Fact]
    public async Task PollingDoesNotExtendIdleButExplicitInteractionDoes()
    {
        var clock = new ManualClock();
        var authority = new ControlledAuthority();
        var sessions = Store(authority, clock);
        var first = sessions.Create(authority.Identity)!;
        clock.Advance(TimeSpan.FromMinutes(9));
        Assert.Equal(first.View.IdleExpiresAt, (await sessions.ResolveAsync(first.Token, false, default))!.View.IdleExpiresAt);
        clock.Advance(TimeSpan.FromMinutes(1));
        Assert.Null(await sessions.ResolveAsync(first.Token, true, default));
        var second = sessions.Create(authority.Identity)!;
        clock.Advance(TimeSpan.FromMinutes(9));
        var touched = await sessions.ResolveAsync(second.Token, true, default);
        Assert.Equal(clock.GetUtcNow() + TimeSpan.FromMinutes(10), touched!.View.IdleExpiresAt);
    }

    [Fact]
    public async Task AbsoluteExpiryCannotBeExtendedByActivity()
    {
        var clock = new ManualClock();
        var authority = new ControlledAuthority();
        var sessions = Store(authority, clock);
        var created = sessions.Create(authority.Identity)!;
        for (var i = 0; i < 3; i++)
        {
            clock.Advance(TimeSpan.FromMinutes(9));
            Assert.NotNull(await sessions.ResolveAsync(created.Token, true, default));
        }
        clock.Advance(TimeSpan.FromMinutes(3));
        Assert.Null(await sessions.ResolveAsync(created.Token, true, default));
    }

    [Fact]
    public async Task PermissionChangesApplyWithoutReloginAndOldGenerationCannotRegress()
    {
        var authority = new ControlledAuthority();
        var sessions = Store(authority, new ManualClock());
        var session = sessions.Create(authority.Identity)!;
        authority.Identity = authority.Identity with { AuthorityVersion = 2, Capabilities = [] };
        var refreshed = await sessions.ResolveAsync(session.Token, false, default);
        Assert.Empty(refreshed!.View.Capabilities);
        Assert.Equal(2, refreshed.View.AuthorityVersion);
        authority.Identity = authority.Identity with { AuthorityVersion = 1, Capabilities = ["platform.status"] };
        Assert.Null(await sessions.ResolveAsync(session.Token, false, default));
        authority.Identity = authority.Identity with { AuthorityVersion = 2, Capabilities = [] };
        Assert.NotNull(await sessions.ResolveAsync(session.Token, false, default));
    }

    [Theory]
    [InlineData("principal")]
    [InlineData("tenant")]
    [InlineData("company")]
    public async Task IdentityBindingMismatchRevokesInsteadOfSwitchingContext(string changed)
    {
        var authority = new ControlledAuthority();
        var sessions = Store(authority, new ManualClock());
        var session = sessions.Create(authority.Identity)!;
        authority.Identity = changed switch
        {
            "principal" => authority.Identity with { PrincipalId = "other" },
            "tenant" => authority.Identity with { TenantId = "other" },
            _ => authority.Identity with { CompanyId = "other" }
        };
        Assert.Null(await sessions.ResolveAsync(session.Token, false, default));
        authority.Identity = ControlledAuthority.Original;
        Assert.Null(await sessions.ResolveAsync(session.Token, false, default));
    }

    [Fact]
    public async Task LogoutDuringRevalidationFencesLateResult()
    {
        var authority = new ControlledAuthority();
        var sessions = Store(authority, new ManualClock());
        var session = sessions.Create(authority.Identity)!;
        var completion = new TaskCompletionSource<IdentityResult>(TaskCreationOptions.RunContinuationsAsynchronously);
        authority.Pending = completion.Task;
        var pending = sessions.ResolveAsync(session.Token, false, default);
        sessions.Revoke(session.Token);
        completion.SetResult(new(IdentityOutcome.Success, authority.Identity));
        Assert.Null(await pending);
        Assert.Null(await sessions.ResolveAsync(session.Token, true, default));
    }

    [Fact]
    public async Task CapabilityChangeWithoutVersionChangeFailsClosed()
    {
        var authority = new ControlledAuthority();
        var sessions = Store(authority, new ManualClock());
        var session = sessions.Create(authority.Identity)!;
        authority.Identity = authority.Identity with { Capabilities = [] };
        Assert.Null(await sessions.ResolveAsync(session.Token, false, default));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task BranchScopeChangeWithoutVersionChangeRevokesSession(bool expanding)
    {
        var authority = new ControlledAuthority();
        authority.Identity = authority.Identity with { BranchIds = expanding ? ["QA-A"] : ["QA-A", "QA-B"] };
        var original = authority.Identity;
        var sessions = Store(authority, new ManualClock());
        var session = sessions.Create(original)!;
        authority.Identity = original with { BranchIds = expanding ? ["QA-A", "QA-B"] : ["QA-A"] };

        Assert.Null(await sessions.ResolveAsync(session.Token, false, default));
        authority.Identity = original;
        Assert.Null(await sessions.ResolveAsync(session.Token, false, default));
    }

    [Theory]
    [InlineData(IdentityOutcome.Rejected)]
    [InlineData(IdentityOutcome.Unavailable)]
    public async Task FailedAuthorityRevalidationCannotAuthorize(IdentityOutcome outcome)
    {
        var authority = new ControlledAuthority();
        var sessions = Store(authority, new ManualClock());
        var session = sessions.Create(authority.Identity)!;
        authority.Outcome = outcome;
        Assert.Null(await sessions.ResolveAsync(session.Token, false, default));
    }

    [Fact]
    public async Task CapacityIsBoundedExpiredEntriesAreReclaimedAndTokensAreUnpredictable()
    {
        var clock = new ManualClock();
        var authority = new ControlledAuthority();
        var sessions = Store(authority, clock, 1);
        var first = sessions.Create(authority.Identity)!;
        Assert.Equal(64, first.Token.Length);
        Assert.Null(sessions.Create(authority.Identity));
        Assert.Null(await sessions.ResolveAsync(new string('0', 64), false, default));
        clock.Advance(TimeSpan.FromMinutes(11));
        var second = sessions.Create(authority.Identity)!;
        Assert.NotEqual(first.Token, second.Token);
        Assert.Null(await sessions.ResolveAsync(first.Token, false, default));
    }

    [Fact]
    public void InvalidIdentityAndPolicyAreRejectedAndCapabilitiesAreFrozen()
    {
        var authority = new ControlledAuthority();
        var sessions = Store(authority, new ManualClock());
        Assert.Null(sessions.Create(authority.Identity with { TenantId = "" }));
        Assert.Null(sessions.Create(authority.Identity with { AuthorityVersion = 0 }));
        var capabilities = new List<string> { "platform.status" };
        var session = sessions.Create(authority.Identity with { Capabilities = capabilities })!;
        capabilities.Clear();
        Assert.Single(session.Identity.Capabilities);
        Assert.Throws<ArgumentOutOfRangeException>(() => new LocalWebSessions(authority, new ManualClock(),
            new(TimeSpan.Zero, TimeSpan.FromMinutes(30), 1)));
    }

    [Fact]
    public async Task ConcurrentLegacyRevalidationDoesNotLogOutUnchangedIdentity()
    {
        var users = new GatedLegacyUsers();
        var authority = new LegacyIdentityAuthority(users, new AcceptedPassword(),
            new("test-tenant", "test-company", "Test company"));
        var login = await authority.AuthenticateAsync("synthetic-user", "synthetic-password", default);
        var sessions = new LocalWebSessions(authority, TimeProvider.System, WebSessionPolicy.Default);
        var session = sessions.Create(login.Identity!)!;
        users.DelayNextRead = true;
        var first = sessions.ResolveAsync(session.Token, false, default);
        await users.ReadEntered.Task.WaitAsync(TimeSpan.FromSeconds(5));
        var second = sessions.ResolveAsync(session.Token, false, default);
        users.ReleaseRead.SetResult();
        var results = await Task.WhenAll(first, second).WaitAsync(TimeSpan.FromSeconds(5));
        Assert.All(results, value => Assert.NotNull(value));
        Assert.True(results[1]!.Identity.AuthorityVersion > results[0]!.Identity.AuthorityVersion);
        Assert.NotNull(await sessions.ResolveAsync(session.Token, false, default));
    }

    [Fact]
    public async Task QueuedRevalidationAfterLogoutDoesNotReadOrResurrectSession()
    {
        var users = new GatedLegacyUsers();
        var authority = new LegacyIdentityAuthority(users, new AcceptedPassword(),
            new("test-tenant", "test-company", "Test company"));
        var login = await authority.AuthenticateAsync("synthetic-user", "synthetic-password", default);
        var sessions = new LocalWebSessions(authority, TimeProvider.System, WebSessionPolicy.Default);
        var session = sessions.Create(login.Identity!)!;
        users.DelayNextRead = true;
        var first = sessions.ResolveAsync(session.Token, false, default);
        await users.ReadEntered.Task.WaitAsync(TimeSpan.FromSeconds(5));
        var second = sessions.ResolveAsync(session.Token, false, default);
        sessions.Revoke(session.Token);
        users.ReleaseRead.SetResult();
        var results = await Task.WhenAll(first, second).WaitAsync(TimeSpan.FromSeconds(5));
        Assert.All(results, value => Assert.Null(value));
        Assert.Equal(2, users.Reads);
    }

    [Fact]
    public async Task CancelledWaiterDoesNotUnlockTheActiveValidationOrRevokeSession()
    {
        var users = new GatedLegacyUsers();
        var (sessions, session) = await LegacySession(users, new ManualClock());
        users.DelayNextRead = true;
        var active = sessions.ResolveAsync(session.Token, false, default);
        await users.ReadEntered.Task.WaitAsync(TimeSpan.FromSeconds(5));
        using var cancellation = new CancellationTokenSource();
        var cancelled = sessions.ResolveAsync(session.Token, false, cancellation.Token);
        cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => cancelled);
        var queued = sessions.ResolveAsync(session.Token, false, default);
        Assert.False(queued.IsCompleted);
        Assert.Equal(2, users.Reads);
        users.ReleaseRead.SetResult();
        var results = await Task.WhenAll(active, queued).WaitAsync(TimeSpan.FromSeconds(5));
        Assert.All(results, value => Assert.NotNull(value));
        Assert.NotNull(await sessions.ResolveAsync(session.Token, false, default));
    }

    [Fact]
    public async Task CancelledActiveValidationReleasesWaiterWithoutRevokingSession()
    {
        var users = new GatedLegacyUsers();
        var (sessions, session) = await LegacySession(users, new ManualClock());
        users.DelayNextRead = true;
        using var cancellation = new CancellationTokenSource();
        var active = sessions.ResolveAsync(session.Token, false, cancellation.Token);
        await users.ReadEntered.Task.WaitAsync(TimeSpan.FromSeconds(5));
        var queued = sessions.ResolveAsync(session.Token, false, default);
        Assert.Equal(2, users.Reads);
        cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => active);
        Assert.NotNull(await queued.WaitAsync(TimeSpan.FromSeconds(5)));
        Assert.Equal(3, users.Reads);
        Assert.NotNull(await sessions.ResolveAsync(session.Token, false, default));
    }

    [Fact]
    public async Task QueuedValidationAfterIdleExpiryDoesNotReadOrExtendSession()
    {
        var users = new GatedLegacyUsers();
        var clock = new ManualClock();
        var (sessions, session) = await LegacySession(users, clock);
        users.DelayNextRead = true;
        var active = sessions.ResolveAsync(session.Token, true, default);
        await users.ReadEntered.Task.WaitAsync(TimeSpan.FromSeconds(5));
        var queued = sessions.ResolveAsync(session.Token, true, default);
        clock.Advance(TimeSpan.FromMinutes(10));
        users.ReleaseRead.SetResult();
        var results = await Task.WhenAll(active, queued).WaitAsync(TimeSpan.FromSeconds(5));
        Assert.All(results, value => Assert.Null(value));
        Assert.Equal(2, users.Reads);
        Assert.Null(await sessions.ResolveAsync(session.Token, true, default));
    }

    [Fact]
    public async Task SlowValidationDoesNotSerializeDifferentSessions()
    {
        var users = new GatedLegacyUsers();
        var (sessions, firstSession) = await LegacySession(users, new ManualClock());
        var otherSession = sessions.Create(firstSession.Identity)!;
        users.DelayNextRead = true;
        var first = sessions.ResolveAsync(firstSession.Token, false, default);
        await users.ReadEntered.Task.WaitAsync(TimeSpan.FromSeconds(5));
        var other = await sessions.ResolveAsync(otherSession.Token, false, default)
            .WaitAsync(TimeSpan.FromSeconds(5));
        Assert.NotNull(other);
        Assert.False(first.IsCompleted);
        users.ReleaseRead.SetResult();
        Assert.NotNull(await first.WaitAsync(TimeSpan.FromSeconds(5)));
    }

    [Fact]
    public async Task LegacyDerivedRestrictedAndAllScopesReplaceCachedSessionBranches()
    {
        // The store supplies synthetic, already-derived explicit scopes. This is
        // authority/session coverage, not a native SQL resolver or live ERP test.
        var users = new GatedLegacyUsers();
        users.User = users.User with { BranchIds = ["QA-A"] };
        var (sessions, original) = await LegacySession(users, new ManualClock());
        Assert.Equal(["QA-A"], original.Identity.BranchIds);

        users.User = users.User with { BranchIds = ["QA-C", "QA-A", "QA-B"] };
        var expanded = await sessions.ResolveAsync(original.Token, false, default);
        Assert.NotNull(expanded);
        Assert.Equal(["QA-A", "QA-B", "QA-C"], expanded.Identity.BranchIds);
        Assert.Equal(original.Token, expanded.Token);
        Assert.Equal(original.Identity.CredentialStamp, expanded.Identity.CredentialStamp);
        Assert.Equal(original.View.Capabilities, expanded.View.Capabilities);
        Assert.Equal(original.View.IdleExpiresAt, expanded.View.IdleExpiresAt);
        Assert.True(expanded.View.AuthorityVersion > original.View.AuthorityVersion);

        users.User = users.User with { BranchIds = ["QA-B"] };
        var narrowed = await sessions.ResolveAsync(original.Token, false, default);
        Assert.NotNull(narrowed);
        Assert.Equal(["QA-B"], narrowed.Identity.BranchIds);
        Assert.Equal(original.Token, narrowed.Token);
        Assert.Equal(original.Identity.CredentialStamp, narrowed.Identity.CredentialStamp);
        Assert.Equal(original.View.Capabilities, narrowed.View.Capabilities);
        Assert.True(narrowed.View.AuthorityVersion > expanded.View.AuthorityVersion);
        Assert.Equal(["QA-A"], original.Identity.BranchIds);
        Assert.Equal(["QA-A", "QA-B", "QA-C"], expanded.Identity.BranchIds);
        Assert.Equal(3, users.Reads);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task LegacyEmptyOrMissingDerivedScopeRemovesAllCachedBranchGrants(bool missing)
    {
        var users = new GatedLegacyUsers();
        users.User = users.User with { BranchIds = ["QA-A", "QA-B"] };
        var (sessions, original) = await LegacySession(users, new ManualClock());
        users.User = users.User with { BranchIds = missing ? null : [] };

        var revalidated = await sessions.ResolveAsync(original.Token, false, default);
        Assert.NotNull(revalidated);
        Assert.NotNull(revalidated.Identity.BranchIds);
        Assert.Empty(revalidated.Identity.BranchIds);
        Assert.Equal(original.View.Capabilities, revalidated.View.Capabilities);
        Assert.True(revalidated.View.AuthorityVersion > original.View.AuthorityVersion);
        var repeated = await sessions.ResolveAsync(original.Token, false, default);
        Assert.NotNull(repeated);
        Assert.Empty(repeated.Identity.BranchIds!);
    }

    [Fact]
    public async Task LegacyExpandedBranchScopeDoesNotRestoreRevokedSessionCapabilities()
    {
        var users = new GatedLegacyUsers();
        users.User = users.User with { Capabilities = ["purchase-orders.read", "purchase-requests.read"], BranchIds = ["QA-A"] };
        var (sessions, original) = await LegacySession(users, new ManualClock());
        users.User = users.User with { Capabilities = [], BranchIds = ["QA-A", "QA-B"] };

        var revalidated = await sessions.ResolveAsync(original.Token, false, default);
        Assert.NotNull(revalidated);
        Assert.Equal(["QA-A", "QA-B"], revalidated.Identity.BranchIds);
        Assert.Equal(["platform.status"], revalidated.Identity.Capabilities);
        Assert.Equal(["platform.status"], revalidated.View.Capabilities);
        var repeated = await sessions.ResolveAsync(original.Token, false, default);
        Assert.NotNull(repeated);
        Assert.Equal(["platform.status"], repeated.View.Capabilities);
    }

    [Theory]
    [InlineData("credential")]
    [InlineData("disabled-user")]
    [InlineData("group")]
    [InlineData("missing-group")]
    [InlineData("disabled-group")]
    public async Task LegacyExpandedBranchScopeCannotResurrectRevokedSession(string change)
    {
        var users = new GatedLegacyUsers();
        users.User = users.User with { BranchIds = ["QA-A"] };
        var originalUser = users.User;
        var (sessions, session) = await LegacySession(users, new ManualClock());
        users.User = users.User with { BranchIds = ["QA-A", "QA-B"] };
        users.User = change switch
        {
            "credential" => users.User with { StoredHash = "changed-synthetic-hash" },
            "disabled-user" => users.User with { Disabled = true },
            "group" => users.User with { GroupId = "other-group" },
            "missing-group" => users.User with { GroupId = null },
            _ => users.User with { GroupEnabled = false }
        };

        Assert.Null(await sessions.ResolveAsync(session.Token, false, default));
        users.User = originalUser with { BranchIds = ["QA-A", "QA-B"] };
        Assert.Null(await sessions.ResolveAsync(session.Token, true, default));
        Assert.Equal(2, users.Reads);
    }

    private static async Task<(LocalWebSessions Sessions, ResolvedSession Session)> LegacySession(
        GatedLegacyUsers users, ManualClock clock)
    {
        var authority = new LegacyIdentityAuthority(users, new AcceptedPassword(),
            new("test-tenant", "test-company", "Test company"));
        var login = await authority.AuthenticateAsync("synthetic-user", "synthetic-password", default);
        var sessions = new LocalWebSessions(authority, clock,
            new(TimeSpan.FromMinutes(10), TimeSpan.FromMinutes(30), 10));
        return (sessions, sessions.Create(login.Identity!)!);
    }

    private sealed class AcceptedPassword : ILegacyPasswordVerifier
    {
        public Task<PasswordOutcome> VerifyAsync(string username, string password, string storedHash,
            CancellationToken cancellationToken) => Task.FromResult(PasswordOutcome.Accepted);
    }

    private sealed class GatedLegacyUsers : ILegacyUserStore
    {
        private int reads;
        public LegacyUser User { get; set; } = new("synthetic-user", "Synthetic user", "synthetic-stored-hash", false,
            "synthetic-group", true, ["purchase-orders.read"], ["synthetic-branch"]);
        public int Reads => Volatile.Read(ref reads);
        public bool DelayNextRead { get; set; }
        public TaskCompletionSource ReadEntered { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource ReleaseRead { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public async Task<LegacyUser?> FindAsync(string username, CancellationToken cancellationToken)
        {
            Interlocked.Increment(ref reads);
            if (DelayNextRead)
            {
                DelayNextRead = false;
                ReadEntered.SetResult();
                await ReleaseRead.Task.WaitAsync(cancellationToken);
            }
            return User;
        }
    }

    private static LocalWebSessions Store(ControlledAuthority authority, ManualClock clock, int capacity = 10) =>
        new(authority, clock, new(TimeSpan.FromMinutes(10), TimeSpan.FromMinutes(30), capacity));
}

internal sealed class ManualClock : TimeProvider
{
    private DateTimeOffset now = new(2026, 10, 2, 0, 0, 0, TimeSpan.Zero);
    public override DateTimeOffset GetUtcNow() => now;
    public void Advance(TimeSpan duration) => now += duration;
}

internal sealed class ControlledAuthority : IIdentityAuthority
{
    public static AuthoritativeIdentity Original => new("test-user", "test-tenant", "test-company",
        "Công ty kiểm thử", "Người kiểm thử", 1, ["platform.status"]);
    public AuthoritativeIdentity Identity { get; set; } = Original;
    public IdentityOutcome Outcome { get; set; } = IdentityOutcome.Success;
    public Task<IdentityResult>? Pending { get; set; }
    public Task<IdentityResult> AuthenticateAsync(string username, string password, CancellationToken cancellationToken) =>
        Task.FromResult(new IdentityResult(username == "synthetic-user" && password == "synthetic-password"
            ? Outcome : IdentityOutcome.Rejected, Identity));
    public Task<IdentityResult> RevalidateAsync(AuthoritativeIdentity identity, CancellationToken cancellationToken) =>
        Pending ?? Task.FromResult(new IdentityResult(Outcome, Identity));
}
