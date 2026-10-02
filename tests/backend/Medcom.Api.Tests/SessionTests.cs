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
