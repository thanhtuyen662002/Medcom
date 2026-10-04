using Medcom.Application.Transfers;
using Medcom.Infrastructure.Transfers;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class TransferCommandTests
{
    private const string Send = "IV_InternalTransferRequestFrm:ExecSQLWithParaButtonCtl";
    private const string Confirm = "IV_InternalTransferPMFrm:ExecSQLWithParaButtonCtl";
    private const string Return = "IV_InternalTransferPMFrm:ExecSQLWithParaButtonCtl_1";

    [Fact]
    public void Catalog_preserves_all_verified_form_control_bindings()
    {
        Assert.Equal(17, TransferActionCatalog.All.Count);
        Assert.Equal(17, TransferActionCatalog.All.Select(action => action.Id).Distinct().Count());
        Assert.All(TransferActionCatalog.All, action =>
        {
            Assert.NotEmpty(action.MenuId);
            Assert.NotEmpty(action.Procedure);
            Assert.Matches("^[0-9a-f]{64}$", action.ProcedureSha256);
            Assert.NotEmpty(action.BeforeCheckProcedure);
            Assert.NotEmpty(action.AllowedSourceStatuses);
        });
        Assert.Equal("IV_InternalTransfer_RequestCheckBeforeUpdateStp",
            TransferActionCatalog.All.Single(action => action.Id == Send).BeforeCheckProcedure);
        Assert.Equal("IV_InternalTransfer_RequestPMCheckBeforeUpdateStp",
            TransferActionCatalog.All.Single(action => action.Id == Confirm).BeforeCheckProcedure);
    }

    [Fact]
    public void Catalog_policies_do_not_expose_mutable_collection_aliases()
    {
        var actions = Assert.IsAssignableFrom<IList<TransferActionDefinition>>(
            TransferActionCatalog.All);
        Assert.True(actions.IsReadOnly);
        Assert.Throws<NotSupportedException>(() => actions.Add(actions[0]));
        Assert.Throws<NotSupportedException>(() => actions[0] = actions[1]);

        Assert.All(TransferActionCatalog.All, action =>
        {
            var sourceStatuses = Assert.IsAssignableFrom<ISet<int>>(action.AllowedSourceStatuses);
            Assert.True(sourceStatuses.IsReadOnly);
            Assert.Throws<NotSupportedException>(() => sourceStatuses.Add(int.MaxValue));

            var postStatuses = Assert.IsAssignableFrom<ISet<int>>(
                action.Effect.AllowedPostStatuses);
            Assert.True(postStatuses.IsReadOnly);
            Assert.Throws<NotSupportedException>(() => postStatuses.Add(int.MaxValue));
        });
    }

    [Theory]
    [InlineData("YCN-123456789012345678901234567")]
    [InlineData("REQ-ĐIỀU-CHUYỂN")]
    [InlineData(" REQ-1")]
    [InlineData("REQ-1 ")]
    public void Legacy_key_rejects_truncation_encoding_or_normalization(string key)
    {
        var result = TransferCommandAdmission.Prepare(
            RequestFor(Send, key, new SendToPmPayload("pm.one", "pm.two", null)),
            SnapshotFor(Send, 0));

        Assert.Equal(TransferValidationCodes.InvalidDocumentKey, result.RejectionCode);
    }

    [Fact]
    public void Client_origin_and_client_status_are_never_accepted_as_authority()
    {
        var request = RequestFor(Send, "REQ-1", new SendToPmPayload("pm.one", "pm.two", null));
        var snapshot = SnapshotFor(Send, 0) with { Origin = TransferSnapshotOrigin.ClientClaim };

        var result = TransferCommandAdmission.Prepare(request, snapshot);

        Assert.Equal(TransferValidationCodes.UntrustedSnapshot, result.RejectionCode);
    }

    [Fact]
    public void Prepared_command_cannot_bypass_admission_with_a_public_constructor()
    {
        Assert.Empty(typeof(PreparedTransferCommand).GetConstructors());
    }

    [Theory]
    [InlineData(false, true, true, true)]
    [InlineData(true, false, true, true)]
    [InlineData(true, true, false, true)]
    [InlineData(true, true, true, false)]
    public void Every_authority_dimension_must_be_granted(
        bool menu, bool capability, bool branch, bool assignment)
    {
        var request = RequestFor(Send, "REQ-1", new SendToPmPayload("pm.one", "pm.two", null));
        var snapshot = SnapshotFor(Send, 0) with
        {
            MenuGranted = menu,
            CapabilityGranted = capability,
            BranchGranted = branch,
            AssignmentGranted = assignment
        };

        Assert.Equal(TransferValidationCodes.ScopeDenied,
            TransferCommandAdmission.Prepare(request, snapshot).RejectionCode);
    }

    [Fact]
    public void Stale_status_and_missing_row_version_fail_closed()
    {
        var request = RequestFor(Send, "REQ-1", new SendToPmPayload("pm.one", "pm.two", null));

        Assert.Equal(TransferValidationCodes.StatusChanged,
            TransferCommandAdmission.Prepare(request, SnapshotFor(Send, 10)).RejectionCode);
        Assert.Equal(TransferValidationCodes.MissingConcurrencyEvidence,
            TransferCommandAdmission.Prepare(request,
                SnapshotFor(Send, 0) with { RowVersionToken = "" }).RejectionCode);
    }

    [Theory]
    [InlineData("pm", "pm")]
    [InlineData("PM.ONE", "pm.one")]
    [InlineData("pm.one", "pm.Đức")]
    [InlineData(" pm.one", "pm.two")]
    public void Send_to_pm_requires_two_distinct_lossless_legacy_users(string first, string second)
    {
        var result = TransferCommandAdmission.Prepare(
            RequestFor(Send, "REQ-1", new SendToPmPayload(first, second, null)),
            SnapshotFor(Send, 0));

        Assert.Equal(TransferValidationCodes.InvalidPayload, result.RejectionCode);
    }

    [Fact]
    public void Pm_approval_requires_complete_bounded_quantities_and_one_positive_line()
    {
        var missing = new ConfirmByPmPayload([new("detail-1", 5m, null)], null);
        var excessive = new ConfirmByPmPayload([new("detail-1", 5m, 6m)], null);
        var allZero = new ConfirmByPmPayload([new("detail-1", 5m, 0m)], null);
        var excessScale = new ConfirmByPmPayload([new("detail-1", 5m, 1.00001m)], null);
        var valid = new ConfirmByPmPayload(
            [new("detail-1", 5m, 0m), new("detail-2", 3m, 2.1250m)], "checked");

        Assert.Equal(TransferValidationCodes.InvalidPayload, Prepare(Confirm, 10, missing).RejectionCode);
        Assert.Equal(TransferValidationCodes.InvalidPayload, Prepare(Confirm, 10, excessive).RejectionCode);
        Assert.Equal(TransferValidationCodes.InvalidPayload, Prepare(Confirm, 10, allZero).RejectionCode);
        Assert.Equal(TransferValidationCodes.InvalidPayload, Prepare(Confirm, 10, excessScale).RejectionCode);
        Assert.True(Prepare(Confirm, 10, valid).Accepted);
    }

    [Fact]
    public void Pm_approval_decimal_min_value_fails_closed_without_throwing()
    {
        var payload = new ConfirmByPmPayload(
            [new("detail-1", 5m, decimal.MinValue)], null);

        var exception = Record.Exception(() => Prepare(Confirm, 10, payload));

        Assert.Null(exception);
        Assert.Equal(TransferValidationCodes.InvalidPayload,
            Prepare(Confirm, 10, payload).RejectionCode);
    }

    [Theory]
    [InlineData("", "detail-2")]
    [InlineData(" detail-1", "detail-2")]
    [InlineData("detail-1", "DETAIL-1")]
    public void Pm_approval_requires_unique_stable_detail_ids(string first, string second)
    {
        var payload = new ConfirmByPmPayload(
            [new(first, 5m, 1m), new(second, 3m, 1m)], null);

        Assert.Equal(TransferValidationCodes.InvalidPayload,
            Prepare(Confirm, 10, payload).RejectionCode);
    }

    [Fact]
    public void Prepared_pm_payload_is_frozen_against_post_admission_mutation()
    {
        var lines = new List<PmApprovalLine> { new("detail-1", 5m, 1m) };
        var prepared = Prepare(Confirm, 10, new ConfirmByPmPayload(lines, null));
        Assert.True(prepared.Accepted);

        lines[0] = new("redirected-detail", 5m, -1m);
        lines.Add(new("detail-1", 5m, 99m));

        var frozen = Assert.IsType<ConfirmByPmPayload>(prepared.Command!.Payload);
        var line = Assert.Single(frozen.Lines);
        Assert.Equal("detail-1", line.DetailId);
        Assert.Equal(1m, line.ApprovedQuantity);
    }

    [Fact]
    public void Null_pm_line_collection_fails_closed()
    {
        var result = Prepare(Confirm, 10, new ConfirmByPmPayload(null!, null));

        Assert.Equal(TransferValidationCodes.InvalidPayload, result.RejectionCode);
    }

    [Fact]
    public void Malformed_payload_collection_fails_closed_without_escaping_admission()
    {
        var payload = new ConfirmByPmPayload(new ThrowingReadOnlyList<PmApprovalLine>(), null);

        var exception = Record.Exception(() => Prepare(Confirm, 10, payload));

        Assert.Null(exception);
        Assert.Equal(TransferValidationCodes.InvalidPayload,
            Prepare(Confirm, 10, payload).RejectionCode);
    }

    [Fact]
    public void Pm_approval_collection_is_bounded_before_preparation()
    {
        var lines = Enumerable.Range(1, 1001)
            .Select(index => new PmApprovalLine($"detail-{index}", 1m, 1m))
            .ToArray();

        var result = Prepare(Confirm, 10, new ConfirmByPmPayload(lines, null));

        Assert.Equal(TransferValidationCodes.InvalidPayload, result.RejectionCode);
    }

    [Fact]
    public void Unicode_payload_fields_reject_nul_and_unpaired_surrogates()
    {
        Assert.Equal(TransferValidationCodes.InvalidPayload,
            Prepare(Send, 0,
                new SendToPmPayload("pm.one", "pm.two", "note\0suffix")).RejectionCode);
        Assert.Equal(TransferValidationCodes.InvalidPayload,
            Prepare(Return, 10, new ReturnByPmPayload("reason-\ud800")).RejectionCode);
        Assert.Equal(TransferValidationCodes.InvalidPayload,
            Prepare(Confirm, 10,
                new ConfirmByPmPayload([new("detail-\ud800", 1m, 1m)], null)).RejectionCode);
    }

    [Fact]
    public void Scope_and_concurrency_evidence_are_bounded_and_unambiguous()
    {
        var request = RequestFor(Send, "REQ-1",
            new SendToPmPayload("pm.one", "pm.two", null));

        Assert.Equal(TransferValidationCodes.ScopeDenied,
            TransferCommandAdmission.Prepare(request,
                SnapshotFor(Send, 0) with { TenantId = "tenant\0suffix" }).RejectionCode);
        Assert.Equal(TransferValidationCodes.ScopeDenied,
            TransferCommandAdmission.Prepare(request,
                SnapshotFor(Send, 0) with { BranchId = new string('b', 251) }).RejectionCode);
        Assert.Equal(TransferValidationCodes.MissingConcurrencyEvidence,
            TransferCommandAdmission.Prepare(request,
                SnapshotFor(Send, 0) with { RowVersionToken = "row-version\nforged" }).RejectionCode);
        Assert.Equal(TransferValidationCodes.MissingConcurrencyEvidence,
            TransferCommandAdmission.Prepare(request,
                SnapshotFor(Send, 0) with { AuthorityVersion = new string('a', 251) }).RejectionCode);
    }

    [Theory]
    [InlineData("tenant\u200Bshadow")]
    [InlineData("te\u0301nant")]
    public void Scope_identifiers_reject_invisible_formatting_and_noncanonical_unicode(string tenantId)
    {
        var request = RequestFor(Send, "REQ-1",
            new SendToPmPayload("pm.one", "pm.two", null));

        var result = TransferCommandAdmission.Prepare(request,
            SnapshotFor(Send, 0) with { TenantId = tenantId });

        Assert.Equal(TransferValidationCodes.ScopeDenied, result.RejectionCode);
    }

    [Theory]
    [InlineData("detail\u200B1")]
    [InlineData("de\u0301tail")]
    public void Detail_identifiers_reject_invisible_formatting_and_noncanonical_unicode(string detailId)
    {
        var result = Prepare(Confirm, 10,
            new ConfirmByPmPayload([new(detailId, 1m, 1m)], null));

        Assert.Equal(TransferValidationCodes.InvalidPayload, result.RejectionCode);
    }

    [Fact]
    public void Return_reason_is_required_without_silent_trim()
    {
        Assert.Equal(TransferValidationCodes.InvalidPayload,
            Prepare(Return, 10, new ReturnByPmPayload("  ")).RejectionCode);
        Assert.Equal(TransferValidationCodes.InvalidPayload,
            Prepare(Return, 10, new ReturnByPmPayload("needs correction ")).RejectionCode);
        Assert.True(Prepare(Return, 10, new ReturnByPmPayload("needs correction")).Accepted);
    }

    [Fact]
    public void Catalogued_action_without_typed_payload_remains_ineligible()
    {
        const string dispatch = "IV_InternalTransferWarehouseOutFrm:ExecSQLWithParaButtonCtl";
        var result = Prepare(dispatch, 70, new ReturnByPmPayload("not a dispatch contract"));

        Assert.Equal(TransferValidationCodes.PayloadContractUnavailable, result.RejectionCode);
    }

    [Fact]
    public async Task Adapter_accepts_only_correlated_audited_expected_effect()
    {
        var command = Prepare(Send, 0, new SendToPmPayload("pm.one", "pm.two", null)).Command!;
        var adapter = new TransferAtomicCommandAdapter(new StubGateway((_, _) =>
            ReceiptFor(command, TransferGatewayOutcome.Committed, 10, "audit-1")));

        var result = await adapter.ExecuteAsync(command);

        Assert.Equal(TransferExecutionOutcome.Committed, result.Outcome);
    }

    [Theory]
    [InlineData(20, "audit-1")]
    [InlineData(10, null)]
    public async Task Adapter_fails_unknown_for_unproved_committed_receipt(int status, string? audit)
    {
        var command = Prepare(Send, 0, new SendToPmPayload("pm.one", "pm.two", null)).Command!;
        var adapter = new TransferAtomicCommandAdapter(new StubGateway((_, _) =>
            ReceiptFor(command, TransferGatewayOutcome.Committed, status, audit)));

        Assert.Equal(TransferExecutionOutcome.OutcomeUnknown,
            (await adapter.ExecuteAsync(command)).Outcome);
    }

    [Theory]
    [InlineData(" audit-1")]
    [InlineData("audit-1\nforged")]
    public async Task Adapter_rejects_non_lossless_durable_audit_identifiers(string audit)
    {
        var command = Prepare(Send, 0, new SendToPmPayload("pm.one", "pm.two", null)).Command!;
        var adapter = new TransferAtomicCommandAdapter(new StubGateway((_, _) =>
            ReceiptFor(command, TransferGatewayOutcome.Committed, 10, audit)));

        Assert.Equal(TransferExecutionOutcome.OutcomeUnknown,
            (await adapter.ExecuteAsync(command)).Outcome);
    }

    [Theory]
    [InlineData(TransferGatewayOutcome.Conflict)]
    [InlineData(TransferGatewayOutcome.Rejected)]
    public async Task Adapter_fails_unknown_when_noncommitted_receipt_has_no_durable_audit(
        TransferGatewayOutcome outcome)
    {
        var command = Prepare(Send, 0, new SendToPmPayload("pm.one", "pm.two", null)).Command!;
        var adapter = new TransferAtomicCommandAdapter(new StubGateway((_, _) =>
            ReceiptFor(command, outcome, rejectionCode: "synthetic-rejection")));

        Assert.Equal(TransferExecutionOutcome.OutcomeUnknown,
            (await adapter.ExecuteAsync(command)).Outcome);
    }

    [Theory]
    [InlineData(TransferGatewayOutcome.Conflict, TransferExecutionOutcome.Conflict)]
    [InlineData(TransferGatewayOutcome.Rejected, TransferExecutionOutcome.Rejected)]
    public async Task Adapter_accepts_correlated_audited_noncommitted_receipt(
        TransferGatewayOutcome gatewayOutcome,
        TransferExecutionOutcome expectedOutcome)
    {
        var command = Prepare(Send, 0, new SendToPmPayload("pm.one", "pm.two", null)).Command!;
        var adapter = new TransferAtomicCommandAdapter(new StubGateway((_, _) =>
            ReceiptFor(command, gatewayOutcome, audit: "audit-1",
                rejectionCode: "synthetic-rejection")));

        Assert.Equal(expectedOutcome, (await adapter.ExecuteAsync(command)).Outcome);
    }

    [Theory]
    [InlineData(true, false, false)]
    [InlineData(false, true, false)]
    [InlineData(false, false, true)]
    public async Task Adapter_requires_full_action_document_and_idempotency_correlation(
        bool wrongAction, bool wrongDocument, bool wrongIdempotency)
    {
        var command = Prepare(Send, 0, new SendToPmPayload("pm.one", "pm.two", null)).Command!;
        var receipt = ReceiptFor(command, TransferGatewayOutcome.Committed, 10, "audit-1") with
        {
            ActionId = wrongAction ? Return : command.Action.Id,
            DocumentKey = wrongDocument ? "REQ-OTHER" : command.DocumentKey.Value,
            IdempotencyKey = wrongIdempotency
                ? "b90d9ef1-118d-4873-a5d6-78d984219691"
                : command.IdempotencyKey.Value
        };
        var adapter = new TransferAtomicCommandAdapter(new StubGateway((_, _) => receipt));

        Assert.Equal(TransferExecutionOutcome.OutcomeUnknown,
            (await adapter.ExecuteAsync(command)).Outcome);
    }

    [Fact]
    public async Task Adapter_rejects_receipt_from_same_keys_but_different_authority_scope()
    {
        var original = Prepare(Send, 0,
            new SendToPmPayload("pm.one", "pm.two", null)).Command!;
        var otherScope = TransferCommandAdmission.Prepare(
            RequestFor(Send, "REQ-1", new SendToPmPayload("pm.one", "pm.two", null)),
            SnapshotFor(Send, 0) with { TenantId = "other-tenant" }).Command!;
        var adapter = new TransferAtomicCommandAdapter(new StubGateway((_, _) =>
            ReceiptFor(original, TransferGatewayOutcome.Committed, 10, "audit-1")));

        Assert.Equal(TransferExecutionOutcome.OutcomeUnknown,
            (await adapter.ExecuteAsync(otherScope)).Outcome);
    }

    [Fact]
    public async Task Adapter_rejects_receipt_from_same_keys_but_different_payload()
    {
        var original = Prepare(Send, 0,
            new SendToPmPayload("pm.one", "pm.two", null)).Command!;
        var otherPayload = Prepare(Send, 0,
            new SendToPmPayload("pm.three", "pm.four", null)).Command!;
        var adapter = new TransferAtomicCommandAdapter(new StubGateway((_, _) =>
            ReceiptFor(original, TransferGatewayOutcome.Committed, 10, "audit-1")));

        Assert.Equal(TransferExecutionOutcome.OutcomeUnknown,
            (await adapter.ExecuteAsync(otherPayload)).Outcome);
    }

    [Fact]
    public void Command_fingerprint_binds_the_versioned_source_action_contract()
    {
        var command = Prepare(Send, 0,
            new SendToPmPayload("pm.one", "pm.two", null)).Command!;

        Assert.Equal(
            "bc902e302f691a479229c7ae22a63159ec139b853088a4299f912f5d854b7f84",
            command.CorrelationFingerprint);
    }

    [Theory]
    [InlineData(TransferGatewayOutcome.Committed, "synthetic-rejection")]
    [InlineData(TransferGatewayOutcome.Conflict, null)]
    [InlineData(TransferGatewayOutcome.Rejected, null)]
    public async Task Adapter_rejects_contradictory_or_unexplained_terminal_receipts(
        TransferGatewayOutcome outcome, string? rejectionCode)
    {
        var command = Prepare(Send, 0, new SendToPmPayload("pm.one", "pm.two", null)).Command!;
        var receipt = ReceiptFor(command, outcome, 10, "audit-1", rejectionCode);
        var adapter = new TransferAtomicCommandAdapter(new StubGateway((_, _) => receipt));

        Assert.Equal(TransferExecutionOutcome.OutcomeUnknown,
            (await adapter.ExecuteAsync(command)).Outcome);
    }

    [Theory]
    [InlineData("")]
    [InlineData(" rejection")]
    [InlineData("rejection\n")]
    public async Task Adapter_rejects_non_lossless_rejection_codes(string rejectionCode)
    {
        var command = Prepare(Send, 0, new SendToPmPayload("pm.one", "pm.two", null)).Command!;
        var receipt = ReceiptFor(command, TransferGatewayOutcome.Rejected,
            audit: "audit-1", rejectionCode: rejectionCode);
        var adapter = new TransferAtomicCommandAdapter(new StubGateway((_, _) => receipt));

        Assert.Equal(TransferExecutionOutcome.OutcomeUnknown,
            (await adapter.ExecuteAsync(command)).Outcome);
    }

    [Fact]
    public void Missing_request_or_database_snapshot_fails_closed_without_throwing()
    {
        var request = RequestFor(Send, "REQ-1", new SendToPmPayload("pm.one", "pm.two", null));

        Assert.Equal(TransferValidationCodes.UnknownAction,
            TransferCommandAdmission.Prepare(null!, SnapshotFor(Send, 0)).RejectionCode);
        Assert.Equal(TransferValidationCodes.UntrustedSnapshot,
            TransferCommandAdmission.Prepare(request, null!).RejectionCode);
    }

    [Fact]
    public async Task Cancellation_after_dispatch_is_outcome_unknown()
    {
        var command = Prepare(Send, 0, new SendToPmPayload("pm.one", "pm.two", null)).Command!;
        var adapter = new TransferAtomicCommandAdapter(new ThrowingGateway());

        Assert.Equal(TransferExecutionOutcome.OutcomeUnknown,
            (await adapter.ExecuteAsync(command)).Outcome);
    }

    [Fact]
    public async Task Cancellation_before_dispatch_never_calls_gateway()
    {
        var command = Prepare(Send, 0, new SendToPmPayload("pm.one", "pm.two", null)).Command!;
        var gateway = new StubGateway((_, _) => throw new InvalidOperationException());
        var adapter = new TransferAtomicCommandAdapter(gateway);
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();

        var result = await adapter.ExecuteAsync(command, cancellation.Token);

        Assert.Equal(TransferExecutionOutcome.CancelledBeforeDispatch, result.Outcome);
        Assert.Equal(0, gateway.Calls);
    }

    [Fact]
    public async Task Missing_prepared_command_never_calls_gateway()
    {
        var gateway = new StubGateway((_, _) => throw new InvalidOperationException());
        var adapter = new TransferAtomicCommandAdapter(gateway);

        var result = await adapter.ExecuteAsync(null!);

        Assert.Equal(TransferExecutionOutcome.OutcomeUnknown, result.Outcome);
        Assert.Equal(0, gateway.Calls);
    }

    [Fact]
    public void Missing_gateway_is_rejected_at_adapter_construction()
    {
        Assert.Throws<ArgumentNullException>(() =>
            new TransferAtomicCommandAdapter(null!));
    }

    [Fact]
    public void Authority_snapshot_for_one_document_cannot_admit_another_document()
    {
        var request = RequestFor(Send, "REQ-OTHER", new SendToPmPayload("pm.one", "pm.two", null));

        var result = TransferCommandAdmission.Prepare(request, SnapshotFor(Send, 0));

        Assert.Equal(TransferValidationCodes.UntrustedSnapshot, result.RejectionCode);
        Assert.False(result.Accepted);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(2)]
    public void Approval_snapshot_rejects_a_collection_whose_enumeration_disagrees_with_count(int count)
    {
        var lines = new CountProbeApprovalList(count);

        var result = Prepare(Confirm, 10, new ConfirmByPmPayload(lines, null));

        Assert.Equal(TransferValidationCodes.InvalidPayload, result.RejectionCode);
    }

    [Fact]
    public void Approval_snapshot_reads_the_untrusted_allocation_bound_once()
    {
        var lines = new CountProbeApprovalList(1, throwOnSecondRead: true);

        var result = Prepare(Confirm, 10, new ConfirmByPmPayload(lines, null));

        Assert.True(result.Accepted);
        Assert.Equal(1, lines.CountReads);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("req-1")]
    [InlineData(" REQ-1")]
    public void Authority_document_binding_is_required_and_exact(string? authorityKey)
    {
        var request = RequestFor(Send, "REQ-1", new SendToPmPayload("pm.one", "pm.two", null));
        var snapshot = SnapshotFor(Send, 0) with { DocumentKey = authorityKey! };

        Assert.Equal(TransferValidationCodes.UntrustedSnapshot,
            TransferCommandAdmission.Prepare(request, snapshot).RejectionCode);
    }

    [Fact]
    public void Matching_authority_document_can_admit_a_different_valid_key()
    {
        var request = RequestFor(Send, "REQ-OTHER", new SendToPmPayload("pm.one", "pm.two", null));
        var snapshot = SnapshotFor(Send, 0) with { DocumentKey = "REQ-OTHER" };

        var result = TransferCommandAdmission.Prepare(request, snapshot);

        Assert.True(result.Accepted);
        Assert.Equal("REQ-OTHER", result.Command!.DocumentKey.Value);
    }

    [Theory]
    [InlineData("tenant")]
    [InlineData("company")]
    [InlineData("branch")]
    [InlineData("actor")]
    [InlineData("status")]
    [InlineData("row-version")]
    [InlineData("authority-version")]
    [InlineData("document")]
    [InlineData("idempotency")]
    public void Fingerprint_distinguishes_each_authority_and_concurrency_dimension(string dimension)
    {
        var request = RequestFor(Send, "REQ-1", new SendToPmPayload("pm.one", "pm.two", null));
        var snapshot = SnapshotFor(Send, 0);
        var original = TransferCommandAdmission.Prepare(request, snapshot).Command!;
        switch (dimension)
        {
            case "tenant": snapshot = snapshot with { TenantId = "tenant-other" }; break;
            case "company": snapshot = snapshot with { CompanyId = "company-other" }; break;
            case "branch": snapshot = snapshot with { BranchId = "branch-other" }; break;
            case "actor": snapshot = snapshot with { Actor = "user.two" }; break;
            case "status": snapshot = snapshot with { CurrentStatus = 30 }; break;
            case "row-version": snapshot = snapshot with { RowVersionToken = "row-version-2" }; break;
            case "authority-version": snapshot = snapshot with { AuthorityVersion = "authority-version-2" }; break;
            case "document":
                request = request with { DocumentKey = "REQ-2" };
                snapshot = snapshot with { DocumentKey = "REQ-2" };
                break;
            case "idempotency": request = request with { IdempotencyKey = "new-idempotency-key" }; break;
            default: throw new ArgumentOutOfRangeException(nameof(dimension));
        }

        var changed = TransferCommandAdmission.Prepare(request, snapshot);

        Assert.True(changed.Accepted);
        Assert.NotEqual(original.CorrelationFingerprint, changed.Command!.CorrelationFingerprint);
    }

    [Fact]
    public void Fingerprint_has_unambiguous_field_boundaries_and_optional_text()
    {
        var request = RequestFor(Send, "REQ-1", new SendToPmPayload("pm.one", "pm.two", null));
        var left = SnapshotFor(Send, 0) with { TenantId = "a|b", CompanyId = "c" };
        var right = SnapshotFor(Send, 0) with { TenantId = "a", CompanyId = "b|c" };
        Assert.NotEqual(
            TransferCommandAdmission.Prepare(request, left).Command!.CorrelationFingerprint,
            TransferCommandAdmission.Prepare(request, right).Command!.CorrelationFingerprint);

        var withoutNotes = Prepare(Send, 0, new SendToPmPayload("pm.one", "pm.two", null)).Command!;
        var emptyNotes = Prepare(Send, 0, new SendToPmPayload("pm.one", "pm.two", "")).Command!;
        var unicodeNotes = Prepare(Send, 0, new SendToPmPayload("pm.one", "pm.two", "checked-\U0001f600")).Command!;
        Assert.NotEqual(withoutNotes.CorrelationFingerprint, emptyNotes.CorrelationFingerprint);
        Assert.NotEqual(emptyNotes.CorrelationFingerprint, unicodeNotes.CorrelationFingerprint);
    }

    [Fact]
    public void Fingerprint_preserves_exact_quantity_meaning_and_stable_detail_identity()
    {
        var original = Prepare(Confirm, 10,
            new ConfirmByPmPayload([new("detail-1", 5m, 1m)], null)).Command!;
        var sameAmounts = Prepare(Confirm, 10,
            new ConfirmByPmPayload([new("detail-1", 5.0000m, 1.0000m)], null)).Command!;
        var otherDetail = Prepare(Confirm, 10,
            new ConfirmByPmPayload([new("detail-2", 5m, 1m)], null)).Command!;
        var otherAmount = Prepare(Confirm, 10,
            new ConfirmByPmPayload([new("detail-1", 5m, 1.0001m)], null)).Command!;

        Assert.Equal(original.CorrelationFingerprint, sameAmounts.CorrelationFingerprint);
        Assert.NotEqual(original.CorrelationFingerprint, otherDetail.CorrelationFingerprint);
        Assert.NotEqual(original.CorrelationFingerprint, otherAmount.CorrelationFingerprint);
    }

    [Fact]
    public void Fingerprint_is_independent_of_approval_line_enumeration_order()
    {
        var original = Prepare(Confirm, 10,
            new ConfirmByPmPayload([
                new("detail-1", 5m, 1m),
                new("detail-2", 3m, 2m)
            ], "checked")).Command!;
        var reordered = Prepare(Confirm, 10,
            new ConfirmByPmPayload([
                new("detail-2", 3m, 2m),
                new("detail-1", 5m, 1m)
            ], "checked")).Command!;

        Assert.Equal(original.CorrelationFingerprint, reordered.CorrelationFingerprint);
    }

    [Theory]
    [InlineData("timeout")]
    [InlineData("io-failure")]
    [InlineData("cancelled")]
    [InlineData("null-receipt")]
    [InlineData("invalid-outcome")]
    public async Task Dispatched_unproved_outcomes_never_become_terminal_success_or_safe_retry(string fault)
    {
        var command = Prepare(Send, 0, new SendToPmPayload("pm.one", "pm.two", null)).Command!;
        var gateway = new StubGateway((_, _) => fault switch
        {
            "timeout" => throw new TimeoutException("Synthetic timeout"),
            "io-failure" => throw new IOException("Synthetic transport failure"),
            "cancelled" => throw new OperationCanceledException(),
            "null-receipt" => null!,
            "invalid-outcome" => ReceiptFor(command, (TransferGatewayOutcome)int.MaxValue, 10, "audit-1"),
            _ => throw new ArgumentOutOfRangeException(nameof(fault))
        });

        var result = await new TransferAtomicCommandAdapter(gateway).ExecuteAsync(command);

        Assert.Equal(1, gateway.Calls);
        Assert.Equal(TransferExecutionOutcome.OutcomeUnknown, result.Outcome);
        Assert.Null(result.Receipt);
    }

    [Fact]
    public async Task Correlated_durable_receipt_remains_terminal_when_token_cancels_during_dispatch()
    {
        var command = Prepare(Send, 0, new SendToPmPayload("pm.one", "pm.two", null)).Command!;
        using var cancellation = new CancellationTokenSource();
        var gateway = new StubGateway((_, _) =>
        {
            cancellation.Cancel();
            return ReceiptFor(command, TransferGatewayOutcome.Committed, 10, "audit-1");
        });

        var result = await new TransferAtomicCommandAdapter(gateway).ExecuteAsync(command, cancellation.Token);

        Assert.Equal(1, gateway.Calls);
        Assert.Equal(TransferExecutionOutcome.Committed, result.Outcome);
        Assert.NotNull(result.Receipt);
    }

    [Theory]
    [InlineData("\U000E0001")]
    [InlineData("\U000E0061")]
    [InlineData("\U000E007F")]
    public void Technical_identifiers_reject_supplementary_format_characters(string invisible)
    {
        var request = RequestFor(Send, "REQ-1", new SendToPmPayload("pm.one", "pm.two", null));
        var scope = SnapshotFor(Send, 0);
        Assert.Equal(TransferValidationCodes.ScopeDenied,
            TransferCommandAdmission.Prepare(request, scope with { TenantId = "tenant" + invisible }).RejectionCode);
        Assert.Equal(TransferValidationCodes.ScopeDenied,
            TransferCommandAdmission.Prepare(request, scope with { CompanyId = "company" + invisible }).RejectionCode);
        Assert.Equal(TransferValidationCodes.ScopeDenied,
            TransferCommandAdmission.Prepare(request, scope with { BranchId = "branch" + invisible }).RejectionCode);
        Assert.Equal(TransferValidationCodes.InvalidPayload,
            Prepare(Confirm, 10, new ConfirmByPmPayload([new("detail" + invisible, 1m, 1m)], null)).RejectionCode);
    }

    [Theory]
    [InlineData("1.00000", "1.00000")]
    [InlineData("3.0000000000000000000000000000", "2.1250000000000000000000000000")]
    [InlineData("1.000000", "0.00010000")]
    public void Approval_accepts_losslessly_representable_quantities_with_redundant_scale(
        string requestedText, string approvedText)
    {
        var requested = decimal.Parse(requestedText, System.Globalization.CultureInfo.InvariantCulture);
        var approved = decimal.Parse(approvedText, System.Globalization.CultureInfo.InvariantCulture);
        var result = Prepare(Confirm, 10, new ConfirmByPmPayload([new("detail-1", requested, approved)], null));
        var canonical = Prepare(Confirm, 10, new ConfirmByPmPayload(
            [new("detail-1", decimal.Round(requested, 4), decimal.Round(approved, 4))], null));

        Assert.True(result.Accepted);
        Assert.True(canonical.Accepted);
        Assert.Equal(canonical.Command!.CorrelationFingerprint, result.Command!.CorrelationFingerprint);
    }

    [Fact]
    public void Scalar_identifier_validation_preserves_visible_supplementary_unicode()
    {
        var request = RequestFor(Send, "REQ-1", new SendToPmPayload("pm.one", "pm.two", null));
        Assert.True(TransferCommandAdmission.Prepare(request,
            SnapshotFor(Send, 0) with { TenantId = "tenant-\U0001F600", CompanyId = "company-\U00020000" }).Accepted);
        Assert.True(Prepare(Confirm, 10,
            new ConfirmByPmPayload([new("detail-\U00020000", 1m, 1m)], null)).Accepted);
    }

    [Theory]
    [InlineData("999999999999999999999999.9999", "999999999999999999999999.9999", true)]
    [InlineData("1000000000000000000000000", "1", false)]
    [InlineData("1", "0.00001", false)]
    [InlineData("0.00001", "0.00001", false)]
    [InlineData("0.0001", "0.0001", true)]
    [InlineData("1", "-0.00001", false)]
    public void Exact_decimal_storage_boundaries_do_not_round_or_overflow(
        string requestedText, string approvedText, bool accepted)
    {
        var requested = decimal.Parse(requestedText, System.Globalization.CultureInfo.InvariantCulture);
        var approved = decimal.Parse(approvedText, System.Globalization.CultureInfo.InvariantCulture);
        var result = Prepare(Confirm, 10, new ConfirmByPmPayload([new("detail-1", requested, approved)], null));
        Assert.Equal(accepted, result.Accepted);
        if (accepted)
        {
            var payload = Assert.IsType<ConfirmByPmPayload>(result.Command!.Payload);
            Assert.Equal(requested, payload.Lines[0].RequestedQuantity);
            Assert.Equal(approved, payload.Lines[0].ApprovedQuantity);
        }
        else
        {
            Assert.Equal(TransferValidationCodes.InvalidPayload, result.RejectionCode);
        }
    }

    private sealed class CountProbeApprovalList(int count, bool throwOnSecondRead = false)
        : IReadOnlyList<PmApprovalLine>
    {
        public int CountReads { get; private set; }
        public int Count
        {
            get
            {
                CountReads++;
                if (throwOnSecondRead && CountReads > 1)
                    throw new InvalidOperationException("The untrusted second Count would change allocation size.");
                return count;
            }
        }
        public PmApprovalLine this[int index] => index == 0
            ? new("detail-1", 1m, 1m)
            : throw new IndexOutOfRangeException();
        public IEnumerator<PmApprovalLine> GetEnumerator()
        {
            yield return new("detail-1", 1m, 1m);
        }
        System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() => GetEnumerator();
    }

    private static TransferAdmissionResult Prepare(string action, int status, ITransferActionPayload payload) =>
        TransferCommandAdmission.Prepare(RequestFor(action, "REQ-1", payload), SnapshotFor(action, status));

    private static TransferCommandRequest RequestFor(
        string action, string key, ITransferActionPayload payload) =>
        new(action, key, "9db9550e-5eb9-44e1-8e76-4bb8b0f57d44", payload);

    private static TransferAuthoritySnapshot SnapshotFor(string action, int status) =>
        new(TransferSnapshotOrigin.DatabaseAuthority, "tenant", "company", "branch", "user.one",
            action, "REQ-1", status, "row-version-1", "authority-version-1", true, true, true, true);

    private static TransferGatewayReceipt ReceiptFor(
        PreparedTransferCommand command,
        TransferGatewayOutcome outcome,
        int? status = null,
        string? audit = null,
        string? rejectionCode = null) =>
        new(outcome, command.Action.Id, command.DocumentKey.Value, command.IdempotencyKey.Value,
            command.CorrelationFingerprint, status, audit, rejectionCode);

    private sealed class StubGateway(
        Func<PreparedTransferCommand, CancellationToken, TransferGatewayReceipt> execute)
        : ITransferAtomicGateway
    {
        public int Calls { get; private set; }

        public ValueTask<TransferGatewayReceipt> ExecuteAsync(
            PreparedTransferCommand command, CancellationToken cancellationToken)
        {
            Calls++;
            return ValueTask.FromResult(execute(command, cancellationToken));
        }
    }

    private sealed class ThrowingGateway : ITransferAtomicGateway
    {
        public ValueTask<TransferGatewayReceipt> ExecuteAsync(
            PreparedTransferCommand command, CancellationToken cancellationToken) =>
            ValueTask.FromException<TransferGatewayReceipt>(new OperationCanceledException());
    }

    private sealed class ThrowingReadOnlyList<T> : IReadOnlyList<T>
    {
        public int Count => 1;
        public T this[int index] => throw new InvalidOperationException("Synthetic list failure.");
        public IEnumerator<T> GetEnumerator() =>
            throw new InvalidOperationException("Synthetic list failure.");
        System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() =>
            GetEnumerator();
    }
}
