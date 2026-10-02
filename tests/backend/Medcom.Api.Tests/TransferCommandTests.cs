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
        var missing = new ConfirmByPmPayload([new(5m, null)], null);
        var excessive = new ConfirmByPmPayload([new(5m, 6m)], null);
        var allZero = new ConfirmByPmPayload([new(5m, 0m)], null);
        var excessScale = new ConfirmByPmPayload([new(5m, 1.00001m)], null);
        var valid = new ConfirmByPmPayload([new(5m, 0m), new(3m, 2.1250m)], "checked");

        Assert.Equal(TransferValidationCodes.InvalidPayload, Prepare(Confirm, 10, missing).RejectionCode);
        Assert.Equal(TransferValidationCodes.InvalidPayload, Prepare(Confirm, 10, excessive).RejectionCode);
        Assert.Equal(TransferValidationCodes.InvalidPayload, Prepare(Confirm, 10, allZero).RejectionCode);
        Assert.Equal(TransferValidationCodes.InvalidPayload, Prepare(Confirm, 10, excessScale).RejectionCode);
        Assert.True(Prepare(Confirm, 10, valid).Accepted);
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
            new(TransferGatewayOutcome.Committed, command.IdempotencyKey.Value, 10, "audit-1")));

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
            new(TransferGatewayOutcome.Committed, command.IdempotencyKey.Value, status, audit)));

        Assert.Equal(TransferExecutionOutcome.OutcomeUnknown,
            (await adapter.ExecuteAsync(command)).Outcome);
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

    private static TransferAdmissionResult Prepare(string action, int status, ITransferActionPayload payload) =>
        TransferCommandAdmission.Prepare(RequestFor(action, "REQ-1", payload), SnapshotFor(action, status));

    private static TransferCommandRequest RequestFor(
        string action, string key, ITransferActionPayload payload) =>
        new(action, key, "9db9550e-5eb9-44e1-8e76-4bb8b0f57d44", payload);

    private static TransferAuthoritySnapshot SnapshotFor(string action, int status) =>
        new(TransferSnapshotOrigin.DatabaseAuthority, "tenant", "company", "branch", "user.one",
            action, status, "row-version-1", "authority-version-1", true, true, true, true);

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
}
