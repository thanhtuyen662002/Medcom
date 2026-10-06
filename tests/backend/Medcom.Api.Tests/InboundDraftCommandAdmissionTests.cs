using System.Data;
using System.Data.Common;
using Medcom.Application;
using Medcom.Application.Inbound;
using Medcom.Contracts.Inbound;
using Medcom.Infrastructure;
using Medcom.Infrastructure.Inbound;
using Xunit;

namespace Medcom.Api.Tests;

// Synthetic query-aware recording evidence only. No private configuration, target
// SQL, legacy runtime or qualification is exercised or asserted by these tests.
public sealed class InboundDraftCommandAdmissionTests
{
    private static readonly Guid Binding = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly LegacyCompany Company = new("synthetic-tenant", "synthetic-company", "Synthetic");
    private static InboundDraftCommandRuntimeAcceptance Acceptance(bool send = true) =>
        new(Binding, Company.TenantId, Company.CompanyId, "synthetic-recording-only-I31", send ? "synthetic-new-send-only" : null);
    private static (InboundModel Model, InboundAuthorityComparison Native) Model()
    {
        var model = new InboundModel();
        var native = new InboundAuthorityComparison(model);
        native.Direct.Add(new("sample-user", "07011"));
        return (model, native);
    }
    private static InboundDraftCommandFactory Factory(InboundModel model, InboundDraftCommandRuntimeAcceptance? acceptance) =>
        new(Binding, Company, (Func<DbConnection>)model.NewConnection, acceptance);
    private static void ReadOnly(InboundModel model)
    {
        Assert.Equal(0, model.CommitAcks); Assert.Equal(0, model.BusinessWrites); Assert.Empty(model.Journal.Rows.Cast<DataRow>());
        Assert.DoesNotContain(model.Events, name => name is "reserve" or "record" or "header" or "send" or "legacy-log" or "create");
        Assert.All(model.Commands, command =>
        {
            Assert.Equal(CommandType.Text, command.CommandType);
            Assert.Equal(IsolationLevel.Serializable, command.Transaction!.IsolationLevel);
        });
    }

    [Theory]
    [InlineData("absent")] [InlineData("binding")] [InlineData("tenant")] [InlineData("company")] [InlineData("evidence")]
    public async Task Missing_or_mismatched_acceptance_does_no_session_SQL_or_allocator_work(string mismatch)
    {
        var (model, _) = Model();
        var acceptance = mismatch switch
        {
            "absent" => null, "binding" => Acceptance() with { DatabaseBindingId = Guid.NewGuid() },
            "tenant" => Acceptance() with { TenantId = "other" }, "company" => Acceptance() with { CompanyId = "other" },
            _ => Acceptance() with { EvidenceReference = " " }
        };
        var calls = 0;
        Task<AuthoritativeIdentity?> Resolve(CancellationToken _) { calls++; return Task.FromResult<AuthoritativeIdentity?>(model.ActiveIdentity); }
        var factory = Factory(model, acceptance);
        var commands = factory.CreateCommands(Resolve);
        Assert.False(factory.RuntimeAccepted); Assert.False(factory.NewSendAccepted);
        Assert.Equal(InboundDraftCommandAuthorityOutcome.Unavailable, (await factory.CreateAuthorityReader(Resolve).ReadAsync("DOC-IN-1")).Outcome);
        Assert.Equal(InboundDraftOutcome.Unavailable, (await commands.ReadAsync("DOC-IN-1")).Outcome);
        Assert.Equal(InboundDraftOutcome.Unavailable, (await commands.ExecuteAsync(InboundModel.Create())).Outcome);
        Assert.Equal(InboundDraftOutcome.Unavailable, (await commands.ReconcileAsync(InboundModel.Create())).Outcome);
        Assert.Equal(0, calls); Assert.Equal(0, model.FactoryCalls); Assert.Equal(0, model.OpenCalls); ReadOnly(model);
    }

    [Theory]
    [InlineData(null)] [InlineData("")] [InlineData("BR-A")]
    public async Task Native_blank_expands_only_qualified_explicit_catalog_and_intersects_live_scope(string? branch)
    {
        var (model, native) = Model(); native.Users[0] = native.Users[0] with { Branch = branch };
        model.ActiveIdentity = model.ActiveIdentity with { BranchIds = ["BR-A"] };
        var result = await Factory(model, Acceptance()).CreateAuthorityReader(model.ResolveAsync).ReadAsync("DOC-IN-1");
        Assert.Equal(InboundDraftCommandAuthorityOutcome.Admitted, result.Outcome); Assert.Equal("BR-A", result.BranchId);
        Assert.Equal(1, model.OpenCalls); Assert.Equal(1, model.ConnectionDisposes); Assert.Equal(1, model.TransactionDisposes);
        Assert.Contains(branch is null or "" ? "catalog" : "native-restricted", model.Events); ReadOnly(model);
    }

    [Theory]
    [InlineData("run")] [InlineData("update")] [InlineData("live-branch")] [InlineData("native-branch")]
    [InlineData("physical-document")] [InlineData("stamp")] [InlineData("principal-alias")] [InlineData("group-alias")]
    public async Task Current_native_Run_and_Update_credentials_physical_identity_and_live_branch_are_independent_fences(string denial)
    {
        var (model, native) = Model();
        if (denial == "run") native.Direct[0] = native.Direct[0] with { Run = false };
        if (denial == "update") native.Direct[0] = native.Direct[0] with { Update = false };
        if (denial == "live-branch") model.ActiveIdentity = model.ActiveIdentity with { BranchIds = ["BR-B"] };
        if (denial == "native-branch") native.Users[0] = native.Users[0] with { Branch = "BR-B" };
        if (denial == "physical-document") model.Tables[0].Rows[0]["DocumentID"] = "doc-in-1";
        if (denial == "stamp") model.ActiveIdentity = model.ActiveIdentity with { CredentialStamp = "wrong-stamp" };
        if (denial == "principal-alias") native.Users.Add(native.Users[0] with { Name = "SAMPLE-USER" });
        if (denial == "group-alias") native.Users[0] = native.Users[0] with { Group = "group-a" };
        var result = await Factory(model, Acceptance()).CreateAuthorityReader(model.ResolveAsync).ReadAsync("DOC-IN-1");
        Assert.NotEqual(InboundDraftCommandAuthorityOutcome.Admitted, result.Outcome); Assert.Null(result.BranchId); ReadOnly(model);
    }

    [Theory]
    [InlineData("disabled-user")] [InlineData("disabled-group")] [InlineData("wrong-menu")]
    [InlineData("wrong-form")] [InlineData("variant")] [InlineData("disabled-menu")]
    public async Task Native_enabled_status_and_exact_menu_form_variant_are_rechecked(string fault)
    {
        var (model, native) = Model();
        native.ChangeProjection = (tag, table) =>
        {
            if (tag == "user" && fault == "disabled-user") table.Rows[0][2] = true;
            if (tag == "user" && fault == "disabled-group") table.Rows[0][4] = true;
            if (tag == "grants")
            {
                if (fault == "wrong-menu") table.Rows[0][0] = "07011 ";
                if (fault == "wrong-form") table.Rows[0][1] = "OtherForm";
                if (fault == "variant") table.Rows[0][2] = "unqualified";
                if (fault == "disabled-menu") table.Rows[0][3] = true;
            }
            return table;
        };
        var result = await Factory(model, Acceptance()).CreateAuthorityReader(model.ResolveAsync).ReadAsync("DOC-IN-1");
        Assert.Equal(InboundDraftCommandAuthorityOutcome.Denied, result.Outcome); Assert.Null(result.BranchId); ReadOnly(model);
    }

    [Fact]
    public async Task Separate_Run_only_and_Update_only_grants_cannot_be_combined_into_authority()
    {
        var (model, native) = Model();
        native.Direct[0] = native.Direct[0] with { Update = false };
        native.GroupRights.Add(new("GROUP-A", "07011", Run: false, Update: true));
        var result = await Factory(model, Acceptance()).CreateAuthorityReader(model.ResolveAsync).ReadAsync("DOC-IN-1");
        Assert.Equal(InboundDraftCommandAuthorityOutcome.Denied, result.Outcome); Assert.Null(result.BranchId); ReadOnly(model);
    }

    [Theory]
    [InlineData("shape")] [InlineData("empty")] [InlineData("duplicate")] [InlineData("alias")] [InlineData("whitespace")]
    [InlineData("case-only")] [InlineData("excessive")] [InlineData("native-whitespace")]
    public async Task Blank_branch_does_not_weaken_catalog_or_native_assignment_qualification(string fault)
    {
        var (model, native) = Model(); native.Users[0] = native.Users[0] with { Branch = null };
        switch (fault)
        {
            case "shape": native.CatalogQualified = false; break;
            case "empty": native.Catalog = []; break;
            case "duplicate": native.Catalog = ["BR-A", "BR-A"]; break;
            case "alias": native.CatalogAlias = 1; break;
            case "whitespace": native.Catalog = ["BR-A "]; break;
            case "case-only": native.Catalog = ["br-a"]; break;
            case "excessive": native.Catalog = Enumerable.Range(0, 201).Select(i => "B" + i).ToArray(); break;
            case "native-whitespace": native.Users[0] = native.Users[0] with { Branch = " " }; break;
        }
        var result = await Factory(model, Acceptance()).CreateAuthorityReader(model.ResolveAsync).ReadAsync("DOC-IN-1");
        Assert.NotEqual(InboundDraftCommandAuthorityOutcome.Admitted, result.Outcome); Assert.Null(result.BranchId); ReadOnly(model);
    }

    [Theory]
    [InlineData(1)] [InlineData(2)] [InlineData(3)] [InlineData(4)]
    public async Task Authority_observation_reuses_I15_full_physical_child_check(int child)
    {
        var (model, _) = Model(); model.SqlEqualChildren = true;
        var row = model.Tables[child].NewRow();
        if (model.Tables[child].Rows.Count != 0) row.ItemArray = model.Tables[child].Rows[0].ItemArray.ToArray();
        row["UserAutoID"] = "FOREIGN-ALIAS"; row["DocumentID"] = "doc-in-1"; model.Tables[child].Rows.Add(row);
        var result = await Factory(model, Acceptance()).CreateAuthorityReader(model.ResolveAsync).ReadAsync("DOC-IN-1");
        Assert.Equal(InboundDraftCommandAuthorityOutcome.Unavailable, result.Outcome); Assert.Null(result.BranchId); ReadOnly(model);
    }

    [Theory]
    [InlineData("native-user")] [InlineData("native-restricted")] [InlineData("catalog-shape")] [InlineData("catalog")]
    public async Task Malformed_native_projection_cannot_admit_or_leak_the_document(string stage)
    {
        var (model, native) = Model();
        native.Users[0] = native.Users[0] with { Branch = stage is "catalog" or "catalog-shape" ? null : "BR-A" };
        native.ChangeProjection = (tag, table) => tag == stage ? InboundModel.Table(("wrong", typeof(bool))) : table;
        var result = await Factory(model, Acceptance()).CreateAuthorityReader(model.ResolveAsync).ReadAsync("DOC-IN-1");
        Assert.Equal(InboundDraftCommandAuthorityOutcome.Unavailable, result.Outcome); Assert.Null(result.BranchId); ReadOnly(model);
    }

    [Theory]
    [InlineData("user")] [InlineData("grants")] [InlineData("native-user")] [InlineData("native-restricted")]
    [InlineData("catalog-shape")] [InlineData("catalog")] [InlineData("branch")] [InlineData("snapshot-before")]
    [InlineData("rollback")] [InlineData("transaction-dispose")] [InlineData("connection-dispose")]
    public async Task Authority_IO_faults_fail_closed_and_preserve_readonly_ownership(string stage)
    {
        var (model, native) = Model();
        if (stage is "catalog-shape" or "catalog") native.Users[0] = native.Users[0] with { Branch = null };
        model.Fault = stage;
        var result = await Factory(model, Acceptance()).CreateAuthorityReader(model.ResolveAsync).ReadAsync("DOC-IN-1");
        Assert.Equal(InboundDraftCommandAuthorityOutcome.Unavailable, result.Outcome); Assert.Null(result.BranchId);
        Assert.Equal(1, model.TransactionDisposes); Assert.Equal(1, model.ConnectionDisposes); ReadOnly(model);
    }

    [Theory]
    [InlineData("user")] [InlineData("native-user")] [InlineData("catalog")]
    [InlineData("snapshot-before")] [InlineData("rollback")] [InlineData("transaction-dispose")] [InlineData("connection-dispose")]
    public async Task Cancellation_during_SQL_or_cleanup_never_returns_positive_access(string stage)
    {
        var (model, native) = Model(); native.Users[0] = native.Users[0] with { Branch = null };
        using var cancellation = new CancellationTokenSource();
        model.OnEvent = tag => { if (tag == stage) cancellation.Cancel(); };
        var result = await Factory(model, Acceptance()).CreateAuthorityReader(model.ResolveAsync).ReadAsync("DOC-IN-1", cancellation.Token);
        Assert.Equal(InboundDraftCommandAuthorityOutcome.Cancelled, result.Outcome); Assert.Null(result.BranchId);
        Assert.Equal(1, model.TransactionDisposes); Assert.Equal(1, model.ConnectionDisposes); ReadOnly(model);
    }

    [Fact]
    public async Task Factory_rejects_connection_reuse_without_disposing_someone_elses_connection()
    {
        var (model, _) = Model();
        var connection = new InboundConnection(model);
        var factory = new InboundDraftCommandFactory(Binding, Company, (Func<DbConnection>)(() => connection), Acceptance());
        var first = await factory.CreateAuthorityReader(model.ResolveAsync).ReadAsync("DOC-IN-1");
        Assert.Equal(InboundDraftCommandAuthorityOutcome.Admitted, first.Outcome);
        var second = await factory.CreateAuthorityReader(model.ResolveAsync).ReadAsync("DOC-IN-1");
        Assert.Equal(InboundDraftCommandAuthorityOutcome.Unavailable, second.Outcome);
        Assert.Equal(1, model.OpenCalls); Assert.Equal(1, model.ConnectionDisposes); ReadOnly(model);
    }

    [Fact]
    public async Task Already_open_borrowed_connection_is_rejected_without_closing_or_disposing_it()
    {
        var (model, _) = Model();
        using var connection = new InboundConnection(model); connection.Open();
        var factory = new InboundDraftCommandFactory(Binding, Company, (Func<DbConnection>)(() => connection), Acceptance());
        var result = await factory.CreateAuthorityReader(model.ResolveAsync).ReadAsync("DOC-IN-1");
        Assert.Equal(InboundDraftCommandAuthorityOutcome.Unavailable, result.Outcome);
        Assert.Equal(ConnectionState.Open, connection.State); Assert.Equal(0, model.ConnectionDisposes);
        Assert.Equal(0, model.TransactionDisposes); Assert.Empty(model.Commands); ReadOnly(model);
    }

    [Theory]
    [InlineData("reservation")] [InlineData("phase-one")] [InlineData("before-effects")] [InlineData("before-commit")]
    public async Task Native_blank_to_restricted_fences_both_phases_without_replacing_original_pending_intent(string phase)
    {
        var (model, native) = Model(); native.Users[0] = native.Users[0] with { Branch = null };
        var commands = Factory(model, Acceptance()).CreateCommands(model.ResolveAsync);
        var read = await commands.ReadAsync("DOC-IN-1"); Assert.Equal(InboundDraftOutcome.Observed, read.Outcome);
        var request = new InboundDraftCommand(Guid.NewGuid(), InboundDraftAction.Save, "DOC-IN-1",
            read.Document!.StateEqualityToken, InboundModel.Header with { Notes = "must not commit" });
        var grantReads = 0;
        model.OnEvent = tag =>
        {
            if (tag != "native-user") return;
            grantReads++;
            var at = phase switch { "reservation" => 2, "phase-one" => 3, "before-effects" => 4, _ => 5 };
            if (grantReads == at) native.Users[0] = native.Users[0] with { Branch = "BR-B" };
        };
        var result = await commands.ExecuteAsync(request);
        Assert.Equal(InboundDraftOutcome.Denied, result.Outcome); Assert.Null(result.Receipt);
        Assert.Equal("original", model.Tables[0].Rows[0]["Notes"]);
        if (phase == "reservation") Assert.Empty(model.Journal.Rows.Cast<DataRow>());
        else
        {
            var pending = Assert.Single(model.Journal.Rows.Cast<DataRow>());
            Assert.Equal(request.OperationId, pending["OperationId"]); Assert.Equal(0, pending["State"]);
            var intent = ((byte[])pending["IntentHash"]).ToArray(); var writes = model.BusinessWrites;
            model.OnEvent = null; native.Users[0] = native.Users[0] with { Branch = null };
            Assert.Equal(InboundDraftOutcome.OutcomeUnknown, (await commands.ReconcileAsync(request)).Outcome);
            Assert.Equal(InboundDraftOutcome.OutcomeUnknown, (await commands.ExecuteAsync(request)).Outcome);
            Assert.Equal(writes, model.BusinessWrites); Assert.Equal(intent, (byte[])model.Journal.Rows[0]["IntentHash"]);
            Assert.Single(model.Journal.Rows.Cast<DataRow>());
        }
    }

    [Theory]
    [InlineData(false)] [InlineData(true)]
    public async Task Committed_original_receipt_requires_current_native_scope_and_read_remains_eligible_after_Send(bool loseAck)
    {
        var (model, native) = Model(); native.Users[0] = native.Users[0] with { Branch = null };
        var commands = Factory(model, Acceptance()).CreateCommands(model.ResolveAsync);
        var read = await commands.ReadAsync("DOC-IN-1");
        var original = new InboundDraftCommand(Guid.NewGuid(), InboundDraftAction.SendToWarehouse, "DOC-IN-1",
            read.Document!.StateEqualityToken, null, Note: "synthetic send");
        if (loseAck) model.Fault = "business-commit-ack";
        var result = await commands.ExecuteAsync(original); model.Fault = null;
        Assert.Equal(loseAck ? InboundDraftOutcome.OutcomeUnknown : InboundDraftOutcome.Committed, result.Outcome);
        var writes = model.BusinessWrites; var commits = model.CommitAcks;
        native.Users[0] = native.Users[0] with { Branch = "BR-B" };
        Assert.Equal(InboundDraftOutcome.Denied, (await commands.ReconcileAsync(original)).Outcome);
        Assert.Equal(InboundDraftOutcome.Denied, (await commands.ReadAsync("DOC-IN-1")).Outcome);
        native.Users[0] = native.Users[0] with { Branch = "" };
        var replay = await commands.ReconcileAsync(original);
        Assert.Equal(InboundDraftOutcome.Replayed, replay.Outcome); Assert.Equal(original.OperationId, replay.Receipt!.OperationId);
        Assert.Equal(2, replay.Receipt.StatusId); Assert.Equal(2, (await commands.ReadAsync("DOC-IN-1")).Document!.StatusId);
        Assert.Equal(writes, model.BusinessWrites); Assert.Equal(commits, model.CommitAcks);
        Assert.Single(model.Tables[4].Rows.Cast<DataRow>()); Assert.Single(model.Journal.Rows.Cast<DataRow>());
    }
}
