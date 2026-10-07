using System.Data;
using System.Data.Common;
using System.Diagnostics.CodeAnalysis;
using System.Reflection;
using System.Text.RegularExpressions;
using Medcom.Application;
using Medcom.Contracts.Inbound;
using Medcom.Infrastructure;
using Medcom.Infrastructure.Inbound;
using Xunit;

namespace Medcom.Api.Tests;

// Actual command orchestration and SQL plans on transactional recording doubles.
// Synthetic data only; no SQL client connection, Tools.dll, private settings or fixture setup.
public sealed class InboundDraftCommandTests
{
    [Fact]
    public async Task Save_commits_exact_upserts_and_audit_receipt_preserving_omitted_cost_and_readonly_rows()
    {
        var m=new InboundModel();var s=m.Service();var request=await m.Save(s);
        var oldCost=m.Tables[2].Rows[0].ItemArray.ToArray();
        request=request with{DetailUpserts=[InboundModel.Detail with{LotNumberByDocument="updated"}]};
        var result=await s.ExecuteAsync(request);
        Assert.Equal(InboundDraftOutcome.Committed,result.Outcome);
        Assert.NotNull(result.Receipt);Assert.Equal("updated",m.Tables[1].Rows[0]["LotNumberByDocument"]);
        Assert.Equal("untouched",m.Tables[1].Rows[1]["LotNumberByDocument"]);
        Assert.Equal("locked note",m.Tables[1].Rows[0]["PalletNote"]);
        Assert.Equal(oldCost,m.Tables[2].Rows[0].ItemArray);
        Assert.Single(m.Tables[3].Rows.Cast<DataRow>());Assert.Empty(m.Tables[4].Rows.Cast<DataRow>());
        Assert.Single(m.Journal.Rows.Cast<DataRow>());Assert.Equal(1,m.Journal.Rows[0]["State"]);
        Assert.Equal(result.Receipt!.AuditId,m.Journal.Rows[0]["AuditId"]);
        Assert.Equal(2,m.CommitAcks);
        Assert.All(m.Commands,c=>Assert.Equal(IsolationLevel.Serializable,c.Transaction!.IsolationLevel));
    }

    [Theory]
    [InlineData("stale",InboundDraftOutcome.Conflict)]
    [InlineData("status",InboundDraftOutcome.Rejected)]
    [InlineData("date",InboundDraftOutcome.NumberingUnavailable)]
    [InlineData("branch",InboundDraftOutcome.Denied)]
    [InlineData("foreign-upsert",InboundDraftOutcome.Conflict)]
    [InlineData("foreign-remove",InboundDraftOutcome.Conflict)]
    [InlineData("detail-limit",InboundDraftOutcome.Rejected)]
    [InlineData("send-empty",InboundDraftOutcome.Rejected)]
    [InlineData("send-null-lot",InboundDraftOutcome.Rejected)]
    [InlineData("rounding",InboundDraftOutcome.Unavailable)]
    public async Task Observable_existing_intent_rejections_do_not_reserve_commit_or_write(string scenario,InboundDraftOutcome expected)
    {
        var m=new InboundModel();var s=m.Service();
        if(scenario=="status")m.Tables[0].Rows[0]["StatusID"]=2;
        if(scenario=="send-empty")m.Tables[1].Clear();
        if(scenario=="send-null-lot")m.Tables[1].Rows[0]["LotNumberByDocument"]=DBNull.Value;
        var request=scenario.StartsWith("send-",StringComparison.Ordinal) ? await m.Send(s) : await m.Save(s);
        if(scenario=="stale")m.Tables[0].Rows[0]["Notes"]="changed since read";
        if(scenario=="date")request=request with{Header=InboundModel.Header with{DocumentDate=InboundModel.Header.DocumentDate.AddDays(1)}};
        if(scenario=="branch")request=request with{Header=InboundModel.Header with{BranchId="BR-B"}};
        if(scenario=="foreign-upsert")request=request with{DetailUpserts=[InboundModel.Detail with{RowId="FOREIGN"}]};
        if(scenario=="foreign-remove")request=request with{RemovedDetailIds=["FOREIGN"]};
        if(scenario=="detail-limit")request=request with{DetailUpserts=Enumerable.Range(0,500).Select(_=>
            InboundModel.Detail with{RowId=null,ClientLineId=Guid.NewGuid()}).ToArray()};
        if(scenario=="rounding")request=request with{Header=InboundModel.Header with{RateExchange=1.5m}};
        m.Commands.Clear();m.Events.Clear();
        var result=await s.ExecuteAsync(request);
        Assert.Equal(expected,result.Outcome);Assert.Null(result.Receipt);
        Assert.Empty(m.Journal.Rows.Cast<DataRow>());Assert.Equal(0,m.CommitAcks);Assert.Equal(0,m.BusinessWrites);
        Assert.DoesNotContain("reserve",m.Events);Assert.DoesNotContain("record",m.Events);
        Assert.DoesNotContain("reserve-commit-before",m.Events);Assert.DoesNotContain("business-commit-before",m.Events);
    }

    [Theory]
    [InlineData(false)] [InlineData(true)]
    public async Task Valid_existing_intents_validate_in_both_transactions_and_replay_before_draft_validation(bool send)
    {
        var m=new InboundModel();var s=m.Service();var request=send ? await m.Send(s) : await m.Save(s);
        m.Commands.Clear();m.Events.Clear();
        var result=await s.ExecuteAsync(request);
        Assert.Equal(InboundDraftOutcome.Committed,result.Outcome);Assert.NotNull(result.Receipt);
        Assert.Equal(2,m.CommitAcks);Assert.Single(m.Journal.Rows.Cast<DataRow>());
        var snapshots=m.Commands.Where(c=>c.CommandText.Contains("inbound:snapshot",StringComparison.Ordinal)).ToArray();
        Assert.Equal(3,snapshots.Length);
        var reserve=Assert.Single(m.Commands,c=>c.CommandText.Contains("inbound:reserve",StringComparison.Ordinal));
        var effect=Assert.Single(m.Commands,c=>c.CommandText.Contains(send ? "inbound:send" : "inbound:header",StringComparison.Ordinal));
        Assert.Same(reserve.Transaction,snapshots[0].Transaction);
        Assert.Same(effect.Transaction,snapshots[1].Transaction);Assert.Same(effect.Transaction,snapshots[2].Transaction);
        Assert.NotSame(snapshots[0].Transaction,snapshots[1].Transaction);
        Assert.True(m.Commands.IndexOf(snapshots[0])<m.Commands.IndexOf(reserve));
        Assert.True(m.Commands.IndexOf(snapshots[1])<m.Commands.IndexOf(effect));
        // Original receipt disclosure must precede current draft validation, including
        // status 2 after Send and an externally advanced status after Save.
        m.Tables[0].Rows[0]["StatusID"]=2;var writes=m.BusinessWrites;
        m.Commands.Clear();m.Events.Clear();
        Assert.Equal(result.Receipt,(await s.ExecuteAsync(request)).Receipt);
        Assert.Equal(result.Receipt,(await s.ReconcileAsync(request)).Receipt);
        Assert.Equal(writes,m.BusinessWrites);Assert.Equal(2,m.CommitAcks);
        Assert.DoesNotContain("snapshot-before",m.Events);Assert.DoesNotContain("reserve",m.Events);
    }

    [Theory]
    [InlineData(false,"token",InboundDraftOutcome.Conflict)]
    [InlineData(true,"token",InboundDraftOutcome.Conflict)]
    [InlineData(false,"status",InboundDraftOutcome.Rejected)]
    [InlineData(true,"status",InboundDraftOutcome.Rejected)]
    [InlineData(false,"scope",InboundDraftOutcome.Denied)]
    public async Task Interphase_change_revalidates_and_preserves_only_genuine_pending_custody(bool send,string change,InboundDraftOutcome expected)
    {
        var m=new InboundModel();var s=m.Service();var request=send ? await m.Send(s) : await m.Save(s);
        m.Commands.Clear();m.Events.Clear();
        m.OnEvent=name=>
        {
            if(name!="reserve-commit-ack")return;
            if(change=="token")m.Tables[0].Rows[0]["Notes"]="concurrent writer";
            if(change=="status")m.Tables[0].Rows[0]["StatusID"]=2;
            if(change=="scope")m.Tables[0].Rows[0]["BranchID"]="BR-B";
        };
        var result=await s.ExecuteAsync(request);
        Assert.Equal(expected,result.Outcome);Assert.Null(result.Receipt);
        var pending=Assert.Single(m.Journal.Rows.Cast<DataRow>());
        Assert.Equal(request.OperationId,pending["OperationId"]);Assert.Equal(0,pending["State"]);
        Assert.Equal(1,m.CommitAcks);Assert.Equal(0,m.BusinessWrites);
        Assert.Single(m.Events,name=>name=="reserve");Assert.DoesNotContain("record",m.Events);
        var intent=((byte[])pending["IntentHash"]).ToArray();
        m.OnEvent=null;m.Tables[0].Rows[0]["BranchID"]="BR-A";
        m.Commands.Clear();m.Events.Clear();
        Assert.Equal(InboundDraftOutcome.OutcomeUnknown,(await s.ExecuteAsync(request)).Outcome);
        Assert.Equal(InboundDraftOutcome.OutcomeUnknown,(await s.ReconcileAsync(request)).Outcome);
        Assert.Equal(1,m.CommitAcks);Assert.Equal(0,m.BusinessWrites);
        Assert.Equal(intent,(byte[])Assert.Single(m.Journal.Rows.Cast<DataRow>())["IntentHash"]);
        Assert.DoesNotContain("reserve",m.Events);Assert.DoesNotContain("snapshot-before",m.Events);
    }

    [Fact]
    public async Task Phase_one_snapshot_failure_retains_the_genuine_pending_operation_without_dispatch()
    {
        var m=new InboundModel();var s=m.Service();var request=await m.Save(s);
        m.Events.Clear();
        m.OnEvent=name=>{if(name=="reserve-commit-ack")m.Fault="snapshot-before";};
        var result=await s.ExecuteAsync(request);
        Assert.Equal(InboundDraftOutcome.Unavailable,result.Outcome);Assert.Null(result.Receipt);
        Assert.Equal(2,m.Events.Count(name=>name=="snapshot-before"));
        Assert.Equal(1,m.CommitAcks);Assert.Equal(0,m.BusinessWrites);
        var pending=Assert.Single(m.Journal.Rows.Cast<DataRow>());
        Assert.Equal(request.OperationId,pending["OperationId"]);Assert.Equal(0,pending["State"]);
        m.OnEvent=null;m.Fault=null;m.Events.Clear();
        Assert.Equal(InboundDraftOutcome.OutcomeUnknown,(await s.ExecuteAsync(request)).Outcome);
        Assert.Equal(InboundDraftOutcome.OutcomeUnknown,(await s.ReconcileAsync(request)).Outcome);
        Assert.Equal(1,m.CommitAcks);Assert.Equal(0,m.BusinessWrites);
        Assert.DoesNotContain("snapshot-before",m.Events);Assert.DoesNotContain("reserve",m.Events);
    }

    [Theory]
    [InlineData("probe")] [InlineData("reserve")] [InlineData("snapshot-before")]
    [InlineData("header")] [InlineData("detail-update")] [InlineData("snapshot-after")]
    [InlineData("record")] [InlineData("reserve-commit-before")] [InlineData("business-commit-before")]
    public async Task Faults_do_not_fabricate_success_and_business_effects_are_not_committed(string fault)
    {
        var m=new InboundModel();var s=m.Service();var request=await m.Save(s);
        var original=m.Tables[0].Rows[0]["Notes"];
        request=request with{Header=InboundModel.Header with{Notes="changed"},DetailUpserts=[InboundModel.Detail]};
        m.Fault=fault;
        var result=await s.ExecuteAsync(request);
        Assert.Null(result.Receipt);Assert.NotEqual(InboundDraftOutcome.Committed,result.Outcome);
        Assert.Equal(original,m.Tables[0].Rows[0]["Notes"]);
        Assert.Empty(m.Tables[4].Rows.Cast<DataRow>());
        Assert.All(m.Journal.Rows.Cast<DataRow>(),r=>Assert.Equal(0,r["State"]));
        Assert.DoesNotContain("synthetic-secret",result.Code ?? "");
    }

    [Fact]
    public async Task Lost_business_commit_ack_reconciles_original_receipt_without_second_dispatch()
    {
        var m=new InboundModel();var s=m.Service();var request=await m.Save(s);
        m.Fault="business-commit-ack";
        Assert.Equal(InboundDraftOutcome.OutcomeUnknown,(await s.ExecuteAsync(request)).Outcome);
        Assert.Equal(1,m.Journal.Rows[0]["State"]);var writes=m.BusinessWrites;
        m.Fault=null;
        var recovered=await s.ReconcileAsync(request);
        Assert.Equal(InboundDraftOutcome.Replayed,recovered.Outcome);Assert.NotNull(recovered.Receipt);
        Assert.Equal(recovered.Receipt,(await s.ExecuteAsync(request)).Receipt);
        Assert.Equal(writes,m.BusinessWrites);
        Assert.Equal(InboundDraftOutcome.Conflict,(await s.ExecuteAsync(request with{Header=InboundModel.Header with{Notes="different intent"}})).Outcome);
    }

    [Fact]
    public async Task Lost_reservation_ack_and_missing_observation_never_authorize_takeover()
    {
        var m=new InboundModel();var s=m.Service();var request=await m.Save(s);m.Fault="reserve-commit-ack";
        Assert.Equal(InboundDraftOutcome.OutcomeUnknown,(await s.ExecuteAsync(request)).Outcome);
        Assert.Equal(0,m.BusinessWrites);m.Fault=null;
        Assert.Equal(InboundDraftOutcome.OutcomeUnknown,(await s.ExecuteAsync(request)).Outcome);
        Assert.Equal(InboundDraftOutcome.OutcomeUnknown,(await s.ReconcileAsync(request)).Outcome);
        Assert.Equal(InboundDraftOutcome.OutcomeUnknown,(await s.ReconcileAsync(request with{OperationId=Guid.NewGuid()})).Outcome);
        Assert.Equal(0,m.BusinessWrites);
    }

    [Theory]
    [InlineData("scope")] [InlineData("identity")]
    public async Task Fresh_branch_or_session_revocation_before_commit_rolls_back_every_business_effect(string revoke)
    {
        var m=new InboundModel();var s=m.Service();var request=await m.Save(s);
        m.Revoke=revoke;
        var result=await s.ExecuteAsync(request with{Header=InboundModel.Header with{Notes="must rollback"}});
        Assert.Equal(InboundDraftOutcome.Denied,result.Outcome);
        Assert.Equal("original",m.Tables[0].Rows[0]["Notes"]);
        Assert.Equal(0,m.Journal.Rows[0]["State"]);
    }

    [Fact]
    public async Task Rollback_failure_is_unknown_and_retains_the_original_operation_key()
    {
        var m=new InboundModel();var s=m.Service();var request=await m.Save(s);
        m.Fault="header";m.RollbackFails=true;
        Assert.Equal(InboundDraftOutcome.OutcomeUnknown,(await s.ExecuteAsync(request)).Outcome);
        Assert.Equal(request.OperationId,m.Journal.Rows[0]["OperationId"]);
    }

    [Fact]
    public async Task State_equality_and_foreign_detail_guards_reject_before_business_writes()
    {
        var m=new InboundModel();var s=m.Service();var request=await m.Save(s);
        m.Tables[1].Rows[0]["LotNumberByDocument"]="concurrent change";
        Assert.Equal(InboundDraftOutcome.Conflict,(await s.ExecuteAsync(request)).Outcome);
        var current=await m.Save(s);
        Assert.Equal(InboundDraftOutcome.Conflict,(await s.ExecuteAsync(current with{RemovedDetailIds=["OTHER-DOCUMENT-ROW"]})).Outcome);
        Assert.Equal(0,m.BusinessWrites);
    }

    [Fact]
    public async Task Configured_send_accepts_only_source_states_and_null_checks_and_inserts_exact_legacy_log()
    {
        var m=new InboundModel();m.Tables[0].Rows[0]["StatusID"]=1;
        // Source checks NULL, not positivity or an empty-string rule.
        m.Tables[1].Rows[0]["SetQuantityByDocument"]=0m;m.Tables[1].Rows[0]["LotNumberByDocument"]="";
        var s=m.Service();var request=await m.Send(s);
        var result=await s.ExecuteAsync(request);
        Assert.Equal(InboundDraftOutcome.Committed,result.Outcome);Assert.Equal(2,result.Receipt!.StatusId);
        var log=Assert.Single(m.Tables[4].Rows.Cast<DataRow>());
        Assert.Equal("sample-user",log["UserName"]);Assert.Equal("source note",log["Notes"]);Assert.Equal(2,log["StatusID"]);
        Assert.DoesNotContain(m.Commands,c=>c.CommandText.Contains("StatusID=10",StringComparison.Ordinal));
    }

    [Theory]
    [InlineData("state")] [InlineData("missing-detail")] [InlineData("missing-lot")]
    public async Task Source_send_rejections_do_not_update_status_or_append_a_log(string reason)
    {
        var m=new InboundModel();
        if(reason=="state")m.Tables[0].Rows[0]["StatusID"]=10;
        if(reason=="missing-detail")m.Tables[1].Clear();
        if(reason=="missing-lot")m.Tables[1].Rows[0]["LotNumberByDocument"]=DBNull.Value;
        var s=m.Service();var result=await s.ExecuteAsync(await m.Send(s));
        Assert.Equal(InboundDraftOutcome.Rejected,result.Outcome);Assert.Empty(m.Tables[4].Rows.Cast<DataRow>());
    }

    [Fact]
    public async Task Unqualified_create_and_cost_edits_fail_without_opening_a_connection()
    {
        var m=new InboundModel();var s=m.Service();
        Assert.Equal(InboundDraftOutcome.NumberingUnavailable,(await s.ExecuteAsync(InboundModel.Create())).Outcome);
        Assert.Equal(InboundDraftOutcome.UnsupportedCostEdits,(await s.ExecuteAsync(InboundModel.Create() with{CostChanges=[new(null,"vendor")]})).Outcome);
        Assert.Equal(0,m.OpenCalls);
    }

    [Fact]
    public async Task Qualified_allocator_uses_the_effect_transaction_and_create_readback_replays_assigned_document()
    {
        var m=new InboundModel();var allocator=new InboundTestAllocator();var s=m.Service(allocator);
        var request=InboundModel.Create();var result=await s.ExecuteAsync(request);
        Assert.Equal(InboundDraftOutcome.Committed,result.Outcome);Assert.Equal("SYNTHETIC-ALLOCATED",result.Receipt!.DocumentId);
        Assert.Same(allocator.Transaction,m.Commands.Single(c=>c.CommandText.Contains("inbound:create",StringComparison.Ordinal)).Transaction);
        Assert.Equal(result.Receipt,(await s.ReconcileAsync(request)).Receipt);Assert.Equal(1,allocator.Calls);
    }

    [Fact]
    public async Task Decimal_canonicalization_replays_equal_intent_and_tampered_audit_state_fails_closed()
    {
        var m=new InboundModel();var s=m.Service();var request=await m.Save(s);
        Assert.Equal(InboundDraftOutcome.Committed,(await s.ExecuteAsync(request)).Outcome);
        Assert.Equal(InboundDraftOutcome.Replayed,(await s.ExecuteAsync(request with{Header=request.Header! with{RateExchange=1.00m}})).Outcome);
        m.Journal.Rows[0]["AfterState"]="invalid";
        Assert.Equal(InboundDraftOutcome.Unavailable,(await s.ReconcileAsync(request)).Outcome);
    }

    [Fact]
    public async Task Explicit_removal_and_new_row_preserve_omitted_rows_and_recalculate_only_changed_dependencies()
    {
        var m=new InboundModel();m.Tables[1].Rows[0]["SourceAmount"]=17m;m.Tables[1].Rows[0]["Amount"]=19m;
        var s=m.Service();var request=await m.Save(s);
        Assert.Equal(InboundDraftOutcome.Committed,(await s.ExecuteAsync(request with{DetailUpserts=[InboundModel.Detail with{LotNumberByDocument="only lot"}]})).Outcome);
        Assert.Equal(17m,m.Tables[1].Rows[0]["SourceAmount"]);Assert.Equal(19m,m.Tables[1].Rows[0]["Amount"]);
        request=await m.Save(s);
        var added=InboundModel.Detail with{RowId=null,ClientLineId=Guid.NewGuid(),SetQuantityByDocument=4m};
        var result=await s.ExecuteAsync(request with{Header=InboundModel.Header with{RateExchange=2m},RemovedDetailIds=["ROW-2"],DetailUpserts=[added]});
        Assert.Equal(InboundDraftOutcome.Committed,result.Outcome);Assert.Equal(2,m.Tables[1].Rows.Count);
        Assert.Equal(17m,m.Tables[1].Rows[0]["SourceAmount"]);Assert.Equal(12m,m.Tables[1].Rows[0]["Amount"]);
        var newRow=Assert.Single(m.Tables[1].Rows.Cast<DataRow>(),r=>(string)r["UserAutoID"]!="ROW-1");
        Assert.Equal(12m,newRow["SourceAmount"]);Assert.Equal(24m,newRow["Amount"]);
        Assert.DoesNotContain(m.Tables[1].Rows.Cast<DataRow>(),r=>(string)r["UserAutoID"]=="ROW-2");
    }

    [Theory]
    [InlineData("header")] [InlineData("detail")] [InlineData("omitted")] [InlineData("cost")] [InlineData("readonly")]
    public async Task Unexpected_readback_mutations_roll_back_instead_of_returning_a_receipt(string field)
    {
        var m=new InboundModel();var s=m.Service();var request=await m.Save(s);
        m.ReadbackMutation=t=>
        {
            if(field=="header")t[0].Rows[0]["QRPrintType"]="unexpected";
            if(field=="detail")t[1].Rows[0]["PalletNote"]="unexpected";
            if(field=="omitted")t[1].Rows[1]["Amount"]=91m;
            if(field=="cost")t[2].Rows[0]["Cost"]=91m;
            if(field=="readonly")t[3].Rows[0]["Notes"]="unexpected";
        };
        var result=await s.ExecuteAsync(request with{DetailUpserts=[InboundModel.Detail with{LotNumberByDocument="change"}]});
        Assert.Equal(InboundDraftOutcome.Unavailable,result.Outcome);Assert.Null(result.Receipt);
        Assert.Equal(0,m.Journal.Rows[0]["State"]);Assert.Equal("lot",m.Tables[1].Rows[0]["LotNumberByDocument"]);
    }

    [Fact]
    public async Task Send_cannot_modify_a_prior_log_row_and_replay_cannot_use_a_tampered_branch()
    {
        var m=new InboundModel();m.Tables[4].Rows.Add("OLD-LOG","DOC-IN-1","earlier-user",0,"earlier",new DateTime(2026,10,1));
        var s=m.Service();var request=await m.Send(s);
        m.ReadbackMutation=t=>t[4].Rows[0]["Notes"]="unexpected";
        Assert.Equal(InboundDraftOutcome.Unavailable,(await s.ExecuteAsync(request)).Outcome);
        Assert.Equal("earlier",m.Tables[4].Rows[0]["Notes"]);Assert.Equal(0,m.Tables[0].Rows[0]["StatusID"]);
        m.ReadbackMutation=null;request=await m.Send(s);
        Assert.Equal(InboundDraftOutcome.Committed,(await s.ExecuteAsync(request)).Outcome);
        m.Journal.Rows[m.Journal.Rows.Count-1]["BranchId"]="BR-B";
        Assert.Equal(InboundDraftOutcome.Denied,(await s.ReconcileAsync(request)).Outcome);
    }

    [Theory]
    [InlineData("size")] [InlineData("surrogate")]
    public async Task Unsupported_hidden_source_values_fail_before_a_state_token_is_returned(string invalid)
    {
        var m=new InboundModel();m.Tables[0].Columns.Add("ResultDesciption",typeof(string));
        m.Tables[0].Rows[0]["ResultDesciption"]=invalid=="size" ? new string('x',1048577) : "\ud800";
        var result=await m.Service().ReadAsync("DOC-IN-1");
        Assert.Equal(InboundDraftOutcome.Unavailable,result.Outcome);Assert.Null(result.Document);Assert.Equal(0,m.BusinessWrites);
    }
}

public sealed class InboundDraftDerivedReadbackTests
{
    [Theory]
    [InlineData("changed-Amount")] [InlineData("changed-SourceAmount")]
    [InlineData("changed-price-Amount")] [InlineData("changed-price-SourceAmount")]
    [InlineData("create-Amount")] [InlineData("create-SourceAmount")]
    [InlineData("rate-omitted-Amount")]
    [InlineData("insert-Amount")] [InlineData("insert-SourceAmount")]
    public async Task Corrupted_affected_derived_values_never_complete_the_journal_or_commit_effects(string scenario)
    {
        var m=new InboundModel();var s=m.Service(new InboundTestAllocator());
        var create=scenario.StartsWith("create",StringComparison.Ordinal);
        var request=create ? InboundModel.Create() : await m.Save(s);
        var column=scenario.EndsWith("SourceAmount",StringComparison.Ordinal) ? "SourceAmount" : "Amount";
        var target=create ? "SYNTHETIC-ALLOCATED" : "DOC-IN-1";
        if(scenario.StartsWith("changed",StringComparison.Ordinal))request=request with{DetailUpserts=[scenario.Contains("price",StringComparison.Ordinal)
            ? InboundModel.Detail with{UnitPrice=4m} : InboundModel.Detail with{SetQuantityByDocument=3m}]};
        if(scenario.StartsWith("insert",StringComparison.Ordinal))request=request with{DetailUpserts=[InboundModel.Detail with{RowId=null,ClientLineId=Guid.NewGuid()}]};
        if(scenario.StartsWith("rate",StringComparison.Ordinal))request=request with{Header=InboundModel.Header with{RateExchange=2m}};
        m.ReadbackMutation=t=>
        {
            var rows=t[1].Rows.Cast<DataRow>().Where(r=>(string)r["DocumentID"]==target);
            var row=scenario.StartsWith("rate",StringComparison.Ordinal) ? rows.Single(r=>(string)r["UserAutoID"]=="ROW-2")
                : scenario.StartsWith("insert",StringComparison.Ordinal) ? rows.Single(r=>(string)r["UserAutoID"] is not "ROW-1" and not "ROW-2")
                : create ? rows.Single() : rows.Single(r=>(string)r["UserAutoID"]=="ROW-1");
            row[column]=999m;
        };
        var result=await s.ExecuteAsync(request);
        Assert.Equal(InboundDraftOutcome.Unavailable,result.Outcome);Assert.Null(result.Receipt);
        Assert.Equal(1,m.CommitAcks);Assert.Equal(0,m.Journal.Rows[0]["State"]);
        Assert.DoesNotContain("record",m.Events);
        Assert.Equal(6m,m.Tables[1].Rows[0]["Amount"]);Assert.Equal(6m,m.Tables[1].Rows[0]["SourceAmount"]);
        Assert.DoesNotContain(m.Tables[0].Rows.Cast<DataRow>(),r=>(string)r["DocumentID"]=="SYNTHETIC-ALLOCATED");
    }

    [Theory]
    [InlineData("quantity")] [InlineData("price")] [InlineData("rate")] [InlineData("create")]
    public async Task Exact_null_propagation_is_verified_on_the_affected_fields(string input)
    {
        var m=new InboundModel();var s=m.Service(new InboundTestAllocator());
        var request=input=="create" ? InboundModel.Create() with{DetailUpserts=[InboundModel.Create().DetailUpserts![0] with{UnitPrice=null}]}
            : await m.Save(s);
        if(input=="quantity")request=request with{DetailUpserts=[InboundModel.Detail with{SetQuantityByDocument=null}]};
        if(input=="price")request=request with{DetailUpserts=[InboundModel.Detail with{UnitPrice=null}]};
        if(input=="rate")request=request with{Header=InboundModel.Header with{RateExchange=null}};
        var result=await s.ExecuteAsync(request);Assert.Equal(InboundDraftOutcome.Committed,result.Outcome);
        var document=result.Receipt!.DocumentId;
        var row=Assert.Single(m.Tables[1].Rows.Cast<DataRow>(),r=>(string)r["DocumentID"]==document && (input=="create" || (string)r["UserAutoID"]=="ROW-1"));
        Assert.Equal(DBNull.Value,row["Amount"]);
        Assert.Equal(input=="rate" ? (object)6m : DBNull.Value,row["SourceAmount"]);
    }

    [Theory]
    [InlineData("SourceAmount")] [InlineData("Amount")]
    public async Task Null_expected_derived_values_cannot_be_replaced_with_a_nonnull_readback(string column)
    {
        var m=new InboundModel();var s=m.Service();var request=await m.Save(s);
        m.ReadbackMutation=t=>t[1].Rows[0][column]=999m;
        var result=await s.ExecuteAsync(request with{DetailUpserts=[InboundModel.Detail with{SetQuantityByDocument=null}]});
        Assert.Equal(InboundDraftOutcome.Unavailable,result.Outcome);Assert.Null(result.Receipt);
        Assert.Equal(1,m.CommitAcks);Assert.Equal(0,m.Journal.Rows[0]["State"]);
    }

    [Theory]
    [InlineData("rounded-create")] [InlineData("rounded-omitted")]
    [InlineData("source-range")] [InlineData("amount-range")]
    [InlineData("near-midpoint")]
    public async Task Unqualified_rounding_or_range_fails_before_any_business_dml(string scenario)
    {
        var m=new InboundModel();var s=m.Service(new InboundTestAllocator());
        var request=scenario=="rounded-create" ? InboundModel.Create() with
            {Header=InboundModel.Header with{RateExchange=0.5m},DetailUpserts=[InboundModel.Create().DetailUpserts![0] with{SetQuantityByDocument=1m}]}
            : await m.Save(s);
        if(scenario=="rounded-omitted")request=request with{Header=InboundModel.Header with{RateExchange=1.5m}};
        if(scenario=="source-range")request=request with{DetailUpserts=[InboundModel.Detail with{SetQuantityByDocument=999999999999999999m,UnitPrice=2m}]};
        if(scenario=="amount-range")request=request with{Header=InboundModel.Header with{RateExchange=999999999999999999m}};
        if(scenario=="near-midpoint")request=request with{Header=InboundModel.Header with{RateExchange=0.4999999999m}};
        var result=await s.ExecuteAsync(request);
        Assert.Equal(InboundDraftOutcome.Unavailable,result.Outcome);Assert.Equal("derived_calculation_not_qualified",result.Code);
        Assert.Null(result.Receipt);Assert.Equal(0,m.BusinessWrites);Assert.DoesNotContain("record",m.Events);
        if(scenario=="rounded-create")
        {Assert.Equal(1,m.CommitAcks);Assert.Equal(0,Assert.Single(m.Journal.Rows.Cast<DataRow>())["State"]);}
        else
        {Assert.Equal(0,m.CommitAcks);Assert.Empty(m.Journal.Rows.Cast<DataRow>());Assert.DoesNotContain("reserve",m.Events);}
    }

    [Fact]
    public async Task Fractional_rate_with_exact_integral_result_and_decimal18_boundary_are_supported_without_rounding()
    {
        var m=new InboundModel();var s=m.Service();var request=await m.Save(s);
        Assert.Equal(InboundDraftOutcome.Committed,(await s.ExecuteAsync(request with
            {Header=InboundModel.Header with{RateExchange=1.5m},RemovedDetailIds=["ROW-2"]})).Outcome);
        Assert.Equal(6m,m.Tables[1].Rows[0]["SourceAmount"]);Assert.Equal(9m,m.Tables[1].Rows[0]["Amount"]);
        request=await m.Save(s);
        var maximum=999999999999999999m;
        Assert.Equal(InboundDraftOutcome.Committed,(await s.ExecuteAsync(request with
            {Header=InboundModel.Header,DetailUpserts=[InboundModel.Detail with{SetQuantityByDocument=maximum,UnitPrice=1m}]})).Outcome);
        Assert.Equal(maximum,m.Tables[1].Rows[0]["SourceAmount"]);Assert.Equal(maximum,m.Tables[1].Rows[0]["Amount"]);
    }

    [Theory]
    [InlineData("0", "0")] [InlineData("-2", "-20000000000")]
    [InlineData("0.0000000001", "1")]
    public async Task Zero_signed_and_ten_place_rates_have_exact_verified_results(string rateText,string amountText)
    {
        var m=new InboundModel();var s=m.Service();var request=await m.Save(s);
        var command=request with
        {
            Header=InboundModel.Header with{RateExchange=decimal.Parse(rateText,System.Globalization.CultureInfo.InvariantCulture)},
            DetailUpserts=[InboundModel.Detail with{SetQuantityByDocument=10000000000m,UnitPrice=1m}],RemovedDetailIds=["ROW-2"]
        };
        var result=await s.ExecuteAsync(command);
        Assert.Equal(InboundDraftOutcome.Committed,result.Outcome);
        Assert.Equal(10000000000m,m.Tables[1].Rows[0]["SourceAmount"]);
        Assert.Equal(decimal.Parse(amountText,System.Globalization.CultureInfo.InvariantCulture),m.Tables[1].Rows[0]["Amount"]);
        Assert.Equal(result.Receipt,(await s.ExecuteAsync(command with
            {Header=command.Header! with{RateExchange=command.Header!.RateExchange*1.00m}})).Receipt);
    }
}

internal sealed class InboundTestAllocator:IInboundDocumentNumberAllocator
{
    public bool IsQualified=>true;public DbTransaction? Transaction{get;private set;}public int Calls{get;private set;}
    public Task<string?> AllocateAsync(DbTransaction transaction,DateTime date,CancellationToken token)
    {Calls++;Transaction=transaction;return Task.FromResult<string?>("SYNTHETIC-ALLOCATED");}
}

internal sealed class InboundModel:IInboundCommandAuthority
{
    internal static readonly InboundDraftHeader Header=new(new DateTime(2026,10,1),"synthetic order","synthetic invoice","from","to","type","BR-A",RateExchange:1m,Notes:"original");
    internal static readonly InboundDraftDetailUpsert Detail=new("ROW-1",null,"ITEM-1","lot",2m,1m,new DateTime(2027,1,1),3m);
    internal static readonly AuthoritativeIdentity Identity=new("sample-user","synthetic-tenant","synthetic-company","Synthetic","Sample",1,[],"synthetic-stamp");
    internal DataTable[] Tables=InitialTables();internal DataTable Journal=JournalTable();
    internal AuthoritativeIdentity ActiveIdentity=Identity;
    internal bool SqlEqualChildren;
    internal InboundAuthorityComparison? SourceAuthority;
    internal readonly List<InboundCommand> Commands=[];internal readonly List<string> Events=[];
    internal string? Fault;internal string? Revoke;internal bool RollbackFails;
    internal Action<string>? OnEvent;
    internal bool ConnectionDisposeFails,TransactionDisposeFails;
    internal int FactoryCalls,ConnectionDisposes,TransactionDisposes;
    internal DbConnection NewConnection(){FactoryCalls++;return new InboundConnection(this);}
    internal Action<DataTable[]>? ReadbackMutation;
    internal int CommitAcks,OpenCalls,BusinessWrites;internal InboundTransaction? Active;
    internal SqlInboundDraftCommandService Service(IInboundDocumentNumberAllocator? allocator=null)=>new(Guid.Parse("11111111-1111-1111-1111-111111111111"),
        new LegacyCompany(Identity.TenantId,Identity.CompanyId,"Synthetic"),()=>new InboundConnection(this),this,allocator);
    internal SqlInboundDraftCommandService SourceService()
    {
        // Invoke the actual production reader through the existing recording connection seam.
        // Reflection avoids widening production visibility solely for these offline tests.
        var type=typeof(SqlInboundDraftCommandService).GetNestedType("SqlAuthority",BindingFlags.NonPublic)!;
        Func<CancellationToken,Task<AuthoritativeIdentity?>> resolve=ResolveAsync;
        var reader=(IInboundCommandAuthority)Activator.CreateInstance(type,[resolve])!;
        return new(Guid.Parse("11111111-1111-1111-1111-111111111111"),new LegacyCompany(Identity.TenantId,Identity.CompanyId,"Synthetic"),
            ()=>new InboundConnection(this),reader);
    }
    internal async Task<InboundDraftCommand> Save(SqlInboundDraftCommandService service)
    {var read=await service.ReadAsync("DOC-IN-1");Assert.Equal(InboundDraftOutcome.Observed,read.Outcome);return new(Guid.NewGuid(),InboundDraftAction.Save,"DOC-IN-1",read.Document!.StateEqualityToken,Header);}
    internal async Task<InboundDraftCommand> Send(SqlInboundDraftCommandService service)
    {var r=await Save(service);return r with{Action=InboundDraftAction.SendToWarehouse,Header=null,Note="source note"};}
    internal static InboundDraftCommand Create()=>new(Guid.NewGuid(),InboundDraftAction.Create,null,null,Header,
        [Detail with{RowId=null,ClientLineId=Guid.Parse("22222222-2222-2222-2222-222222222222")}]);
    public Task<AuthoritativeIdentity?> ResolveAsync(CancellationToken token)=>Task.FromResult<AuthoritativeIdentity?>(
        Active?.Business==true && Revoke=="identity" ? null : ActiveIdentity);
    public Task<IReadOnlyList<string>?> ReadGrantsAsync(DbTransaction tx,AuthoritativeIdentity id,InboundDraftAction action,CancellationToken token)
        =>Task.FromResult<IReadOnlyList<string>?>(Active?.Business==true && Revoke=="scope" ? ["BR-B"] : ["BR-A"]);
    internal void Event(string name){Events.Add(name);OnEvent?.Invoke(name);if(Fault==name)throw new IOException("synthetic-secret-never-return");}
    internal static DataTable Table(params (string Name,Type Type)[] columns)
    {var t=new DataTable();foreach(var c in columns)t.Columns.Add(c.Name,c.Type);return t;}
    private static DataTable[] InitialTables()
    {
        var h=Table(("DocumentID",typeof(string)),("DocumentDate",typeof(DateTime)),("OrderNumber",typeof(string)),("InvoiceNo",typeof(string)),
            ("DeparturePoint",typeof(string)),("DestinationPoint",typeof(string)),("OrderTypeID",typeof(string)),("BranchID",typeof(string)),
            ("ObjectID",typeof(string)),("CurrencyID",typeof(string)),("RateExchange",typeof(decimal)),("Notes",typeof(string)),("StatusID",typeof(int)),("QRPrintType",typeof(string)));
        h.Rows.Add("DOC-IN-1",Header.DocumentDate,Header.OrderNumber,Header.InvoiceNo,"from","to","type","BR-A",DBNull.Value,DBNull.Value,1m,"original",0,"source-default");
        var d=Table(("UserAutoID",typeof(string)),("DocumentID",typeof(string)),("ItemID",typeof(string)),("LotNumberByDocument",typeof(string)),
            ("SetQuantityByDocument",typeof(decimal)),("BarrelQuantityByDocument",typeof(decimal)),("ExpireDateByDocument",typeof(DateTime)),
            ("UnitPrice",typeof(decimal)),("SourceAmount",typeof(decimal)),("Amount",typeof(decimal)),("PalletNote",typeof(string)));
        d.Rows.Add("ROW-1","DOC-IN-1","ITEM-1","lot",2m,1m,Detail.ExpireDateByDocument,3m,6m,6m,"locked note");
        d.Rows.Add("ROW-2","DOC-IN-1","ITEM-2","untouched",1m,1m,Detail.ExpireDateByDocument,1m,1m,1m,"locked other");
        var cost=Table(("UserAutoID",typeof(string)),("DocumentID",typeof(string)),("ObjectID",typeof(string)),("Cost",typeof(decimal)));
        cost.Rows.Add("COST-1","DOC-IN-1","synthetic vendor",12.50m);
        var readonlyChild=Table(("UserAutoID",typeof(string)),("DocumentID",typeof(string)),("Notes",typeof(string)));
        readonlyChild.Rows.Add("RO-1","DOC-IN-1","preserved");
        var log=Table(("UserAutoID",typeof(string)),("DocumentID",typeof(string)),("UserName",typeof(string)),("StatusID",typeof(int)),("Notes",typeof(string)),("ThoiGian",typeof(DateTime)));
        return [h,d,cost,readonlyChild,log];
    }
    internal static DataTable JournalTable()=>Table(("DatabaseBindingId",typeof(Guid)),("TenantId",typeof(string)),("CompanyId",typeof(string)),
        ("Actor",typeof(string)),("OperationId",typeof(Guid)),("IntentHash",typeof(byte[])),("Action",typeof(string)),("AttemptId",typeof(Guid)),
        ("State",typeof(int)),("BranchId",typeof(string)),("DocumentId",typeof(string)),("BeforeState",typeof(string)),("AfterState",typeof(string)),
        ("StatusAfter",typeof(int)),("AuditId",typeof(Guid)),("CommittedAtUtc",typeof(DateTime)));
}

internal sealed class InboundConnection(InboundModel model):DbConnection
{
    internal InboundModel Model=>model;private ConnectionState state;
    [AllowNull] public override string ConnectionString{get;set;}="";
    public override string Database=>"SyntheticOnly";public override string DataSource=>"RecordingOnly";public override string ServerVersion=>"RecordingOnly";
    public override ConnectionState State=>state;public override void ChangeDatabase(string name)=>throw new NotSupportedException();
    public override void Open(){model.OpenCalls++;state=ConnectionState.Open;}public override void Close()=>state=ConnectionState.Closed;
    protected override DbTransaction BeginDbTransaction(IsolationLevel level)=>model.Active=new InboundTransaction(this,level);
    protected override DbCommand CreateDbCommand(){var c=new InboundCommand(this);model.Commands.Add(c);return c;}
    protected override void Dispose(bool disposing)
    {
        if(disposing){model.ConnectionDisposes++;model.Event("connection-dispose");Close();
            if(model.ConnectionDisposeFails)throw new IOException("synthetic cleanup failure");}
        base.Dispose(disposing);
    }
}
internal sealed class InboundTransaction(InboundConnection owner,IsolationLevel level):DbTransaction
{
    internal readonly DataTable[] Tables=owner.Model.Tables.Select(t=>t.Copy()).ToArray();
    internal readonly DataTable Journal=owner.Model.Journal.Copy();internal bool Business;
    public override IsolationLevel IsolationLevel=>level;protected override DbConnection DbConnection=>owner;
    public override void Commit()
    {
        var kind=Business?"business":"reserve";owner.Model.Event(kind+"-commit-before");
        owner.Model.Tables=Tables.Select(t=>t.Copy()).ToArray();owner.Model.Journal=Journal.Copy();owner.Model.CommitAcks++;
        owner.Model.Event(kind+"-commit-ack");
    }
    public override void Rollback(){owner.Model.Event("rollback");if(owner.Model.RollbackFails)throw new IOException("synthetic rollback failure");}
    protected override void Dispose(bool disposing)
    {
        if(disposing){owner.Model.TransactionDisposes++;owner.Model.Event("transaction-dispose");
            if(owner.Model.TransactionDisposeFails)throw new IOException("synthetic cleanup failure");}
        base.Dispose(disposing);
    }
}
internal sealed class InboundCommand(InboundConnection owner):DbCommand
{
    private readonly RecordingParameters parameters=new();
    [AllowNull] public override string CommandText{get;set;}="";
    public override int CommandTimeout{get;set;}public override CommandType CommandType{get;set;}=CommandType.Text;
    public override bool DesignTimeVisible{get;set;}public override UpdateRowSource UpdatedRowSource{get;set;}
    protected override DbConnection? DbConnection{get=>owner;set=>throw new NotSupportedException();}
    protected override DbTransaction? DbTransaction{get;set;}
    protected override DbParameterCollection DbParameterCollection=>parameters;
    protected override DbParameter CreateDbParameter()=>new InboundParameter();
    public override void Cancel(){}public override void Prepare(){}public override object? ExecuteScalar()=>throw new NotSupportedException();
    private InboundTransaction Tx=>(InboundTransaction)DbTransaction!;
    private object P(string n)=>parameters[n].Value!;
    private string Tag=>CommandText switch
    {
        SqlLegacyBranchScope.NativeUserText => "native-user",
        SqlLegacyBranchScope.RestrictedText => "native-restricted",
        SqlLegacyBranchScope.CatalogShapeText => "catalog-shape",
        SqlLegacyBranchScope.CatalogText => "catalog",
        _ => Regex.Match(CommandText,@"inbound:([a-z-]+)").Groups[1].Value
    };
    private DataRow? Head=>Tx.Tables[0].Rows.Cast<DataRow>().SingleOrDefault(r=>Equals(r["DocumentID"],P("@document")));
    private DataRow? JournalRow=>Tx.Journal.Rows.Cast<DataRow>().SingleOrDefault(r=>new[]{("DatabaseBindingId","@binding"),("TenantId","@tenant"),
        ("CompanyId","@company"),("Actor","@actor"),("OperationId","@operation")}.All(p=>Equals(r[p.Item1],P(p.Item2))));
    protected override DbDataReader ExecuteDbDataReader(CommandBehavior behavior)
    {
        Assert.Same(owner,Tx.Connection);var tag=Tag;
        owner.Model.Event(tag=="snapshot" ? Tx.Business?"snapshot-after":"snapshot-before" : tag);
        if(tag=="snapshot" && Tx.Business)owner.Model.ReadbackMutation?.Invoke(Tx.Tables);
        if(tag is "user" or "grants" or "branches" or "native-user" or "native-restricted" or "catalog-shape" or "catalog")return owner.Model.SourceAuthority!.Read(this,tag);
        if(tag=="probe")return Tx.Journal.Clone().CreateDataReader();
        if(tag=="lookup"){var t=Tx.Journal.Clone();if(JournalRow is {} row)t.ImportRow(row);return t.CreateDataReader();}
        if(tag=="branch"){var t=InboundModel.Table(("DocumentID",typeof(string)),("BranchID",typeof(string)));if(Head is {} h)t.Rows.Add(h["DocumentID"],h["BranchID"]);return t.CreateDataReader();}
        if(tag=="snapshot")return new DataTableReader(Tx.Tables.Select(t=>
        {
            var answer=t.Clone();
            foreach(var r in t.Rows.Cast<DataRow>().Where(r=>owner.Model.SqlEqualChildren
                ? InboundAuthorityComparison.Equal(CommandText,"DocumentID","@document",(string)r["DocumentID"],(string)P("@document"))
                : Equals(r["DocumentID"],P("@document"))))answer.ImportRow(r);
            return answer;
        }).ToArray());
        throw new NotSupportedException("Unrecognized fixed query.");
    }
    public override int ExecuteNonQuery()
    {
        Assert.Same(owner,Tx.Connection);var tag=Tag;
        if(tag is not "reserve" and not "record"){Tx.Business=true;owner.Model.BusinessWrites++;}
        owner.Model.Event(tag);
        if(tag=="reserve")
        {if(JournalRow is not null)throw new IOException("synthetic duplicate");Tx.Journal.Rows.Add(P("@binding"),P("@tenant"),P("@company"),P("@actor"),P("@operation"),P("@intent"),P("@action"),P("@attempt"),0,P("@branch"),P("@document"),DBNull.Value,DBNull.Value,DBNull.Value,DBNull.Value,DBNull.Value);return 1;}
        if(tag=="record")
        {var r=JournalRow!;r["State"]=1;r["BranchId"]=P("@branch");r["DocumentId"]=P("@document");r["BeforeState"]=P("@before");r["AfterState"]=P("@after");r["StatusAfter"]=P("@status");r["AuditId"]=P("@audit");r["CommittedAtUtc"]=DateTime.UtcNow;return 1;}
        if(tag=="header" || tag=="create")
        {
            var h=Head;
            if(tag=="create"){if(h is not null)return 0;h=Tx.Tables[0].NewRow();h["DocumentID"]=P("@document");h["StatusID"]=0;h["QRPrintType"]="source-default";Tx.Tables[0].Rows.Add(h);}
            if(h is null || (int)h["StatusID"] is not 0 and not 1 || tag=="header" && !Equals(h["BranchID"],P("@branch")))return 0;
            foreach(var p in new[]{("DocumentDate","@date"),("OrderNumber","@order"),("InvoiceNo","@invoice"),("DeparturePoint","@departure"),
                ("DestinationPoint","@destination"),("OrderTypeID","@type"),("BranchID","@branch"),("ObjectID","@object"),("CurrencyID","@currency"),("RateExchange","@rate"),("Notes","@notes")})h[p.Item1]=P(p.Item2);
            return 1;
        }
        if(tag=="detail-delete")
        {var r=Tx.Tables[1].Rows.Cast<DataRow>().SingleOrDefault(r=>Equals(r["UserAutoID"],P("@row")) && Equals(r["DocumentID"],P("@document")));if(r is null)return 0;Tx.Tables[1].Rows.Remove(r);return 1;}
        if(tag is "detail-update" or "detail-insert")
        {
            var r=Tx.Tables[1].Rows.Cast<DataRow>().SingleOrDefault(r=>Equals(r["UserAutoID"],P("@row")) && Equals(r["DocumentID"],P("@document")));
            if(tag=="detail-insert"){r=Tx.Tables[1].NewRow();r["UserAutoID"]=P("@row");r["DocumentID"]=P("@document");Tx.Tables[1].Rows.Add(r);}if(r is null)return 0;
            var changed=tag=="detail-insert" || !Equals(r["SetQuantityByDocument"],P("@set")) || !Equals(r["UnitPrice"],P("@price"));
            foreach(var p in new[]{("ItemID","@item"),("LotNumberByDocument","@lot"),("SetQuantityByDocument","@set"),("BarrelQuantityByDocument","@barrel"),("ExpireDateByDocument","@expiry"),("UnitPrice","@price")})r[p.Item1]=P(p.Item2);
            if(changed){r["SourceAmount"]=Product(P("@set"),P("@price"));r["Amount"]=Product(P("@set"),P("@price"),P("@rate"));}return 1;
        }
        if(tag=="amounts"){var rows=Tx.Tables[1].Rows.Cast<DataRow>().Where(r=>Equals(r["DocumentID"],P("@document"))).ToArray();foreach(var r in rows)r["Amount"]=Product(r["SetQuantityByDocument"],r["UnitPrice"],P("@rate"));return rows.Length;}
        if(tag=="send"){if(Head is not {} h || (int)h["StatusID"] is not 0 and not 1 || !Equals(h["BranchID"],P("@branch")))return 0;h["StatusID"]=2;return 1;}
        if(tag=="legacy-log"){Tx.Tables[4].Rows.Add(Guid.NewGuid().ToString("D"),P("@document"),P("@actor"),2,P("@note"),new DateTime(2026,10,1));return 1;}
        throw new NotSupportedException("Unrecognized fixed mutation.");
    }
    private static object Product(params object[] values)=>values.Any(v=>v is DBNull)?DBNull.Value:
        decimal.Round(values.Cast<decimal>().Aggregate(1m,(a,b)=>a*b),0,MidpointRounding.AwayFromZero);
}
internal sealed class InboundParameter:DbParameter
{
    public override DbType DbType{get;set;}public override ParameterDirection Direction{get;set;}public override bool IsNullable{get;set;}
    [AllowNull] public override string ParameterName{get;set;}="";
    [AllowNull] public override string SourceColumn{get;set;}="";
    public override object? Value{get;set;}public override bool SourceColumnNullMapping{get;set;}public override int Size{get;set;}
    public override byte Precision{get;set;}public override byte Scale{get;set;}public override void ResetDbType(){}
}

public sealed class InboundDraftCollationTests
{
    [Theory]
    [InlineData(1,"doc-in-1")] [InlineData(1,"DOC-IN-1 ")]
    [InlineData(2,"doc-in-1")] [InlineData(2,"DOC-IN-1 ")]
    [InlineData(3,"doc-in-1")] [InlineData(3,"DOC-IN-1 ")]
    [InlineData(4,"doc-in-1")] [InlineData(4,"DOC-IN-1 ")]
    public async Task Sql_equal_child_aliases_are_observed_and_rejected_instead_of_hidden_from_the_token(int table,string alias)
    {
        var m=new InboundModel{SqlEqualChildren=true};var s=m.Service();var original=await m.Save(s);
        var row=m.Tables[table].NewRow();
        if(m.Tables[table].Rows.Count!=0)row.ItemArray=m.Tables[table].Rows[0].ItemArray.ToArray();
        row["UserAutoID"]="ALIASED-CHILD";row["DocumentID"]=alias;m.Tables[table].Rows.Add(row);
        var read=await s.ReadAsync("DOC-IN-1");
        Assert.Equal(InboundDraftOutcome.Unavailable,read.Outcome);Assert.Null(read.Document);
        Assert.Equal(InboundDraftOutcome.Unavailable,(await s.ExecuteAsync(original)).Outcome);
        Assert.Equal(0,m.BusinessWrites);
    }

    [Theory]
    [InlineData("direct-case")] [InlineData("direct-space")] [InlineData("group-case")]
    [InlineData("delegated-actor-case")] [InlineData("delegated-group-case")] [InlineData("menu-space")]
    public async Task Sql_equal_permission_aliases_cannot_grant_a_distinct_physical_actor_or_group(string alias)
    {
        var m=new InboundModel();var source=new InboundAuthorityComparison(m);
        source.Users.Add(new("SAMPLE-USER","OTHER",null,null));
        source.Groups.Add("OTHER");
        if(alias=="direct-case")source.Direct.Add(new("SAMPLE-USER","07011"));
        if(alias=="direct-space")source.Direct.Add(new("sample-user ","07011"));
        if(alias=="group-case")source.GroupRights.Add(new("group-a","07011"));
        if(alias=="delegated-actor-case")
        {source.Users.Add(new("delegate","OTHER","SAMPLE-USER",null));source.GroupRights.Add(new("OTHER","07011"));}
        if(alias=="delegated-group-case")
        {source.Users.Add(new("delegate","other","sample-user",null));source.GroupRights.Add(new("OTHER","07011"));}
        if(alias=="menu-space")source.Direct.Add(new("sample-user","07011 "));
        var result=await m.SourceService().ReadAsync("DOC-IN-1");
        Assert.Equal(InboundDraftOutcome.Denied,result.Outcome);Assert.Null(result.Document);Assert.Equal(0,m.BusinessWrites);
    }

    [Theory]
    [InlineData("case")] [InlineData("space")]
    public async Task Sql_equal_branch_owner_alias_cannot_expand_the_physical_actors_scope(string alias)
    {
        var m=new InboundModel();var source=new InboundAuthorityComparison(m);
        source.Direct.Add(new("sample-user","07011"));
        source.Branches.Add((alias=="case" ? "SAMPLE-USER" : "sample-user ","BR-B"));
        m.Tables[0].Rows[0]["BranchID"]="BR-B";
        var result=await m.SourceService().ReadAsync("DOC-IN-1");
        Assert.Equal(InboundDraftOutcome.Denied,result.Outcome);Assert.Null(result.Document);Assert.Equal(0,m.BusinessWrites);
    }

    [Theory]
    [InlineData("group-a")] [InlineData("GROUP-A ")]
    public async Task A_noncanonical_user_group_reference_is_denied_even_with_an_exact_direct_grant(string group)
    {
        var m=new InboundModel();var source=new InboundAuthorityComparison(m);
        source.Users[0]=source.Users[0] with{Group=group};source.BindIdentity(m);
        source.Direct.Add(new("sample-user","07011"));
        var result=await m.SourceService().ReadAsync("DOC-IN-1");
        Assert.Equal(InboundDraftOutcome.Denied,result.Outcome);Assert.Null(result.Document);
    }

    [Theory]
    [InlineData("direct")] [InlineData("group")] [InlineData("delegate")]
    public async Task Canonical_physical_permission_sources_still_authorize_the_concrete_workflow(string permission)
    {
        var m=new InboundModel();var source=new InboundAuthorityComparison(m);
        if(permission=="direct")source.Direct.Add(new("sample-user","07011"));
        if(permission=="group")source.GroupRights.Add(new("GROUP-A","07011"));
        if(permission=="delegate")
        {source.Groups.Add("DELEGATE");source.Users.Add(new("delegate","DELEGATE","sample-user",null));source.GroupRights.Add(new("DELEGATE","07011"));}
        var s=m.SourceService();var request=await m.Save(s);
        Assert.Equal(InboundDraftOutcome.Committed,(await s.ExecuteAsync(request)).Outcome);
    }
}

// Query-aware, deliberately bounded comparison model: identity keys are case sensitive;
// permission/delegation/branch references use case-insensitive, padded SQL equality.
// This is not a SQL Server emulator or evidence of a deployed/customer collation.
internal sealed class InboundAuthorityComparison
{
    internal sealed record User(string Name,string Group,string? Authority,string? Branch);
    internal sealed record Grant(string Owner,string Menu,bool Run=true,bool Update=true,bool Add=true);
    internal readonly List<User> Users=[new("sample-user","GROUP-A",null,"BR-A")];
    internal readonly HashSet<string> Groups=new(StringComparer.Ordinal){"GROUP-A"};
    internal readonly List<Grant> Direct=[],GroupRights=[];
    internal readonly List<(string Actor,string Branch)> Branches=[];
    internal const string Password="synthetic-source-password-value";
    internal string[] Catalog=["BR-A","BR-B"];
    internal bool CatalogQualified=true;
    internal int CatalogAlias;
    internal Func<string,DataTable,DataTable>? ChangeProjection;
    internal InboundAuthorityComparison(InboundModel model)
    {
        model.SourceAuthority=this;BindIdentity(model);
    }
    internal void BindIdentity(InboundModel model)
    {
        var stamp=typeof(LegacyIdentityAuthority).GetMethod("Stamp",BindingFlags.NonPublic|BindingFlags.Static)!;
        model.ActiveIdentity=InboundModel.Identity with{BranchIds=["BR-A","BR-B"],CredentialStamp=(string)stamp.Invoke(null,
            [new LegacyUser("sample-user","",Password,false,Users[0].Group,true)])!};
    }
    internal static bool Equal(string sql,string left,string right,string a,string b,bool defaultCaseSensitive=false)
    {
        var normalized=Regex.Replace(sql,@"\s+","");
        var l="CONVERT(nvarchar(max),"+left+")";var r="CONVERT(nvarchar(max),"+right+")";
        var binary=normalized.Contains(l+"COLLATELatin1_General_100_BIN2="+r+"COLLATELatin1_General_100_BIN2",StringComparison.Ordinal)
            || normalized.Contains(left+"COLLATELatin1_General_100_BIN2="+right+"COLLATELatin1_General_100_BIN2",StringComparison.Ordinal);
        var length=normalized.Contains("DATALENGTH("+l+")=DATALENGTH("+r+")",StringComparison.Ordinal)
            || normalized.Contains("DATALENGTH("+left+")=DATALENGTH("+right+")",StringComparison.Ordinal);
        if(length && a.Length!=b.Length)return false;
        return string.Equals(a.TrimEnd(' '),b.TrimEnd(' '),binary || defaultCaseSensitive ? StringComparison.Ordinal : StringComparison.OrdinalIgnoreCase);
    }
    internal DbDataReader Read(InboundCommand command,string tag)
    {
        var sql=command.CommandText;
        string P(string name)=>(string)command.Parameters[name].Value!;
        bool Eq(string left,string right,string a,string b,bool sensitive=false)=>Equal(sql,left,right,a,b,sensitive);
        DbDataReader Result(DataTable table) => (ChangeProjection?.Invoke(tag,table) ?? table).CreateDataReader();
        if(tag=="native-user")
        {
            var rows=InboundModel.Table(("UserName",typeof(string)),("Password",typeof(string)),("Disable",typeof(bool)),
                ("UserGroupID",typeof(string)),("IsDisable",typeof(bool)),("BranchID",typeof(string)));
            foreach(var user in Users.Where(u=>string.Equals(u.Name.TrimEnd(' '),P("@actor").TrimEnd(' '),StringComparison.OrdinalIgnoreCase)))
            {
                var validGroup=Groups.Contains(user.Group);
                rows.Rows.Add(user.Name,Password,false,user.Group,validGroup ? (object)false : DBNull.Value,(object?)user.Branch ?? DBNull.Value);
            }
            return Result(rows);
        }
        if(tag=="native-restricted")
        {
            var rows=InboundModel.Table(("BranchID",typeof(string)));
            foreach(var branch in Users.Where(u=>u.Name==P("@actor")).Select(u=>u.Branch)
                .Concat(Branches.Where(b=>b.Actor==P("@actor")).Select(b=>(string?)b.Branch)).Where(b=>!string.IsNullOrEmpty(b)))
                rows.Rows.Add(branch);
            return Result(rows);
        }
        if(tag=="catalog-shape")
        {var rows=InboundModel.Table(("ShapeOk",typeof(int)));rows.Rows.Add(CatalogQualified?1:0);return Result(rows);}
        if(tag=="catalog")
        {var rows=InboundModel.Table(("BranchID",typeof(string)),("IdentityAlias",typeof(int)));foreach(var b in Catalog)rows.Rows.Add(b,CatalogAlias);return Result(rows);}
        if(tag=="user")
        {
            var includeGroup=sql[..sql.IndexOf("FROM",StringComparison.Ordinal)].Contains("G.UserGroupID",StringComparison.Ordinal);
            var columns=new List<(string,Type)>{("UserName",typeof(string)),("Password",typeof(string)),("Disable",typeof(bool)),("UserGroupID",typeof(string)),("IsDisable",typeof(bool))};
            if(includeGroup)columns.Add(("PhysicalGroup",typeof(string)));
            var rows=InboundModel.Table(columns.ToArray());
            foreach(var user in Users.Where(u=>Eq("U.UserName","@actor",u.Name,P("@actor"),true)))
                foreach(var group in Groups.Where(g=>Eq("G.UserGroupID","U.UserGroupID",g,user.Group)))
                {
                    object[] values=includeGroup ? [user.Name,Password,false,user.Group,false,group] : [user.Name,Password,false,user.Group,false];
                    rows.Rows.Add(values);
                }
            return Result(rows);
        }
        if(tag=="grants")
        {
            var actor=P("@username");var group=P("@group");
            bool Right(Grant grant) => grant.Run && ((bool)command.Parameters["@create"].Value! ? grant.Add : grant.Update);
            var allowed=Direct.Any(p=>Right(p) && Eq("P.UserName","@username",p.Owner,actor) && Eq("P.MenuID","M.MenuID",p.Menu,P("@menu")))
                || GroupRights.Any(p=>Right(p) && Eq("P.UserGroupID","@group",p.Owner,group) && Eq("P.MenuID","M.MenuID",p.Menu,P("@menu")))
                || Users.Any(u=>u.Authority is not null && Eq("U.UserAuthority","@username",u.Authority,actor)
                    && Groups.Any(g=>Eq("G.UserGroupID","U.UserGroupID",g,u.Group))
                    && GroupRights.Any(p=>Right(p) && Eq("U.UserGroupID","P.UserGroupID",u.Group,p.Owner) && Eq("P.MenuID","M.MenuID",p.Menu,P("@menu"))));
            var rows=InboundModel.Table(("MenuID",typeof(string)),("FormName",typeof(string)),("Para",typeof(string)),("isDisable",typeof(bool)),("Granted",typeof(int)));
            rows.Rows.Add("07011","IV_InboundRequestFrm",DBNull.Value,false,allowed?1:0);return Result(rows);
        }
        if(tag=="branches")
        {
            var rows=InboundModel.Table(("BranchID",typeof(string)));
            var matches=Users.Where(u=>Eq("U.UserName","@actor",u.Name,P("@actor"),true)).Select(u=>u.Branch)
                .Concat(Branches.Where(b=>Eq("B.UserName","@actor",b.Actor,P("@actor"))).Select(b=>(string?)b.Branch))
                .Where(b=>!string.IsNullOrEmpty(b)).Distinct(StringComparer.Ordinal);
            foreach(var branch in matches)rows.Rows.Add(branch);return rows.CreateDataReader();
        }
        throw new NotSupportedException("Unsupported authority query.");
    }
}
