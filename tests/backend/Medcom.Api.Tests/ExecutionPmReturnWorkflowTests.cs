using System.Data;
using System.Data.Common;
using System.Data.SqlTypes;
using System.Diagnostics.CodeAnalysis;
using System.Security.Cryptography;
using Medcom.Application;
using Medcom.Application.Transfers;
using Medcom.Infrastructure.Execution.PmReturn;
using Medcom.Infrastructure.Transfers;
using Xunit;

namespace Medcom.Api.Tests;

// No SqlConnection or real engine. Production orchestrator + actual SQL plans/probes/codecs,
// transactional recording snapshots and an injected I06/legacy boundary with adversarial faults.
public sealed class ExecutionPmReturnWorkflowTests
{
    [Fact]
    public async Task Actual_orchestrator_commits_reservation_then_atomic_effect_audit_receipt_and_replays_original()
    {
        var model=new WorkflowModel();
        var result=await model.Workflow().ExecuteAsync(I06Fixtures.Request);
        Assert.Equal(PmReturnWorkflowKind.Committed,result.Kind);
        Assert.Equal(2,model.CommitAcks); Assert.Equal(1,model.Dispatches); Assert.Equal(30,model.Status);
        Assert.Single(model.Journal.Rows.Cast<DataRow>()); Assert.Single(model.Audit.Rows.Cast<DataRow>());
        Assert.Equal(model.Audit.Rows[0]["AuditId"].ToString(),result.Receipt!.DurableAuditId);
        Assert.Equal(1,model.Journal.Rows[0]["State"]);
        Assert.True(model.Events.IndexOf("p0:commit-ack")<model.Events.IndexOf("p1:source"));
        Assert.True(model.Events.IndexOf("p1:source")<model.Events.IndexOf("p1:audit-insert"));
        Assert.True(model.Events.IndexOf("p1:audit-insert")<model.Events.IndexOf("p1:cas"));
        var original=result.Receipt; model.Status=99;
        var replay=await model.Workflow().ExecuteAsync(I06Fixtures.Request);
        Assert.Equal(PmReturnWorkflowKind.Replayed,replay.Kind); Assert.Equal(original,replay.Receipt);
        Assert.Equal(1,model.Dispatches); Assert.Single(model.Audit.Rows.Cast<DataRow>());
        Assert.True(model.SessionCalls>=6);
        Assert.All(model.Commands,c=>Assert.Equal(IsolationLevel.Serializable,c.Transaction!.IsolationLevel));
    }
    [Theory]
    [InlineData("p0:open")] [InlineData("p0:begin")] [InlineData("p0:authority")]
    [InlineData("p0:journal-probe")] [InlineData("p0:audit-probe")] [InlineData("p0:lookup")]
    [InlineData("p0:reserve")] [InlineData("p0:commit-before")] [InlineData("p0:commit-ack")]
    [InlineData("p0:audit-absence")] [InlineData("p1:audit-absence")]
    [InlineData("p1:open")] [InlineData("p1:begin")] [InlineData("p1:authority")]
    [InlineData("p1:journal-probe")] [InlineData("p1:audit-probe")] [InlineData("p1:lookup")]
    [InlineData("p1:source")] [InlineData("p1:transaction")] [InlineData("p1:audit-insert")]
    [InlineData("p1:cas")] [InlineData("p1:readback")] [InlineData("p1:audit-read")]
    [InlineData("p1:commit-before")] [InlineData("p1:commit-ack")]
    public async Task Faults_never_fabricate_success_or_retry_and_keep_committed_reservation(string fault)
    {
        var model=new WorkflowModel { Fault=fault };
        var result=await model.Workflow().ExecuteAsync(I06Fixtures.Request);
        Assert.Null(result.Receipt); Assert.NotEqual(PmReturnWorkflowKind.Committed,result.Kind);
        Assert.InRange(model.Dispatches,0,1);
        if(fault.StartsWith("p0:")) Assert.Equal(0,model.Dispatches);
        if(fault.Contains("commit-")) Assert.Equal(PmReturnWorkflowKind.OutcomeUnknown,result.Kind);
        if(fault.StartsWith("p1:") && fault!="p1:commit-ack")
        { Assert.Equal(2,model.Journal.Rows[0]["State"]); Assert.Empty(model.Audit.Rows.Cast<DataRow>()); Assert.Equal(10,model.Status); }
        if(fault=="p1:commit-ack")
        {
            Assert.Equal(1,model.Journal.Rows[0]["State"]); Assert.Single(model.Audit.Rows.Cast<DataRow>());
            model.Fault=null;
            Assert.Equal(PmReturnWorkflowKind.Replayed,(await model.Workflow().ExecuteAsync(I06Fixtures.Request)).Kind);
            Assert.Equal(1,model.Dispatches);
        }
    }
    [Theory]
    [InlineData(1)] [InlineData(2)] [InlineData(3)] [InlineData(4)] [InlineData(5)]
    public async Task Live_session_revocation_is_checked_at_each_phase_and_before_commit(int call)
    {
        var model=new WorkflowModel { RevokeAt=call };
        var result=await model.Workflow().ExecuteAsync(I06Fixtures.Request);
        Assert.Null(result.Receipt); Assert.NotEqual(PmReturnWorkflowKind.Committed,result.Kind);
        Assert.Empty(model.Audit.Rows.Cast<DataRow>()); Assert.Equal(10,model.Status);
        Assert.Equal(call==5 ? 1 : 0,model.Dispatches);
        if(call>=3) Assert.Equal(2,model.Journal.Rows[0]["State"]);
    }
    [Theory]
    [InlineData(2)] [InlineData(3)] [InlineData(4)]
    public async Task Retained_key_has_no_restart_takeover_even_with_valid_authority(int state)
    {
        var model=new WorkflowModel { Journal=ExecutionPmReturnJournalTests.Rows(I07Fixtures.Intent(),state) };
        Assert.Equal(PmReturnWorkflowKind.Blocked,(await model.Workflow().ExecuteAsync(I06Fixtures.Request)).Kind);
        Assert.Equal(0,model.Dispatches); Assert.Equal(0,model.CommitAcks);
    }
    [Fact]
    public async Task Concurrent_reserve_insert_conflict_has_no_second_dispatch()
    {
        var model=new WorkflowModel { Fault="p0:reserve" };
        Assert.Equal(PmReturnWorkflowKind.Unavailable,(await model.Workflow().ExecuteAsync(I06Fixtures.Request)).Kind);
        Assert.Equal(0,model.Dispatches); Assert.Equal(0,model.CommitAcks);
    }
    [Theory]
    [InlineData("slot")] [InlineData("binding")] [InlineData("attempt")] [InlineData("audit")]
    [InlineData("document")] [InlineData("submission")] [InlineData("source")] [InlineData("execution")]
    [InlineData("before")] [InlineData("after")] [InlineData("missing")] [InlineData("duplicate")]
    public async Task Replay_requires_actual_exact_audit_not_a_guid_label(string corruption)
    {
        var model=new WorkflowModel();
        Assert.Equal(PmReturnWorkflowKind.Committed,(await model.Workflow().ExecuteAsync(I06Fixtures.Request)).Kind);
        var row=model.Audit.Rows[0];
        switch(corruption)
        {
            case "slot": row["Slot"]=((byte[])row["Slot"]).Concat(new byte[]{0}).ToArray(); break;
            case "binding": row["DatabaseBindingId"]=I07Fixtures.OtherBinding;break;
            case "attempt": row["AttemptId"]=Guid.NewGuid();break;
            case "audit": row["AuditId"]=Guid.NewGuid();break;
            case "document": row["DocumentKey"]="other";break;
            case "submission": row["SubmissionIdentity"]=I07Fixtures.OtherSubmission;break;
            case "source": row["SourceProcedureSha256"]=I07Fixtures.OtherDigest;break;
            case "execution": row["OriginalExecutionFingerprint"]=I07Fixtures.OtherDigest;break;
            case "before": row["BeforeStatus"]=30;break;
            case "after": row["AfterStatus"]=10;break;
            case "missing": model.Audit.Clear();break;
            case "duplicate": model.Audit.ImportRow(row);break;
        }
        var result=await model.Workflow().ExecuteAsync(I06Fixtures.Request);
        Assert.Equal(PmReturnWorkflowKind.Unavailable,result.Kind); Assert.Null(result.Receipt); Assert.Equal(1,model.Dispatches);
    }
    [Theory]
    [InlineData("journal")] [InlineData("audit")] [InlineData("transaction")] [InlineData("count")]
    [InlineData("count-zero")]
    public async Task Invalid_probe_or_cas_count_and_nested_rollback_fail_closed(string invalid)
    {
        var model=new WorkflowModel { Invalid=invalid };
        var result=await model.Workflow().ExecuteAsync(I06Fixtures.Request);
        Assert.Null(result.Receipt); Assert.NotEqual(PmReturnWorkflowKind.Committed,result.Kind);
        Assert.Empty(model.Audit.Rows.Cast<DataRow>());
        Assert.DoesNotContain(model.Events,e=>e.Contains("replacement"));
        if(invalid is "journal" or "audit") Assert.Equal(0,model.Dispatches);
    }
    [Theory]
    [InlineData("p0:reserve")] [InlineData("p0:commit-ack")] [InlineData("p1:source")]
    [InlineData("p1:audit-insert")] [InlineData("p1:commit-ack")]
    public async Task Cancellation_after_io_never_grants_new_dispatch(string at)
    {
        using var cancel=new CancellationTokenSource();
        var model=new WorkflowModel { OnEvent=e=> {if(e==at) cancel.Cancel();} };
        var result=await model.Workflow().ExecuteAsync(I06Fixtures.Request,cancel.Token);
        Assert.Null(result.Receipt); Assert.NotEqual(PmReturnWorkflowKind.Committed,result.Kind);
        Assert.InRange(model.Dispatches,0,1);
        if(at.StartsWith("p0:")) Assert.Equal(0,model.Dispatches);
    }
    [Fact]
    public async Task Changed_intent_conflicts_and_revoked_replay_cannot_disclose_receipt()
    {
        var model=new WorkflowModel();await model.Workflow().ExecuteAsync(I06Fixtures.Request);
        Assert.Equal(PmReturnWorkflowKind.Conflict,(await model.Workflow().ExecuteAsync(I06Fixtures.Request with {Payload=new ReturnByPmPayload("changed")})).Kind);
        model.RevokeAt=model.SessionCalls+1;
        Assert.Equal(PmReturnWorkflowKind.Denied,(await model.Workflow().ExecuteAsync(I06Fixtures.Request)).Kind);
        Assert.Equal(1,model.Dispatches);
    }
    [Fact]
    public async Task State_changed_between_phases_and_padded_journal_are_never_fresh_absence()
    {
        var model=new WorkflowModel { OnPhaseOne=m=>m.Status=99 };
        Assert.Equal(PmReturnWorkflowKind.Denied,(await model.Workflow().ExecuteAsync(I06Fixtures.Request)).Kind);Assert.Equal(0,model.Dispatches);
        model=new WorkflowModel {Journal=ExecutionPmReturnJournalTests.Rows(I07Fixtures.Intent())};
        model.Journal.Rows[0]["Slot"]=((byte[])model.Journal.Rows[0]["Slot"]).Concat(new byte[]{0}).ToArray();
        Assert.Equal(PmReturnWorkflowKind.Unavailable,(await model.Workflow().ExecuteAsync(I06Fixtures.Request)).Kind);Assert.Equal(0,model.Dispatches);
    }
    [Fact]
    public async Task Precancellation_has_no_io_and_exact_artifact_and_typed_correlation_are_pinned()
    {
        var model=new WorkflowModel(); using var cts=new CancellationTokenSource();cts.Cancel();
        Assert.Equal(PmReturnWorkflowKind.CancelledBeforeIo,(await model.Workflow().ExecuteAsync(I06Fixtures.Request,cts.Token)).Kind);
        Assert.Empty(model.Events);
        var file=Path.GetFullPath(Path.Combine(AppContext.BaseDirectory,"../../../../../../schemas/backend/pm-return-audit-v1.sql"));
        Assert.Equal(PmReturnWorkflowSql.ArtifactSha256,Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(file))).ToLowerInvariant());
        var result=await model.Workflow().ExecuteAsync(I06Fixtures.Request);Assert.Equal(PmReturnWorkflowKind.Committed,result.Kind);
        var cas=Assert.Single(model.Commands,c=>c.CommandText==PmReturnWorkflowSql.CommitJournalText);
        Assert.Equal(DbType.Binary,cas.Parameters["@slot"].DbType);Assert.Equal(871,cas.Parameters["@slot"].Size);
        Assert.Equal(4000,cas.Parameters["@receipt"].Size);Assert.Equal(DbType.String,cas.Parameters["@receipt"].DbType);
        Assert.Equal(DbType.Guid,cas.Parameters["@attempt"].DbType);Assert.Equal(30,cas.Parameters["@document"].Size);
        Assert.DoesNotContain("DATALENGTH",PmReturnWorkflowSql.AuditReadText);
        Assert.DoesNotContain("Reason",cas.CommandText);Assert.DoesNotContain("Password",cas.CommandText);
        using var recording=new WorkflowConnection(model,0);recording.Open();using var tx=recording.BeginTransaction(IsolationLevel.Serializable);
        using var log=PmReturnWorkflowSql.LegacyLogCount(tx,I06Fixtures.Prepare());
        Assert.Contains("UserName=@actor",log.CommandText);Assert.DoesNotContain("UserAutoID=@actor",log.CommandText);
        Assert.Equal(DbType.String,log.Parameters["@reason"].DbType);Assert.Equal(-1,log.Parameters["@reason"].Size);
        Assert.Equal(50,log.Parameters["@actor"].Size);
    }
    [Fact]
    public async Task Orphan_audit_blocks_absent_journal_instead_of_dispatching_again()
    {
        var model=new WorkflowModel();await model.Workflow().ExecuteAsync(I06Fixtures.Request);
        model.Journal.Clear();
        var result=await model.Workflow().ExecuteAsync(I06Fixtures.Request);
        Assert.Equal(PmReturnWorkflowKind.Unavailable,result.Kind);Assert.Equal(1,model.Dispatches);
    }
    [Theory]
    [InlineData(0)] [InlineData(1)] [InlineData(2)] [InlineData(3)] [InlineData(4)] [InlineData(5)]
    [InlineData(6)] [InlineData(7)] [InlineData(8)] [InlineData(9)] [InlineData(10)] [InlineData(11)]
    public async Task Every_audit_probe_pin_or_semantic_check_failure_prevents_reservation(int column)
    {
        var model=new WorkflowModel { BadProbeColumn=column };
        Assert.Equal(PmReturnWorkflowKind.Unavailable,(await model.Workflow().ExecuteAsync(I06Fixtures.Request)).Kind);
        Assert.Equal(0,model.Dispatches);Assert.Equal(0,model.CommitAcks);Assert.Empty(model.Journal.Rows.Cast<DataRow>());
    }
    [Fact]
    public async Task Other_invocation_cannot_use_first_invocations_ack_and_ambiguous_reservation_is_retained()
    {
        var model=new WorkflowModel();PmReturnWorkflowResult? other=null;
        model.OnEvent=e=> { if(e=="p0:commit-ack") other=model.Workflow().ExecuteAsync(I06Fixtures.Request).GetAwaiter().GetResult(); };
        Assert.Equal(PmReturnWorkflowKind.Committed,(await model.Workflow().ExecuteAsync(I06Fixtures.Request)).Kind);
        Assert.Equal(PmReturnWorkflowKind.Blocked,other!.Kind);Assert.Equal(1,model.Dispatches);
        model=new WorkflowModel { Fault="p0:commit-ack" };
        Assert.Equal(PmReturnWorkflowKind.OutcomeUnknown,(await model.Workflow().ExecuteAsync(I06Fixtures.Request)).Kind);
        model.Fault=null;
        Assert.Equal(PmReturnWorkflowKind.Blocked,(await model.Workflow().ExecuteAsync(I06Fixtures.Request)).Kind);
        Assert.Equal(0,model.Dispatches);
    }
    [Fact]
    public async Task Wrong_attempt_at_execution_and_failed_rollback_cannot_authorize_retry()
    {
        var model=new WorkflowModel { OnPhaseOne=m=>m.Journal.Rows[0]["AttemptId"]=Guid.NewGuid() };
        Assert.Equal(PmReturnWorkflowKind.Blocked,(await model.Workflow().ExecuteAsync(I06Fixtures.Request)).Kind);Assert.Equal(0,model.Dispatches);
        model=new WorkflowModel { Fault="p1:audit-insert",RollbackFails=true };
        Assert.Equal(PmReturnWorkflowKind.OutcomeUnknown,(await model.Workflow().ExecuteAsync(I06Fixtures.Request)).Kind);Assert.Equal(1,model.Dispatches);
        Assert.Empty(model.Audit.Rows.Cast<DataRow>());
    }
}

internal sealed class WorkflowModel : IPmReturnWorkflowAuthority
{
    internal DataTable Journal=ExecutionPmReturnJournalTests.Rows();
    internal DataTable Audit=AuditTable();
    internal int Status=10,Dispatches,CommitAcks,SessionCalls,Connections;
    internal string? Fault,Invalid; internal int RevokeAt;
    internal int BadProbeColumn=-1;internal bool RollbackFails;
    internal List<string> Events=[];internal List<WorkflowCommand> Commands=[];
    internal Action<string>? OnEvent;internal Action<WorkflowModel>? OnPhaseOne;
    internal SqlPmReturnWorkflow Workflow()=>new(I07Fixtures.Binding,()=>
    { var phase=Connections++;if(phase==1) OnPhaseOne?.Invoke(this);return new WorkflowConnection(this,phase);},this);
    internal void Event(int phase,string name)
    { var point=$"p{phase}:{name}";Events.Add(point);OnEvent?.Invoke(point);if(Fault==point) throw new IOException("synthetic-sensitive-message-never-returned"); }
    public Task<AuthoritativeIdentity?> ResolveSessionAsync(CancellationToken token)
    { token.ThrowIfCancellationRequested();SessionCalls++;return Task.FromResult(RevokeAt==SessionCalls ? null : (AuthoritativeIdentity?)I06Fixtures.Identity(SessionCalls)); }
    public Task<PmReturnReadResult> ReadAsync(DbTransaction transaction,AuthoritativeIdentity identity,string document,CancellationToken token)
    {
        token.ThrowIfCancellationRequested();var tx=(WorkflowTransaction)transaction;Event(tx.Owner.Phase,"authority");
        return Task.FromResult(new PmReturnReadResult(I06Fixtures.State(I06Fixtures.Head with {Status=tx.Status}),I06Fixtures.Evidence,null));
    }
    public Task<bool> ExecuteAndVerifyAsync(DbTransaction transaction,PreparedPmReturn prepared,CancellationToken token)
    {
        token.ThrowIfCancellationRequested();var tx=(WorkflowTransaction)transaction;Dispatches++;
        // Actual source-backed I06 parameter plan is constructed, but no SqlClient command runs.
        var plan=PmReturnSqlCommandFactory.CreatePlan(prepared);
        Assert.Equal(PmReturnSqlCommandFactory.SourceProcedure,plan.Procedure);Assert.Equal(-1,plan.Parameters[2].Size);
        tx.Status=30;Event(tx.Owner.Phase,"source");
        if(Invalid=="transaction") {tx.Rollback();return Task.FromResult(false);}
        return Task.FromResult(true);
    }
    internal static DataTable AuditTable()
    {
        var table=new DataTable();foreach(var (n,i) in PmReturnWorkflowSql.AuditColumns.Select((n,i)=>(n,i)))
            table.Columns.Add(n,i is 0 or 2 or 3 ? typeof(Guid) : i==1 ? typeof(byte[]) : i is 8 or 9 ? typeof(int) : i==10 ? typeof(DateTime) : typeof(string));
        return table;
    }
    internal DataTable AuditProbe()
    {
        var t=new DataTable();foreach(var (n,i) in PmReturnWorkflowSql.ProbeColumns.Select((n,i)=>(n,i)))
            t.Columns.Add(n,i==2 ? typeof(Guid) : i==3 || i>=10 ? typeof(string) : typeof(int));
        t.Rows.Add(1,1,I07Fixtures.Binding,PmReturnWorkflowSql.ArtifactSha256,Invalid=="audit" ? 0 : 1,1,1,1,1,1,"SingletonId=1","DATALENGTH(Slot)>0");
        if(BadProbeColumn>=0)t.Rows[0][BadProbeColumn]=BadProbeColumn==2 ? I07Fixtures.OtherBinding : BadProbeColumn==3 ? new string('a',64)
            : BadProbeColumn==10 ? "SingletonId=2" : BadProbeColumn==11 ? "DATALENGTH(Slot)>1" : 0;
        return t;
    }
}
internal sealed class WorkflowConnection(WorkflowModel model,int phase) : DbConnection
{
    internal WorkflowModel Model=>model;internal int Phase=>phase;private ConnectionState state;
    [AllowNull] public override string ConnectionString{get;set;}="";
    public override string Database=>"Recording";public override string DataSource=>"Recording";public override string ServerVersion=>"Recording";
    public override ConnectionState State=>state;
    public override void Open(){model.Event(phase,"open");state=ConnectionState.Open;}
    public override void Close()=>state=ConnectionState.Closed;
    public override void ChangeDatabase(string databaseName)=>throw new NotSupportedException();
    protected override DbTransaction BeginDbTransaction(IsolationLevel isolationLevel)
    { Assert.Equal(IsolationLevel.Serializable,isolationLevel);model.Event(phase,"begin");return new WorkflowTransaction(this); }
    protected override DbCommand CreateDbCommand(){var cmd=new WorkflowCommand(this);model.Commands.Add(cmd);return cmd;}
    protected override void Dispose(bool disposing){if(disposing) Close();base.Dispose(disposing);}
}
internal sealed class WorkflowTransaction(WorkflowConnection owner) : DbTransaction
{
    internal WorkflowConnection Owner=>owner;
    internal DataTable Journal=owner.Model.Journal.Copy(),Audit=owner.Model.Audit.Copy();internal int Status=owner.Model.Status;
    private bool live=true;public override IsolationLevel IsolationLevel=>IsolationLevel.Serializable;
    protected override DbConnection? DbConnection=>live ? owner : null;
    public override void Commit()
    {
        owner.Model.Event(owner.Phase,"commit-before");owner.Model.Journal=Journal.Copy();owner.Model.Audit=Audit.Copy();owner.Model.Status=Status;
        owner.Model.CommitAcks++;live=false;owner.Model.Event(owner.Phase,"commit-ack");
    }
    public override void Rollback(){if(owner.Model.RollbackFails)throw new IOException("synthetic rollback fault");live=false;owner.Model.Events.Add($"p{owner.Phase}:rollback");}
}
internal sealed class WorkflowCommand(WorkflowConnection owner) : DbCommand
{
    private readonly RecordingParameters parameters=new();
    [AllowNull] public override string CommandText{get;set;}="";
    public override int CommandTimeout{get;set;}public override CommandType CommandType{get;set;}public override bool DesignTimeVisible{get;set;}public override UpdateRowSource UpdatedRowSource{get;set;}
    protected override DbConnection? DbConnection{get=>owner;set=>throw new NotSupportedException();}
    protected override DbTransaction? DbTransaction{get;set;}
    protected override DbParameterCollection DbParameterCollection=>parameters;
    protected override DbParameter CreateDbParameter()=>new RecordingParameter();
    public override void Cancel(){}public override void Prepare(){}public override object? ExecuteScalar()=>throw new NotSupportedException();
    private WorkflowTransaction Tx=>(WorkflowTransaction)DbTransaction!;
    private object P(string n)=>parameters[n].Value!;
    private bool Match(DataRow row)=>(Guid)row["DatabaseBindingId"]==(Guid)P("@binding")
      && (new SqlBinary((byte[])row["Slot"])==new SqlBinary((byte[])P("@slot"))).IsTrue;
    private DataTable Lookup(DataTable table){var answer=table.Clone();foreach(var row in table.Rows.Cast<DataRow>().Where(Match).Take(2))answer.ImportRow(row);return answer;}
    protected override DbDataReader ExecuteDbDataReader(CommandBehavior behavior)
    {
        Assert.Same(owner,Tx.Connection);
        if(CommandText==PmReturnJournalSql.ProbeText)
        {owner.Model.Event(owner.Phase,"journal-probe");var t=ExecutionPmReturnJournalTests.ProbeTable();if(owner.Model.Invalid=="journal")t.Rows[0]["ShapeOk"]=0;return t.CreateDataReader();}
        if(CommandText==PmReturnWorkflowSql.ProbeText){owner.Model.Event(owner.Phase,"audit-probe");return owner.Model.AuditProbe().CreateDataReader();}
        if(CommandText==PmReturnJournalSql.LookupText)
        {owner.Model.Event(owner.Phase,Tx.Journal.Rows.Count>0 && (int)Tx.Journal.Rows[0]["State"]==1 ? "readback" : "lookup");return Lookup(Tx.Journal).CreateDataReader();}
        if(CommandText==PmReturnWorkflowSql.AuditReadText){owner.Model.Event(owner.Phase,Tx.Audit.Rows.Count==0 ? "audit-absence" : "audit-read");return Lookup(Tx.Audit).CreateDataReader();}
        if(CommandText==PmReturnWorkflowSql.TransactionText)
        {owner.Model.Event(owner.Phase,"transaction");var t=new DataTable();t.Columns.Add("TransactionCount",typeof(int));t.Columns.Add("TransactionState",typeof(int));t.Rows.Add(1,1);return t.CreateDataReader();}
        throw new NotSupportedException("Unrecognized SQL plan.");
    }
    public override int ExecuteNonQuery()
    {
        Assert.Same(owner,Tx.Connection);
        if(CommandText==PmReturnJournalSql.InsertText)
        {owner.Model.Event(owner.Phase,"reserve");var t=ExecutionPmReturnJournalTests.Rows(I07Fixtures.Intent());t.Rows[0]["AttemptId"]=P("@attempt");Tx.Journal.ImportRow(t.Rows[0]);return 1;}
        if(CommandText==PmReturnWorkflowSql.AuditInsertText)
        {owner.Model.Event(owner.Phase,"audit-insert");Tx.Audit.Rows.Add(P("@binding"),P("@slot"),P("@attempt"),P("@audit"),P("@document"),P("@submission"),P("@source"),P("@execution"),10,30,DateTime.UtcNow);return 1;}
        if(CommandText==PmReturnWorkflowSql.CommitJournalText)
        {
            owner.Model.Event(owner.Phase,"cas");var rows=Tx.Journal.Rows.Cast<DataRow>().Where(r=>Match(r) && (Guid)r["AttemptId"]==(Guid)P("@attempt") && (int)r["State"]==2
              && new[]{("TenantId","@tenant"),("CompanyId","@company"),("Actor","@actor"),("ActionId","@action"),("IdempotencyKey","@key"),("DocumentKey","@document"),("SubmissionIdentity","@submission"),("SourceProcedureSha256","@source")}.All(pair=>(string)r[pair.Item1]==(string)P(pair.Item2))).ToArray();
            foreach(var r in rows){r["State"]=1;r["OriginalExecutionFingerprint"]=P("@execution");r["AuditId"]=P("@auditText");r["ReceiptJson"]=P("@receipt");}
            return owner.Model.Invalid=="count" ? 2 : owner.Model.Invalid=="count-zero" ? 0 : rows.Length;
        }
        throw new NotSupportedException("Unrecognized SQL plan.");
    }
}
