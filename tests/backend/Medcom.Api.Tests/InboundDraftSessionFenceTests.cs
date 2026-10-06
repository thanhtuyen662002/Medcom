using Medcom.Application;
using Medcom.Infrastructure.Inbound;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class InboundDraftSessionFenceTests
{
    [Fact]
    public void Positive_nondecreasing_actual_versions_preserve_the_full_canonical_scope()
    {
        var fence = new InboundDraftSessionFence();
        var identity = Identity(1) with
        {
            Capabilities = ["platform.status", "inbound-requests.read", "platform.status"],
            BranchIds = ["BR-B", "BR-A", "BR-B"]
        };
        Assert.True(fence.TryAccept(identity, out var first));
        Assert.Equal(new[] { "inbound-requests.read", "platform.status" }, first.Capabilities);
        Assert.Equal(new[] { "BR-A", "BR-B" }, first.BranchIds);
        Assert.Equal(1, first.AuthorityVersion);
        Assert.True(fence.TryAccept(identity with { AuthorityVersion = 1 }, out var equal));
        Assert.Equal(1, equal.AuthorityVersion);
        Assert.True(fence.TryAccept(identity with { AuthorityVersion = 7 }, out var later));
        Assert.Equal(7, later.AuthorityVersion);
        Assert.Equal(7, fence.LastAcceptedVersion);
        Assert.True(fence.TryAccept(identity with
        {
            AuthorityVersion = 8,
            Capabilities = ["inbound-requests.read", "platform.status"],
            BranchIds = ["BR-A", "BR-B"]
        }, out var canonical));
        Assert.Equal(8, canonical.AuthorityVersion);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void Nonpositive_versions_are_rejected_without_seeding_the_fence(long version)
    {
        var fence = new InboundDraftSessionFence();
        Assert.False(fence.TryAccept(Identity(version), out _));
        Assert.Equal(0, fence.LastAcceptedVersion);
        Assert.True(fence.TryAccept(Identity(1), out _));
    }

    [Fact]
    public void Regression_is_compared_to_the_last_accepted_observation_not_the_anchor()
    {
        var fence = new InboundDraftSessionFence();
        Assert.True(fence.TryAccept(Identity(2), out _));
        Assert.True(fence.TryAccept(Identity(9), out _));
        Assert.False(fence.TryAccept(Identity(8), out _));
        Assert.False(fence.TryAccept(Identity(2), out _));
        Assert.Equal(9, fence.LastAcceptedVersion);
        Assert.True(fence.TryAccept(Identity(10), out var accepted));
        Assert.Equal(10, accepted.AuthorityVersion);
    }

    [Theory]
    [InlineData("principal")]
    [InlineData("tenant")]
    [InlineData("company")]
    [InlineData("credential")]
    [InlineData("capability-remove")]
    [InlineData("capability-add")]
    [InlineData("branch-remove")]
    [InlineData("branch-add")]
    [InlineData("branch-case")]
    public void Increasing_version_cannot_change_any_part_of_the_frozen_security_scope(string change)
    {
        var fence = new InboundDraftSessionFence();
        var initial = Identity(4);
        Assert.True(fence.TryAccept(initial, out _));
        var changed = change switch
        {
            "principal" => initial with { PrincipalId = "another-user" },
            "tenant" => initial with { TenantId = "another-tenant" },
            "company" => initial with { CompanyId = "another-company" },
            "credential" => initial with { CredentialStamp = "changed-stamp" },
            "capability-remove" => initial with { Capabilities = ["platform.status"] },
            "capability-add" => initial with { Capabilities = [.. initial.Capabilities, "extra"] },
            "branch-remove" => initial with { BranchIds = ["BR-A"] },
            "branch-add" => initial with { BranchIds = ["BR-A", "BR-B", "BR-C"] },
            _ => initial with { BranchIds = ["br-a", "BR-B"] }
        };
        Assert.False(fence.TryAccept(changed with { AuthorityVersion = 5 }, out _));
        Assert.Equal(4, fence.LastAcceptedVersion);
        Assert.True(fence.TryAccept(initial with { AuthorityVersion = 6 }, out _));
    }

    [Theory]
    [InlineData("null")]
    [InlineData("principal")]
    [InlineData("tenant")]
    [InlineData("company")]
    [InlineData("stamp")]
    [InlineData("capabilities-null")]
    [InlineData("capability-empty")]
    [InlineData("capability-control")]
    [InlineData("capabilities-overflow")]
    [InlineData("branches-null")]
    [InlineData("branch-empty")]
    [InlineData("branch-control")]
    [InlineData("branches-overflow")]
    public void Malformed_identity_is_rejected_without_an_accepted_observation(string fault)
    {
        var original = Identity();
        var invalid = fault switch
        {
            "null" => null,
            "principal" => original with { PrincipalId = "\u00e9-user" },
            "tenant" => original with { TenantId = "bad\ntenant" },
            "company" => original with { CompanyId = "" },
            "stamp" => original with { CredentialStamp = " " },
            "capabilities-null" => original with { Capabilities = null! },
            "capability-empty" => original with { Capabilities = [""] },
            "capability-control" => original with { Capabilities = ["read\n"] },
            "capabilities-overflow" => original with { Capabilities = Enumerable.Repeat("read", 257).ToArray() },
            "branches-null" => original with { BranchIds = null },
            "branch-empty" => original with { BranchIds = [" "] },
            "branch-control" => original with { BranchIds = ["BR-A\n"] },
            _ => original with { BranchIds = Enumerable.Repeat("BR-A", 201).ToArray() }
        };
        var fence = new InboundDraftSessionFence();
        Assert.False(fence.TryAccept(invalid, out _));
        Assert.Equal(0, fence.LastAcceptedVersion);
    }

    [Fact]
    public void Caller_owned_collections_cannot_rewrite_the_first_accepted_scope()
    {
        var capabilities = new List<string> { "inbound-requests.read", "platform.status" };
        var branches = new List<string> { "BR-A", "BR-B" };
        var fence = new InboundDraftSessionFence();
        Assert.True(fence.TryAccept(Identity() with { Capabilities = capabilities, BranchIds = branches }, out var frozen));
        capabilities.Clear(); branches[0] = "BR-C";
        Assert.Equal(new[] { "inbound-requests.read", "platform.status" }, frozen.Capabilities);
        Assert.Equal(new[] { "BR-A", "BR-B" }, frozen.BranchIds);
        Assert.True(fence.TryAccept(Identity(2), out _));
        Assert.False(fence.TryAccept(Identity(3) with { Capabilities = capabilities, BranchIds = branches }, out _));
        Assert.Equal(2, fence.LastAcceptedVersion);
    }

    [Fact]
    public void Different_invocations_have_independent_high_water_marks()
    {
        var first = new InboundDraftSessionFence();
        var second = new InboundDraftSessionFence();
        Assert.True(first.TryAccept(Identity(10), out _));
        Assert.True(second.TryAccept(Identity(2), out _));
        Assert.False(first.TryAccept(Identity(9), out _));
        Assert.True(second.TryAccept(Identity(3), out _));
        Assert.Equal(10, first.LastAcceptedVersion);
        Assert.Equal(3, second.LastAcceptedVersion);
    }

    private static AuthoritativeIdentity Identity(long version = 1) => InboundModel.Identity with
    {
        AuthorityVersion = version,
        Capabilities = ["inbound-requests.read", "platform.status"],
        BranchIds = ["BR-A", "BR-B"]
    };
}
