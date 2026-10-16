using System.Data;
using System.Data.Common;
using System.Diagnostics.CodeAnalysis;
using System.Globalization;
using System.Security.Cryptography;
using Medcom.Application;
using Medcom.Contracts;
using Medcom.Infrastructure;
using Medcom.Infrastructure.Erp;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class ErpAttachmentSqlTests
{
    [Theory]
    [InlineData("purchase-orders")][InlineData("sales-orders")][InlineData("sales-order-pm")][InlineData("inbound-requests")]
    public async Task Native_image_upload_read_replace_delete_and_replay_use_one_transactional_DB_binding(string module)
    {
        var wire=new AttachmentWire(module);var service=wire.Service();var original=await wire.Request("upload");
        var uploaded=await service.UploadAsync(module,original,ErpAttachmentEndpointTests.Png,ReadOnlyMemory<byte>.Empty,default);
        Assert.Equal(ErpCommandOutcome.Committed,uploaded.Outcome);Assert.Single(wire.Photos);Assert.Equal(1,wire.Commits);
        Assert.Equal(ErpAttachmentEndpointTests.Png,wire.Photos.Values.Single().Content);Assert.Equal(ErpAttachmentEndpointTests.Png,wire.Photos.Values.Single().Preview);
        var replay=await service.UploadAsync(module,original,ErpAttachmentEndpointTests.Png,ReadOnlyMemory<byte>.Empty,default);
        Assert.Equal(ErpCommandOutcome.Replayed,replay.Outcome);Assert.Equal(uploaded.Receipt,replay.Receipt);Assert.Equal(1,wire.Commits);
        // Existing PO rows may have a display order; replacing their image preserves it.
        if(module=="purchase-orders"){var existing=wire.Photos.Values.Single();wire.Photos[existing.Id]=existing with{Slot=7};}
        var list=await service.ListAsync(module,"QA-A","QA-DOC",1,20,default);Assert.Equal(ErpReadOutcome.Success,list.Outcome);
        var row=Assert.Single(list.Value!.Rows);Assert.True(list.Value.CanUpload);Assert.Equal(uploaded.Receipt!.AttachmentId,row.AttachmentId);
        var file=await service.ContentAsync(module,"QA-A","QA-DOC",row.AttachmentId,true,default);
        Assert.Equal(ErpReadOutcome.Success,file.Outcome);Assert.Equal(ErpAttachmentEndpointTests.Png,file.Value!.Bytes);
        var replacement=(await wire.Request("replace")) with{AttachmentId=row.AttachmentId,ExpectedAttachmentToken=row.StateToken,AttachmentName="updated.png"};
        var replaced=await service.UploadAsync(module,replacement,ErpAttachmentEndpointTests.Png,ReadOnlyMemory<byte>.Empty,default);Assert.Equal(ErpCommandOutcome.Committed,replaced.Outcome);
        Assert.NotEqual(row.StateToken,replaced.Receipt!.AttachmentStateToken);
        var delete=new ErpAttachmentDelete("delete","QA-A","QA-DOC",replaced.Receipt.DocumentStateToken,row.AttachmentId,replaced.Receipt.AttachmentStateToken!);
        var removed=await service.DeleteAsync(module,delete,default);Assert.Equal(ErpCommandOutcome.Committed,removed.Outcome);Assert.Empty(wire.Photos);
        Assert.Equal(ErpCommandOutcome.Replayed,(await service.DeleteAsync(module,delete,default)).Outcome);Assert.Equal(3,wire.Commits);
        Assert.All(wire.Sql,sql=>Assert.False(sql.Contains("sys.sql_modules",StringComparison.Ordinal)||sql.Contains("SY_FrmCfg",StringComparison.Ordinal)));
    }
    [Theory]
    [InlineData("rights")][InlineData("locked")][InlineData("owner")][InlineData("status")][InlineData("capability")][InlineData("branch")]
    public async Task Attachment_writes_do_not_bypass_native_permissions_assignment_branch_or_document_state(string defect)
    {
        var wire=new AttachmentWire();var request=await wire.Request("denied");
        if(defect=="rights")wire.Update=false;if(defect=="locked")wire.Header["isLocked"]=true;
        if(defect=="owner")wire.Header["userCreate"]="other";if(defect=="status")wire.Header["statusId"]=12;
        if(defect=="capability")wire.Identity=wire.Identity with{Capabilities=[]};if(defect=="branch")request=request with{BranchId="outside"};
        if(defect is "locked" or "owner" or "status")request=(await wire.Request("denied"));
        var result=await wire.Service().UploadAsync(wire.Module,request,ErpAttachmentEndpointTests.Png,ReadOnlyMemory<byte>.Empty,default);
        Assert.Equal(ErpCommandOutcome.Denied,result.Outcome);Assert.Empty(wire.Photos);Assert.Equal(0,wire.Commits);
    }
    [Theory]
    [InlineData("idempotency")][InlineData("slot")][InlineData("attachment-token")][InlineData("document-token")]
    public async Task Conflicting_retries_or_stale_tokens_never_overwrite_an_existing_image(string defect)
    {
        var wire=new AttachmentWire();var service=wire.Service();var request=await wire.Request("first");
        var first=await service.UploadAsync(wire.Module,request,ErpAttachmentEndpointTests.Png,ReadOnlyMemory<byte>.Empty,default);Assert.Equal(ErpCommandOutcome.Committed,first.Outcome);
        request=defect=="idempotency"?request with{AttachmentName="different.png"}:request with{IdempotencyKey="second"};
        if(defect is "attachment-token" or "document-token")request=request with{AttachmentId=first.Receipt!.AttachmentId,ExpectedAttachmentToken=first.Receipt.AttachmentStateToken};
        if(defect=="attachment-token")request=request with{ExpectedAttachmentToken=new string('f',64)};
        if(defect=="document-token")wire.Header["notes"]="Concurrent edit";
        var result=await service.UploadAsync(wire.Module,request,ErpAttachmentEndpointTests.Png,ReadOnlyMemory<byte>.Empty,default);
        Assert.Equal(ErpCommandOutcome.Conflict,result.Outcome);Assert.Single(wire.Photos);Assert.Equal("image.png",wire.Photos.Values.Single().Name);Assert.Equal(1,wire.Commits);
    }
    [Theory]
    [InlineData("postcondition")][InlineData("revoke")][InlineData("commit")]
    public async Task Image_and_journal_roll_back_together_and_uncertain_commit_is_never_reported_as_success(string defect)
    {
        var wire=new AttachmentWire{FailPostcondition=defect=="postcondition",RevokeAfterWrite=defect=="revoke",FailCommit=defect=="commit"};
        var result=await wire.Service().UploadAsync(wire.Module,await wire.Request("failed"),ErpAttachmentEndpointTests.Png,ReadOnlyMemory<byte>.Empty,default);
        Assert.Equal(defect=="commit"?ErpCommandOutcome.OutcomeUnknown:defect=="revoke"?ErpCommandOutcome.Denied:ErpCommandOutcome.Unavailable,result.Outcome);
        Assert.Empty(wire.Photos);Assert.Empty(wire.Journal);Assert.Equal(0,wire.Commits);
    }
    [Fact]
    public async Task Shared_SA_view_reads_the_same_images_but_does_not_advertise_hidden_native_editing()
    {
        var wire=new AttachmentWire("sales-order-sa");wire.Seed();
        var result=await wire.Service().ListAsync(wire.Module,"QA-A","QA-DOC",1,20,default);
        Assert.Equal(ErpReadOutcome.Success,result.Outcome);Assert.Single(result.Value!.Rows);Assert.False(result.Value.CanUpload);Assert.False(result.Value.CanDelete);
        Assert.False(ErpAttachmentCatalog.Writable(wire.Module));
    }
    [Fact]
    public async Task Read_paging_parent_scope_and_document_cleanup_are_bounded()
    {
        var wire=new AttachmentWire();wire.Seed();wire.Photos["B"]=wire.Photos["A"] with{Id="B"};var service=wire.Service();
        var page=await service.ListAsync(wire.Module,"QA-A","QA-DOC",1,1,default);Assert.True(page.Value!.HasMore);Assert.Single(page.Value.Rows);
        var second=await service.ListAsync(wire.Module,"QA-A","QA-DOC",2,1,default);Assert.False(second.Value!.HasMore);Assert.Equal("B",Assert.Single(second.Value.Rows).AttachmentId);
        Assert.Equal(ErpReadOutcome.NotFound,(await service.ContentAsync(wire.Module,"QA-A","wrong-doc","A",false,default)).Outcome);
        using var connection=wire.Connection();connection.Open();using var tx=connection.BeginTransaction(IsolationLevel.Serializable);
        await SqlErpAttachmentStore.DeleteForDocument(tx,wire.Module,"QA-DOC",default);Assert.Empty(wire.Photos);tx.Commit();
    }
    [Theory]
    [InlineData("schema")][InlineData("journal")][InlineData("target")]
    public async Task Actual_storage_or_target_incompatibility_remains_a_scoped_error(string defect)
    {
        var wire=new AttachmentWire{BadSchema=defect=="schema",BadJournal=defect=="journal",BadTarget=defect=="target"};
        var result=await wire.Service().UploadAsync(wire.Module,await wire.Request("schema"),ErpAttachmentEndpointTests.Png,ReadOnlyMemory<byte>.Empty,default);
        Assert.Equal(ErpCommandOutcome.QualificationRequired,result.Outcome);Assert.Empty(wire.Photos);
    }
    [Theory]
    [InlineData("bad.exe")][InlineData("../bad.png")][InlineData("bad.svg")]
    public async Task A_filename_or_non_raster_payload_cannot_reach_SQL(string name)
    {
        var wire=new AttachmentWire();var request=(await wire.Request("invalid")) with{AttachmentName=name};wire.Sql.Clear();
        Assert.Equal(ErpCommandOutcome.InvalidInput,(await wire.Service().UploadAsync(wire.Module,request,ErpAttachmentEndpointTests.Png,ReadOnlyMemory<byte>.Empty,default)).Outcome);Assert.Empty(wire.Sql);
    }
    [Fact]
    public async Task Screens_without_an_existing_attachment_binding_report_it_without_querying_an_Attach_table()
    {
        var wire=new AttachmentWire("purchase-requests");var result=await wire.Service().ListAsync(wire.Module,"QA-A","QA-DOC",1,20,default);
        Assert.Equal(ErpReadOutcome.Success,result.Outcome);Assert.False(result.Value!.Supported);Assert.False(result.Value.CanUpload);Assert.Empty(result.Value.Rows);
        Assert.DoesNotContain(wire.Sql,sql=>sql.Contains("AttachTbl",StringComparison.Ordinal));
    }
}

// A recording transactional database with synthetic rows, not MedData acceptance.
internal sealed class AttachmentWire
{
    internal readonly string Module;internal readonly ErpSqlPlan Plan;internal readonly Guid Binding=Guid.NewGuid();
    internal AuthoritativeIdentity Identity=PurchaseQuerySource.NewIdentity() with{BranchIds=["QA-A"],BranchSelection=new("assigned","QA-A",true)};
    internal readonly LegacyCompany Company=PurchaseQuerySource.Company;internal readonly Dictionary<string,object?> Header;
    internal Dictionary<string,Photo> Photos=new(StringComparer.Ordinal);internal Dictionary<string,Entry> Journal=new(StringComparer.Ordinal);
    internal readonly List<string> Sql=[];internal bool Update=true,FailPostcondition,RevokeAfterWrite,FailCommit,BadSchema,BadJournal,BadTarget;
    internal int Commits,Effects;private Dictionary<string,Photo>? initialPhotos;private Dictionary<string,Entry>? initialJournal;
    internal sealed record Photo(string Id,string Document,string Name,int? Slot,byte[] Content,byte[] Preview);
    internal sealed record Entry(byte[] Key,byte[] Intent,Guid Audit,string? Receipt=null,string? Document=null,string? After=null);
    internal AttachmentWire(string module="sales-orders")
    {
        Module=module;Plan=ErpSqlPlan.Get(module)!;Identity=Identity with{Capabilities=[module+".read"]};
        Header=Plan.Screen.Fields["header"].ToDictionary(f=>f.Name,Default,StringComparer.Ordinal);
        Header[Plan.HeaderJsonKey]="QA-DOC";Header["branchId"]="QA-A";Header["statusId"]=module switch{"sales-order-pm"=>12,"sales-order-sa"=>14,"purchase-orders" or "inbound-requests"=>0,_=>11};
        Header["isLocked"]=false;Header["userCreate"]=Identity.PrincipalId;Header["sendTo"]=Identity.PrincipalId;
    }
    internal DbConnection Connection()=>new ConnectionWire(this);
    internal SqlErpAttachments Service()=>new(Company,Connection,_=>Task.FromResult<AuthoritativeIdentity?>(Identity),
        _=>Task.FromResult(RevokeAfterWrite&&Effects>0?null:Identity),Binding,new ErpWriteRuntime(Binding,"Synthetic",ErpScreenCatalog.ModuleIds));
    internal async Task<ErpAttachmentUpload> Request(string key)
    {
        using var c=Connection();c.Open();using var t=c.BeginTransaction(IsolationLevel.Serializable);
        var snapshot=await SqlErpScreenReader.Snapshot(t,Identity,Plan,"QA-A","QA-DOC",default);
        return new(key,"QA-A","QA-DOC",SqlErpScreenReader.StateToken(snapshot!),Module=="purchase-orders"?null:2,null,null,"image.png");
    }
    internal void Seed()=>Photos["A"]=new("A","QA-DOC","image.png",Module=="purchase-orders"?null:2,ErpAttachmentEndpointTests.Png,ErpAttachmentEndpointTests.Png);
    private static object? Default(ErpFieldDefinition f)=>f.Nullable?null:f.SqlType switch
    {"varchar" or "nvarchar" or "char" or "nchar"=>"SYNTHETIC","int"=>0,"smallint"=>(short)0,"tinyint"=>(byte)0,"bigint"=>0L,"bit"=>false,
        "decimal" or "numeric" or "money" or "smallmoney"=>0m,"float"=>0d,"real"=>0f,"datetime" or "datetime2" or "date"=>new DateTime(2026,10,16),_=>throw new InvalidOperationException(f.SqlType)};
    private static DbDataReader Rows(params object?[][] rows)
    {var t=new DataTable();for(var i=0;i<(rows.Length==0?1:rows[0].Length);i++)t.Columns.Add("c"+i,typeof(object));foreach(var row in rows)t.Rows.Add(row.Select(v=>v??DBNull.Value).ToArray());return t.CreateDataReader();}
    private void Track(DbCommand c){Assert.NotNull(c.Transaction);Assert.Equal(IsolationLevel.Serializable,c.Transaction.IsolationLevel);Sql.Add(c.CommandText);}
    private IEnumerable<Photo> Selected(DbCommand c)
    {
        var rows=Photos.Values.Where(p=>p.Document==(string)c.Parameters["@document"].Value!);
        if(c.Parameters.Contains("@attachment"))rows=rows.Where(p=>p.Id==(string)c.Parameters["@attachment"].Value!);
        return rows.OrderBy(p=>p.Id,StringComparer.Ordinal);
    }
    internal object Scalar(DbCommand c)
    {
        Track(c);var sql=c.CommandText;if(sql=="SELECT DB_NAME();")return BadTarget?"Other":"Synthetic";
        if(sql.Contains("sp_getapplock",StringComparison.Ordinal))return 0;
        if(sql.StartsWith("SELECT COUNT_BIG(*) FROM dbo.[",StringComparison.Ordinal))return c.Parameters.Contains("@slot")?Selected(c).LongCount(p=>p.Slot==(int)c.Parameters["@slot"].Value!):Selected(c).LongCount();
        throw new InvalidOperationException("Unexpected scalar: "+sql);
    }
    internal DbDataReader Read(DbCommand c)
    {
        if(c.CommandText is SqlNativeIdentity.Text or SqlNativeIdentity.ErpText)return NativeIdentityBatchFixture.Read(c,Read);
        Track(c);var sql=c.CommandText;
        if(sql=="SELECT @@TRANCOUNT,CONVERT(int,XACT_STATE());")return Rows([1,1]);
        if(sql.Contains("FROM sys.columns C JOIN sys.types T",StringComparison.Ordinal))return Schema(c,sql.Contains("C.precision",StringComparison.Ordinal));
        if(sql.Contains("SELECT TOP(2) U.UserName,U.[Password]",StringComparison.Ordinal))return Rows([Identity.PrincipalId,"synthetic-stored-value",false,"qa-group",false]);
        if(sql==SqlLegacyBranchScope.NativeUserText)
        {var t=new DataTable();foreach(var type in new[]{typeof(string),typeof(string),typeof(bool),typeof(string),typeof(bool),typeof(string)})t.Columns.Add("c"+t.Columns.Count,type);t.Rows.Add(Identity.PrincipalId,"synthetic-stored-value",false,"qa-group",false,"QA-A");return t.CreateDataReader();}
        if(sql==SqlLegacyBranchScope.RestrictedText){var t=new DataTable();t.Columns.Add("branch",typeof(string));t.Rows.Add("QA-A");return t.CreateDataReader();}
        if(sql.Contains(ErpSqlAuthority.GrantProjection,StringComparison.Ordinal))return Rows([Plan.Screen.MenuId,Plan.Screen.FormId,false,null,1,1,Update?1:0,1]);
        if(sql.StartsWith("SELECT SingletonId,SchemaVersion,DatabaseBindingId",StringComparison.Ordinal))return Rows([(byte)1,1,BadJournal?Guid.Empty:Binding]);
        if(sql.StartsWith("SELECT KeyBytes,IntentBytes,ReceiptJson",StringComparison.Ordinal))
        {var key=Convert.ToHexString((byte[])c.Parameters["@slot"].Value!);return Journal.TryGetValue(key,out var e)?Rows([e.Key,e.Intent,e.Receipt,e.Document,e.After,e.Audit]):Rows();}
        if(sql==Plan.HeaderText)return Project("header",(string)c.Parameters["@document"].Value! =="QA-DOC"?[Header]:[]);
        foreach(var section in Plan.Tables.Keys.Where(s=>s!="header"))if(sql==Plan.LinesText(section))return Project(section,[]);
        if(sql.StartsWith("SELECT UserAutoID,FileName,TRY_CONVERT",StringComparison.Ordinal))
        {
            if(FailPostcondition&&Effects>0)throw new InvalidOperationException("Synthetic postcondition failure.");
            var selected=Selected(c);if(c.Parameters.Contains("@offset"))selected=selected.Skip((int)c.Parameters["@offset"].Value!).Take((int)c.Parameters["@take"].Value!);
            return Rows(selected.Select(p=>new object?[]{p.Id,p.Name,p.Slot,1,(long)p.Content.Length,Convert.ToHexString(SHA256.HashData(p.Content)),Convert.ToHexString(SHA256.HashData(p.Preview))}).ToArray());
        }
        if(sql.StartsWith("SELECT FileName,",StringComparison.Ordinal))return Rows(Selected(c).Select(p=>new object?[]{p.Name,sql.Contains("DATALENGTH(Content2)>0",StringComparison.Ordinal)&&p.Preview.Length>0?p.Preview:p.Content}).ToArray());
        throw new InvalidOperationException("Unexpected reader: "+sql);
    }
    private DbDataReader Schema(DbCommand c,bool screen)
    {
        if(!screen)return Rows(new[]{("UserAutoID","varchar",50),("DocumentID","varchar",50),("FileName","nvarchar",1000),("STT","int",4),("FileType","int",4),("Content","varbinary",-1),("Content2","image",16)}
            .Where(r=>!BadSchema||r.Item1!="Content").Select(r=>new object?[]{r.Item1,r.Item2,(short)r.Item3,false,false}).ToArray());
        var tables=c.Parameters.Cast<DbParameter>().Select(p=>
        {
        var table=(string)p.Value!;var section=Plan.Tables.Single(t=>"dbo."+t.Value==table).Key;
        var shape=new DataTable();for(var i=0;i<9;i++)shape.Columns.Add("c"+i,typeof(object));
        foreach(var f in Plan.Screen.Fields[section].Where(f=>!f.Virtual))
        {var args=f.TypeArguments?.Trim('(',')').Split(',');short len=(short)(f.SqlType is "nvarchar" or "varchar" or "char" or "nchar"?args is["max"]?-1:int.Parse(args![0],CultureInfo.InvariantCulture)*(f.SqlType.StartsWith('n')?2:1):0);
            shape.Rows.Add(f.Column,f.SqlType,len,(byte)(args?.Length==2?int.Parse(args[0],CultureInfo.InvariantCulture):0),(byte)(args?.Length==2?int.Parse(args[1],CultureInfo.InvariantCulture):0),f.Nullable,false,false,f.Ordinal);}
        return shape;
        }).ToArray();return new DataTableReader(tables);
    }
    private DbDataReader Project(string section,IEnumerable<Dictionary<string,object?>> rows)
    {var fields=Plan.Screen.Fields[section];var t=new DataTable();for(var i=0;i<fields.Count;i++)t.Columns.Add("f"+i,typeof(object));foreach(var row in rows)t.Rows.Add(fields.Select(f=>row.GetValueOrDefault(f.Name)??DBNull.Value).ToArray());return t.CreateDataReader();}
    internal int Write(DbCommand c)
    {
        Track(c);var sql=c.CommandText;
        if(sql.StartsWith("INSERT dbo.MedcomErpCommandJournal",StringComparison.Ordinal))
        {Journal.Add(Convert.ToHexString((byte[])c.Parameters["@slot"].Value!),new((byte[])c.Parameters["@key"].Value!,(byte[])c.Parameters["@intent"].Value!,(Guid)c.Parameters["@audit"].Value!));return 1;}
        if(sql.StartsWith("UPDATE dbo.MedcomErpCommandJournal",StringComparison.Ordinal))
        {var key=Convert.ToHexString((byte[])c.Parameters["@slot"].Value!);Journal[key]=Journal[key] with{Receipt=(string)c.Parameters["@receipt"].Value!,Document=(string)c.Parameters["@document"].Value!,After=(string)c.Parameters["@after"].Value!};return 1;}
        Effects++;
        if(sql.StartsWith("DELETE",StringComparison.Ordinal))
        {var keys=Selected(c).Where(p=>!c.Parameters.Contains("@id")||p.Id==(string)c.Parameters["@id"].Value!).Select(p=>p.Id).ToArray();foreach(var key in keys)Photos.Remove(key);return keys.Length;}
        var id=(string)c.Parameters["@id"].Value!;var slot=sql.StartsWith("UPDATE",StringComparison.Ordinal)?Photos[id].Slot:
            c.Parameters["@slot"].Value is DBNull?null:(int?)Convert.ToInt32(c.Parameters["@slot"].Value,CultureInfo.InvariantCulture);
        Photos[id]=new(id,(string)c.Parameters["@document"].Value!,(string)c.Parameters["@name"].Value!,slot,(byte[])c.Parameters["@content"].Value!,(byte[])c.Parameters["@preview"].Value!);return 1;
    }
    private sealed class ConnectionWire(AttachmentWire w):DbConnection
    {
        private ConnectionState state;[AllowNull]public override string ConnectionString{get;set;}="";public override string Database=>"Synthetic";public override string DataSource=>"Recording";public override string ServerVersion=>"Recording";
        public override ConnectionState State=>state;public override void Open()=>state=ConnectionState.Open;public override void Close()=>state=ConnectionState.Closed;public override void ChangeDatabase(string name)=>throw new NotSupportedException();
        protected override DbCommand CreateDbCommand()=>new CommandWire(this,w);
        protected override DbTransaction BeginDbTransaction(IsolationLevel level){w.initialPhotos=new(w.Photos,StringComparer.Ordinal);w.initialJournal=new(w.Journal,StringComparer.Ordinal);return new TransactionWire(this,w,level);}
    }
    private sealed class TransactionWire(ConnectionWire c,AttachmentWire w,IsolationLevel level):DbTransaction
    {
        public override IsolationLevel IsolationLevel=>level;protected override DbConnection DbConnection=>c;
        public override void Commit(){if(w.FailCommit)throw new InvalidOperationException("Uncertain commit.");w.Commits++;}
        public override void Rollback(){w.Photos=new(w.initialPhotos!,StringComparer.Ordinal);w.Journal=new(w.initialJournal!,StringComparer.Ordinal);}
    }
    private sealed class CommandWire(ConnectionWire c,AttachmentWire w):DbCommand
    {
        private readonly QueryParameters parameters=new();[AllowNull]public override string CommandText{get;set;}="";public override int CommandTimeout{get;set;}public override CommandType CommandType{get;set;}
        public override bool DesignTimeVisible{get;set;}public override UpdateRowSource UpdatedRowSource{get;set;}protected override DbConnection? DbConnection{get;set;}=c;protected override DbTransaction? DbTransaction{get;set;}
        protected override DbParameterCollection DbParameterCollection=>parameters;protected override DbParameter CreateDbParameter()=>new QueryParameter();
        public override object? ExecuteScalar()=>w.Scalar(this);protected override DbDataReader ExecuteDbDataReader(CommandBehavior behavior)=>w.Read(this);public override int ExecuteNonQuery()=>w.Write(this);public override void Cancel(){}public override void Prepare(){}
    }
}
