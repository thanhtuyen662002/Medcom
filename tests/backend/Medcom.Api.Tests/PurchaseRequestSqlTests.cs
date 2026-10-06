using System.Data;
using System.Data.Common;
using System.Diagnostics.CodeAnalysis;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Medcom.Application;
using Medcom.Application.PurchaseRequests;
using Medcom.Contracts;
using Medcom.Infrastructure;
using Medcom.Infrastructure.PurchaseRequests;
using Microsoft.Data.SqlClient;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class PurchaseRequestSqlTests
{
    [Theory]
    [InlineData(0,"native-user")] [InlineData(1,"native-user")]
    [InlineData(0,"catalog-shape")] [InlineData(1,"catalog-shape")]
    [InlineData(0,"catalog")] [InlineData(1,"catalog")]
    public async Task Native_blank_scope_provider_failure_keeps_phase_custody_and_does_not_allocate(int phase,string stage)
    {
        var db=new PurchaseRecordingModel { NativeBranch=null,Fault=phase+":"+stage };
        var result=await db.Service().CreateAsync(PurchaseFixtures.Create);
        Assert.Equal(PurchaseRequestCommandOutcome.Unavailable,result.Outcome); Assert.Null(result.Receipt);
        Assert.Equal(0,db.AllocatorCalls); Assert.Empty(db.Documents); Assert.Equal(0,db.SubmitEffects);
        Assert.Equal(phase,db.Commits);
        if(phase==0) Assert.Empty(db.Journal);
        else Assert.Equal((byte)0,Assert.Single(db.Journal.Values).State);
    }

    [Theory]
    [InlineData(0)] [InlineData(1)]
    public async Task Invalid_blank_catalog_in_write_phase_is_unavailable_without_business_effects(int phase)
    {
        var db=new PurchaseRecordingModel { NativeBranch="" };
        db.OnStep=(current,stage)=> { if(current==phase && stage=="catalog") db.CatalogAlias=1; };
        var result=await db.Service().CreateAsync(PurchaseFixtures.Create);
        Assert.Equal(PurchaseRequestCommandOutcome.Unavailable,result.Outcome); Assert.Null(result.Receipt);
        Assert.Equal(0,db.AllocatorCalls); Assert.Empty(db.Documents); Assert.Equal(0,db.SubmitEffects);
        Assert.Equal(phase,db.Commits);
        if(phase==0) Assert.Empty(db.Journal);
        else Assert.Equal((byte)0,Assert.Single(db.Journal.Values).State);
    }

    [Theory]
    [InlineData(null)] [InlineData("")]
    public async Task Blank_native_scope_retains_uncertain_commit_receipt_and_never_reallocates_on_replay(string? native)
    {
        var db=new PurchaseRecordingModel { NativeBranch=native,Fault="1:commit-ack" };
        var first=await db.Service().CreateAsync(PurchaseFixtures.Create);
        Assert.Equal(PurchaseRequestCommandOutcome.OutcomeUnknown,first.Outcome); Assert.Null(first.Receipt);
        var original=Assert.Single(db.Journal.Values);
        Assert.Equal((byte)1,original.State); Assert.Equal(1,db.AllocatorCalls);
        db.Fault=null; db.NativeBranch="B2"; db.NativeBranches=["B2"];
        var denied=await db.Service().CreateAsync(PurchaseFixtures.Create);
        Assert.Equal(PurchaseRequestCommandOutcome.Denied,denied.Outcome); Assert.Null(denied.Receipt);
        Assert.Same(original,Assert.Single(db.Journal.Values)); Assert.Equal(1,db.AllocatorCalls);
        db.NativeBranch=native;
        var replay=await db.Service().CreateAsync(PurchaseFixtures.Create);
        Assert.Equal(PurchaseRequestCommandOutcome.Replayed,replay.Outcome);
        Assert.Equal(original.Receipt,JsonSerializer.Serialize(replay.Receipt,PurchaseRequestCommandRules.Json)); Assert.Equal(1,db.AllocatorCalls);
    }

    [Theory]
    [InlineData("case")] [InlineData("accent")] [InlineData("space")]
    public async Task Sql_related_detail_alias_is_fetched_then_rejected_before_reservation_or_submit(string alias)
    {
        var db=new PurchaseRecordingModel(); db.Seed();
        var foreignKey=PurchaseSqlComparisonModel.Alias(PurchaseFixtures.DocumentId,alias);
        Assert.True(PurchaseSqlComparisonModel.CollatedEqual(foreignKey,PurchaseFixtures.DocumentId));
        Assert.NotEqual(PurchaseFixtures.DocumentId,foreignKey);
        db.RelatedAlias=new(foreignKey,new("related-alias-line",PurchaseFixtures.Values with { Quantity="99" }));
        var token=PurchaseRequestCommandRules.EqualityToken(db.Documents[PurchaseFixtures.DocumentId]);
        db.RelatedAlias=db.RelatedAlias with { Line=db.RelatedAlias.Line with { Values=PurchaseFixtures.Values with { Quantity="100" } } };
        var result=await db.Service().SubmitAsync(new("related-alias","B1",PurchaseFixtures.DocumentId,token));
        Assert.Equal(PurchaseRequestCommandOutcome.Conflict,result.Outcome); Assert.Null(result.Receipt);
        Assert.Empty(db.Journal); Assert.Equal(0,db.SubmitEffects); Assert.Equal(0,db.Commits);
        Assert.Equal(1,db.RelatedAliasReads);
    }
    [Fact]
    public async Task Sql_related_alias_inserted_between_phases_conflicts_and_retains_pending_without_submit()
    {
        var db=new PurchaseRecordingModel { RelatedAliasFromPhase=1 }; db.Seed();
        db.RelatedAlias=new(PurchaseFixtures.DocumentId.ToUpperInvariant(),new("late-alias-line",PurchaseFixtures.Values));
        var result=await db.Service().SubmitAsync(new("late-related-alias","B1",PurchaseFixtures.DocumentId,
            PurchaseRequestCommandRules.EqualityToken(db.Documents[PurchaseFixtures.DocumentId])));
        Assert.Equal(PurchaseRequestCommandOutcome.Conflict,result.Outcome); Assert.Null(result.Receipt);
        Assert.Equal((byte)0,Assert.Single(db.Journal.Values).State); Assert.Equal(0,db.SubmitEffects);
        Assert.Equal(1,db.Commits); Assert.Equal(1,db.RelatedAliasReads);
    }
    [Fact]
    public async Task Replay_does_not_disclose_a_cached_partial_receipt_when_a_related_alias_now_exists()
    {
        var db=new PurchaseRecordingModel(); var service=db.Service();
        Assert.Equal(PurchaseRequestCommandOutcome.Committed,(await service.CreateAsync(PurchaseFixtures.Create)).Outcome);
        db.RelatedAlias=new(PurchaseFixtures.DocumentId+" ",new("replay-alias-line",PurchaseFixtures.Values));
        var result=await service.CreateAsync(PurchaseFixtures.Create);
        Assert.Equal(PurchaseRequestCommandOutcome.Conflict,result.Outcome); Assert.Null(result.Receipt);
        Assert.Equal(1,db.AllocatorCalls); Assert.Equal(2,db.Commits); Assert.Equal(1,db.RelatedAliasReads);
    }
    [Theory]
    [InlineData("actor","case")] [InlineData("actor","accent")] [InlineData("actor","space")] [InlineData("actor","zero")]
    [InlineData("group","case")] [InlineData("group","space")] [InlineData("group","zero")]
    [InlineData("delegation","case")] [InlineData("delegation","accent")] [InlineData("delegation","space")] [InlineData("delegation","zero")]
    [InlineData("delegation-permission-group","case")] [InlineData("delegation-permission-group","zero")]
    [InlineData("delegation-enabled-group","case")] [InlineData("delegation-enabled-group","zero")]
    [InlineData("actor-menu","space")]
    public async Task Query_aware_native_grant_model_cannot_borrow_another_physical_principal_or_menu(string route,string alias)
    {
        var db=new PurchaseRecordingModel { PhysicalGrant=PurchaseGrantFixture.For(route,alias) }; db.Seed();
        var result=await db.Service().SubmitAsync(new("physical-grant","B1",PurchaseFixtures.DocumentId,
            PurchaseRequestCommandRules.EqualityToken(db.Documents[PurchaseFixtures.DocumentId])));
        Assert.Equal(PurchaseRequestCommandOutcome.Denied,result.Outcome); Assert.Null(result.Receipt);
        Assert.Empty(db.Journal); Assert.Equal(0,db.SubmitEffects); Assert.Equal(0,db.Commits);
        Assert.Equal(1,db.PhysicalGrantReads);
    }
    [Theory]
    [InlineData("actor")] [InlineData("group")] [InlineData("delegation")]
    public async Task Canonical_actor_group_and_delegated_group_grants_still_authorize_the_fixed_action(string route)
    {
        var db=new PurchaseRecordingModel { PhysicalGrant=PurchaseGrantFixture.For(route,"exact") }; db.Seed();
        var result=await db.Service().SubmitAsync(new("canonical-grant","B1",PurchaseFixtures.DocumentId,
            PurchaseRequestCommandRules.EqualityToken(db.Documents[PurchaseFixtures.DocumentId])));
        Assert.Equal(PurchaseRequestCommandOutcome.Committed,result.Outcome); Assert.Equal(2,result.Receipt!.Document.StatusId);
        var grants=db.Commands.Where(c=>c.CommandText==PurchaseRequestSql.GrantsText).ToArray();
        Assert.NotEmpty(grants);
        Assert.All(grants,c=> { Assert.Equal(DbType.String,c.Parameters["@username"].DbType); Assert.Equal(DbType.String,c.Parameters["@group"].DbType); });
    }
    [Fact]
    public void Actual_SqlClient_parameters_preserve_source_lengths_types_nullability_and_precision()
    {
        // Build parameters only: no connection, server, statement execution or ERP DLL.
        using var cmd=new SqlCommand(); var header=PurchaseRequestCommandRules.Header(PurchaseFixtures.Header);
        PurchaseRequestSql.Header(cmd,header); PurchaseRequestSql.Line(cmd,PurchaseRequestCommandRules.Line(PurchaseFixtures.Values));
        Assert.Equal(SqlDbType.DateTime,cmd.Parameters["@date"].SqlDbType);
        Assert.Equal(SqlDbType.Float,cmd.Parameters["@rate"].SqlDbType);
        Assert.Equal(SqlDbType.NVarChar,cmd.Parameters["@person"].SqlDbType); Assert.Equal(500,cmd.Parameters["@person"].Size);
        Assert.Equal(SqlDbType.VarChar,cmd.Parameters["@currency"].SqlDbType); Assert.Equal(3,cmd.Parameters["@currency"].Size);
        Assert.Equal(SqlDbType.VarChar,cmd.Parameters["@item"].SqlDbType); Assert.Equal(50,cmd.Parameters["@item"].Size);
        Assert.Equal(SqlDbType.NVarChar,cmd.Parameters["@time"].SqlDbType); Assert.Equal(200,cmd.Parameters["@time"].Size);
        Assert.Equal((byte)18,cmd.Parameters["@price"].Precision); Assert.Equal((byte)2,cmd.Parameters["@price"].Scale);
        Assert.All(new[]{"@budget","@quantity","@unitPrice","@total"},n=>
        {Assert.Equal(SqlDbType.Decimal,cmd.Parameters[n].SqlDbType); Assert.Equal((byte)18,cmd.Parameters[n].Precision); Assert.Equal((byte)0,cmd.Parameters[n].Scale);});
        Assert.Equal(DBNull.Value,cmd.Parameters["@budget"].Value); Assert.Equal(DBNull.Value,cmd.Parameters["@model"].Value);
    }
    [Theory]
    [InlineData("1.1")] [InlineData("1000000000000000000")] [InlineData("NaN")] [InlineData("1e3")]
    [InlineData("1.00000000000000000000000000001")] [InlineData("0.00000000000000000000000000001")]
    public async Task Source_integer_decimal_rejects_precision_loss_before_any_io(string value)
    {
        var db=new PurchaseRecordingModel(); var request=PurchaseFixtures.Create with { Lines=[new("line",PurchaseFixtures.Values with { Quantity=value })] };
        Assert.Equal(PurchaseRequestCommandOutcome.InvalidInput,(await db.Service().CreateAsync(request)).Outcome); Assert.Empty(db.Commands);
    }
    [Theory]
    [InlineData("1.239")] [InlineData("10000000000000000")] [InlineData("1.00000000000000000000000000001")]
    public async Task Header_price_rejects_nonrepresentable_scale_and_range(string value)
    {
        var db=new PurchaseRecordingModel();
        Assert.Equal(PurchaseRequestCommandOutcome.InvalidInput,(await db.Service().CreateAsync(PurchaseFixtures.Create with { Header=PurchaseFixtures.Header with { Price=value } })).Outcome);
        Assert.Empty(db.Commands);
    }
    [Fact]
    public void Canonical_decimal_accepts_boundaries_zero_negatives_and_trailing_zeroes_without_business_math()
    {
        Assert.Equal("999999999999999999",PurchaseRequestCommandRules.Decimal("999999999999999999",0));
        Assert.Equal("-2",PurchaseRequestCommandRules.Decimal("-2.0000",0));
        Assert.Equal("9999999999999999.99",PurchaseRequestCommandRules.Decimal("9999999999999999.99",2));
        Assert.Equal("1.20",PurchaseRequestCommandRules.Decimal("01.20000",2));
        Assert.Equal("0",PurchaseRequestCommandRules.Decimal("-0.0000",0));
    }
    [Theory]
    [InlineData("2026-10-06T00:00:00.001")] [InlineData("2026-10-06T00:00:00.000Z")]
    [InlineData("2026-10-06T07:00:00.000+07:00")] [InlineData("1700-01-01T00:00:00.000")]
    [InlineData("9999-12-31T23:59:59.999")]
    public void Date_does_not_guess_offset_or_silently_round_SQL_datetime(string value)
        =>Assert.Throws<ArgumentException>(()=>PurchaseRequestCommandRules.Date(value));
    [Theory]
    [InlineData("2026-10-06T00:00:00.000")] [InlineData("2026-10-06T00:00:00.003")] [InlineData("2026-10-06T00:00:00.007")]
    [InlineData("9999-12-31T23:59:59.997")]
    public void Exact_SQL_datetime_values_are_accepted(string value)=>Assert.Equal(value,PurchaseRequestCommandRules.Date(value));
    [Fact]
    public async Task Maximum_datetime_overflow_is_invalid_input_not_an_unhandled_provider_exception()
    {
        var db=new PurchaseRecordingModel();
        var input=PurchaseFixtures.Create with { Header=PurchaseFixtures.Header with { PurchaseDate="9999-12-31T23:59:59.999" } };
        Assert.Equal(PurchaseRequestCommandOutcome.InvalidInput,(await db.Service().CreateAsync(input)).Outcome);
        Assert.Empty(db.Commands);
    }
    [Theory]
    [InlineData(double.NaN)] [InlineData(double.PositiveInfinity)] [InlineData(double.NegativeInfinity)]
    public async Task Nonfinite_source_float_is_rejected_without_io(double value)
    {
        var db=new PurchaseRecordingModel();
        Assert.Equal(PurchaseRequestCommandOutcome.InvalidInput,(await db.Service().CreateAsync(PurchaseFixtures.Create with { Header=PurchaseFixtures.Header with { RateExchange=value } })).Outcome);
        Assert.Empty(db.Commands);
    }
    [Fact]
    public void Json_body_is_closed_for_identity_generated_keys_status_lock_and_nested_unknown_fields()
    {
        var json=JsonSerializer.Serialize(PurchaseFixtures.Create,PurchaseRequestCommandRules.Json);
        foreach(var field in new[]{"actor","companyId","purchaseRequestId","statusId","isLocked","sql"})
            Assert.Throws<JsonException>(()=>JsonSerializer.Deserialize<CreatePurchaseRequestDraft>(json[..^1]+",\""+field+"\":\"injected\"}",PurchaseRequestCommandRules.Json));
        Assert.Throws<JsonException>(()=>JsonSerializer.Deserialize<PurchaseRequestLineValues>("{\"itemId\":\"I\",\"quantity\":\"1\",\"unitPrice\":\"1\",\"purchaseRequestId\":\"foreign\"}",PurchaseRequestCommandRules.Json));
    }
    [Fact]
    public void State_token_is_deterministic_state_equality_and_preserves_null_lock_not_history()
    {
        var a=PurchaseFixtures.Aggregate(2); var reordered=a with { Lines=a.Lines.Reverse().ToArray() };
        Assert.Equal(PurchaseRequestCommandRules.EqualityToken(a),PurchaseRequestCommandRules.EqualityToken(reordered));
        Assert.NotEqual(PurchaseRequestCommandRules.EqualityToken(a),PurchaseRequestCommandRules.EqualityToken(a with { IsLocked=null }));
        // Identical delete/reinsert cannot be distinguished: no fictitious monotonic/ABA claim.
        Assert.Equal(PurchaseRequestCommandRules.EqualityToken(a),PurchaseRequestCommandRules.EqualityToken(a with { }));
    }
    [Theory]
    [InlineData("insert-head")] [InlineData("insert-line")] [InlineData("submit")] [InlineData("complete")]
    public async Task Affected_count_mismatch_rolls_back_business_and_receipt_without_success(string stage)
    {
        var db=new PurchaseRecordingModel { WrongCount=stage };
        var result=await db.Service().CreateAsync(PurchaseFixtures.Create with { SubmitAfterCreate=true });
        Assert.NotEqual(PurchaseRequestCommandOutcome.Committed,result.Outcome); Assert.Null(result.Receipt); Assert.Empty(db.Documents);
        Assert.All(db.Journal.Values,e=>Assert.Equal((byte)0,e.State));
    }
    [Fact]
    public async Task Readback_mismatch_rolls_back_and_invalid_marker_fails_before_allocator()
    {
        var db=new PurchaseRecordingModel { CorruptReadback=true };
        Assert.Equal(PurchaseRequestCommandOutcome.Unavailable,(await db.Service().CreateAsync(PurchaseFixtures.Create)).Outcome);
        Assert.Empty(db.Documents); db=new() { InvalidProbe=true };
        Assert.Equal(PurchaseRequestCommandOutcome.QualificationRequired,(await db.Service().CreateAsync(PurchaseFixtures.Create)).Outcome);
        Assert.Empty(db.Journal); Assert.Equal(0,db.AllocatorCalls);
    }
    [Fact]
    public async Task Allocator_cannot_use_foreign_document_repeated_line_ids_or_escape_caller_transaction()
    {
        foreach(var bad in new[]{"document","line","transaction"})
        {
            var db=new PurchaseRecordingModel { BadAllocation=bad };
            var request=PurchaseFixtures.Create with { Lines=[new("a",PurchaseFixtures.Values),new("b",PurchaseFixtures.Values)] };
            Assert.NotEqual(PurchaseRequestCommandOutcome.Committed,(await db.Service().CreateAsync(request)).Outcome);
            Assert.Empty(db.Documents);
        }
    }
    [Fact]
    public async Task Mutable_input_is_frozen_before_first_await_and_pre_cancel_opens_nothing()
    {
        var db=new PurchaseRecordingModel(); var lines=new List<PurchaseRequestNewLine>(PurchaseFixtures.Create.Lines);
        var gate=new TaskCompletionSource<AuthoritativeIdentity?>(TaskCreationOptions.RunContinuationsAsynchronously);
        db.FirstSession=gate.Task;
        var running=db.Service().CreateAsync(PurchaseFixtures.Create with { Lines=lines }); lines.Clear();
        gate.SetResult(PurchaseFixtures.Identity());
        Assert.Single((await running).Receipt!.Document.Lines);
        db=new(); using var cancelled=new CancellationTokenSource(); cancelled.Cancel();
        Assert.Equal(PurchaseRequestCommandOutcome.Cancelled,(await db.Service().CreateAsync(PurchaseFixtures.Create,cancelled.Token)).Outcome);
        Assert.Empty(db.Commands);
    }
}

internal static class PurchaseFixtures
{
    internal static readonly Guid Binding=new("05140514-0514-0514-0514-051405140514");
    internal const string DocumentId="synthetic-request-1";
    internal const string Actor="synthetic.actor",Group="synthetic.group",Stored="synthetic-hash-not-a-credential";
    internal static readonly LegacyCompany Company=new("synthetic.tenant","synthetic.company","Synthetic fixture");
    internal static PurchaseRequestHeaderInput Header=>new("2026-10-06T00:00:00.000",null,"Synthetic requester","Synthetic department",null,"15",null,"VND","synthetic-object",1);
    internal static PurchaseRequestLineValues Values=>new("synthetic-item",null,"free-form requirement","2","5","13",null);
    internal static CreatePurchaseRequestDraft Create=>new("synthetic-create","B1",Header,[new("client-1",Values)]);
    internal static AuthoritativeIdentity Identity(long version=1)=>new(Actor,Company.TenantId,Company.CompanyId,Company.CompanyName,"Synthetic actor",version,[],
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(Actor+"\0"+Stored+"\0"+Group))),["B1","B2"]);
    internal static PurchaseRequestAggregate Aggregate(int count=1)=>PurchaseRequestCommandRules.Normalize(new(DocumentId,"B1",Header,1,false,
        Enumerable.Range(1,count).Select(i=>new PurchaseRequestPersistedLine("line-"+i,Values)).ToArray()));
}

// Only in test assembly. Runs ALL fixed SQL plans through the production command class.
// This records transaction ownership/faults, not SQL Server locking or deployment qualification.
internal sealed class PurchaseRecordingModel : IPurchaseRequestIdentifierAllocator
{
    internal Dictionary<string,PurchaseRequestAggregate> Documents=new(StringComparer.Ordinal);
    internal Dictionary<string,PurchaseJournalEntry> Journal=new(StringComparer.Ordinal);
    internal readonly List<DbCommand> Commands=[];
    internal readonly List<string> Events=[];
    internal int Connections,Commits,AllocatorCalls,SubmitEffects,SessionCalls;
    internal string? Fault,Denial,WrongCount,BadAllocation;
    internal int RevokeAt,VersionChangeAt;
    internal string? NativeBranch="B1";
    internal string[] NativeBranches=["B1"],CatalogBranches=["B1"];
    internal int CatalogShape=1,CatalogAlias;
    internal Action<int,string>? OnStep;
    internal bool AllocatorQualified=true,InvalidProbe,CorruptReadback,CorruptKey;
    internal PurchaseRelatedAlias? RelatedAlias;
    internal PurchaseGrantFixture? PhysicalGrant;
    internal int RelatedAliasReads,PhysicalGrantReads,RelatedAliasFromPhase;
    internal Task<AuthoritativeIdentity?>? FirstSession;
    internal void Seed(int count=1)=>Documents[PurchaseFixtures.DocumentId]=PurchaseFixtures.Aggregate(count);
    internal SqlPurchaseRequestCommands Service(bool qualified=true)=>new(PurchaseFixtures.Binding,PurchaseFixtures.Company,
        (Func<DbConnection>)(()=>new PurchaseRecordingConnection(this,Connections++)),Resolve,this,qualified);
    private Task<AuthoritativeIdentity?> Resolve(CancellationToken token)
    {
        SessionCalls++; if(SessionCalls==1 && FirstSession is not null) return FirstSession;
        return Task.FromResult<AuthoritativeIdentity?>(RevokeAt==SessionCalls ? null : PurchaseFixtures.Identity(VersionChangeAt==SessionCalls ? 2 : 1));
    }
    internal void Event(int phase,string name)
    {var key=phase+":"+name;Events.Add(key);OnStep?.Invoke(phase,name);if(Fault==key)throw new IOException("Synthetic recording fault.");}
    public bool IsQualified(PurchaseRequestAllocationContext context)=>AllocatorQualified;
    public Task<PurchaseRequestAllocatedIdentifiers> AllocateAsync(DbTransaction transaction,PurchaseRequestAllocationContext context,CancellationToken token)
    {
        var tx=Assert.IsType<PurchaseRecordingTransaction>(transaction); Event(tx.Owner.Phase,"allocate"); AllocatorCalls++;
        if(BadAllocation=="transaction") tx.InvalidTransaction=true;
        var document=context.ExistingDocumentId ?? (BadAllocation=="document" ? "invalid\0id" : "synthetic-request-"+AllocatorCalls);
        return Task.FromResult(new PurchaseRequestAllocatedIdentifiers(document,context.ClientLineKeys.Select((key,i)=>
            new PurchaseRequestAllocatedLine(key,"allocated-line-"+AllocatorCalls+"-"+(BadAllocation=="line" ? 0 : i))).ToArray()));
    }
}
internal sealed record PurchaseJournalEntry(byte[] Slot,byte[] Key,byte[] Intent,Guid Attempt,byte State,string? Document=null,string? Receipt=null,byte[]? Aggregate=null);
internal sealed class PurchaseRecordingConnection(PurchaseRecordingModel model,int phase) : DbConnection
{
    internal PurchaseRecordingModel Model=>model; internal int Phase=>phase; private ConnectionState state;
    [AllowNull] public override string ConnectionString{get;set;}="";
    public override string Database=>"Synthetic"; public override string DataSource=>"Synthetic"; public override string ServerVersion=>"Synthetic";
    public override ConnectionState State=>state;
    public override void Open(){model.Event(phase,"open");state=ConnectionState.Open;}
    public override void Close()=>state=ConnectionState.Closed;
    public override void ChangeDatabase(string databaseName)=>throw new NotSupportedException();
    protected override DbTransaction BeginDbTransaction(IsolationLevel isolationLevel)
    {Assert.Equal(IsolationLevel.Serializable,isolationLevel);model.Event(phase,"begin");return new PurchaseRecordingTransaction(this);}
    protected override DbCommand CreateDbCommand(){var command=new PurchaseRecordingCommand(this);model.Commands.Add(command);return command;}
    protected override void Dispose(bool disposing){if(disposing)Close();base.Dispose(disposing);}
}
internal sealed class PurchaseRecordingTransaction(PurchaseRecordingConnection owner) : DbTransaction
{
    internal PurchaseRecordingConnection Owner=>owner;
    internal Dictionary<string,PurchaseRequestAggregate> Documents=new(owner.Model.Documents,StringComparer.Ordinal);
    internal Dictionary<string,PurchaseJournalEntry> Journal=new(owner.Model.Journal,StringComparer.Ordinal);
    internal bool Mutated,InvalidTransaction; private bool live=true;
    public override IsolationLevel IsolationLevel=>IsolationLevel.Serializable;
    protected override DbConnection? DbConnection=>live ? owner : null;
    public override void Commit()
    {
        owner.Model.Event(owner.Phase,"commit-before"); owner.Model.Documents=new(Documents,StringComparer.Ordinal);owner.Model.Journal=new(Journal,StringComparer.Ordinal);
        owner.Model.Commits++;live=false;owner.Model.Event(owner.Phase,"commit-ack");
    }
    public override void Rollback(){live=false;owner.Model.Events.Add(owner.Phase+":rollback");}
}
internal sealed class PurchaseRecordingCommand(PurchaseRecordingConnection owner) : DbCommand
{
    private readonly RecordingParameters parameters=new();
    [AllowNull] public override string CommandText{get;set;}="";
    public override int CommandTimeout{get;set;} public override CommandType CommandType{get;set;}=CommandType.Text;
    public override bool DesignTimeVisible{get;set;} public override UpdateRowSource UpdatedRowSource{get;set;}
    protected override DbConnection? DbConnection{get=>owner;set=>throw new NotSupportedException();}
    protected override DbTransaction? DbTransaction{get;set;}
    protected override DbParameterCollection DbParameterCollection=>parameters;
    protected override DbParameter CreateDbParameter()=>new RecordingParameter();
    public override void Cancel(){} public override void Prepare(){} public override object? ExecuteScalar()=>throw new NotSupportedException();
    private PurchaseRecordingTransaction Tx=>Assert.IsType<PurchaseRecordingTransaction>(DbTransaction);
    private object P(string name)=>parameters[name].Value!;
    private string Slot=>Convert.ToHexString((byte[])P("@slot"));
    private void Check(){Assert.Same(owner,Tx.Connection);Assert.Equal(IsolationLevel.Serializable,Tx.IsolationLevel);Assert.Equal(5,CommandTimeout);}
    protected override DbDataReader ExecuteDbDataReader(CommandBehavior behavior)
    {
        Check(); var model=owner.Model; var denial=model.Denial;
        if(CommandText==PurchaseRequestSql.CredentialText)
        {model.Event(owner.Phase,"credential");return Table([typeof(string),typeof(string),typeof(bool),typeof(string),typeof(bool)],
            [PurchaseFixtures.Actor,denial=="credential" ? "changed synthetic" : PurchaseFixtures.Stored,false,PurchaseFixtures.Group,false]).CreateDataReader();}
        if(CommandText==PurchaseRequestSql.GrantsText)
        {
            model.Event(owner.Phase,"grants"); var add=denial=="add" ? 0 : 1; var update=denial=="update" ? 0 : 1;
            if(model.PhysicalGrant is {} grant)
            {
                model.PhysicalGrantReads++;
                add=update=grant.Matches(CommandText,(string)P("@username"),(string)P("@group"),(string)P("@menu")) ? 1 : 0;
            }
            return Table([typeof(string),typeof(string),typeof(string),typeof(bool),typeof(string),typeof(bool),typeof(int),typeof(int)],
                [PurchaseRequestCommandRules.MenuId,denial=="menu" ? "WrongForm" : PurchaseRequestCommandRules.FormId,DBNull.Value,false,"05",denial=="parent",add,update]).CreateDataReader();
        }
        if(CommandText==SqlLegacyBranchScope.NativeUserText)
        {
            model.Event(owner.Phase,"native-user");
            Assert.Equal(PurchaseFixtures.Actor,P("@actor"));
            return Table([typeof(string),typeof(string),typeof(bool),typeof(string),typeof(bool),typeof(string)],
                [PurchaseFixtures.Actor,PurchaseFixtures.Stored,false,PurchaseFixtures.Group,false,(object?)model.NativeBranch ?? DBNull.Value]).CreateDataReader();
        }
        if(CommandText==SqlLegacyBranchScope.RestrictedText)
        {
            model.Event(owner.Phase,"branches");
            var table=Table([typeof(string)]);
            foreach(var branch in denial=="branch" ? new[]{"B2"} : model.NativeBranches) table.Rows.Add(branch);
            return table.CreateDataReader();
        }
        if(CommandText==SqlLegacyBranchScope.CatalogShapeText)
        {model.Event(owner.Phase,"catalog-shape");return Table([typeof(int)],[model.CatalogShape]).CreateDataReader();}
        if(CommandText==SqlLegacyBranchScope.CatalogText)
        {
            model.Event(owner.Phase,"catalog");
            var table=Table([typeof(string),typeof(int)]);
            foreach(var branch in denial=="branch" ? new[]{"B2"} : model.CatalogBranches) table.Rows.Add(branch,model.CatalogAlias);
            return table.CreateDataReader();
        }
        if(CommandText==PurchaseRequestSql.ProbeText)
        {model.Event(owner.Phase,"probe");return Table([typeof(int),typeof(Guid),typeof(int),typeof(int)],[1,PurchaseFixtures.Binding,1,model.InvalidProbe ? 0 : 1]).CreateDataReader();}
        if(CommandText==PurchaseRequestSql.TransactionText)
        {model.Event(owner.Phase,"transaction");return Table([typeof(int),typeof(int)],[Tx.InvalidTransaction ? 2 : 1,1]).CreateDataReader();}
        if(CommandText==PurchaseRequestSql.LookupText)
        {
            var t=Table([typeof(Guid),typeof(byte[]),typeof(byte[]),typeof(byte[]),typeof(Guid),typeof(byte),typeof(string),typeof(string),typeof(byte[])]);
            if(Tx.Journal.TryGetValue(Slot,out var entry))
            {
                model.Event(owner.Phase,entry.State==1 ? "receipt-read" : owner.Phase==0 ? "reservation-read" : "lookup");
                t.Rows.Add(PurchaseFixtures.Binding,entry.Slot,model.CorruptKey ? entry.Key.Concat(new byte[]{0}).ToArray() : entry.Key,entry.Intent,entry.Attempt,entry.State,
                    entry.Document is null ? DBNull.Value : entry.Document,entry.Receipt is null ? DBNull.Value : entry.Receipt,entry.Aggregate is null ? DBNull.Value : entry.Aggregate);
            }
            else model.Event(owner.Phase,"lookup");
            return t.CreateDataReader();
        }
        if(CommandText==PurchaseRequestSql.HeadText)
        {
            model.Event(owner.Phase,Tx.Mutated ? "readback" : "head-read");
            var t=Table([typeof(string),typeof(DateTime),typeof(int),typeof(string),typeof(string),typeof(string),typeof(decimal),typeof(string),typeof(int),typeof(bool),typeof(string),typeof(string),typeof(double),typeof(string)]);
            if(Tx.Documents.TryGetValue((string)P("@document"),out var doc))
            {
                var h=doc.Header;
                t.Rows.Add(doc.PurchaseRequestId,O(h.PurchaseDate is null ? null : DateTime.Parse(h.PurchaseDate,CultureInfo.InvariantCulture)),O(h.PurposeId),h.PersonSuggest,h.Department,
                    O(h.PurposeDescOrClient),O(D(h.Price)),model.CorruptReadback && Tx.Mutated ? "corrupt synthetic" : O(h.Notes),doc.StatusId,O(doc.IsLocked),h.CurrencyId,h.ObjectId,h.RateExchange,doc.BranchId);
            }
            return t.CreateDataReader();
        }
        if(CommandText==PurchaseRequestSql.DetailsText)
        {
            model.Event(owner.Phase,"details-read");var t=Table([typeof(string),typeof(string),typeof(decimal),typeof(string),typeof(decimal),typeof(decimal),typeof(decimal),typeof(string),typeof(string)]);
            if(Tx.Documents.TryGetValue((string)P("@document"),out var doc))foreach(var line in doc.Lines)
            {var v=line.Values;t.Rows.Add(line.LineId,v.ItemId,O(D(v.Budget)),O(v.TimeRequired),D(v.Quantity),D(v.UnitPrice),O(D(v.TotalPrice)),O(v.Model),doc.PurchaseRequestId);}
            if(owner.Phase>=model.RelatedAliasFromPhase && model.RelatedAlias is {} alias
                && PurchaseSqlComparisonModel.Matches(CommandText,"PurchaseRequestID","@document",alias.ForeignKey,(string)P("@document")))
            {
                model.RelatedAliasReads++; var v=alias.Line.Values;
                t.Rows.Add(alias.Line.LineId,v.ItemId,O(D(v.Budget)),O(v.TimeRequired),D(v.Quantity),D(v.UnitPrice),O(D(v.TotalPrice)),O(v.Model),alias.ForeignKey);
            }
            return t.CreateDataReader();
        }
        throw new NotSupportedException("Unrecognized fixed SQL.");
    }
    public override int ExecuteNonQuery()
    {
        Check();var model=owner.Model;string stage;
        if(CommandText==PurchaseRequestSql.ReserveText)
        {
            stage="reserve";model.Event(owner.Phase,stage);
            Tx.Journal.Add(Slot,new((byte[])P("@slot"),(byte[])P("@keyBytes"),(byte[])P("@intentBytes"),(Guid)P("@attempt"),0));
        }
        else if(CommandText==PurchaseRequestSql.CompleteText)
        {
            stage="complete";model.Event(owner.Phase,stage);var old=Tx.Journal[Slot];
            if(old.Attempt!=(Guid)P("@attempt") || old.State!=0 || !old.Key.AsSpan().SequenceEqual((byte[])P("@keyBytes"))
                || !old.Intent.AsSpan().SequenceEqual((byte[])P("@intentBytes")))return 0;
            Assert.Equal(old.Key.Length,P("@keyLength"));Assert.Equal(old.Intent.Length,P("@intentLength"));
            Tx.Journal[Slot]=old with { State=1,Document=(string)P("@document"),Receipt=(string)P("@receipt"),Aggregate=(byte[])P("@aggregate") };
        }
        else if(CommandText==PurchaseRequestSql.InsertHeadText)
        {
            stage="insert-head";model.Event(owner.Phase,stage);var id=(string)P("@document");
            Tx.Documents.Add(id,new(id,(string)P("@branch"),Header(),1,false,[]));Tx.Mutated=true;
        }
        else if(CommandText==PurchaseRequestSql.UpdateHeadText)
        {
            stage="update-head";model.Event(owner.Phase,stage);var id=(string)P("@document");var old=Tx.Documents[id];
            if(old.BranchId!=(string)P("@branchScope") || old.StatusId!=1 || old.IsLocked is true)return 0;
            Tx.Documents[id]=old with { Header=Header() };Tx.Mutated=true;
        }
        else if(CommandText==PurchaseRequestSql.InsertLineText || CommandText==PurchaseRequestSql.UpdateLineText || CommandText==PurchaseRequestSql.DeleteLineText)
        {
            stage=CommandText==PurchaseRequestSql.InsertLineText ? "insert-line" : CommandText==PurchaseRequestSql.UpdateLineText ? "update-line" : "delete-line";
            model.Event(owner.Phase,stage);var id=(string)P("@document");var old=Tx.Documents[id];var lines=old.Lines.ToList();
            if(stage=="insert-line")lines.Add(new((string)P("@line"),Line()));
            else
            {
                var index=lines.FindIndex(l=>l.LineId==(string)P("@lineScope"));if(index<0)return 0;
                if(stage=="delete-line")lines.RemoveAt(index);else lines[index]=new((string)P("@lineScope"),Line());
            }
            Tx.Documents[id]=old with { Lines=lines };Tx.Mutated=true;
        }
        else if(CommandText==PurchaseRequestSql.SubmitText)
        {
            stage="submit";model.Event(owner.Phase,stage);var id=(string)P("@document");var old=Tx.Documents[id];
            if(old.StatusId!=1 || old.IsLocked is true || old.BranchId!=(string)P("@branchScope"))return 0;
            Tx.Documents[id]=old with { StatusId=2,IsLocked=true };model.SubmitEffects++;Tx.Mutated=true;
        }
        else throw new NotSupportedException("Unrecognized fixed SQL mutation.");
        return model.WrongCount==stage ? 2 : 1;
    }
    private string? S(string name)=>P(name)==DBNull.Value ? null : (string)P(name);
    private string? Decimal(string name,byte scale)=>P(name)==DBNull.Value ? null : ((decimal)P(name)).ToString(scale==0 ? "0" : "0.00",CultureInfo.InvariantCulture);
    private PurchaseRequestHeaderInput Header()=>new(P("@date")==DBNull.Value ? null : ((DateTime)P("@date")).ToString("yyyy-MM-dd'T'HH:mm:ss.fff",CultureInfo.InvariantCulture),
        P("@purpose")==DBNull.Value ? null : (int)P("@purpose"),S("@person")!,S("@department")!,S("@description"),Decimal("@price",2),S("@notes"),S("@currency")!,S("@object")!,(double)P("@rate"));
    private PurchaseRequestLineValues Line()=>new(S("@item")!,Decimal("@budget",0),S("@time"),Decimal("@quantity",0)!,Decimal("@unitPrice",0)!,Decimal("@total",0),S("@model"));
    private static object O(object? value)=>value ?? DBNull.Value;
    private static decimal? D(string? value)=>value is null ? null : decimal.Parse(value,CultureInfo.InvariantCulture);
    private static DataTable Table(Type[] types,object[]? values=null)
    {var table=new DataTable();for(var i=0;i<types.Length;i++)table.Columns.Add("C"+i,types[i]);if(values is not null)table.Rows.Add(values);return table;}
}

internal sealed record PurchaseRelatedAlias(string ForeignKey,PurchaseRequestPersistedLine Line);
internal sealed record PurchaseGrantFixture(string Route,string Principal,string PermissionGroup,string DelegatingGroup,string EnabledGroup,string Menu)
{
    internal static PurchaseGrantFixture For(string route,string alias)
    {
        var actor=PurchaseFixtures.Actor; var group=PurchaseFixtures.Group; var menu=PurchaseRequestCommandRules.MenuId;
        return new(route,route is "actor" or "delegation" ? PurchaseSqlComparisonModel.Alias(actor,alias) : actor,
            route is "group" or "delegation-permission-group" ? PurchaseSqlComparisonModel.Alias(group,alias) : group,
            group,route=="delegation-enabled-group" ? PurchaseSqlComparisonModel.Alias(group,alias) : group,
            route=="actor-menu" ? PurchaseSqlComparisonModel.Alias(menu,alias) : menu);
    }
    internal bool Matches(string sql,string actor,string group,string menu)
    {
        var owner=Route switch
        {
            "actor" or "actor-menu"=>PurchaseSqlComparisonModel.Matches(sql,"P.UserName","@username",Principal,actor),
            "group"=>PurchaseSqlComparisonModel.Matches(sql,"P.UserGroupID","@group",PermissionGroup,group),
            _=>PurchaseSqlComparisonModel.Matches(sql,"U.UserAuthority","@username",Principal,actor)
                && PurchaseSqlComparisonModel.Matches(sql,"U.UserGroupID","P.UserGroupID",DelegatingGroup,PermissionGroup)
                && PurchaseSqlComparisonModel.Matches(sql,"G.UserGroupID","U.UserGroupID",EnabledGroup,DelegatingGroup)
        };
        return owner && PurchaseSqlComparisonModel.Matches(sql,"G.MenuID","M.MenuID",Menu,menu);
    }
}
// A narrow parameter-aware SQL comparison model, not a SQL Server engine or incidence proof.
// CI/AI with SQL space padding models the reported compatible target layout; exact binary
// equality separately models zero padding, so merely adding CONVERT without length is insufficient.
internal static class PurchaseSqlComparisonModel
{
    internal static string Alias(string value,string kind)=>kind switch
    { "case"=>value.ToUpperInvariant(),"accent"=>value.Contains('a') ? value.Replace("a","\u00e1",StringComparison.Ordinal) : value.Replace("e","\u00e9",StringComparison.Ordinal),"space"=>value+" ","zero"=>value+"\0",_=>value };
    internal static bool CollatedEqual(string left,string right)=>CultureInfo.InvariantCulture.CompareInfo.Compare(
        left.TrimEnd(' '),right.TrimEnd(' '),CompareOptions.IgnoreCase|CompareOptions.IgnoreNonSpace)==0;
    internal static bool Matches(string sql,string leftExpression,string rightExpression,string left,string right)
    {
        var compact=System.Text.RegularExpressions.Regex.Replace(sql,@"\s+","");
        var l="CONVERT(nvarchar(max),"+leftExpression+")";
        var r=rightExpression.StartsWith('@') ? rightExpression : "CONVERT(nvarchar(max),"+rightExpression+")";
        // Document FK is already nvarchar; recognize the previous byte-exact filter too.
        var binary=compact.Contains("CONVERT(varbinary(max),"+l+")=CONVERT(varbinary(max),"+r+")",StringComparison.Ordinal)
            || compact.Contains("CONVERT(varbinary(max),"+leftExpression+")=CONVERT(varbinary(max),"+rightExpression+")",StringComparison.Ordinal);
        var native=compact.Contains(leftExpression+"="+rightExpression,StringComparison.Ordinal);
        Assert.True(binary || native,"Unmodeled fixed predicate: "+leftExpression+" / "+rightExpression);
        if(!binary) return CollatedEqual(left,right);
        var a=Encoding.Unicode.GetBytes(left); var b=Encoding.Unicode.GetBytes(right);
        var length=compact.Contains("DATALENGTH("+l+")=DATALENGTH("+r+")",StringComparison.Ordinal);
        if(length && a.Length!=b.Length) return false;
        for(var i=0;i<Math.Max(a.Length,b.Length);i++) if((i<a.Length ? a[i] : 0)!=(i<b.Length ? b[i] : 0)) return false;
        return true;
    }
}
