using Medcom.Application;
using Medcom.Infrastructure.PurchaseRequests;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class PurchaseRequestSessionFenceTests
{
    [Fact]
    public void Monotone_versions_are_accepted_when_full_security_scope_is_unchanged()
    {
        var fence = new PurchaseRequestSessionFence();
        var first = PurchaseFixtures.Identity(1) with
        {
            Capabilities = ["z-capability", "purchase-requests.read", "z-capability"],
            BranchIds = ["B2", "B1", "B2"]
        };
        Assert.True(fence.TryAccept(first, out var accepted1));
        Assert.Equal(new[] { "purchase-requests.read", "z-capability" }, accepted1.Capabilities);
        Assert.Equal(new[] { "B1", "B2" }, accepted1.BranchIds);
        Assert.Equal(1, fence.LastAcceptedVersion);

        Assert.True(fence.TryAccept(first with
        {
            AuthorityVersion = 2,
            Capabilities = ["purchase-requests.read", "z-capability"],
            BranchIds = ["B1", "B2"]
        }, out var accepted2));
        Assert.Equal(2, accepted2.AuthorityVersion);
        Assert.Equal(2, fence.LastAcceptedVersion);

        Assert.True(fence.TryAccept(first with { AuthorityVersion = 3 }, out _));
        Assert.Equal(3, fence.LastAcceptedVersion);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void Nonpositive_observation_versions_are_never_accepted(long version)
    {
        var fence = new PurchaseRequestSessionFence();
        Assert.False(fence.TryAccept(PurchaseFixtures.Identity(version), out _));
        Assert.Equal(0, fence.LastAcceptedVersion);
    }

    [Fact]
    public void Regression_is_compared_to_the_last_accepted_observation_not_the_first()
    {
        var fence = new PurchaseRequestSessionFence();
        Assert.True(fence.TryAccept(PurchaseFixtures.Identity(1), out _));
        Assert.True(fence.TryAccept(PurchaseFixtures.Identity(1), out _));
        Assert.True(fence.TryAccept(PurchaseFixtures.Identity(2), out _));
        Assert.False(fence.TryAccept(PurchaseFixtures.Identity(1), out _));
        Assert.Equal(2, fence.LastAcceptedVersion);
    }

    [Theory]
    [InlineData("principal")]
    [InlineData("tenant")]
    [InlineData("company")]
    [InlineData("credential")]
    [InlineData("capabilities")]
    [InlineData("branches")]
    public void Any_security_scope_change_is_rejected_even_with_a_higher_version(string change)
    {
        var fence = new PurchaseRequestSessionFence();
        var first = PurchaseFixtures.Identity(4) with
        {
            Capabilities = ["purchase-requests.read", "platform.status"],
            BranchIds = ["B2", "B1"]
        };
        Assert.True(fence.TryAccept(first, out _));
        var changed = change switch
        {
            "principal" => first with { AuthorityVersion = 5, PrincipalId = "other.actor" },
            "tenant" => first with { AuthorityVersion = 5, TenantId = "other.tenant" },
            "company" => first with { AuthorityVersion = 5, CompanyId = "other.company" },
            "credential" => first with { AuthorityVersion = 5, CredentialStamp = "changed" },
            "capabilities" => first with { AuthorityVersion = 5, Capabilities = ["platform.status"] },
            _ => first with { AuthorityVersion = 5, BranchIds = ["B2"] }
        };
        Assert.False(fence.TryAccept(changed, out _));
        Assert.Equal(4, fence.LastAcceptedVersion);
    }

    [Fact]
    public void Trackers_are_invocation_local_and_do_not_share_high_water_marks()
    {
        var first = new PurchaseRequestSessionFence();
        var second = new PurchaseRequestSessionFence();
        Assert.True(first.TryAccept(PurchaseFixtures.Identity(10), out _));
        Assert.True(second.TryAccept(PurchaseFixtures.Identity(2), out _));
        Assert.False(first.TryAccept(PurchaseFixtures.Identity(9), out _));
        Assert.True(second.TryAccept(PurchaseFixtures.Identity(3), out _));
        Assert.Equal(10, first.LastAcceptedVersion);
        Assert.Equal(3, second.LastAcceptedVersion);
    }
}
