using System.Text.Json;
using System.Data.Common;
using Medcom.Application;
using Medcom.Application.PurchaseRequests;
using Medcom.Contracts;
using Medcom.Infrastructure.PurchaseRequests;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class PurchaseRequestCommandTests
{
    [Theory]
    [InlineData("create")] [InlineData("create-submit")] [InlineData("save")] [InlineData("submit")]
    public async Task Lookup_returns_original_receipt_after_later_edit_without_any_dispatch(string action)
    {
        var db=new PurchaseRecordingModel();
        if(action is "save" or "submit") db.Seed();
        var save=SaveIntent(db); var submit=SubmitIntent(db);
        var create=PurchaseFixtures.Create with { SubmitAfterCreate=action=="create-submit" };
        var committed=action switch {
            "save"=>await db.Service().SaveAsync(save), "submit"=>await db.Service().SubmitAsync(submit),
            _=>await db.Service().CreateAsync(create) };
        Assert.Equal(PurchaseRequestCommandOutcome.Committed,committed.Outcome);
        var receipt=JsonSerializer.Serialize(committed.Receipt,PurchaseRequestCommandRules.Json);
        var current=db.Documents[PurchaseFixtures.DocumentId];
        db.Documents[PurchaseFixtures.DocumentId]=current with { Header=current.Header with { Notes="later synthetic edit" } };
        Assert.NotEqual(committed.Receipt!.StateToken,PurchaseRequestCommandRules.EqualityToken(db.Documents[PurchaseFixtures.DocumentId]));
        db.Commands.Clear(); db.Events.Clear(); var commits=db.Commits; var allocations=db.AllocatorCalls; var journal=JournalState(db);
        var allocator=new LookupForbiddenAllocator(); var service=LookupService(db,allocator);
        var observed=action switch {
            "save"=>await service.LookupAsync(save), "submit"=>await service.LookupAsync(submit),
            _=>await service.LookupAsync(create) };
        Assert.Equal(PurchaseRequestLookupOutcome.Committed,observed.Outcome);
        Assert.Equal(receipt,JsonSerializer.Serialize(observed.Receipt,PurchaseRequestCommandRules.Json));
        Assert.Equal(journal,JournalState(db)); Assert.Equal(commits,db.Commits); Assert.Equal(allocations,db.AllocatorCalls);
        AssertLookupOnly(db,allocator);
    }
    [Fact]
    public async Task Lookup_resolves_lost_business_commit_ack_without_retrying_the_command()
    {
        var db=new PurchaseRecordingModel { Fault="1:commit-ack" };
        Assert.Equal(PurchaseRequestCommandOutcome.OutcomeUnknown,(await db.Service().CreateAsync(PurchaseFixtures.Create)).Outcome);
        db.Fault=null; db.Commands.Clear(); db.Events.Clear(); var allocator=new LookupForbiddenAllocator();
        var observed=await LookupService(db,allocator).LookupAsync(PurchaseFixtures.Create);
        Assert.Equal(PurchaseRequestLookupOutcome.Committed,observed.Outcome); Assert.NotNull(observed.Receipt);
        Assert.Single(db.Documents); Assert.Equal(1,db.AllocatorCalls); Assert.Equal(2,db.Commits); AssertLookupOnly(db,allocator);
    }
    [Theory]
    [InlineData("create-submit")] [InlineData("save")] [InlineData("submit")]
    public async Task Lookup_other_original_operations_observe_pending_without_reservation_or_allocator(string action)
    {
        var db=new PurchaseRecordingModel { Fault="0:commit-ack" }; db.Seed(); var save=SaveIntent(db); var submit=SubmitIntent(db);
        var create=PurchaseFixtures.Create with { SubmitAfterCreate=true };
        var original=action switch {
            "save"=>await db.Service().SaveAsync(save), "submit"=>await db.Service().SubmitAsync(submit),
            _=>await db.Service().CreateAsync(create) };
        Assert.Equal(PurchaseRequestCommandOutcome.OutcomeUnknown,original.Outcome);
        db.Fault=null; db.Commands.Clear(); db.Events.Clear(); var journal=JournalState(db); var allocator=new LookupForbiddenAllocator(); var service=LookupService(db,allocator);
        var result=action switch {
            "save"=>await service.LookupAsync(save), "submit"=>await service.LookupAsync(submit),
            _=>await service.LookupAsync(create) };
        Assert.Equal(PurchaseRequestLookupOutcome.Pending,result.Outcome); Assert.Null(result.Receipt);
        Assert.Equal(journal,JournalState(db)); Assert.Equal(1,db.Commits); AssertLookupOnly(db,allocator);
    }
    [Theory]
    [InlineData("create","add")] [InlineData("create-submit","add")] [InlineData("create-submit","update")]
    [InlineData("save","update")] [InlineData("submit","update")]
    public async Task Lookup_preserves_original_action_grants_even_for_negative_observations(string action,string denial)
    {
        var db=new PurchaseRecordingModel { Denial=denial }; db.Seed(); var allocator=new LookupForbiddenAllocator(); var service=LookupService(db,allocator);
        var result=action switch {
            "save"=>await service.LookupAsync(SaveIntent(db)), "submit"=>await service.LookupAsync(SubmitIntent(db)),
            _=>await service.LookupAsync(PurchaseFixtures.Create with { SubmitAfterCreate=action=="create-submit" }) };
        Assert.Equal(PurchaseRequestLookupOutcome.Denied,result.Outcome); Assert.Null(result.Receipt);
        Assert.DoesNotContain(db.Commands,c=>c.CommandText==PurchaseRequestSql.LookupText); AssertLookupOnly(db,allocator);
    }
    [Fact]
    public async Task Lookup_absent_can_race_original_reservation_and_then_observe_pending_without_resuming()
    {
        var db=new PurchaseRecordingModel(); var gate=new TaskCompletionSource<AuthoritativeIdentity?>(TaskCreationOptions.RunContinuationsAsynchronously);
        db.FirstSession=gate.Task;
        var original=db.Service().CreateAsync(PurchaseFixtures.Create); // Already in flight before the negative observation.
        var allocator=new LookupForbiddenAllocator(); var service=LookupService(db,allocator);
        Assert.Equal(PurchaseRequestLookupOutcome.Absent,(await service.LookupAsync(PurchaseFixtures.Create)).Outcome);
        Assert.Empty(db.Journal); Assert.False(original.IsCompleted); Assert.Equal(0,db.Commits); AssertLookupOnly(db,allocator);
        db.Fault=db.Connections+":commit-ack"; gate.SetResult(PurchaseFixtures.Identity());
        Assert.Equal(PurchaseRequestCommandOutcome.OutcomeUnknown,(await original).Outcome);
        Assert.Equal((byte)0,Assert.Single(db.Journal.Values).State); Assert.Empty(db.Documents);
        db.Fault=null; db.Commands.Clear(); db.Events.Clear(); var journal=JournalState(db); var commits=db.Commits;
        var pending=await service.LookupAsync(PurchaseFixtures.Create);
        Assert.Equal(PurchaseRequestLookupOutcome.Pending,pending.Outcome); Assert.Null(pending.Receipt);
        Assert.Equal(journal,JournalState(db)); Assert.Equal(commits,db.Commits); Assert.Empty(db.Documents); AssertLookupOnly(db,allocator);
    }
    [Theory]
    [InlineData("save")] [InlineData("submit")]
    public async Task Existing_original_DTO_lookup_is_absent_without_validating_or_dispatching_current_draft(string action)
    {
        var db=new PurchaseRecordingModel(); db.Seed(); var save=SaveIntent(db); var submit=SubmitIntent(db);
        db.Documents.Clear(); var allocator=new LookupForbiddenAllocator(); var service=LookupService(db,allocator);
        var result=action=="save" ? await service.LookupAsync(save) : await service.LookupAsync(submit);
        Assert.Equal(PurchaseRequestLookupOutcome.Absent,result.Outcome); Assert.Null(result.Receipt);
        Assert.Empty(db.Documents); Assert.Empty(db.Journal); Assert.Equal(0,db.Commits); AssertLookupOnly(db,allocator);
    }
    [Theory]
    [InlineData("key")] [InlineData("slot")] [InlineData("binding-key")] [InlineData("receipt-json")]
    [InlineData("receipt-token")] [InlineData("receipt-action")] [InlineData("receipt-branch")]
    [InlineData("receipt-key")] [InlineData("aggregate")] [InlineData("document")]
    [InlineData("attempt")] [InlineData("state")] [InlineData("intent")] [InlineData("pending-shape")]
    public async Task Lookup_full_bytes_and_corrupted_receipt_fail_closed_without_any_dispatch(string corruption)
    {
        var db=new PurchaseRecordingModel(); var original=await db.Service().CreateAsync(PurchaseFixtures.Create);
        var pair=Assert.Single(db.Journal); var e=pair.Value; var r=original.Receipt!;
        db.Journal[pair.Key]=corruption switch {
            "key"=>e with { Key=e.Key.Concat(new byte[]{0}).ToArray() },
            "slot"=>e with { Slot=e.Slot.Concat(new byte[]{0}).ToArray() },
            "binding-key"=>e with { Key=e.Key.Select((b,i)=>i==1 ? (byte)(b^1) : b).ToArray() },
            "receipt-json"=>e with { Receipt="{\"unexpected\":true}" },
            "receipt-token"=>e with { Receipt=JsonSerializer.Serialize(r with { StateToken="prs1."+new string('0',64) },PurchaseRequestCommandRules.Json) },
            "receipt-action"=>e with { Receipt=JsonSerializer.Serialize(r with { ActionId=PurchaseRequestCommandRules.SubmitAction },PurchaseRequestCommandRules.Json) },
            "receipt-branch"=>e with { Receipt=JsonSerializer.Serialize(r with { Document=r.Document with { BranchId="B2" },StateToken=PurchaseRequestCommandRules.EqualityToken(r.Document with { BranchId="B2" }) },PurchaseRequestCommandRules.Json) },
            "receipt-key"=>e with { Receipt=JsonSerializer.Serialize(r with { IdempotencyKey="other-intent" },PurchaseRequestCommandRules.Json) },
            "aggregate"=>e with { Aggregate=e.Aggregate!.Concat(new byte[]{0}).ToArray() },
            "document"=>e with { Document="other-document" },
            "attempt"=>e with { Attempt=Guid.Empty }, "state"=>e with { State=2 }, "pending-shape"=>e with { State=0 },
            _=>e with { Intent=e.Intent.Concat(new byte[]{0}).ToArray() } };
        db.Commands.Clear(); db.Events.Clear(); var journal=JournalState(db); var allocator=new LookupForbiddenAllocator();
        var result=await LookupService(db,allocator).LookupAsync(PurchaseFixtures.Create);
        Assert.Equal(corruption=="intent" ? PurchaseRequestLookupOutcome.Conflict : PurchaseRequestLookupOutcome.Unavailable,result.Outcome);
        Assert.Null(result.Receipt); Assert.Equal(journal,JournalState(db)); Assert.Equal(2,db.Commits); AssertLookupOnly(db,allocator);
    }
    [Fact]
    public async Task Lookup_changed_original_intent_conflicts_and_different_action_is_an_independent_absence()
    {
        var db=new PurchaseRecordingModel(); await db.Service().CreateAsync(PurchaseFixtures.Create);
        db.Commands.Clear(); db.Events.Clear(); var allocator=new LookupForbiddenAllocator(); var service=LookupService(db,allocator);
        var changed=await service.LookupAsync(PurchaseFixtures.Create with { Header=PurchaseFixtures.Header with { Price="16" } });
        Assert.Equal(PurchaseRequestLookupOutcome.Conflict,changed.Outcome); Assert.Null(changed.Receipt);
        Assert.Equal(PurchaseRequestLookupOutcome.Absent,(await service.LookupAsync(PurchaseFixtures.Create with { SubmitAfterCreate=true })).Outcome);
        Assert.Equal(2,db.Commits); Assert.Single(db.Journal); AssertLookupOnly(db,allocator);
    }
    [Theory]
    [InlineData("case")] [InlineData("accent")] [InlineData("space")]
    public async Task Lookup_rejects_related_physical_FK_aliases_without_disclosing_receipt(string alias)
    {
        var db=new PurchaseRecordingModel(); await db.Service().CreateAsync(PurchaseFixtures.Create);
        db.RelatedAlias=new(PurchaseSqlComparisonModel.Alias(PurchaseFixtures.DocumentId,alias),new("alias-line",PurchaseFixtures.Values));
        db.Commands.Clear(); db.Events.Clear(); var allocator=new LookupForbiddenAllocator();
        var result=await LookupService(db,allocator).LookupAsync(PurchaseFixtures.Create);
        Assert.Equal(PurchaseRequestLookupOutcome.Conflict,result.Outcome); Assert.Null(result.Receipt);
        Assert.Equal(1,db.RelatedAliasReads); Assert.Equal(2,db.Commits); AssertLookupOnly(db,allocator);
    }
    [Theory]
    [InlineData("actor","case")] [InlineData("actor","accent")] [InlineData("actor","space")] [InlineData("actor","zero")]
    [InlineData("group","zero")] [InlineData("delegation","case")] [InlineData("actor-menu","space")]
    public async Task Lookup_native_physical_grant_alias_cannot_borrow_cached_receipt(string route,string alias)
    {
        var db=new PurchaseRecordingModel(); await db.Service().CreateAsync(PurchaseFixtures.Create);
        db.PhysicalGrant=PurchaseGrantFixture.For(route,alias); db.Commands.Clear(); db.Events.Clear(); var allocator=new LookupForbiddenAllocator();
        var result=await LookupService(db,allocator).LookupAsync(PurchaseFixtures.Create);
        Assert.Equal(PurchaseRequestLookupOutcome.Denied,result.Outcome); Assert.Null(result.Receipt); AssertLookupOnly(db,allocator);
    }
    [Theory]
    [InlineData("actor")] [InlineData("tenant")] [InlineData("company")] [InlineData("credential")] [InlineData("branch")]
    public async Task Lookup_initial_live_scope_cannot_disclose_another_actor_or_company_receipt(string change)
    {
        var db=new PurchaseRecordingModel(); await db.Service().CreateAsync(PurchaseFixtures.Create);
        var id=PurchaseFixtures.Identity(); id=change switch {
            "actor"=>id with { PrincipalId="other.actor" }, "tenant"=>id with { TenantId="other.tenant" },
            "company"=>id with { CompanyId="other.company" }, "credential"=>id with { CredentialStamp="changed" },
            _=>id with { BranchIds=["B2"] } };
        db.Commands.Clear(); db.Events.Clear(); var allocator=new LookupForbiddenAllocator();
        var result=await LookupService(db,allocator,_=>Task.FromResult<AuthoritativeIdentity?>(id)).LookupAsync(PurchaseFixtures.Create);
        Assert.Equal(PurchaseRequestLookupOutcome.Denied,result.Outcome); Assert.Null(result.Receipt); AssertLookupOnly(db,allocator);
    }
    [Theory]
    [InlineData("committed","revoke")] [InlineData("pending","revoke")] [InlineData("absent","revoke")]
    [InlineData("committed","version")] [InlineData("pending","actor")] [InlineData("absent","tenant")]
    [InlineData("committed","company")] [InlineData("pending","credential")] [InlineData("absent","branch")]
    [InlineData("committed","grant")] [InlineData("committed","cancel")]
    public async Task Lookup_fences_late_revocation_scope_changes_and_cancellation_including_negative_observations(string state,string change)
    {
        var db=new PurchaseRecordingModel();
        if(state!="absent") { if(state=="pending") db.Fault="0:commit-ack"; await db.Service().CreateAsync(PurchaseFixtures.Create); db.Fault=null; }
        using var cancelled=new CancellationTokenSource(); var calls=0;
        Task<AuthoritativeIdentity?> Resolve(CancellationToken token)
        {
            var id=PurchaseFixtures.Identity(); if(++calls==1) return Task.FromResult<AuthoritativeIdentity?>(id);
            if(change=="revoke") return Task.FromResult<AuthoritativeIdentity?>(null);
            if(change=="grant") db.Denial="add";
            if(change=="cancel") cancelled.Cancel();
            id=change switch {
                "version"=>id with { AuthorityVersion=2 }, "actor"=>id with { PrincipalId="other.actor" },
                "tenant"=>id with { TenantId="other.tenant" }, "company"=>id with { CompanyId="other.company" },
                "credential"=>id with { CredentialStamp="changed" }, "branch"=>id with { BranchIds=["B2"] },_=>id };
            return Task.FromResult<AuthoritativeIdentity?>(id);
        }
        db.Commands.Clear(); db.Events.Clear(); var journal=JournalState(db); var allocator=new LookupForbiddenAllocator();
        var result=await LookupService(db,allocator,Resolve).LookupAsync(PurchaseFixtures.Create,cancelled.Token);
        Assert.Equal(change=="cancel" ? PurchaseRequestLookupOutcome.Cancelled : PurchaseRequestLookupOutcome.Denied,result.Outcome);
        Assert.Null(result.Receipt); Assert.Equal(journal,JournalState(db)); AssertLookupOnly(db,allocator);
    }
    [Fact]
    public async Task Lookup_current_foreign_branch_does_not_disclose_committed_receipt()
    {
        var db=new PurchaseRecordingModel(); await db.Service().CreateAsync(PurchaseFixtures.Create);
        db.Documents[PurchaseFixtures.DocumentId]=db.Documents[PurchaseFixtures.DocumentId] with { BranchId="B2" };
        db.Commands.Clear(); db.Events.Clear(); var allocator=new LookupForbiddenAllocator();
        var result=await LookupService(db,allocator).LookupAsync(PurchaseFixtures.Create);
        Assert.Equal(PurchaseRequestLookupOutcome.Conflict,result.Outcome); Assert.Null(result.Receipt); AssertLookupOnly(db,allocator);
    }
    [Theory]
    [InlineData("case")] [InlineData("accent")] [InlineData("space")]
    public async Task Lookup_rejects_noncanonical_physical_head_identity(string alias)
    {
        var db=new PurchaseRecordingModel(); await db.Service().CreateAsync(PurchaseFixtures.Create);
        db.Documents[PurchaseFixtures.DocumentId]=db.Documents[PurchaseFixtures.DocumentId] with { PurchaseRequestId=PurchaseSqlComparisonModel.Alias(PurchaseFixtures.DocumentId,alias) };
        db.Commands.Clear(); db.Events.Clear(); var allocator=new LookupForbiddenAllocator();
        var result=await LookupService(db,allocator).LookupAsync(PurchaseFixtures.Create);
        Assert.Equal(PurchaseRequestLookupOutcome.Conflict,result.Outcome); Assert.Null(result.Receipt); AssertLookupOnly(db,allocator);
    }
    [Theory]
    [InlineData("runtime")] [InlineData("probe")] [InlineData("binding")]
    [InlineData("0:open")] [InlineData("0:begin")] [InlineData("0:credential")]
    [InlineData("0:probe")] [InlineData("0:transaction")] [InlineData("0:lookup")]
    public async Task Lookup_qualification_and_recording_faults_never_fabricate_absence_or_dispatch(string fault)
    {
        var db=new PurchaseRecordingModel { InvalidProbe=fault=="probe",Fault=fault.Contains(':') ? fault : null };
        var allocator=new LookupForbiddenAllocator();
        var result=await LookupService(db,allocator,qualified:fault!="runtime",binding:fault=="binding" ? Guid.NewGuid() : null).LookupAsync(PurchaseFixtures.Create);
        Assert.Equal(fault is "runtime" or "probe" or "binding" ? PurchaseRequestLookupOutcome.QualificationRequired : PurchaseRequestLookupOutcome.Unavailable,result.Outcome);
        Assert.Null(result.Receipt); Assert.Empty(db.Journal); Assert.Empty(db.Documents); AssertLookupOnly(db,allocator);
    }
    [Fact]
    public async Task Lookup_freezes_original_lines_before_await_and_invalid_or_precancelled_input_opens_nothing()
    {
        var db=new PurchaseRecordingModel(); await db.Service().CreateAsync(PurchaseFixtures.Create); db.Commands.Clear(); db.Events.Clear();
        var allocator=new LookupForbiddenAllocator(); var gate=new TaskCompletionSource<AuthoritativeIdentity?>(TaskCreationOptions.RunContinuationsAsynchronously); var calls=0;
        var lines=new List<PurchaseRequestNewLine>(PurchaseFixtures.Create.Lines);
        var service=LookupService(db,allocator,_=>++calls==1 ? gate.Task : Task.FromResult<AuthoritativeIdentity?>(PurchaseFixtures.Identity()));
        var observed=service.LookupAsync(PurchaseFixtures.Create with { Lines=lines }); lines.Clear(); gate.SetResult(PurchaseFixtures.Identity());
        Assert.Equal(PurchaseRequestLookupOutcome.Committed,(await observed).Outcome); AssertLookupOnly(db,allocator);
        db.Commands.Clear(); db.Events.Clear(); using var cancelled=new CancellationTokenSource(); cancelled.Cancel();
        Assert.Equal(PurchaseRequestLookupOutcome.Cancelled,(await service.LookupAsync(PurchaseFixtures.Create,cancelled.Token)).Outcome);
        Assert.Equal(PurchaseRequestLookupOutcome.InvalidInput,(await service.LookupAsync(PurchaseFixtures.Create with { IdempotencyKey="" })).Outcome);
        Assert.Empty(db.Commands); AssertLookupOnly(db,allocator);
    }
    [Theory]
    [InlineData("header")] [InlineData("update")] [InlineData("remove")] [InlineData("submit")]
    public async Task Existing_no_Add_save_and_submit_do_not_require_number_allocation(string operation)
    {
        var db=new PurchaseRecordingModel { AllocatorQualified=false }; db.Seed(); var current=db.Documents[PurchaseFixtures.DocumentId];
        PurchaseRequestLineChange[] changes=operation switch {
            "update"=>[new(PurchaseRequestLineChangeKind.Update,"line-1",null,PurchaseFixtures.Values with { Quantity="3" })],
            "remove"=>[new(PurchaseRequestLineChangeKind.Remove,"line-1",null,null)],_=>[] };
        var allocator=new LookupForbiddenAllocator(); var service=LookupService(db,allocator);
        var result=operation=="submit" ? await service.SubmitAsync(SubmitIntent(db))
            : await service.SaveAsync(SaveIntent(db) with { Header=current.Header with { Notes="synthetic update" },LineChanges=changes });
        Assert.Equal(PurchaseRequestCommandOutcome.Committed,result.Outcome); Assert.Equal(0,db.AllocatorCalls);
        Assert.Equal(0,allocator.QualificationCalls); Assert.Equal(0,allocator.AllocationCalls);
        Assert.Empty(result.Receipt!.AllocatedLines);
        Assert.DoesNotContain(db.Commands,c=>c.CommandText==PurchaseRequestSql.InsertLineText || c.CommandText==PurchaseRequestSql.InsertHeadText);
    }
    [Fact]
    public async Task Existing_Add_save_and_Create_still_require_qualified_allocation()
    {
        var db=new PurchaseRecordingModel { AllocatorQualified=false }; db.Seed();
        Assert.Equal(PurchaseRequestCommandOutcome.QualificationRequired,(await db.Service().CreateAsync(PurchaseFixtures.Create)).Outcome);
        var result=await db.Service().SaveAsync(SaveIntent(db) with { LineChanges=[new(PurchaseRequestLineChangeKind.Add,null,"new-line",PurchaseFixtures.Values)] });
        Assert.Equal(PurchaseRequestCommandOutcome.QualificationRequired,result.Outcome); Assert.Empty(db.Journal); Assert.Equal(0,db.AllocatorCalls);
    }
    [Theory]
    [InlineData("missing-map")] [InlineData("null-map")] [InlineData("foreign-client")]
    [InlineData("foreign-line")] [InlineData("duplicate-map")] [InlineData("null-map-entry")]
    [InlineData("status")] [InlineData("lock")] [InlineData("null-lock")]
    [InlineData("header")] [InlineData("quantity")] [InlineData("extra-line")] [InlineData("noncanonical")]
    public async Task Lookup_rejects_semantically_corrupt_receipt_even_with_consistent_token_and_aggregate(string kind)
    {
        var db=new PurchaseRecordingModel(); var original=await db.Service().CreateAsync(PurchaseFixtures.Create);
        var receipt=original.Receipt!; var document=receipt.Document; var map=Assert.Single(receipt.AllocatedLines);
        receipt=kind switch {
            "missing-map"=>receipt with { AllocatedLines=[] }, "null-map"=>receipt with { AllocatedLines=null! },
            "foreign-client"=>receipt with { AllocatedLines=[map with { ClientLineKey="foreign-client" }] },
            "foreign-line"=>receipt with { AllocatedLines=[map with { LineId="foreign-line" }] },
            "duplicate-map"=>receipt with { AllocatedLines=[map,map] },
            "null-map-entry"=>receipt with { AllocatedLines=[null!] }, _=>receipt };
        document=kind switch {
            "status"=>document with { StatusId=7 }, "lock"=>document with { IsLocked=true },
            "null-lock"=>document with { IsLocked=null },
            "header"=>document with { Header=document.Header with { Notes="corrupt original" } },
            "quantity"=>document with { Lines=[document.Lines[0] with { Values=document.Lines[0].Values with { Quantity="99" } }] },
            "extra-line"=>document with { Lines=document.Lines.Concat(new[]{new PurchaseRequestPersistedLine("extra-line",PurchaseRequestCommandRules.Line(PurchaseFixtures.Values))}).OrderBy(l=>l.LineId,StringComparer.Ordinal).ToArray() },
            "noncanonical"=>document with { Header=document.Header with { Price="15" } }, _=>document };
        receipt=receipt with { Document=document,StateToken=PurchaseRequestCommandRules.EqualityToken(document) };
        ReplaceReceipt(db,receipt); db.Commands.Clear(); db.Events.Clear();
        var snapshot=BusinessSnapshot(db); var allocator=new LookupForbiddenAllocator(); var wire=new LookupWire();
        var observed=await WireService(db,allocator,wire).LookupAsync(PurchaseFixtures.Create);
        Assert.Equal(PurchaseRequestLookupOutcome.Unavailable,observed.Outcome); Assert.Null(observed.Receipt);
        AssertReadOnlySnapshot(db,allocator,wire,snapshot);
    }
    [Theory]
    [InlineData("duplicate-root")] [InlineData("duplicate-nested")]
    [InlineData("missing-map")] [InlineData("missing-lock")] [InlineData("missing-null-property")]
    [InlineData("wrong-case")] [InlineData("null-document")]
    public async Task Lookup_receipt_JSON_requires_complete_unique_exact_property_names(string kind)
    {
        var db=new PurchaseRecordingModel(); var written=await db.Service().CreateAsync(PurchaseFixtures.Create);
        var json=JsonSerializer.Serialize(written.Receipt,PurchaseRequestCommandRules.Json);
        var node=System.Text.Json.Nodes.JsonNode.Parse(json)!.AsObject();
        switch(kind)
        {
            case "missing-map": node.Remove("allocatedLines"); break;
            case "missing-lock": node["document"]!.AsObject().Remove("isLocked"); break;
            case "missing-null-property": node["document"]!["header"]!.AsObject().Remove("notes"); break;
            case "wrong-case": node["ActionId"]=node["actionId"]!.GetValue<string>(); node.Remove("actionId"); break;
            case "null-document": node["document"]=null; break;
        }
        json=node.ToJsonString(PurchaseRequestCommandRules.Json);
        if(kind=="duplicate-root") json=json.Replace("\"actionId\":","\"actionId\":\"wrong\",\"actionId\":",StringComparison.Ordinal);
        if(kind=="duplicate-nested") json=json.Replace("\"notes\":","\"notes\":\"wrong\",\"notes\":",StringComparison.Ordinal);
        var entry=Assert.Single(db.Journal); db.Journal[entry.Key]=entry.Value with { Receipt=json };
        db.Commands.Clear(); db.Events.Clear(); var snapshot=BusinessSnapshot(db); var allocator=new LookupForbiddenAllocator(); var wire=new LookupWire();
        var observed=await WireService(db,allocator,wire).LookupAsync(PurchaseFixtures.Create);
        Assert.Equal(PurchaseRequestLookupOutcome.Unavailable,observed.Outcome); Assert.Null(observed.Receipt);
        AssertReadOnlySnapshot(db,allocator,wire,snapshot);
    }
    [Theory]
    [InlineData("update")] [InlineData("remove")] [InlineData("add")]
    public async Task Lookup_save_receipt_checks_explicit_effects_but_not_latest_document_equality(string change)
    {
        var db=new PurchaseRecordingModel(); db.Seed(2);
        var input=SaveIntent(db) with { LineChanges=change switch {
            "update"=>[new(PurchaseRequestLineChangeKind.Update,"line-1",null,PurchaseFixtures.Values with { Quantity="7" })],
            "remove"=>[new(PurchaseRequestLineChangeKind.Remove,"line-1",null,null)],
            _=>[new(PurchaseRequestLineChangeKind.Add,null,"added",PurchaseFixtures.Values)] } };
        var written=await db.Service().SaveAsync(input); Assert.Equal(PurchaseRequestCommandOutcome.Committed,written.Outcome);
        var good=written.Receipt!; var allocator=new LookupForbiddenAllocator();
        Assert.Equal(PurchaseRequestLookupOutcome.Committed,(await LookupService(db,allocator).LookupAsync(input)).Outcome);
        var corrupt=good.Document with { Lines=change switch {
            "update"=>good.Document.Lines.Select(l=>l.LineId=="line-1" ? l with { Values=l.Values with { Quantity="8" } } : l).ToArray(),
            "remove"=>good.Document.Lines.Prepend(new PurchaseRequestPersistedLine("line-1",PurchaseRequestCommandRules.Line(PurchaseFixtures.Values))).ToArray(),
            _=>good.Document.Lines.Where(l=>l.LineId!=good.AllocatedLines[0].LineId).ToArray() } };
        ReplaceReceipt(db,good with { Document=corrupt,StateToken=PurchaseRequestCommandRules.EqualityToken(corrupt) });
        db.Commands.Clear(); db.Events.Clear(); var snapshot=BusinessSnapshot(db); var wire=new LookupWire();
        var observed=await WireService(db,allocator,wire).LookupAsync(input);
        Assert.Equal(PurchaseRequestLookupOutcome.Unavailable,observed.Outcome); Assert.Null(observed.Receipt);
        AssertReadOnlySnapshot(db,allocator,wire,snapshot);
    }
    [Theory]
    [InlineData(false)] [InlineData(true)]
    public async Task Lookup_Save_Remove_then_Add_reusing_removed_ID_returns_writer_receipt_without_dispatch(bool laterEdit)
    {
        var (db,input,receipt,writerAllocator)=await WriteSaveWithReusedLineId();
        var original=JsonSerializer.Serialize(receipt,PurchaseRequestCommandRules.Json);
        if(laterEdit)
        {
            // A separate, intentional no-Add save changes the same reused line after the original commit.
            var later=SaveIntent(db) with { IdempotencyKey="synthetic-later-save-reuse",
                Header=receipt.Document.Header with { Notes="later synthetic edit" },
                LineChanges=[new(PurchaseRequestLineChangeKind.Update,"line-1",null,
                    receipt.Document.Lines.Single(l=>l.LineId=="line-1").Values with { Quantity="9" })] };
            var changed=await db.Service().SaveAsync(later);
            Assert.Equal(PurchaseRequestCommandOutcome.Committed,changed.Outcome);
            Assert.NotEqual(receipt.StateToken,changed.Receipt!.StateToken);
        }
        db.Commands.Clear(); db.Events.Clear(); var before=BusinessSnapshot(db);
        var allocator=new LookupForbiddenAllocator(); var wire=new LookupWire();
        var observed=await WireService(db,allocator,wire).LookupAsync(input);
        Assert.Equal(PurchaseRequestLookupOutcome.Committed,observed.Outcome);
        Assert.Equal(original,JsonSerializer.Serialize(observed.Receipt,PurchaseRequestCommandRules.Json));
        Assert.Equal(2,writerAllocator.Qualifications); Assert.Equal(1,writerAllocator.Allocations);
        AssertReadOnlySnapshot(db,allocator,wire,before);
    }
    [Theory]
    [InlineData("missing-final")] [InlineData("old-final-values")]
    [InlineData("missing-map")] [InlineData("foreign-client")] [InlineData("foreign-line")] [InlineData("duplicate-map")]
    [InlineData("key")] [InlineData("intent")] [InlineData("denied")] [InlineData("logout")]
    public async Task Lookup_Save_reused_ID_still_checks_final_effect_mapping_key_intent_and_authority(string fault)
    {
        var (db,input,receipt,writerAllocator)=await WriteSaveWithReusedLineId();
        var map=Assert.Single(receipt.AllocatedLines);
        var corrupt=receipt with { Document=receipt.Document with { Lines=fault switch {
            "missing-final"=>receipt.Document.Lines.Where(l=>l.LineId!="line-1").ToArray(),
            "old-final-values"=>receipt.Document.Lines.Select(l=>l.LineId=="line-1"
                ? l with { Values=PurchaseRequestCommandRules.Line(PurchaseFixtures.Values) } : l).ToArray(),
            _=>receipt.Document.Lines } }, AllocatedLines=fault switch {
            "missing-map"=>[], "foreign-client"=>[map with { ClientLineKey="other-client" }],
            "foreign-line"=>[map with { LineId="line-2" }], "duplicate-map"=>[map,map], _=>receipt.AllocatedLines } };
        // Keep aggregate/token self-consistent so these cases reach the effect/mapping checks.
        corrupt=corrupt with { StateToken=PurchaseRequestCommandRules.EqualityToken(corrupt.Document) };
        ReplaceReceipt(db,corrupt);
        var entry=Assert.Single(db.Journal);
        if(fault=="key") db.Journal[entry.Key]=entry.Value with { Key=entry.Value.Key.Concat(new byte[]{0}).ToArray() };
        if(fault=="intent") db.Journal[entry.Key]=entry.Value with { Intent=entry.Value.Intent.Concat(new byte[]{0}).ToArray() };
        if(fault=="denied") db.Denial="update";
        db.Commands.Clear(); db.Events.Clear(); var before=BusinessSnapshot(db);
        var allocator=new LookupForbiddenAllocator(); var wire=new LookupWire();
        Task<AuthoritativeIdentity?> Resolve(CancellationToken token)=>Task.FromResult<AuthoritativeIdentity?>(
            fault=="logout" ? null : PurchaseFixtures.Identity());
        var observed=await WireService(db,allocator,wire,Resolve).LookupAsync(input);
        var expected=fault=="intent" ? PurchaseRequestLookupOutcome.Conflict
            : fault is "denied" or "logout" ? PurchaseRequestLookupOutcome.Denied : PurchaseRequestLookupOutcome.Unavailable;
        Assert.Equal(expected,observed.Outcome); Assert.Null(observed.Receipt);
        Assert.Equal(2,writerAllocator.Qualifications); Assert.Equal(1,writerAllocator.Allocations);
        AssertReadOnlySnapshot(db,allocator,wire,before);
    }
    [Fact]
    public async Task Lookup_Save_does_not_reorder_Add_before_Remove_to_make_an_impossible_receipt_valid()
    {
        var (db,input,receipt,writerAllocator)=await WriteSaveWithReusedLineId();
        var reversed=input with { LineChanges=input.LineChanges.Reverse().ToArray() };
        var control=new PurchaseRecordingModel(); control.Seed(2);
        var allocation=new ExactTestAllocator(new(PurchaseFixtures.DocumentId,[new("replacement-client","line-1")]));
        var writer=new SqlPurchaseRequestCommands(PurchaseFixtures.Binding,PurchaseFixtures.Company,
            (Func<DbConnection>)(()=>new PurchaseRecordingConnection(control,control.Connections++)),
            _=>Task.FromResult<AuthoritativeIdentity?>(PurchaseFixtures.Identity()),allocation,true);
        var originalDocument=PurchaseRequestCommandRules.IntentBytes(control.Documents[PurchaseFixtures.DocumentId]);
        var rejected=await writer.SaveAsync(reversed);
        Assert.Equal(PurchaseRequestCommandOutcome.Conflict,rejected.Outcome); Assert.Null(rejected.Receipt);
        Assert.Equal(originalDocument,PurchaseRequestCommandRules.IntentBytes(control.Documents[PurchaseFixtures.DocumentId]));
        Assert.Equal(1,control.Commits); Assert.Equal((byte)0,Assert.Single(control.Journal.Values).State);
        Assert.DoesNotContain(control.Commands,c=>c.CommandText==PurchaseRequestSql.InsertLineText
            || c.CommandText==PurchaseRequestSql.DeleteLineText || c.CommandText==PurchaseRequestSql.CompleteText);
        // A forged journal is not enough: last-effect-only acceptance would lose the writer's order constraint.
        var document=receipt.Document with { Lines=receipt.Document.Lines.Where(l=>l.LineId!="line-1").ToArray() };
        ReplaceReceipt(db,receipt with { Document=document,StateToken=PurchaseRequestCommandRules.EqualityToken(document) });
        var entry=Assert.Single(db.Journal);
        db.Journal[entry.Key]=entry.Value with { Intent=PurchaseRequestCommandRules.IntentBytes(PurchaseRequestCommandRules.Freeze(reversed)) };
        db.Commands.Clear(); db.Events.Clear(); var before=BusinessSnapshot(db);
        var allocator=new LookupForbiddenAllocator(); var wire=new LookupWire();
        var observed=await WireService(db,allocator,wire).LookupAsync(reversed);
        Assert.Equal(PurchaseRequestLookupOutcome.Unavailable,observed.Outcome); Assert.Null(observed.Receipt);
        Assert.Equal(2,writerAllocator.Qualifications); Assert.Equal(1,writerAllocator.Allocations);
        AssertReadOnlySnapshot(db,allocator,wire,before);
    }
    private static async Task<(PurchaseRecordingModel Db,SavePurchaseRequestDraft Input,
        PurchaseRequestCommandReceipt Receipt,ExactTestAllocator Allocator)> WriteSaveWithReusedLineId()
    {
        var db=new PurchaseRecordingModel(); db.Seed(2);
        var untouched=db.Documents[PurchaseFixtures.DocumentId].Lines.Single(l=>l.LineId=="line-2");
        var replacement=PurchaseFixtures.Values with { ItemId="synthetic-replacement",Quantity="7",Model="replacement" };
        var input=SaveIntent(db) with { LineChanges=[new(PurchaseRequestLineChangeKind.Remove,"line-1",null,null),
            new(PurchaseRequestLineChangeKind.Add,null,"replacement-client",replacement)] };
        // Synthetic output only: this does not assert that a real allocator reuses IDs.
        var allocator=new ExactTestAllocator(new(PurchaseFixtures.DocumentId,[new("replacement-client","line-1")]));
        var writer=new SqlPurchaseRequestCommands(PurchaseFixtures.Binding,PurchaseFixtures.Company,
            (Func<DbConnection>)(()=>new PurchaseRecordingConnection(db,db.Connections++)),
            _=>Task.FromResult<AuthoritativeIdentity?>(PurchaseFixtures.Identity()),allocator,true);
        var written=await writer.SaveAsync(input);
        Assert.Equal(PurchaseRequestCommandOutcome.Committed,written.Outcome);
        var receipt=Assert.IsType<PurchaseRequestCommandReceipt>(written.Receipt);
        Assert.Equal(2,db.Commits); Assert.Equal(2,allocator.Qualifications); Assert.Equal(1,allocator.Allocations);
        Assert.Equal(new PurchaseRequestAllocatedLine("replacement-client","line-1"),Assert.Single(receipt.AllocatedLines));
        Assert.Equal(2,receipt.Document.Lines.Count);
        Assert.Equal(PurchaseRequestCommandRules.Line(replacement),receipt.Document.Lines.Single(l=>l.LineId=="line-1").Values);
        Assert.Equal(untouched,receipt.Document.Lines.Single(l=>l.LineId=="line-2"));
        var delete=Assert.Single(db.Commands.Where(c=>c.CommandText==PurchaseRequestSql.DeleteLineText));
        var insert=Assert.Single(db.Commands.Where(c=>c.CommandText==PurchaseRequestSql.InsertLineText));
        Assert.Equal("line-1",delete.Parameters["@lineScope"].Value); Assert.Equal("line-1",insert.Parameters["@line"].Value);
        Assert.True(db.Commands.IndexOf(delete)<db.Commands.IndexOf(insert));
        Assert.Single(db.Commands.Where(c=>c.CommandText==PurchaseRequestSql.ReserveText));
        Assert.Single(db.Commands.Where(c=>c.CommandText==PurchaseRequestSql.CompleteText));
        var stored=Assert.Single(db.Journal.Values); Assert.Equal((byte)1,stored.State);
        Assert.Equal(PurchaseRequestCommandRules.IntentBytes(PurchaseRequestCommandRules.Freeze(input)),stored.Intent);
        Assert.Equal(JsonSerializer.Serialize(receipt,PurchaseRequestCommandRules.Json),stored.Receipt);
        Assert.Equal(PurchaseRequestCommandRules.IntentBytes(receipt.Document),stored.Aggregate);
        return (db,input,receipt,allocator);
    }
    [Theory]
    [InlineData(false)] [InlineData(true)]
    public async Task Lookup_submit_validates_original_prestate_and_no_allocations(bool nullLock)
    {
        var db=new PurchaseRecordingModel(); db.Seed();
        if(nullLock) db.Documents[PurchaseFixtures.DocumentId]=db.Documents[PurchaseFixtures.DocumentId] with { IsLocked=null };
        var input=SubmitIntent(db); var written=await db.Service().SubmitAsync(input);
        Assert.Equal(PurchaseRequestCommandOutcome.Committed,written.Outcome);
        var allocator=new LookupForbiddenAllocator();
        Assert.Equal(PurchaseRequestLookupOutcome.Committed,(await LookupService(db,allocator).LookupAsync(input)).Outcome);
        var corrupt=written.Receipt!.Document with { Header=written.Receipt.Document.Header with { Notes="not the original submitted prestate" } };
        ReplaceReceipt(db,written.Receipt with { Document=corrupt,StateToken=PurchaseRequestCommandRules.EqualityToken(corrupt) });
        db.Commands.Clear(); db.Events.Clear(); var snapshot=BusinessSnapshot(db); var wire=new LookupWire();
        var observed=await WireService(db,allocator,wire).LookupAsync(input);
        Assert.Equal(PurchaseRequestLookupOutcome.Unavailable,observed.Outcome); Assert.Null(observed.Receipt);
        AssertReadOnlySnapshot(db,allocator,wire,snapshot);
    }
    public static IEnumerable<object[]> LookupReaderCases()
    {
        foreach(var stage in new[]{"credential","grants","branches","probe","transaction","journal","head","details"})
            foreach(var fault in new[]{"extra-result","missing-column","wrong-type","timeout","cancel"})
                yield return new object[]{stage,fault};
    }
    [Theory]
    [MemberData(nameof(LookupReaderCases))]
    public async Task Lookup_every_read_fails_closed_on_bad_shape_extra_result_timeout_or_cancellation(string stage,string fault)
    {
        var db=new PurchaseRecordingModel(); await db.Service().CreateAsync(PurchaseFixtures.Create);
        using var cancelled=new CancellationTokenSource();
        var wire=new LookupWire { TargetSql=LookupStageSql(stage),ReaderFault=fault,Cancel=cancelled };
        db.Commands.Clear(); db.Events.Clear(); var snapshot=BusinessSnapshot(db); var allocator=new LookupForbiddenAllocator();
        var result=await WireService(db,allocator,wire).LookupAsync(PurchaseFixtures.Create,cancelled.Token);
        var expected=fault=="cancel" ? PurchaseRequestLookupOutcome.Cancelled : fault=="timeout" ? PurchaseRequestLookupOutcome.Unavailable
            : stage is "credential" or "grants" or "branches" ? PurchaseRequestLookupOutcome.Denied
            : stage is "probe" or "transaction" ? PurchaseRequestLookupOutcome.QualificationRequired : PurchaseRequestLookupOutcome.Unavailable;
        Assert.Equal(expected,result.Outcome); Assert.Null(result.Receipt); Assert.Equal(1,wire.Injections);
        AssertReadOnlySnapshot(db,allocator,wire,snapshot);
    }
    [Theory]
    [InlineData("binding")] [InlineData("slot-null")] [InlineData("key-null")] [InlineData("intent-empty")]
    [InlineData("document-null")] [InlineData("receipt-null")] [InlineData("aggregate-null")] [InlineData("duplicate-row")]
    public async Task Lookup_journal_corrupt_storage_never_returns_receipt(string fault)
    {
        var db=new PurchaseRecordingModel(); await db.Service().CreateAsync(PurchaseFixtures.Create);
        var wire=new LookupWire { TargetSql=PurchaseRequestSql.LookupText,ReaderFault=fault };
        db.Commands.Clear(); db.Events.Clear(); var snapshot=BusinessSnapshot(db); var allocator=new LookupForbiddenAllocator();
        var result=await WireService(db,allocator,wire).LookupAsync(PurchaseFixtures.Create);
        Assert.Equal(PurchaseRequestLookupOutcome.Unavailable,result.Outcome); Assert.Null(result.Receipt); Assert.Equal(1,wire.Injections);
        AssertReadOnlySnapshot(db,allocator,wire,snapshot);
    }
    [Theory]
    [InlineData("extra-result")] [InlineData("missing-column")] [InlineData("wrong-type")]
    public async Task Lookup_empty_but_malformed_reader_is_not_Absent(string fault)
    {
        var db=new PurchaseRecordingModel(); var wire=new LookupWire { TargetSql=PurchaseRequestSql.LookupText,ReaderFault=fault };
        var snapshot=BusinessSnapshot(db); var allocator=new LookupForbiddenAllocator();
        var result=await WireService(db,allocator,wire).LookupAsync(PurchaseFixtures.Create);
        Assert.Equal(PurchaseRequestLookupOutcome.Unavailable,result.Outcome); Assert.Null(result.Receipt);
        AssertReadOnlySnapshot(db,allocator,wire,snapshot);
    }
    public static IEnumerable<object[]> LookupCleanupCases()
    {
        foreach(var state in new[]{"committed","pending","absent"})
            foreach(var fault in new[]{"revoke","cancel","rollback-fault","transaction-dispose-fault","connection-dispose-fault"})
                yield return new object[]{state,fault};
    }
    [Theory]
    [MemberData(nameof(LookupCleanupCases))]
    public async Task Lookup_does_not_publish_an_observation_across_failed_or_revoked_cleanup(string state,string fault)
    {
        var db=new PurchaseRecordingModel();
        if(state!="absent") { if(state=="pending") db.Fault="0:commit-ack"; await db.Service().CreateAsync(PurchaseFixtures.Create); db.Fault=null; }
        using var cancelled=new CancellationTokenSource(); var revoked=false; var wire=new LookupWire();
        wire.BeforeRollback=()=> { if(fault=="revoke") revoked=true; if(fault=="cancel") cancelled.Cancel();
            if(fault=="rollback-fault") throw new IOException("synthetic rollback failure"); };
        wire.BeforeTransactionDispose=()=> { if(fault=="transaction-dispose-fault") throw new IOException("synthetic disposal failure"); };
        wire.BeforeConnectionDispose=()=> { if(fault=="connection-dispose-fault") throw new IOException("synthetic disposal failure"); };
        db.Commands.Clear(); db.Events.Clear(); var snapshot=BusinessSnapshot(db); var allocator=new LookupForbiddenAllocator();
        var result=await WireService(db,allocator,wire,_=>Task.FromResult<AuthoritativeIdentity?>(revoked ? null : PurchaseFixtures.Identity())).LookupAsync(PurchaseFixtures.Create,cancelled.Token);
        Assert.Equal(fault=="revoke" ? PurchaseRequestLookupOutcome.Denied : fault=="cancel" ? PurchaseRequestLookupOutcome.Cancelled : PurchaseRequestLookupOutcome.Unavailable,result.Outcome);
        Assert.Null(result.Receipt); AssertReadOnlySnapshot(db,allocator,wire,snapshot);
    }
    [Fact]
    public async Task Lookup_cancels_a_stalled_live_session_without_opening_a_connection()
    {
        var db=new PurchaseRecordingModel(); var allocator=new LookupForbiddenAllocator();
        var gate=new TaskCompletionSource<AuthoritativeIdentity?>(TaskCreationOptions.RunContinuationsAsynchronously);
        using var cancelled=new CancellationTokenSource();
        var service=LookupService(db,allocator,_=>gate.Task);
        var lookup=service.LookupAsync(PurchaseFixtures.Create,cancelled.Token); cancelled.Cancel();
        var result=await lookup.WaitAsync(TimeSpan.FromSeconds(3));
        gate.TrySetResult(null); // release the synthetic resolver; no background business work exists.
        Assert.Equal(PurchaseRequestLookupOutcome.Cancelled,result.Outcome); Assert.Null(result.Receipt);
        Assert.Equal(0,db.Connections); Assert.Empty(db.Commands); AssertLookupOnly(db,allocator);
    }
    [Fact]
    public async Task Lookup_ambient_transaction_is_rejected_without_joining_or_dispatching()
    {
        var db=new PurchaseRecordingModel(); var allocator=new LookupForbiddenAllocator();
        using var ambient=new System.Transactions.TransactionScope(System.Transactions.TransactionScopeAsyncFlowOption.Enabled);
        var result=await LookupService(db,allocator).LookupAsync(PurchaseFixtures.Create);
        Assert.Equal(PurchaseRequestLookupOutcome.Unavailable,result.Outcome); Assert.Null(result.Receipt);
        Assert.Equal(0,db.Connections); AssertLookupOnly(db,allocator);
    }
    [Fact]
    public async Task All_three_lookup_overloads_reject_null_original_DTO_without_IO()
    {
        var db=new PurchaseRecordingModel(); var allocator=new LookupForbiddenAllocator(); var service=LookupService(db,allocator);
        Assert.Equal(PurchaseRequestLookupOutcome.InvalidInput,(await service.LookupAsync((CreatePurchaseRequestDraft)null!)).Outcome);
        Assert.Equal(PurchaseRequestLookupOutcome.InvalidInput,(await service.LookupAsync((SavePurchaseRequestDraft)null!)).Outcome);
        Assert.Equal(PurchaseRequestLookupOutcome.InvalidInput,(await service.LookupAsync((SubmitPurchaseRequest)null!)).Outcome);
        Assert.Equal(0,db.Connections); AssertLookupOnly(db,allocator);
    }
    [Fact]
    public async Task Lookup_Absent_does_not_stop_original_invocation_from_reserving_and_committing_later()
    {
        var db=new PurchaseRecordingModel(); var gate=new TaskCompletionSource<AuthoritativeIdentity?>(TaskCreationOptions.RunContinuationsAsynchronously);
        db.FirstSession=gate.Task;
        var original=db.Service().CreateAsync(PurchaseFixtures.Create);
        var allocator=new LookupForbiddenAllocator(); var wire=new LookupWire(); var service=WireService(db,allocator,wire);
        var before=BusinessSnapshot(db);
        var absent=await service.LookupAsync(PurchaseFixtures.Create);
        Assert.Equal(PurchaseRequestLookupOutcome.Absent,absent.Outcome); Assert.Null(absent.Receipt);
        Assert.False(original.IsCompleted); AssertReadOnlySnapshot(db,allocator,wire,before);
        gate.SetResult(PurchaseFixtures.Identity());
        var written=await original.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.Equal(PurchaseRequestCommandOutcome.Committed,written.Outcome);
        Assert.Equal(1,db.AllocatorCalls); Assert.Equal(2,db.Commits);
        db.Commands.Clear(); db.Events.Clear(); before=BusinessSnapshot(db);
        var committed=await service.LookupAsync(PurchaseFixtures.Create);
        Assert.Equal(PurchaseRequestLookupOutcome.Committed,committed.Outcome);
        Assert.Equal(JsonSerializer.Serialize(written.Receipt,PurchaseRequestCommandRules.Json),JsonSerializer.Serialize(committed.Receipt,PurchaseRequestCommandRules.Json));
        AssertReadOnlySnapshot(db,allocator,wire,before);
    }
    [Theory]
    [InlineData("create")] [InlineData("add")]
    public async Task Write_paths_use_only_exact_identifiers_supplied_by_qualified_allocator(string operation)
    {
        var db=new PurchaseRecordingModel(); if(operation=="add") db.Seed();
        var documentId=operation=="add" ? PurchaseFixtures.DocumentId : "allocator-issued-document-X";
        var clientKey=operation=="add" ? "added-client" : "client-1";
        var allocator=new ExactTestAllocator(new(documentId,[new(clientKey,"allocator-issued-detail-Z")]));
        var service=new SqlPurchaseRequestCommands(PurchaseFixtures.Binding,PurchaseFixtures.Company,
            (Func<DbConnection>)(()=>new PurchaseRecordingConnection(db,db.Connections++)),
            _=>Task.FromResult<AuthoritativeIdentity?>(PurchaseFixtures.Identity()),allocator,true);
        var result=operation=="create" ? await service.CreateAsync(PurchaseFixtures.Create)
            : await service.SaveAsync(SaveIntent(db) with { LineChanges=[new(PurchaseRequestLineChangeKind.Add,null,clientKey,PurchaseFixtures.Values)] });
        Assert.Equal(PurchaseRequestCommandOutcome.Committed,result.Outcome);
        Assert.Equal(documentId,result.Receipt!.Document.PurchaseRequestId);
        Assert.Equal(new PurchaseRequestAllocatedLine(clientKey,"allocator-issued-detail-Z"),Assert.Single(result.Receipt.AllocatedLines));
        Assert.Contains(result.Receipt.Document.Lines,l=>l.LineId=="allocator-issued-detail-Z");
        Assert.Equal(1,allocator.Allocations); Assert.Equal(2,allocator.Qualifications);
        Assert.Equal(PurchaseFixtures.Binding,allocator.Context!.DatabaseBindingId);
        Assert.Equal(clientKey,Assert.Single(allocator.Context.ClientLineKeys));
        Assert.Equal(operation=="add" ? PurchaseFixtures.DocumentId : null,allocator.Context.ExistingDocumentId);
    }
    [Fact]
    public async Task Empty_create_still_requires_document_numbering_qualification()
    {
        var db=new PurchaseRecordingModel { AllocatorQualified=false }; var input=PurchaseFixtures.Create with { Lines=[] };
        var result=await db.Service().CreateAsync(input);
        Assert.Equal(PurchaseRequestCommandOutcome.QualificationRequired,result.Outcome); Assert.Null(result.Receipt);
        Assert.Empty(db.Documents); Assert.Empty(db.Journal); Assert.Equal(0,db.AllocatorCalls);
    }
    [Fact]
    public async Task Lookup_keeps_dispatch_canonicalization_and_compares_every_canonical_intent_byte()
    {
        var db=new PurchaseRecordingModel(); await db.Service().CreateAsync(PurchaseFixtures.Create);
        db.Commands.Clear(); db.Events.Clear(); var before=BusinessSnapshot(db); var allocator=new LookupForbiddenAllocator(); var wire=new LookupWire();
        var service=WireService(db,allocator,wire);
        var same=PurchaseFixtures.Create with { Header=PurchaseFixtures.Header with { Price="15.00" } };
        Assert.Equal(PurchaseRequestLookupOutcome.Committed,(await service.LookupAsync(same)).Outcome);
        var different=PurchaseFixtures.Create with { Header=PurchaseFixtures.Header with { Notes="" } };
        var conflict=await service.LookupAsync(different);
        Assert.Equal(PurchaseRequestLookupOutcome.Conflict,conflict.Outcome); Assert.Null(conflict.Receipt);
        var otherKey=await service.LookupAsync(PurchaseFixtures.Create with { IdempotencyKey="Synthetic-create" });
        Assert.Equal(PurchaseRequestLookupOutcome.Absent,otherKey.Outcome); Assert.Null(otherKey.Receipt);
        AssertReadOnlySnapshot(db,allocator,wire,before);
    }
    private sealed class ExactTestAllocator(PurchaseRequestAllocatedIdentifiers identifiers) : IPurchaseRequestIdentifierAllocator
    {
        internal int Allocations,Qualifications;
        internal PurchaseRequestAllocationContext? Context;
        public bool IsQualified(PurchaseRequestAllocationContext context) { Qualifications++; Context=context; return true; }
        public Task<PurchaseRequestAllocatedIdentifiers> AllocateAsync(DbTransaction transaction,PurchaseRequestAllocationContext context,CancellationToken token)
        {
            token.ThrowIfCancellationRequested(); Assert.NotNull(transaction.Connection);
            Assert.Equal(System.Data.IsolationLevel.Serializable,transaction.IsolationLevel);
            Assert.Equal(Context,context); Allocations++; return Task.FromResult(identifiers);
        }
    }
    [Theory]
    [InlineData("foreign-owner")] [InlineData("wrong-isolation")]
    public async Task Lookup_rejects_bad_transaction_and_never_rolls_back_foreign_ownership(string kind)
    {
        var db=new PurchaseRecordingModel(); var allocator=new LookupForbiddenAllocator(); var rollbacks=0; var disposals=0;
        using var foreign=new PurchaseRecordingConnection(new PurchaseRecordingModel(),0);
        var wire=new LookupWire { TransactionOwner=kind=="foreign-owner" ? foreign : null,
            TransactionIsolation=kind=="wrong-isolation" ? System.Data.IsolationLevel.ReadCommitted : null,
            BeforeRollback=()=>rollbacks++,BeforeTransactionDispose=()=>disposals++ };
        var before=BusinessSnapshot(db);
        var result=await WireService(db,allocator,wire).LookupAsync(PurchaseFixtures.Create);
        Assert.Equal(PurchaseRequestLookupOutcome.Unavailable,result.Outcome); Assert.Null(result.Receipt);
        Assert.Equal(kind=="foreign-owner" ? 0 : 1,rollbacks); Assert.Equal(kind=="foreign-owner" ? 0 : 1,disposals);
        Assert.Empty(db.Commands); AssertReadOnlySnapshot(db,allocator,wire,before);
    }
    [Fact]
    public async Task Lookup_does_not_close_or_enlist_a_borrowed_open_connection()
    {
        var db=new PurchaseRecordingModel(); var allocator=new LookupForbiddenAllocator(); var disposals=0;
        var wire=new LookupWire { BeforeConnectionDispose=()=>disposals++ };
        using var connection=new LookupWireConnection(new PurchaseRecordingConnection(db,db.Connections++),wire);
        connection.Open();
        var service=new SqlPurchaseRequestCommands(PurchaseFixtures.Binding,PurchaseFixtures.Company,
            (Func<DbConnection>)(()=>connection),_=>Task.FromResult<AuthoritativeIdentity?>(PurchaseFixtures.Identity()),allocator,true);
        var before=BusinessSnapshot(db);
        var result=await service.LookupAsync(PurchaseFixtures.Create);
        Assert.Equal(PurchaseRequestLookupOutcome.Unavailable,result.Outcome); Assert.Null(result.Receipt);
        Assert.Equal(0,disposals); Assert.Equal(System.Data.ConnectionState.Open,connection.State);
        Assert.Empty(db.Commands); AssertReadOnlySnapshot(db,allocator,wire,before);
    }
    private static string BusinessSnapshot(PurchaseRecordingModel db)=>JsonSerializer.Serialize(new {
        Documents=db.Documents.OrderBy(p=>p.Key),Journal=db.Journal.OrderBy(p=>p.Key),db.Commits,db.AllocatorCalls,db.SubmitEffects },PurchaseRequestCommandRules.Json);
    private static void ReplaceReceipt(PurchaseRecordingModel db,PurchaseRequestCommandReceipt receipt)
    {
        var entry=Assert.Single(db.Journal); db.Journal[entry.Key]=entry.Value with {
            Receipt=JsonSerializer.Serialize(receipt,PurchaseRequestCommandRules.Json),
            Aggregate=PurchaseRequestCommandRules.IntentBytes(receipt.Document) };
    }
    private static void AssertReadOnlySnapshot(PurchaseRecordingModel db,LookupForbiddenAllocator allocator,LookupWire wire,string before)
    {
        Assert.Equal(before,BusinessSnapshot(db)); AssertLookupOnly(db,allocator);
        Assert.Equal(0,wire.NonQueries); Assert.Equal(0,wire.Scalars); Assert.Equal(0,wire.Commits);
    }
    private static string LookupStageSql(string stage)=>stage switch {
        "credential"=>PurchaseRequestSql.CredentialText,"grants"=>PurchaseRequestSql.GrantsText,
        "branches"=>PurchaseRequestSql.BranchesText,"probe"=>PurchaseRequestSql.ProbeText,
        "transaction"=>PurchaseRequestSql.TransactionText,"journal"=>PurchaseRequestSql.LookupText,
        "head"=>PurchaseRequestSql.HeadText,"details"=>PurchaseRequestSql.DetailsText,
        _=>throw new ArgumentException("Unknown synthetic stage.") };
    private static SqlPurchaseRequestCommands WireService(PurchaseRecordingModel db,LookupForbiddenAllocator allocator,LookupWire wire,
        Func<CancellationToken,Task<AuthoritativeIdentity?>>? resolve=null)=>new(PurchaseFixtures.Binding,PurchaseFixtures.Company,
            (Func<DbConnection>)(()=>new LookupWireConnection(new PurchaseRecordingConnection(db,db.Connections++),wire)),
            resolve ?? (_=>Task.FromResult<AuthoritativeIdentity?>(PurchaseFixtures.Identity())),allocator,true);
    // Test-only ADO decorator, confined to this owned file. It wraps the unchanged I14 recording provider.
    // Every write-shaped API is a trap. Shape/fault injection never contacts an actual SQL server.
    private sealed class LookupWire
    {
        internal string? TargetSql,ReaderFault;
        internal DbConnection? TransactionOwner;
        internal System.Data.IsolationLevel? TransactionIsolation;
        internal CancellationTokenSource? Cancel;
        internal Action? BeforeRollback,BeforeTransactionDispose,BeforeConnectionDispose;
        internal int NonQueries,Scalars,Commits,Injections;
        internal DbDataReader Reader(DbCommand command,System.Data.CommandBehavior behavior)
        {
            if(command.CommandText!=TargetSql) return command.ExecuteReader(behavior);
            Injections++;
            if(ReaderFault=="timeout") throw new TimeoutException("synthetic read timeout");
            if(ReaderFault=="cancel") { Cancel!.Cancel(); throw new OperationCanceledException(Cancel.Token); }
            using var original=command.ExecuteReader(behavior);
            var table=new System.Data.DataTable(); table.Load(original);
            switch(ReaderFault)
            {
                case "missing-column": table.Columns.RemoveAt(table.Columns.Count-1); break;
                case "wrong-type":
                    var bad=new System.Data.DataTable();
                    for(var i=0;i<table.Columns.Count;i++) bad.Columns.Add("bad"+i,i==0 ? typeof(object) : table.Columns[i].DataType);
                    foreach(System.Data.DataRow row in table.Rows) bad.Rows.Add(row.ItemArray);
                    table=bad; break;
                case "duplicate-row": table.Rows.Add(table.Rows[0].ItemArray); break;
                case "binding": table.Rows[0][0]=Guid.NewGuid(); break;
                case "slot-null": table.Rows[0][1]=DBNull.Value; break;
                case "key-null": table.Rows[0][2]=DBNull.Value; break;
                case "intent-empty": table.Rows[0][3]=Array.Empty<byte>(); break;
                case "document-null": table.Rows[0][6]=DBNull.Value; break;
                case "receipt-null": table.Rows[0][7]=DBNull.Value; break;
                case "aggregate-null": table.Rows[0][8]=DBNull.Value; break;
            }
            return new System.Data.DataTableReader(ReaderFault=="extra-result" ? new[]{table,table.Copy()} : new[]{table});
        }
    }
    private sealed class LookupWireConnection(DbConnection inner,LookupWire wire) : DbConnection
    {
        [System.Diagnostics.CodeAnalysis.AllowNull] public override string ConnectionString { get=>inner.ConnectionString; set=>inner.ConnectionString=value; }
        public override string Database=>inner.Database; public override string DataSource=>inner.DataSource;
        public override string ServerVersion=>inner.ServerVersion; public override System.Data.ConnectionState State=>inner.State;
        public override void Open()=>inner.Open(); public override void Close()=>inner.Close();
        public override void ChangeDatabase(string databaseName)=>throw new NotSupportedException();
        protected override DbTransaction BeginDbTransaction(System.Data.IsolationLevel isolationLevel)=>new LookupWireTransaction(wire.TransactionOwner ?? this,inner.BeginTransaction(isolationLevel),wire);
        protected override DbCommand CreateDbCommand()=>new LookupWireCommand(this,inner.CreateCommand(),wire);
        protected override void Dispose(bool disposing)
        {
            if(disposing) { try { wire.BeforeConnectionDispose?.Invoke(); } finally { inner.Dispose(); } }
            base.Dispose(disposing);
        }
    }
    private sealed class LookupWireTransaction(DbConnection owner,DbTransaction inner,LookupWire wire) : DbTransaction
    {
        internal DbTransaction Inner=>inner;
        public override System.Data.IsolationLevel IsolationLevel=>wire.TransactionIsolation ?? inner.IsolationLevel;
        protected override DbConnection? DbConnection=>inner.Connection is null ? null : owner;
        public override void Commit() { wire.Commits++; throw new InvalidOperationException("Lookup must not commit."); }
        public override void Rollback() { try { wire.BeforeRollback?.Invoke(); } finally { inner.Rollback(); } }
        protected override void Dispose(bool disposing)
        {
            if(disposing) { try { wire.BeforeTransactionDispose?.Invoke(); } finally { inner.Dispose(); } }
            base.Dispose(disposing);
        }
    }
    private sealed class LookupWireCommand(DbConnection owner,DbCommand inner,LookupWire wire) : DbCommand
    {
        private DbTransaction? transaction;
        [System.Diagnostics.CodeAnalysis.AllowNull] public override string CommandText { get=>inner.CommandText; set=>inner.CommandText=value; }
        public override int CommandTimeout { get=>inner.CommandTimeout; set=>inner.CommandTimeout=value; }
        public override System.Data.CommandType CommandType { get=>inner.CommandType; set=>inner.CommandType=value; }
        public override bool DesignTimeVisible { get=>inner.DesignTimeVisible; set=>inner.DesignTimeVisible=value; }
        public override System.Data.UpdateRowSource UpdatedRowSource { get=>inner.UpdatedRowSource; set=>inner.UpdatedRowSource=value; }
        protected override DbConnection? DbConnection { get=>owner; set=>throw new NotSupportedException(); }
        protected override DbTransaction? DbTransaction { get=>transaction; set { transaction=value; inner.Transaction=((LookupWireTransaction?)value)?.Inner; } }
        protected override DbParameterCollection DbParameterCollection=>inner.Parameters;
        protected override DbParameter CreateDbParameter()=>inner.CreateParameter();
        public override void Cancel()=>inner.Cancel(); public override void Prepare()=>throw new NotSupportedException();
        public override int ExecuteNonQuery() { wire.NonQueries++; throw new InvalidOperationException("Lookup must not write."); }
        public override object? ExecuteScalar() { wire.Scalars++; throw new InvalidOperationException("Unexpected lookup scalar dispatch."); }
        protected override DbDataReader ExecuteDbDataReader(System.Data.CommandBehavior behavior)=>wire.Reader(inner,behavior);
        protected override void Dispose(bool disposing) { if(disposing) inner.Dispose(); base.Dispose(disposing); }
    }
    private static SavePurchaseRequestDraft SaveIntent(PurchaseRecordingModel db)=>new("synthetic-save","B1",PurchaseFixtures.DocumentId,
        PurchaseRequestCommandRules.EqualityToken(db.Documents.GetValueOrDefault(PurchaseFixtures.DocumentId) ?? PurchaseFixtures.Aggregate()),PurchaseFixtures.Header,[]);
    private static SubmitPurchaseRequest SubmitIntent(PurchaseRecordingModel db)=>new("synthetic-submit","B1",PurchaseFixtures.DocumentId,SaveIntent(db).ExpectedStateToken);
    private static string JournalState(PurchaseRecordingModel db)=>JsonSerializer.Serialize(db.Journal.OrderBy(p=>p.Key),PurchaseRequestCommandRules.Json);
    private static SqlPurchaseRequestCommands LookupService(PurchaseRecordingModel db,LookupForbiddenAllocator allocator,
        Func<CancellationToken,Task<AuthoritativeIdentity?>>? resolve=null,bool qualified=true,Guid? binding=null)
        =>new(binding ?? PurchaseFixtures.Binding,PurchaseFixtures.Company,
            (Func<DbConnection>)(()=>new PurchaseRecordingConnection(db,db.Connections++)),
            resolve ?? (_=>Task.FromResult<AuthoritativeIdentity?>(PurchaseFixtures.Identity())),allocator,qualified);
    private static void AssertLookupOnly(PurchaseRecordingModel db,LookupForbiddenAllocator allocator)
    {
        Assert.Equal(0,allocator.QualificationCalls); Assert.Equal(0,allocator.AllocationCalls);
        var allowed=new[]{PurchaseRequestSql.CredentialText,PurchaseRequestSql.GrantsText,PurchaseRequestSql.BranchesText,
            PurchaseRequestSql.ProbeText,PurchaseRequestSql.TransactionText,PurchaseRequestSql.LookupText,PurchaseRequestSql.HeadText,PurchaseRequestSql.DetailsText};
        Assert.All(db.Commands,c=>Assert.Contains(c.CommandText,allowed));
        Assert.DoesNotContain(db.Events,e=>e.EndsWith(":commit-before",StringComparison.Ordinal) || e.EndsWith(":commit-ack",StringComparison.Ordinal));
    }
    private sealed class LookupForbiddenAllocator : IPurchaseRequestIdentifierAllocator
    {
        internal int QualificationCalls,AllocationCalls;
        public bool IsQualified(PurchaseRequestAllocationContext context) { QualificationCalls++; throw new InvalidOperationException("Lookup must not consult allocation."); }
        public Task<PurchaseRequestAllocatedIdentifiers> AllocateAsync(DbTransaction transaction,PurchaseRequestAllocationContext context,CancellationToken token)
        { AllocationCalls++; throw new InvalidOperationException("Lookup must not allocate."); }
    }
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
