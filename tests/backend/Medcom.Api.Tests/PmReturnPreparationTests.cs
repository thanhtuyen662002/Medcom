using Medcom.Application;
using Medcom.Application.Transfers;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class PmReturnPreparationTests
{
    [Fact]
    public void Source_bound_return_preserves_reason_and_separates_intent_from_execution()
    {
        var first = I06Fixtures.Prepare();
        var second = I06Fixtures.Prepare(identity: I06Fixtures.Identity(99),
            state: I06Fixtures.State(I06Fixtures.Head with { UpdatedAt = new DateTime(2026, 10, 6) }));
        Assert.Equal(first.SubmissionIdentity, second.SubmissionIdentity);
        Assert.NotEqual(first.Command.CorrelationFingerprint, second.Command.CorrelationFingerprint);
        Assert.Equal(I06Fixtures.Reason, Assert.IsType<ReturnByPmPayload>(first.Command.Payload).Reason);
        Assert.Equal(first.State.StateEqualityToken, first.Command.ExpectedRowVersion);
        Assert.Equal(10, first.Command.ExpectedStatus);
        Assert.Contains(30, first.Command.Action.Effect.AllowedPostStatuses);
    }

    [Theory]
    [InlineData("account")]
    [InlineData("credential")]
    [InlineData("menu")]
    [InlineData("run")]
    [InlineData("update")]
    [InlineData("menu-id")]
    [InlineData("form")]
    [InlineData("current-branch")]
    public void Missing_current_authority_fails_closed(string missing)
    {
        var evidence = I06Fixtures.Evidence;
        evidence = missing switch
        {
            "account" => evidence with { AccountEnabled = false },
            "credential" => evidence with { CredentialMatches = false },
            "menu" => evidence with { MenuEnabled = false },
            "run" => evidence with { RunGranted = false },
            "update" => evidence with { UpdateGranted = false },
            "menu-id" => evidence with { MenuId = "another-menu" },
            "form" => evidence with { FormId = "another-form" },
            _ => evidence with { CurrentBranchIds = ["B", "FROM"] }
        };
        Assert.Equal(TransferValidationCodes.ScopeDenied, I06Fixtures.Result(evidence: evidence).RejectionCode);
    }

    [Theory]
    [InlineData("tenant")]
    [InlineData("company")]
    [InlineData("request-document")]
    [InlineData("evidence-document")]
    [InlineData("client-origin")]
    [InlineData("credential-stamp")]
    public void Cross_binding_and_client_authority_are_rejected(string changed)
    {
        var identity = I06Fixtures.Identity();
        var request = I06Fixtures.Request;
        var evidence = I06Fixtures.Evidence;
        switch (changed)
        {
            case "tenant": identity = identity with { TenantId = "other" }; break;
            case "company": identity = identity with { CompanyId = "other" }; break;
            case "request-document": request = request with { DocumentKey = "REQ-2" }; break;
            case "evidence-document": evidence = evidence with { DocumentKey = "REQ-2" }; break;
            case "client-origin": evidence = evidence with { Origin = TransferSnapshotOrigin.ClientClaim }; break;
            default: identity = identity with { CredentialStamp = null }; break;
        }
        Assert.Equal(TransferValidationCodes.UntrustedSnapshot,
            I06Fixtures.Result(identity, request, evidence: evidence).RejectionCode);
    }

    [Theory]
    [InlineData("assignment")]
    [InlineData("unassigned")]
    [InlineData("locked")]
    [InlineData("frozen-branch")]
    public void No_assignment_lock_or_branch_fallback(string changed)
    {
        var head = I06Fixtures.Head;
        var identity = I06Fixtures.Identity();
        switch (changed)
        {
            case "assignment": head = head with { AssignedPm = "other.pm" }; break;
            case "unassigned": head = head with { AssignedPm = null }; break;
            case "locked": head = head with { IsLocked = true }; break;
            default: identity = identity with { BranchIds = ["B", "FROM"] }; break;
        }
        Assert.Equal(TransferValidationCodes.ScopeDenied,
            I06Fixtures.Result(identity: identity, state: I06Fixtures.State(head)).RejectionCode);
    }

    [Fact]
    public void Wrong_status_is_not_a_success_or_an_idempotency_receipt()
    {
        Assert.Equal(TransferValidationCodes.StatusChanged,
            I06Fixtures.Result(state: I06Fixtures.State(I06Fixtures.Head with { Status = 30 })).RejectionCode);
    }

    [Theory]
    [InlineData(50, true)]
    [InlineData(51, false)]
    [InlineData(100, false)]
    public void Actor_respects_actual_log_width_without_truncation(int length, bool accepted)
    {
        var actor = new string('p', length);
        var result = I06Fixtures.Result(identity: I06Fixtures.Identity() with { PrincipalId = actor },
            state: I06Fixtures.State(I06Fixtures.Head with { AssignedPm = actor }),
            evidence: I06Fixtures.Evidence with { Actor = actor });
        Assert.Equal(accepted, result.Accepted);
        if (accepted) Assert.Equal(actor, result.Prepared!.Command.Actor.Value);
        else Assert.Equal(TransferValidationCodes.InvalidActor, result.RejectionCode);
    }

    [Theory]
    [InlineData(" pm.one")]
    [InlineData("pm.one ")]
    [InlineData("pm.\u0111\u1ee9c")]
    public void Actor_is_not_trimmed_or_transcoded(string actor)
    {
        Assert.Equal(TransferValidationCodes.InvalidActor,
            I06Fixtures.Result(identity: I06Fixtures.Identity() with { PrincipalId = actor },
                evidence: I06Fixtures.Evidence with { Actor = actor }).RejectionCode);
    }

    [Theory]
    [InlineData("")]
    [InlineData("  ")]
    [InlineData("a\0b")]
    [InlineData(" reason")]
    [InlineData("reason ")]
    public void Invalid_reason_never_produces_a_command(string reason)
    {
        Assert.Equal(TransferValidationCodes.InvalidPayload,
            I06Fixtures.Result(request: I06Fixtures.Request with { Payload = new ReturnByPmPayload(reason) }).RejectionCode);
    }

    [Fact]
    public void Malformed_utf16_reason_is_rejected_without_test_transport_replacement()
    {
        foreach (var reason in new[] { new string('\ud800', 1), new string('\udc00', 1) })
            Assert.Equal(TransferValidationCodes.InvalidPayload, I06Fixtures.Result(request:
                I06Fixtures.Request with { Payload = new ReturnByPmPayload(reason) }).RejectionCode);
    }

    [Fact]
    public void Reason_length_and_other_action_are_bounded()
    {
        Assert.False(I06Fixtures.Result(request: I06Fixtures.Request with
            { Payload = new ReturnByPmPayload(new string('x', 1001)) }).Accepted);
        Assert.True(I06Fixtures.Result(request: I06Fixtures.Request with
            { Payload = new ReturnByPmPayload(new string('x', 1000)) }).Accepted);
        Assert.Equal(TransferValidationCodes.UnknownAction, I06Fixtures.Result(request:
            I06Fixtures.Request with { ActionId = "IV_InternalTransferPMFrm:ExecSQLWithParaButtonCtl" }).RejectionCode);
    }

    [Fact]
    public void Null_inputs_and_changed_actor_fail_closed()
    {
        Assert.False(PmReturnPreparation.Prepare(null, I06Fixtures.Request, I06Fixtures.State(), I06Fixtures.Evidence).Accepted);
        Assert.False(PmReturnPreparation.Prepare(I06Fixtures.Identity(), null, I06Fixtures.State(), I06Fixtures.Evidence).Accepted);
        Assert.False(PmReturnPreparation.Prepare(I06Fixtures.Identity(), I06Fixtures.Request, null, I06Fixtures.Evidence).Accepted);
        Assert.False(PmReturnPreparation.Prepare(I06Fixtures.Identity(), I06Fixtures.Request, I06Fixtures.State(), null).Accepted);
        Assert.Equal(TransferValidationCodes.InvalidActor,
            I06Fixtures.Result(evidence: I06Fixtures.Evidence with { Actor = "other" }).RejectionCode);
        Assert.Empty(typeof(PreparedPmReturn).GetConstructors());
    }

    [Fact]
    public void Stable_submission_changes_with_intent_or_scope_and_does_not_accept_long_keys()
    {
        var first = I06Fixtures.Prepare().SubmissionIdentity;
        Assert.NotEqual(first, I06Fixtures.Prepare(request: I06Fixtures.Request with
            { Payload = new ReturnByPmPayload("Different reason") }).SubmissionIdentity);
        Assert.NotEqual(first, TransferSubmissionIdentity.ForPmReturn("other", "company", "pm.one",
            "REQ-1", I06Fixtures.Request.IdempotencyKey, new(I06Fixtures.Reason)));
        Assert.NotEqual(first, I06Fixtures.Prepare(request: I06Fixtures.Request with
            { IdempotencyKey = "another-intent-0123456789" }).SubmissionIdentity);
        Assert.Throws<ArgumentException>(() => TransferSubmissionIdentity.ForPmReturn("tenant", "company",
            "pm.one", new string('r', 31), I06Fixtures.Request.IdempotencyKey, new(I06Fixtures.Reason)));
    }
}

internal static class I06Fixtures
{
    internal const string Reason = "Synthetic\nreturn reason";
    internal static TransferRequestHeadState Head => new("REQ-1", "B", "FROM", "TO", "sales.one",
        "pm.one", 10, false, new DateTime(2026, 10, 5));
    internal static TransferRequestDetailState[] Lines =>
        [new("D1", "REQ-1", "ITEM-1", 5m, 2m), new("D2", "REQ-1", "ITEM-2", 3.1250m, null)];
    internal static TransferCommandRequest Request => new(PmReturnPreparation.ActionId,
        "REQ-1", "synthetic-key-0123456789", new ReturnByPmPayload(Reason));
    internal static AuthoritativeIdentity Identity(long version = 1) => new("pm.one", "tenant", "company",
        "Synthetic Company", "Synthetic PM", version, ["platform.status"], "synthetic-stamp", ["B", "FROM", "TO"]);
    internal static PmReturnAuthorityEvidence Evidence => new(TransferSnapshotOrigin.DatabaseAuthority,
        "pm.one", "REQ-1", true, true, true, PmReturnPreparation.MenuId, PmReturnPreparation.FormId,
        true, true, ["B", "FROM", "TO"]);
    internal static TransferStateSnapshot State(TransferRequestHeadState? head = null,
        IEnumerable<TransferRequestDetailState>? lines = null)
    {
        Assert.True(TransferStateSnapshot.TryCreate("tenant", "company", head ?? Head, lines ?? Lines, out var state));
        return Assert.IsType<TransferStateSnapshot>(state);
    }
    internal static PmReturnPreparationResult Result(AuthoritativeIdentity? identity = null,
        TransferCommandRequest? request = null, TransferStateSnapshot? state = null,
        PmReturnAuthorityEvidence? evidence = null) => PmReturnPreparation.Prepare(
            identity ?? Identity(), request ?? Request, state ?? State(), evidence ?? Evidence);
    internal static PreparedPmReturn Prepare(AuthoritativeIdentity? identity = null,
        TransferCommandRequest? request = null, TransferStateSnapshot? state = null)
    {
        var result = Result(identity, request, state);
        Assert.True(result.Accepted, result.RejectionCode);
        return Assert.IsType<PreparedPmReturn>(result.Prepared);
    }
}
