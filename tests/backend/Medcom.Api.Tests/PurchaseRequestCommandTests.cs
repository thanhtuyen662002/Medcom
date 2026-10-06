using System.Text.Json;
using Medcom.Application.PurchaseRequests;
using Medcom.Contracts;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class PurchaseRequestCommandTests
{
    [Fact]
    public async Task Concrete_sql_service_creates_atomic_draft_persists_receipt_then_replays_without_allocator()
    {
        var db=new PurchaseRecordingModel(); var service=db.Service();
        var answer=await service.CreateAsync(PurchaseFixtures.Create);
        Assert.Equal(PurchaseRequestCommandOutcome.Committed,answer.Outcome);
        Assert.Equal(1,answer.Receipt!.Document.StatusId); Assert.False(answer.Receipt.Document.IsLocked);
        Assert.Equal(2,db.Commits); Assert.Equal(1,db.AllocatorCalls); Assert.Single(db.Documents); Assert.Single(db.Journal);
        Assert.Equal("15.00",answer.Receipt.Document.Header.Price);
        Assert.Equal("13",answer.Receipt.Document.Lines[0].Values.TotalPrice); // no guessed quantity*price rule.
        Assert.All(db.Commands,c=>Assert.NotNull(c.Transaction));
        var receipt=JsonSerializer.Serialize(answer.Receipt,PurchaseRequestCommandRules.Json);
        db.AllocatorQualified=false;
        var replay=await service.CreateAsync(PurchaseFixtures.Create);
        Assert.Equal(PurchaseRequestCommandOutcome.Replayed,replay.Outcome);
        Assert.Equal(receipt,JsonSerializer.Serialize(replay.Receipt,PurchaseRequestCommandRules.Json)); Assert.Equal(1,db.AllocatorCalls);
    }
    [Fact]
    public async Task New_create_and_configured_submit_runs_in_one_business_transaction_without_existing_history()
    {
        var db=new PurchaseRecordingModel();
        var answer=await db.Service().CreateAsync(PurchaseFixtures.Create with { SubmitAfterCreate=true });
        Assert.Equal(PurchaseRequestCommandOutcome.Committed,answer.Outcome); Assert.Equal(2,answer.Receipt!.Document.StatusId);
        Assert.True(answer.Receipt.Document.IsLocked); Assert.Equal(1,db.SubmitEffects);
        Assert.True(db.Events.IndexOf("0:commit-ack")<db.Events.IndexOf("1:insert-head"));
        Assert.True(db.Events.IndexOf("1:insert-head")<db.Events.IndexOf("1:submit"));
        Assert.True(db.Events.IndexOf("1:receipt-read")<db.Events.IndexOf("1:commit-before"));
        Assert.DoesNotContain(db.Commands,c=>c.CommandText.Contains("AP_Order",StringComparison.Ordinal));
    }
    [Fact]
    public async Task Save_uses_state_equality_explicit_changes_and_preserves_omitted_lines()
    {
        var db=new PurchaseRecordingModel(); db.Seed(2);
        var current=db.Documents[PurchaseFixtures.DocumentId];
        var changes=new PurchaseRequestLineChange[] {
            new(PurchaseRequestLineChangeKind.Update,"line-1",null,PurchaseFixtures.Values with { Quantity="-2",TotalPrice=null }),
            new(PurchaseRequestLineChangeKind.Add,null,"new-line",PurchaseFixtures.Values) };
        var request=new SavePurchaseRequestDraft("save-1","B1",PurchaseFixtures.DocumentId,
            PurchaseRequestCommandRules.EqualityToken(current),PurchaseFixtures.Header with { Notes="synthetic update" },changes);
        var result=await db.Service().SaveAsync(request);
        Assert.Equal(PurchaseRequestCommandOutcome.Committed,result.Outcome); Assert.Equal(3,result.Receipt!.Document.Lines.Count);
        Assert.Equal("-2",result.Receipt.Document.Lines.Single(l=>l.LineId=="line-1").Values.Quantity);
        Assert.Equal(current.Lines.Single(l=>l.LineId=="line-2"),result.Receipt.Document.Lines.Single(l=>l.LineId=="line-2"));
        Assert.Equal(1,result.Receipt.Document.StatusId); Assert.Equal(0,db.SubmitEffects);
        Assert.DoesNotContain(db.Commands,c=>c.CommandText.Contains("DELETE dbo.AP_PurchaseRequestTbl",StringComparison.Ordinal));
    }
    [Fact]
    public async Task Explicit_remove_is_scoped_to_owned_detail_and_omission_is_not_delete()
    {
        var db=new PurchaseRecordingModel(); db.Seed(2); var current=db.Documents[PurchaseFixtures.DocumentId];
        var result=await db.Service().SaveAsync(new("remove-1","B1",PurchaseFixtures.DocumentId,
            PurchaseRequestCommandRules.EqualityToken(current),PurchaseFixtures.Header,
            [new(PurchaseRequestLineChangeKind.Remove,"line-1",null,null)]));
        Assert.Equal(PurchaseRequestCommandOutcome.Committed,result.Outcome);
        Assert.Equal("line-2",Assert.Single(result.Receipt!.Document.Lines).LineId);
        Assert.Equal(0,db.AllocatorCalls);
    }
    [Fact]
    public async Task Existing_unlocked_null_lock_is_preserved_by_save_and_submit_sets_lock()
    {
        var db=new PurchaseRecordingModel(); db.Seed();
        db.Documents[PurchaseFixtures.DocumentId]=db.Documents[PurchaseFixtures.DocumentId] with { IsLocked=null };
        var current=db.Documents[PurchaseFixtures.DocumentId];
        var saved=await db.Service().SaveAsync(new("save-null","B1",PurchaseFixtures.DocumentId,
            PurchaseRequestCommandRules.EqualityToken(current),PurchaseFixtures.Header,[]));
        Assert.Equal(PurchaseRequestCommandOutcome.Committed,saved.Outcome); Assert.Null(saved.Receipt!.Document.IsLocked);
        var submitted=await db.Service().SubmitAsync(new("submit-null","B1",PurchaseFixtures.DocumentId,saved.Receipt.StateToken));
        Assert.Equal(PurchaseRequestCommandOutcome.Committed,submitted.Outcome); Assert.True(submitted.Receipt!.Document.IsLocked);
    }
    [Theory]
    [InlineData(2,false)] [InlineData(3,false)] [InlineData(4,false)] [InlineData(5,false)] [InlineData(1,true)]
    public async Task Existing_non_draft_or_locked_document_is_not_silently_admitted(int status,bool locked)
    {
        var db=new PurchaseRecordingModel(); db.Seed();
        var current=db.Documents[PurchaseFixtures.DocumentId] with { StatusId=status,IsLocked=locked };
        db.Documents[PurchaseFixtures.DocumentId]=current;
        var result=await db.Service().SubmitAsync(new("submit-state","B1",PurchaseFixtures.DocumentId,PurchaseRequestCommandRules.EqualityToken(current)));
        Assert.Equal(PurchaseRequestCommandOutcome.Conflict,result.Outcome); Assert.Empty(db.Journal); Assert.Equal(0,db.SubmitEffects);
    }
    [Theory]
    [InlineData("add")] [InlineData("update")] [InlineData("parent")] [InlineData("menu")] [InlineData("branch")] [InlineData("credential")]
    public async Task Fresh_sql_authority_denies_missing_action_branch_menu_or_credential(string kind)
    {
        var db=new PurchaseRecordingModel { Denial=kind };
        var result=await db.Service().CreateAsync(PurchaseFixtures.Create with { SubmitAfterCreate=true });
        Assert.Equal(PurchaseRequestCommandOutcome.Denied,result.Outcome); Assert.Empty(db.Documents); Assert.Empty(db.Journal); Assert.Equal(0,db.AllocatorCalls);
    }
    [Theory]
    [InlineData(1)] [InlineData(2)] [InlineData(3)] [InlineData(4)] [InlineData(5)]
    public async Task Live_session_revocation_before_each_authority_fence_never_returns_success(int call)
    {
        var db=new PurchaseRecordingModel { RevokeAt=call };
        var answer=await db.Service().CreateAsync(PurchaseFixtures.Create);
        Assert.Equal(PurchaseRequestCommandOutcome.Denied,answer.Outcome); Assert.Null(answer.Receipt); Assert.Empty(db.Documents);
    }
    [Fact]
    public async Task Authority_version_change_between_reservation_and_write_denies_without_overwriting_source()
    {
        var db=new PurchaseRecordingModel { VersionChangeAt=3 };
        var result=await db.Service().CreateAsync(PurchaseFixtures.Create);
        Assert.Equal(PurchaseRequestCommandOutcome.Denied,result.Outcome); Assert.Empty(db.Documents); Assert.Single(db.Journal);
    }
    [Fact]
    public async Task Pending_slot_cannot_be_resumed_by_another_invocation_or_after_lost_reservation_ack()
    {
        var db=new PurchaseRecordingModel { Fault="0:commit-ack" };
        var result=await db.Service().CreateAsync(PurchaseFixtures.Create);
        Assert.Equal(PurchaseRequestCommandOutcome.OutcomeUnknown,result.Outcome); Assert.Single(db.Journal); Assert.Empty(db.Documents);
        db.Fault=null;
        Assert.Equal(PurchaseRequestCommandOutcome.OutcomeUnknown,(await db.Service().CreateAsync(PurchaseFixtures.Create)).Outcome);
        Assert.Equal(0,db.AllocatorCalls);
    }
    [Fact]
    public async Task Same_slot_changed_intent_conflicts_and_padded_binary_identity_is_rejected()
    {
        var db=new PurchaseRecordingModel();
        Assert.Equal(PurchaseRequestCommandOutcome.Committed,(await db.Service().CreateAsync(PurchaseFixtures.Create)).Outcome);
        var changed=PurchaseFixtures.Create with { Header=PurchaseFixtures.Header with { Price="16" } };
        Assert.Equal(PurchaseRequestCommandOutcome.Conflict,(await db.Service().CreateAsync(changed)).Outcome);
        db.CorruptKey=true;
        Assert.Equal(PurchaseRequestCommandOutcome.Unavailable,(await db.Service().CreateAsync(PurchaseFixtures.Create)).Outcome);
        Assert.Single(db.Documents); Assert.Equal(1,db.AllocatorCalls);
    }
    [Fact]
    public async Task Stale_state_token_and_foreign_detail_identity_conflict_before_reservation()
    {
        var db=new PurchaseRecordingModel(); db.Seed(); var current=db.Documents[PurchaseFixtures.DocumentId];
        var stale=PurchaseRequestCommandRules.EqualityToken(current with { Header=current.Header with { Notes="stale" } });
        Assert.Equal(PurchaseRequestCommandOutcome.Conflict,(await db.Service().SaveAsync(new("save-stale","B1",PurchaseFixtures.DocumentId,stale,PurchaseFixtures.Header,[]))).Outcome);
        Assert.Equal(PurchaseRequestCommandOutcome.Conflict,(await db.Service().SaveAsync(new("save-foreign","B1",PurchaseFixtures.DocumentId,
            PurchaseRequestCommandRules.EqualityToken(current),PurchaseFixtures.Header,[new(PurchaseRequestLineChangeKind.Remove,"foreign-line",null,null)]))).Outcome);
        Assert.Empty(db.Journal);
    }
    [Theory]
    [InlineData("0:open")] [InlineData("0:begin")] [InlineData("0:credential")] [InlineData("0:probe")]
    [InlineData("0:lookup")] [InlineData("0:reserve")] [InlineData("0:commit-before")] [InlineData("0:commit-ack")]
    [InlineData("1:open")] [InlineData("1:begin")] [InlineData("1:credential")] [InlineData("1:probe")]
    [InlineData("1:allocate")] [InlineData("1:insert-head")] [InlineData("1:insert-line")] [InlineData("1:submit")]
    [InlineData("1:readback")] [InlineData("1:complete")] [InlineData("1:receipt-read")] [InlineData("1:commit-before")]
    public async Task Recording_faults_exercise_real_orchestrator_and_never_fabricate_commit_or_retry(string fault)
    {
        var db=new PurchaseRecordingModel { Fault=fault };
        var result=await db.Service().CreateAsync(PurchaseFixtures.Create with { SubmitAfterCreate=true });
        Assert.NotEqual(PurchaseRequestCommandOutcome.Committed,result.Outcome); Assert.Null(result.Receipt); Assert.Empty(db.Documents);
        Assert.InRange(db.AllocatorCalls,0,1); Assert.InRange(db.SubmitEffects,0,1);
    }
    [Fact]
    public async Task Lost_business_commit_ack_replays_original_persisted_receipt_without_second_dispatch()
    {
        var db=new PurchaseRecordingModel { Fault="1:commit-ack" };
        Assert.Equal(PurchaseRequestCommandOutcome.OutcomeUnknown,(await db.Service().CreateAsync(PurchaseFixtures.Create)).Outcome);
        Assert.Single(db.Documents); Assert.Single(db.Journal); db.Fault=null;
        Assert.Equal(PurchaseRequestCommandOutcome.Replayed,(await db.Service().CreateAsync(PurchaseFixtures.Create)).Outcome);
        Assert.Single(db.Documents); Assert.Equal(1,db.AllocatorCalls);
    }
    [Fact]
    public async Task Runtime_and_numbering_gates_are_explicit_and_have_no_source_write_or_number_guess()
    {
        var db=new PurchaseRecordingModel();
        Assert.Equal(PurchaseRequestCommandOutcome.QualificationRequired,(await db.Service(false).CreateAsync(PurchaseFixtures.Create)).Outcome);
        Assert.Empty(db.Commands); db.AllocatorQualified=false;
        Assert.Equal(PurchaseRequestCommandOutcome.QualificationRequired,(await db.Service().CreateAsync(PurchaseFixtures.Create)).Outcome);
        Assert.Empty(db.Journal); Assert.Empty(db.Documents); Assert.Equal(0,db.AllocatorCalls);
    }
    [Fact]
    public async Task Replay_rechecks_native_authority_and_current_document_branch_before_disclosing_original_receipt()
    {
        var db=new PurchaseRecordingModel(); var service=db.Service();
        Assert.Equal(PurchaseRequestCommandOutcome.Committed,(await service.CreateAsync(PurchaseFixtures.Create)).Outcome);
        db.Denial="add";
        var denied=await service.CreateAsync(PurchaseFixtures.Create);
        Assert.Equal(PurchaseRequestCommandOutcome.Denied,denied.Outcome); Assert.Null(denied.Receipt);
        db.Denial=null;
        db.Documents[PurchaseFixtures.DocumentId]=db.Documents[PurchaseFixtures.DocumentId] with { BranchId="B2" };
        var foreign=await service.CreateAsync(PurchaseFixtures.Create);
        Assert.Equal(PurchaseRequestCommandOutcome.Conflict,foreign.Outcome); Assert.Null(foreign.Receipt);
        Assert.Equal(1,db.AllocatorCalls); Assert.Single(db.Journal);
    }
    [Theory]
    [InlineData("update-head")] [InlineData("update-line")] [InlineData("delete-line")]
    public async Task Failed_existing_save_preserves_original_header_and_all_details(string stage)
    {
        var db=new PurchaseRecordingModel { Fault="1:"+stage }; db.Seed(3);
        var current=db.Documents[PurchaseFixtures.DocumentId];
        var original=JsonSerializer.Serialize(current,PurchaseRequestCommandRules.Json);
        var changes=new PurchaseRequestLineChange[] {
            new(PurchaseRequestLineChangeKind.Update,"line-1",null,PurchaseFixtures.Values with { Quantity="20" }),
            new(PurchaseRequestLineChangeKind.Remove,"line-2",null,null) };
        var result=await db.Service().SaveAsync(new("save-fault","B1",PurchaseFixtures.DocumentId,
            PurchaseRequestCommandRules.EqualityToken(current),PurchaseFixtures.Header with { Notes="must roll back" },changes));
        Assert.Equal(PurchaseRequestCommandOutcome.Unavailable,result.Outcome); Assert.Null(result.Receipt);
        Assert.Equal(original,JsonSerializer.Serialize(db.Documents[PurchaseFixtures.DocumentId],PurchaseRequestCommandRules.Json));
        Assert.All(db.Journal.Values,e=>Assert.Equal((byte)0,e.State));
    }
}
