using System.Collections;
using Medcom.Application;
using Medcom.Application.Transfers;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class PmReturnReplayPolicyTests
{
    [Fact]
    public void Replay_after_commit_and_revalidation_preserves_original_receipt_without_new_admission()
    {
        var stored = I07Fixtures.Record();
        var after = I06Fixtures.State(I06Fixtures.Head with { Status = 30 });
        var current = I06Fixtures.Identity(99);
        Assert.Equal(TransferValidationCodes.StatusChanged, I06Fixtures.Result(current, state: after).RejectionCode);
        var result = PmReturnReplayPolicy.Evaluate(I07Fixtures.Intent(), I07Fixtures.Authority(current, after),
            I07Fixtures.Observation(stored));
        Assert.Equal(PmReturnReplayDisposition.ReplayOriginalReceipt, result.Disposition);
        Assert.Same(stored.CommittedReceipt!.OriginalReceipt, result.OriginalReceipt);
        Assert.Equal(stored.OriginalExecutionFingerprint, result.OriginalReceipt!.CommandFingerprint);
        Assert.NotEqual(I06Fixtures.Prepare(identity: current).Command.CorrelationFingerprint,
            result.OriginalReceipt.CommandFingerprint);
        Assert.False(result.PermitsDispatch);
    }

    [Fact]
    public void Result_visibility_does_not_require_old_assignment_lock_status_or_state_token()
    {
        var current = I06Fixtures.State(I06Fixtures.Head with
            { Status = 99, AssignedPm = "later.pm", IsLocked = true, UpdatedAt = new DateTime(2026, 10, 9) });
        var result = PmReturnReplayPolicy.Evaluate(I07Fixtures.Intent(), I07Fixtures.Authority(state: current),
            I07Fixtures.Observation());
        Assert.Equal(PmReturnReplayDisposition.ReplayOriginalReceipt, result.Disposition);
        Assert.Equal(30, result.OriginalReceipt!.ObservedPostStatus); // Original effect, not current status.
        Assert.False(I06Fixtures.Result(state: current).Accepted);
    }

    [Fact]
    public void Explicit_absence_requires_fresh_admission_but_grants_no_dispatch_or_success()
    {
        var result = PmReturnReplayPolicy.Evaluate(I07Fixtures.Intent(), I07Fixtures.Authority(),
            new(TransferSnapshotOrigin.DatabaseAuthority, I07Fixtures.Key, PmReturnJournalState.Absent));
        Assert.Equal(PmReturnReplayDisposition.NeedsFreshAdmission, result.Disposition);
        Assert.Null(result.OriginalReceipt);
        Assert.False(result.PermitsDispatch);
        Assert.Equal(TransferValidationCodes.StatusChanged, I06Fixtures.Result(state:
            I06Fixtures.State(I06Fixtures.Head with { Status = 30 })).RejectionCode);
    }

    [Theory]
    [InlineData(PmReturnJournalState.InProgress)]
    [InlineData(PmReturnJournalState.OutcomeUnknown)]
    [InlineData(PmReturnJournalState.Tombstone)]
    [InlineData(PmReturnJournalState.Unavailable)]
    public void Unresolved_or_retained_keys_never_become_absence_replay_or_dispatch(PmReturnJournalState state)
    {
        foreach (var row in new[] { null, I07Fixtures.Record() })
        {
            var result = PmReturnReplayPolicy.Evaluate(I07Fixtures.Intent(), I07Fixtures.Authority(),
                new(TransferSnapshotOrigin.DatabaseAuthority, I07Fixtures.Key, state, row));
            Assert.Equal(PmReturnReplayDisposition.Blocked, result.Disposition);
            Assert.Null(result.OriginalReceipt);
            Assert.False(result.PermitsDispatch);
        }
    }

    [Theory]
    [InlineData("null")]
    [InlineData("client")]
    [InlineData("bad-origin")]
    [InlineData("bad-state")]
    [InlineData("negative-state")]
    [InlineData("absent-with-row")]
    [InlineData("committed-without-row")]
    [InlineData("committed-without-receipt")]
    public void Missing_or_contradictory_observations_are_invalid_not_absent(string change)
    {
        var observed = I07Fixtures.Observation();
        observed = change switch
        {
            "null" => null,
            "client" => observed with { Origin = TransferSnapshotOrigin.ClientClaim },
            "bad-origin" => observed with { Origin = (TransferSnapshotOrigin)99 },
            "bad-state" => observed with { State = (PmReturnJournalState)99 },
            "negative-state" => observed with { State = (PmReturnJournalState)(-1) },
            "absent-with-row" => observed with { State = PmReturnJournalState.Absent },
            "committed-without-row" => observed with { Record = null },
            _ => observed with { Record = observed.Record! with { CommittedReceipt = null } }
        };
        var result = PmReturnReplayPolicy.Evaluate(I07Fixtures.Intent(), I07Fixtures.Authority(), observed);
        Assert.Equal(PmReturnReplayDisposition.InvalidObservation, result.Disposition);
        Assert.Null(result.OriginalReceipt);
        Assert.False(result.PermitsDispatch);
    }

    [Theory]
    [InlineData("account")]
    [InlineData("credential")]
    [InlineData("menu")]
    [InlineData("run")]
    [InlineData("update")]
    [InlineData("menu-id")]
    [InlineData("form-id")]
    [InlineData("origin")]
    [InlineData("current-branch")]
    [InlineData("session-branch")]
    [InlineData("stamp")]
    [InlineData("invalid-current-version")]
    public void Current_authority_denial_hides_all_observation_states_and_receipts(string change)
    {
        var identity = I06Fixtures.Identity(99);
        var evidence = I06Fixtures.Evidence;
        switch (change)
        {
            case "account": evidence = evidence with { AccountEnabled = false }; break;
            case "credential": evidence = evidence with { CredentialMatches = false }; break;
            case "menu": evidence = evidence with { MenuEnabled = false }; break;
            case "run": evidence = evidence with { RunGranted = false }; break;
            case "update": evidence = evidence with { UpdateGranted = false }; break;
            case "menu-id": evidence = evidence with { MenuId = "other-menu" }; break;
            case "form-id": evidence = evidence with { FormId = "other-form" }; break;
            case "origin": evidence = evidence with { Origin = TransferSnapshotOrigin.ClientClaim }; break;
            case "current-branch": evidence = evidence with { CurrentBranchIds = ["B", "FROM"] }; break;
            case "session-branch": identity = identity with { BranchIds = ["B", "FROM"] }; break;
            case "stamp": identity = identity with { CredentialStamp = null }; break;
            default: identity = identity with { AuthorityVersion = 0 }; break;
        }
        var current = I07Fixtures.Authority(identity, evidence: evidence);
        foreach (var state in Enum.GetValues<PmReturnJournalState>())
        {
            var result = PmReturnReplayPolicy.Evaluate(I07Fixtures.Intent(), current,
                new(TransferSnapshotOrigin.DatabaseAuthority, I07Fixtures.Key, state, I07Fixtures.Record()));
            Assert.Equal(PmReturnReplayDisposition.Denied, result.Disposition);
            Assert.Null(result.OriginalReceipt);
            Assert.False(result.PermitsDispatch);
        }
        Assert.Equal(PmReturnReplayDisposition.Denied,
            PmReturnReplayPolicy.Evaluate(I07Fixtures.Intent(), current, null).Disposition);
    }

    [Theory]
    [InlineData("binding")]
    [InlineData("tenant")]
    [InlineData("company")]
    [InlineData("actor")]
    [InlineData("actor-case")]
    [InlineData("document")]
    public void Authority_for_a_different_binding_scope_actor_or_document_cannot_disclose(string field)
    {
        var key = I07Fixtures.Key;
        var request = I06Fixtures.Request;
        key = field switch
        {
            "binding" => key with { DatabaseBindingId = I07Fixtures.OtherBinding },
            "tenant" => key with { TenantId = "other-tenant" },
            "company" => key with { CompanyId = "other-company" },
            "actor" => key with { Actor = "other.pm" },
            "actor-case" => key with { Actor = "PM.ONE" },
            _ => key
        };
        if (field == "document") request = request with { DocumentKey = "REQ-2" };
        var result = PmReturnReplayPolicy.Evaluate(I07Fixtures.Intent(key, request), I07Fixtures.Authority(),
            I07Fixtures.Observation());
        Assert.Equal(PmReturnReplayDisposition.Denied, result.Disposition);
        Assert.Null(result.OriginalReceipt);
    }

    [Theory]
    [InlineData("binding")]
    [InlineData("tenant")]
    [InlineData("company")]
    [InlineData("actor")]
    [InlineData("action")]
    [InlineData("idempotency")]
    public void Lookup_key_and_each_committed_envelope_key_must_match_exactly(string field)
    {
        var altered = field switch
        {
            "binding" => I07Fixtures.Key with { DatabaseBindingId = I07Fixtures.OtherBinding },
            "tenant" => I07Fixtures.Key with { TenantId = "other" },
            "company" => I07Fixtures.Key with { CompanyId = "other" },
            "actor" => I07Fixtures.Key with { Actor = "other.pm" },
            "action" => I07Fixtures.Key with { ActionId = "other-action" },
            _ => I07Fixtures.Key with { IdempotencyKey = "other-key-0123456789" }
        };
        var row = I07Fixtures.Record();
        var observations = new[] {
            I07Fixtures.Observation() with { Key = altered },
            I07Fixtures.Observation(row with { Key = altered }),
            I07Fixtures.Observation(row with { CommittedReceipt = row.CommittedReceipt! with { Key = altered } })
        };
        foreach (var observation in observations)
        {
            var result = PmReturnReplayPolicy.Evaluate(I07Fixtures.Intent(), I07Fixtures.Authority(), observation);
            Assert.Equal(PmReturnReplayDisposition.InvalidObservation, result.Disposition);
            Assert.Null(result.OriginalReceipt);
            Assert.False(result.PermitsDispatch);
        }
    }

    [Theory]
    [InlineData("document")]
    [InlineData("submission")]
    [InlineData("source")]
    [InlineData("execution")]
    [InlineData("audit")]
    [InlineData("receipt-action")]
    [InlineData("receipt-document")]
    [InlineData("receipt-idempotency")]
    [InlineData("receipt-execution")]
    [InlineData("receipt-audit")]
    [InlineData("receipt-status")]
    [InlineData("receipt-null-status")]
    [InlineData("receipt-outcome")]
    [InlineData("receipt-bad-outcome")]
    [InlineData("receipt-rejection")]
    [InlineData("receipt-null")]
    public void Any_broken_receipt_correlation_or_effect_prevents_replay(string field)
    {
        var row = I07Fixtures.Record();
        var envelope = row.CommittedReceipt!;
        var receipt = envelope.OriginalReceipt;
        envelope = field switch
        {
            "document" => envelope with { DocumentKey = "REQ-2" },
            "submission" => envelope with { SubmissionIdentity = I07Fixtures.OtherSubmission },
            "source" => envelope with { SourceProcedureSha256 = I07Fixtures.OtherDigest },
            "execution" => envelope with { OriginalExecutionFingerprint = I07Fixtures.OtherDigest },
            "audit" => envelope with { AuditId = "other-audit" },
            "receipt-action" => envelope with { OriginalReceipt = receipt with { ActionId = "other" } },
            "receipt-document" => envelope with { OriginalReceipt = receipt with { DocumentKey = "REQ-2" } },
            "receipt-idempotency" => envelope with { OriginalReceipt = receipt with { IdempotencyKey = "other-key-0123456789" } },
            "receipt-execution" => envelope with { OriginalReceipt = receipt with { CommandFingerprint = I07Fixtures.OtherDigest } },
            "receipt-audit" => envelope with { OriginalReceipt = receipt with { DurableAuditId = "other-audit" } },
            "receipt-status" => envelope with { OriginalReceipt = receipt with { ObservedPostStatus = 10 } },
            "receipt-null-status" => envelope with { OriginalReceipt = receipt with { ObservedPostStatus = null } },
            "receipt-outcome" => envelope with { OriginalReceipt = receipt with { Outcome = TransferGatewayOutcome.Rejected } },
            "receipt-bad-outcome" => envelope with { OriginalReceipt = receipt with { Outcome = (TransferGatewayOutcome)99 } },
            "receipt-rejection" => envelope with { OriginalReceipt = receipt with { RejectionCode = "rejected" } },
            _ => envelope with { OriginalReceipt = null! }
        };
        var result = PmReturnReplayPolicy.Evaluate(I07Fixtures.Intent(), I07Fixtures.Authority(),
            I07Fixtures.Observation(row with { CommittedReceipt = envelope }));
        Assert.Equal(PmReturnReplayDisposition.InvalidObservation, result.Disposition);
        Assert.Null(result.OriginalReceipt);
    }

    [Theory]
    [InlineData("document")]
    [InlineData("reason")]
    [InlineData("policy")]
    public void Same_lookup_key_with_different_valid_intent_or_policy_conflicts(string field)
    {
        var request = field == "reason" ? I06Fixtures.Request with { Payload = new ReturnByPmPayload("Other reason") }
            : I06Fixtures.Request;
        var row = I07Fixtures.Record();
        if (field == "document") row = I07Fixtures.Rebind(row, document: "REQ-2");
        if (field == "policy") row = I07Fixtures.Rebind(row, source: I07Fixtures.OtherDigest);
        var result = PmReturnReplayPolicy.Evaluate(I07Fixtures.Intent(request: request), I07Fixtures.Authority(),
            I07Fixtures.Observation(row));
        Assert.Equal(PmReturnReplayDisposition.Conflict, result.Disposition);
        Assert.Null(result.OriginalReceipt);
        Assert.False(result.PermitsDispatch);
    }

    [Theory]
    [InlineData("audit-empty")]
    [InlineData("audit-long")]
    [InlineData("audit-control")]
    [InlineData("audit-unicode")]
    [InlineData("execution-long")]
    [InlineData("execution-uppercase")]
    [InlineData("source-nonhex")]
    [InlineData("submission-prefix")]
    [InlineData("submission-short")]
    [InlineData("document-long")]
    [InlineData("null-key")]
    public void Malformed_journal_metadata_is_not_commit_proof(string field)
    {
        var row = I07Fixtures.Record();
        row = field switch
        {
            "audit-empty" => I07Fixtures.Rebind(row, audit: ""),
            "audit-long" => I07Fixtures.Rebind(row, audit: new string('a', 101)),
            "audit-control" => I07Fixtures.Rebind(row, audit: "a\0b"),
            "audit-unicode" => I07Fixtures.Rebind(row, audit: "\u0111"),
            "execution-long" => I07Fixtures.Rebind(row, execution: new string('a', 65)),
            "execution-uppercase" => I07Fixtures.Rebind(row, execution: new string('A', 64)),
            "source-nonhex" => I07Fixtures.Rebind(row, source: new string('z', 64)),
            "submission-prefix" => I07Fixtures.Rebind(row, submission: "v1:" + I07Fixtures.OtherDigest),
            "submission-short" => I07Fixtures.Rebind(row, submission: "pmr-submission-v1:" + new string('a', 63)),
            "document-long" => I07Fixtures.Rebind(row, document: new string('r', 31)),
            _ => row with { Key = null! }
        };
        Assert.Equal(PmReturnReplayDisposition.InvalidObservation, PmReturnReplayPolicy.Evaluate(
            I07Fixtures.Intent(), I07Fixtures.Authority(), I07Fixtures.Observation(row)).Disposition);
    }

    [Fact]
    public void Captured_branch_authority_is_bounded_and_cannot_be_changed_by_caller_mutation()
    {
        var session = new List<string> { "B", "FROM" };
        var current = new List<string> { "B", "FROM" };
        var captured = I07Fixtures.Authority(I06Fixtures.Identity() with { BranchIds = session },
            evidence: I06Fixtures.Evidence with { CurrentBranchIds = current });
        session.Add("TO"); current.Add("TO");
        Assert.Equal(PmReturnReplayDisposition.Denied, PmReturnReplayPolicy.Evaluate(
            I07Fixtures.Intent(), captured, I07Fixtures.Observation()).Disposition);
        var exposed = Assert.IsAssignableFrom<IList<string>>(captured.CurrentBranchIds);
        Assert.True(exposed.IsReadOnly);
        Assert.Throws<NotSupportedException>(() => exposed.Add("TO"));
        var all = new List<string> { "B", "FROM", "TO" };
        var granted = I07Fixtures.Authority(I06Fixtures.Identity() with { BranchIds = all },
            evidence: I06Fixtures.Evidence with { CurrentBranchIds = all });
        all.Clear();
        Assert.Equal(PmReturnReplayDisposition.ReplayOriginalReceipt, PmReturnReplayPolicy.Evaluate(
            I07Fixtures.Intent(), granted, I07Fixtures.Observation()).Disposition);
        Assert.False(PmReturnReplayAuthority.TryCapture(I07Fixtures.Binding, I06Fixtures.Identity(), I06Fixtures.State(),
            I06Fixtures.Evidence with { CurrentBranchIds = Enumerable.Repeat("B", 201).ToArray() }, out _));
        Assert.False(PmReturnReplayAuthority.TryCapture(I07Fixtures.Binding, I06Fixtures.Identity(), I06Fixtures.State(),
            I06Fixtures.Evidence with { CurrentBranchIds = new ThrowingBranches() }, out _));
    }

    [Fact]
    public void Record_with_copies_do_not_mutate_a_selected_original_receipt()
    {
        var row = I07Fixtures.Record();
        var result = PmReturnReplayPolicy.Evaluate(I07Fixtures.Intent(), I07Fixtures.Authority(), I07Fixtures.Observation(row));
        var changed = row with { CommittedReceipt = row.CommittedReceipt! with
            { OriginalReceipt = row.CommittedReceipt!.OriginalReceipt with { DurableAuditId = "changed" } } };
        Assert.NotEqual(changed.CommittedReceipt!.OriginalReceipt, result.OriginalReceipt);
        Assert.Equal(row.AuditId, result.OriginalReceipt!.DurableAuditId);
        Assert.Same(row.CommittedReceipt!.OriginalReceipt, result.OriginalReceipt);
        Assert.Empty(typeof(PmReturnReplayDecision).GetConstructors());
        Assert.Empty(typeof(PmReturnSubmittedIntent).GetConstructors());
        Assert.Empty(typeof(PmReturnReplayAuthority).GetConstructors());
    }

    [Fact]
    public void Submitted_input_is_lossless_bound_to_configured_guid_and_does_not_keep_secrets_or_reason()
    {
        var intent = I07Fixtures.Intent();
        Assert.Equal(typeof(Guid), typeof(PmReturnJournalKey).GetProperty(nameof(PmReturnJournalKey.DatabaseBindingId))!.PropertyType);
        Assert.Equal(TransferSubmissionIdentity.ForPmReturn("tenant", "company", "pm.one", "REQ-1",
            I06Fixtures.Request.IdempotencyKey, new(I06Fixtures.Reason)), intent.SubmissionIdentity);
        foreach (var key in new[] { I07Fixtures.Key with { DatabaseBindingId = Guid.Empty },
            I07Fixtures.Key with { Actor = new string('p', 51) }, I07Fixtures.Key with { Actor = " pm.one" },
            I07Fixtures.Key with { Actor = "pm.\u0111" }, I07Fixtures.Key with { TenantId = " tenant" },
            I07Fixtures.Key with { CompanyId = "" }, I07Fixtures.Key with { ActionId = "other" },
            I07Fixtures.Key with { IdempotencyKey = new string('x', 15) },
            I07Fixtures.Key with { IdempotencyKey = new string('x', 101) } })
            Assert.False(PmReturnSubmittedIntent.TryCreate(key, I06Fixtures.Request, out _));
        Assert.False(PmReturnSubmittedIntent.TryCreate(I07Fixtures.Key, I06Fixtures.Request with
            { Payload = new ReturnByPmPayload(" reason") }, out _));
        Assert.False(PmReturnSubmittedIntent.TryCreate(I07Fixtures.Key, I06Fixtures.Request with
            { IdempotencyKey = "different-key-0123456789" }, out _));
        Assert.DoesNotContain(typeof(PmReturnSubmittedIntent).GetProperties(), p => p.Name is "Reason" or "CredentialStamp" or "ConnectionString");
        Assert.DoesNotContain(typeof(PmReturnReplayAuthority).GetProperties(), p => p.Name is "CredentialStamp" or "AuthorityVersion" or "Status" or "StateEqualityToken");
    }

    [Fact]
    public void Null_or_unbound_authority_capture_is_never_authorization()
    {
        Assert.False(PmReturnSubmittedIntent.TryCreate(null, I06Fixtures.Request, out _));
        Assert.False(PmReturnSubmittedIntent.TryCreate(I07Fixtures.Key, null, out _));
        Assert.Equal(PmReturnReplayDisposition.InvalidInput, PmReturnReplayPolicy.Evaluate(null, null, null).Disposition);
        Assert.Equal(PmReturnReplayDisposition.Denied, PmReturnReplayPolicy.Evaluate(I07Fixtures.Intent(), null, I07Fixtures.Observation()).Disposition);
        Assert.False(PmReturnReplayAuthority.TryCapture(Guid.Empty, I06Fixtures.Identity(), I06Fixtures.State(), I06Fixtures.Evidence, out _));
        Assert.False(PmReturnReplayAuthority.TryCapture(I07Fixtures.Binding, null, I06Fixtures.State(), I06Fixtures.Evidence, out _));
        Assert.False(PmReturnReplayAuthority.TryCapture(I07Fixtures.Binding, I06Fixtures.Identity(), null, I06Fixtures.Evidence, out _));
        Assert.False(PmReturnReplayAuthority.TryCapture(I07Fixtures.Binding, I06Fixtures.Identity(), I06Fixtures.State(), null, out _));
        Assert.False(PmReturnReplayAuthority.TryCapture(I07Fixtures.Binding, I06Fixtures.Identity() with { TenantId = "other" }, I06Fixtures.State(), I06Fixtures.Evidence, out _));
        Assert.False(PmReturnReplayAuthority.TryCapture(I07Fixtures.Binding, I06Fixtures.Identity(), I06Fixtures.State(), I06Fixtures.Evidence with { DocumentKey = "REQ-2" }, out _));
    }

    private sealed class ThrowingBranches : IReadOnlyList<string>
    {
        public int Count => throw new InvalidOperationException("Synthetic unstable scope");
        public string this[int index] => throw new InvalidOperationException("Synthetic unstable scope");
        public IEnumerator<string> GetEnumerator() => throw new InvalidOperationException("Synthetic unstable scope");
        IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
    }
}

internal static class I07Fixtures
{
    internal static Guid Binding => Guid.Parse("11111111-2222-4333-8444-555555555555");
    internal static Guid OtherBinding => Guid.Parse("66666666-7777-4888-8999-aaaaaaaaaaaa");
    internal static string OtherDigest => new('a', 64);
    internal static string OtherSubmission => "pmr-submission-v1:" + OtherDigest;
    internal static PmReturnJournalKey Key => new(Binding, "tenant", "company", "pm.one",
        PmReturnPreparation.ActionId, I06Fixtures.Request.IdempotencyKey);
    internal static PmReturnSubmittedIntent Intent(PmReturnJournalKey? key = null, TransferCommandRequest? request = null)
    {
        Assert.True(PmReturnSubmittedIntent.TryCreate(key ?? Key, request ?? I06Fixtures.Request, out var intent));
        return Assert.IsType<PmReturnSubmittedIntent>(intent);
    }
    internal static PmReturnReplayAuthority Authority(AuthoritativeIdentity? identity = null,
        TransferStateSnapshot? state = null, PmReturnAuthorityEvidence? evidence = null)
    {
        Assert.True(PmReturnReplayAuthority.TryCapture(Binding, identity ?? I06Fixtures.Identity(99),
            state ?? I06Fixtures.State(I06Fixtures.Head with { Status = 30 }), evidence ?? I06Fixtures.Evidence, out var authority));
        return Assert.IsType<PmReturnReplayAuthority>(authority);
    }
    internal static PmReturnJournalRecord Record()
    {
        var original = I06Fixtures.Prepare();
        var receipt = new TransferGatewayReceipt(TransferGatewayOutcome.Committed, Key.ActionId, "REQ-1",
            Key.IdempotencyKey, original.Command.CorrelationFingerprint, 30, "synthetic-audit-001");
        var envelope = new PmReturnJournalReceipt(Key, "REQ-1", original.SubmissionIdentity,
            original.Command.Action.ProcedureSha256, receipt.CommandFingerprint, receipt.DurableAuditId!, receipt);
        return new(Key, envelope.DocumentKey, envelope.SubmissionIdentity, envelope.SourceProcedureSha256,
            envelope.OriginalExecutionFingerprint, envelope.AuditId, envelope);
    }
    internal static PmReturnJournalObservation Observation(PmReturnJournalRecord? row = null) =>
        new(TransferSnapshotOrigin.DatabaseAuthority, Key, PmReturnJournalState.Committed, row ?? Record());
    internal static PmReturnJournalRecord Rebind(PmReturnJournalRecord row, string? document = null,
        string? submission = null, string? source = null, string? execution = null, string? audit = null)
    {
        var envelope = row.CommittedReceipt!;
        var receipt = envelope.OriginalReceipt with { DocumentKey = document ?? row.DocumentKey,
            CommandFingerprint = execution ?? row.OriginalExecutionFingerprint, DurableAuditId = audit ?? row.AuditId };
        envelope = envelope with { DocumentKey = receipt.DocumentKey, SubmissionIdentity = submission ?? row.SubmissionIdentity,
            SourceProcedureSha256 = source ?? row.SourceProcedureSha256, OriginalExecutionFingerprint = receipt.CommandFingerprint,
            AuditId = receipt.DurableAuditId!, OriginalReceipt = receipt };
        return row with { DocumentKey = envelope.DocumentKey, SubmissionIdentity = envelope.SubmissionIdentity,
            SourceProcedureSha256 = envelope.SourceProcedureSha256, OriginalExecutionFingerprint = envelope.OriginalExecutionFingerprint,
            AuditId = envelope.AuditId, CommittedReceipt = envelope };
    }
}
