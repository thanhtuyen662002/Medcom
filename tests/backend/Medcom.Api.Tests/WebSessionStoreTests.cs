using Medcom.Application;
using Medcom.Infrastructure;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class WebSessionStoreTests : IDisposable
{
    private readonly string directory = Path.Combine(Path.GetTempPath(), "medcom-sessions-" + Guid.NewGuid().ToString("N"));
    private string StorePath => Path.Combine(directory, "web-sessions.json");

    [Fact]
    public async Task A_session_survives_a_restart_and_still_revalidates_against_ERP()
    {
        var authority = new ControlledAuthority(); var clock = new ManualClock();
        var policy = new WebSessionPolicy(TimeSpan.FromMinutes(10), TimeSpan.FromMinutes(30), 10);
        string token;
        using (var before = new LocalWebSessions(authority, clock, policy, new WebSessionFileStore(StorePath)))
            token = before.Create(authority.Identity)!.Token;
        // Only the token hash is stored, never the token itself.
        Assert.DoesNotContain(token, File.ReadAllText(StorePath), StringComparison.OrdinalIgnoreCase);

        var after = new LocalWebSessions(authority, clock, policy, new WebSessionFileStore(StorePath));
        Assert.Equal("test-user", (await after.ResolveAsync(token, true, default))!.Identity.PrincipalId);
        authority.Outcome = IdentityOutcome.Rejected;
        Assert.Null(await after.ResolveAsync(token, true, default));
    }

    [Fact]
    public async Task Logout_expiry_and_a_shorter_policy_are_not_undone_by_a_restart()
    {
        var authority = new ControlledAuthority(); var clock = new ManualClock();
        var policy = new WebSessionPolicy(TimeSpan.FromMinutes(10), TimeSpan.FromMinutes(30), 10);
        var sessions = new LocalWebSessions(authority, clock, policy, new WebSessionFileStore(StorePath));
        var revoked = sessions.Create(authority.Identity)!.Token;
        var kept = sessions.Create(authority.Identity)!.Token;
        sessions.Revoke(revoked); sessions.Flush();

        var restored = new LocalWebSessions(authority, clock, policy, new WebSessionFileStore(StorePath));
        Assert.Null(await restored.ResolveAsync(revoked, false, default));
        Assert.NotNull(await restored.ResolveAsync(kept, false, default));

        var shorter = new WebSessionPolicy(TimeSpan.FromMinutes(5), TimeSpan.FromMinutes(5), 10);
        Assert.Null(await new LocalWebSessions(authority, clock, shorter, new WebSessionFileStore(StorePath))
            .ResolveAsync(kept, false, default));
        clock.Advance(TimeSpan.FromMinutes(11));
        Assert.Null(await new LocalWebSessions(authority, clock, policy, new WebSessionFileStore(StorePath))
            .ResolveAsync(kept, false, default));
    }

    [Fact]
    public void A_corrupt_or_missing_file_starts_empty_and_none_disables_the_store()
    {
        Directory.CreateDirectory(directory);
        File.WriteAllText(StorePath, "{not json");
        Assert.Empty(new WebSessionFileStore(StorePath).Load());
        Assert.Empty(new WebSessionFileStore(Path.Combine(directory, "missing.json")).Load());
        Assert.Null(WebSessionFileStore.Create("none"));
        Assert.NotNull(WebSessionFileStore.Create(null));
        Assert.Throws<ArgumentException>(() => new WebSessionFileStore("relative.json"));
    }

    public void Dispose()
    {
        if (Directory.Exists(directory)) Directory.Delete(directory, true);
    }
}
