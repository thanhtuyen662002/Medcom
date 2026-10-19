using System.Data;
using System.Data.Common;
using System.Diagnostics.CodeAnalysis;
using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using Medcom.Application;
using Medcom.Contracts;
using Medcom.Infrastructure;
using Medcom.Infrastructure.Erp;
using Xunit;
namespace Medcom.Api.Tests;

// Recording SQL orchestration, not a production-write acceptance claim.
public sealed class ErpRuntimeCompatibilityTests
{
    public static IEnumerable<object[]> Modules()=>ErpScreenCatalog.ModuleIds.Select(m=>new object[]{m});
    [Theory]
    [MemberData(nameof(Modules))]
    public async Task Every_module_accepts_the_current_target_without_any_schema_or_source_digest(string module)
    {
        var wire=new RuntimeWire();using var connection=wire.Connection();connection.Open();
        using var transaction=connection.BeginTransaction(IsolationLevel.Serializable);
        var runtime=new ErpWriteRuntime(wire.Binding,"Synthetic","stale-invalid-fingerprint",ErpScreenCatalog.ModuleIds);
        Assert.True(await runtime.VerifyAsync(transaction,wire.Binding,module,default));
        Assert.Single(wire.Sql);Assert.Equal("SELECT DB_NAME();",wire.Sql[0]);
        Assert.False(await runtime.VerifyAsync(transaction,Guid.NewGuid(),module,default));
        Assert.False(await runtime.VerifyAsync(transaction,wire.Binding,"unknown",default));
        wire.Database="Other";Assert.False(await runtime.VerifyAsync(transaction,wire.Binding,module,default));
    }
    [Theory]
    [MemberData(nameof(Modules))]
    public async Task Additive_columns_and_physical_order_changes_do_not_break_the_required_field_contract(string module)
    {
        var exchanges=0;
        using var connection=new DisplayConnection(command=>{exchanges++;return Schema(command,ErpSqlPlan.Get(module)!,"additive");});
        connection.Open();using var transaction=connection.BeginTransaction(IsolationLevel.Serializable);
        Assert.True(await SqlErpScreenReader.SchemaMatches(transaction,ErpSqlPlan.Get(module)!,default));
        Assert.Equal(1,exchanges);
    }
    [Theory]
    [InlineData("missing")][InlineData("type")][InlineData("length")][InlineData("duplicate")]
    [InlineData("computed")][InlineData("identity")][InlineData("nullability")]
    [InlineData("missing-result")][InlineData("extra-result")][InlineData("projection")]
    public async Task Incompatible_required_fields_remain_scoped_errors(string mutation)
    {
        var plan=ErpSqlPlan.Get("purchase-requests")!;
        using var connection=new DisplayConnection(command=>Schema(command,plan,mutation));connection.Open();
        using var transaction=connection.BeginTransaction(IsolationLevel.Serializable);
        Assert.False(await SqlErpScreenReader.SchemaMatches(transaction,plan,default));
    }
    [Theory]
    [InlineData("wider-text")][InlineData("max-text")]
    public async Task Widened_variable_text_does_not_block_existing_typed_reads_or_commands(string mutation)
    {
        var plan=ErpSqlPlan.Get("sales-orders")!;
        using var connection=new DisplayConnection(command=>Schema(command,plan,mutation));connection.Open();
        using var transaction=connection.BeginTransaction(IsolationLevel.Serializable);
        Assert.True(await SqlErpScreenReader.SchemaMatches(transaction,plan,default));
    }
    [Theory]
    [InlineData("create")][InlineData("save")][InlineData("delete")]
    public async Task Nullable_object_preserves_CUD_commit_replay_and_null_database_parameter(string operation)
    {
        var wire=new RuntimeWire{NullObject=true};wire.Seed(operation!="create");
        var request=await wire.Intent(operation);var commands=wire.Commands();
        var result=await commands.ExecuteAsync("purchase-requests",operation,request,default);
        Assert.Equal(ErpCommandOutcome.Committed,result.Outcome);
        Assert.Equal(ErpCommandOutcome.Replayed,(await commands.ExecuteAsync("purchase-requests",operation,request,default)).Outcome);
        Assert.Equal(1,wire.Commits);
        if(operation!="delete")Assert.Null(wire.Header!["objectId"]);
    }
    [Theory]
    [InlineData("create")][InlineData("save")][InlineData("delete")]
    public async Task CUD_commits_and_replays_with_retired_hashes_and_changed_dropdown_source(string operation)
    {
        var wire=new RuntimeWire();wire.Seed(operation!="create");
        var request=await wire.Intent(operation);var commands=wire.Commands();
        var result=await commands.ExecuteAsync("purchase-requests",operation,request,default);
        Assert.Equal(ErpCommandOutcome.Committed,result.Outcome);Assert.NotNull(result.Receipt);
        Assert.Equal(1,wire.Commits);Assert.True(wire.Effects>0);Assert.Equal(operation=="delete",result.Receipt.Deleted);
        var effects=wire.Effects;
        var replay=await commands.ExecuteAsync("purchase-requests",operation,request,default);
        Assert.Equal(ErpCommandOutcome.Replayed,replay.Outcome);Assert.Equal(effects,wire.Effects);Assert.Equal(1,wire.Commits);
        Assert.All(wire.Sql,sql=>Assert.False(RuntimeWire.IsFingerprintQuery(sql),sql));
    }
    [Theory]
    [InlineData("create")][InlineData("save")][InlineData("delete")]
    public async Task Removing_hash_gates_does_not_grant_native_CUD_permission(string operation)
    {
        var wire=new RuntimeWire{AllowWrites=false};wire.Seed(operation!="create");
        var result=await wire.Commands().ExecuteAsync("purchase-requests",operation,await wire.Intent(operation),default);
        Assert.Equal(ErpCommandOutcome.Denied,result.Outcome);Assert.Equal(0,wire.Effects);Assert.Equal(0,wire.Commits);
    }
    [Theory]
    [InlineData("save")][InlineData("delete")]
    public async Task Locked_documents_and_stale_state_tokens_still_cannot_be_changed(string operation)
    {
        var wire=new RuntimeWire();wire.Seed(true);var request=await wire.Intent(operation);
        wire.Header!["isLocked"]=true;
        var stale=await wire.Commands().ExecuteAsync("purchase-requests",operation,request,default);
        Assert.Equal(ErpCommandOutcome.Conflict,stale.Outcome);Assert.Equal(0,wire.Effects);
        var locked=await wire.Commands().ExecuteAsync("purchase-requests",operation,await wire.Intent(operation),default);
        Assert.Equal(ErpCommandOutcome.Denied,locked.Outcome);Assert.Equal(0,wire.Commits);
    }
    [Theory]
    [InlineData("database")][InlineData("binding")][InlineData("version")]
    public async Task A_different_database_or_journal_is_still_rejected(string defect)
    {
        var wire=new RuntimeWire();wire.Seed(true);var request=await wire.Intent("delete");
        if(defect=="database")wire.Database="Other";
        if(defect=="binding")wire.JournalBinding=Guid.NewGuid();
        if(defect=="version")wire.JournalVersion=2;
        var result=await wire.Commands().ExecuteAsync("purchase-requests","delete",request,default);
        Assert.Equal(ErpCommandOutcome.QualificationRequired,result.Outcome);Assert.Equal(0,wire.Effects);Assert.Equal(0,wire.Commits);
        Assert.NotEqual("target_acceptance_changed",result.Code);
    }
    [Fact]
    public async Task Current_compatible_reads_do_not_call_module_or_form_hash_audits()
    {
        var wire=new RuntimeWire();wire.Seed(true);
        var service=new SqlErpScreenService(wire.Company,wire.Connection,_=>Task.FromResult<AuthoritativeIdentity?>(wire.Identity),
            _=>Task.FromResult<AuthoritativeIdentity?>(wire.Identity));
        var result=await service.ListAsync("purchase-requests",new("QA-A"),default);
        Assert.Equal(ErpReadOutcome.Success,result.Outcome);Assert.Single(result.Value!.Rows);
        Assert.All(wire.Sql,sql=>Assert.False(RuntimeWire.IsFingerprintQuery(sql),sql));
    }
    [Fact]
    public async Task Existing_journal_preparation_no_longer_requires_a_catalog_or_schema_digest_refresh()
    {
        var wire=new RuntimeWire();
        var result=await SqlErpWritePreparation.PrepareCoreAsync(wire.Connection,wire.Binding,"Synthetic",["purchase-requests"],false,default);
        Assert.Null(result.SchemaFingerprint);Assert.False(result.Installed);Assert.Equal(0,wire.Commits);
        Assert.All(wire.Sql,sql=>Assert.False(RuntimeWire.IsFingerprintQuery(sql),sql));
    }
    private static DbDataReader Schema(DbCommand command,ErpSqlPlan plan,string mutation)
    {
        DataTable Section(string name)
        {
        var table=Table(typeof(string),typeof(string),typeof(short),typeof(byte),typeof(byte),typeof(bool),typeof(bool),typeof(bool),typeof(int));
        var section=plan.Tables.Single(p=>"dbo."+p.Value==name).Key;
        var fields=plan.Screen.Fields[section].Where(f=>!f.Virtual).Reverse().ToArray();
        foreach(var field in fields)
        {
            var args=field.TypeArguments?.Trim('(',')').Split(',');
            short length=(short)(field.SqlType is "nvarchar" or "varchar" or "nchar" or "char"
                ?args is ["max"]?-1:int.Parse(args![0],CultureInfo.InvariantCulture)*(field.SqlType.StartsWith('n')?2:1):0);
            table.Rows.Add(field.Column,field.SqlType,length,(byte)(args?.Length==2?byte.Parse(args[0],CultureInfo.InvariantCulture):0),
                (byte)(args?.Length==2?byte.Parse(args[1],CultureInfo.InvariantCulture):0),field.Nullable,false,false,999-field.Ordinal);
        }
        if(mutation=="missing")table.Rows.RemoveAt(0);
        if(mutation=="type")table.Rows[0][1]="incompatible";
        if(mutation=="length")table.Rows.Cast<DataRow>().First(r=>(string)r[1]is "nvarchar" or "varchar")[2]=(short)1;
        if(mutation is "wider-text" or "max-text")
        {
            var row=table.Rows.Cast<DataRow>().First(r=>(string)r[1]is "nvarchar" or "varchar"&&(short)r[2]>0);
            row[2]=mutation=="max-text"?(short)-1:(short)((short)row[2]*2);
        }
        if(mutation=="duplicate")table.Rows.Add(table.Rows[0].ItemArray);
        if(mutation=="computed")table.Rows[0][7]=true;
        if(mutation=="identity")table.Rows[0][6]=true;
        if(mutation=="nullability")table.Rows[0][5]=!(bool)table.Rows[0][5];
        table.Rows.Add("NewOptionalColumn","nvarchar",(short)200,(byte)0,(byte)0,true,false,false,9999);
        return table;
        }
        var tables=command.Parameters.Cast<DbParameter>().Select(p=>Section((string)p.Value!)).ToArray();
        if(mutation=="projection")tables[0].Columns.RemoveAt(8);
        return new DataTableReader(mutation=="missing-result"?tables[..^1]:mutation=="extra-result"?[..tables,tables[0].Copy()]:tables);
    }
    private static DataTable Table(params Type[] types)
    {var t=new DataTable();for(var i=0;i<types.Length;i++)t.Columns.Add("c"+i,types[i]);return t;}
    private static DbDataReader Rows(params object[][] rows)
    {var t=Table(Enumerable.Repeat(typeof(object),rows.Length==0?1:rows[0].Length).ToArray());foreach(var row in rows)t.Rows.Add(row);return t.CreateDataReader();}

    private sealed class RuntimeWire
    {
        internal readonly Guid Binding=Guid.NewGuid();internal Guid JournalBinding;
        internal readonly LegacyCompany Company=PurchaseQuerySource.Company;
        internal readonly AuthoritativeIdentity Identity=PurchaseQuerySource.NewIdentity() with{BranchIds=["QA-A"],BranchSelection=new("assigned","QA-A",true)};
        internal readonly ErpSqlPlan Plan=ErpSqlPlan.Get("purchase-requests")!;
        internal readonly List<string> Sql=[];internal string Database="Synthetic";internal int JournalVersion=1,Commits,Effects;
        internal bool AllowWrites=true,NullObject;internal Dictionary<string,object?>? Header;
        private readonly Dictionary<string,Dictionary<string,object?>> lines=new(StringComparer.Ordinal);
        private byte[]? journalKey,journalIntent;private string? receipt;private Guid audit;
        internal RuntimeWire()=>JournalBinding=Binding;
        internal static bool IsFingerprintQuery(string sql)=>new[]{"HASHBYTES","sys.sql_modules","SY_FrmCfg","SY_FrmExpTbl","CatalogHash"}.Any(s=>sql.Contains(s,StringComparison.OrdinalIgnoreCase));
        internal DbConnection Connection()=>new WireConnection(this);
        internal SqlErpScreenCommands Commands()=>new(Binding,Company,Connection,_=>Task.FromResult<AuthoritativeIdentity?>(Identity),
            _=>Task.FromResult<AuthoritativeIdentity?>(Identity),new ErpWriteRuntime(Binding,Database=="Other"?"Synthetic":Database,"stale-hash",ErpScreenCatalog.ModuleIds),new Number());
        private JsonElement InputHeader()=>ErpInputRules.Serialize(new{purchaseDate="2026-10-15T00:00:00.000",personSuggest="Synthetic",department="Synthetic",currencyId="VND",objectId=NullObject?null:"OBJECT",rateExchange=1d});
        internal void Seed(bool exists)
        {
            if(!exists)return;
            Header=Plan.Screen.Fields["header"].ToDictionary(f=>f.Name,f=>Default(f),StringComparer.Ordinal);
            Header["purchaseRequestId"]="QA-DOC";Header["branchId"]="QA-A";Header["statusId"]=1;Header["isLocked"]=false;
            Header["currencyId"]="VND";Header["objectId"]=NullObject?null:"OBJECT";
            var line=Plan.Screen.Fields["lines"].ToDictionary(f=>f.Name,f=>Default(f),StringComparer.Ordinal);
            line["userAutoId"]="QA-LINE";line["purchaseRequestId"]="QA-DOC";line["itemId"]="ITEM";line["quantity"]=1m;line["unitPrice"]=2m;lines["QA-LINE"]=line;
        }
        private static object? Default(ErpFieldDefinition f)=>f.Nullable?null:f.SqlType switch
        {"varchar" or "nvarchar" or "char" or "nchar"=>"SYNTHETIC","datetime" or "datetime2" or "date"=>new DateTime(2026,10,15),
            "decimal" or "numeric" or "money" or "smallmoney"=>0m,"int"=>0,"bit"=>false,"float"=>1d,_=>throw new InvalidOperationException(f.SqlType)};
        internal async Task<JsonElement> Intent(string operation)
        {
            if(operation=="create")return ErpInputRules.Serialize(new ErpCreateRequest("key-create","QA-A",InputHeader(),
                [new("new-line",ErpInputRules.Serialize(new{itemId="ITEM",quantity="1",unitPrice="2"}))]));
            using var connection=Connection();connection.Open();using var transaction=connection.BeginTransaction(IsolationLevel.Serializable);
            var snapshot=await SqlErpScreenReader.Snapshot(transaction,Identity,Plan,"QA-A","QA-DOC",default);
            var state=SqlErpScreenReader.StateToken(snapshot!);
            return operation=="save"?ErpInputRules.Serialize(new ErpSaveRequest("key-save","QA-A","QA-DOC",state,InputHeader(),[]))
                :ErpInputRules.Serialize(new ErpDeleteRequest("key-delete","QA-A","QA-DOC",state));
        }
        private void Track(DbCommand command)
        {Assert.NotNull(command.Transaction);Assert.Equal(IsolationLevel.Serializable,command.Transaction.IsolationLevel);Assert.False(IsFingerprintQuery(command.CommandText),command.CommandText);Sql.Add(command.CommandText);}
        internal object Scalar(DbCommand command)
        {
            Track(command);var sql=command.CommandText;
            if(sql=="SELECT DB_NAME();")return Database;
            if(sql.Contains("sp_getapplock",StringComparison.Ordinal))return 0;
            if(sql.Contains("SELECT COUNT_BIG(*) FROM dbo.[AP_PurchaseRequestTbl]",StringComparison.Ordinal))return Header is null?0L:1L;
            if(sql.StartsWith("SELECT CONVERT(bit,CASE WHEN EXISTS",StringComparison.Ordinal))return false;
            throw new InvalidOperationException("Unexpected scalar: "+sql);
        }
        internal DbDataReader Read(DbCommand command)
        {
            if(command.CommandText is SqlNativeIdentity.Text or SqlNativeIdentity.ErpText)return NativeIdentityBatchFixture.Read(command,Read);
            Track(command);var sql=command.CommandText;
            if(sql=="SELECT DB_NAME();")return Rows([Database]);
            if(sql=="SELECT @@TRANCOUNT,CONVERT(int,XACT_STATE());")return Rows([1,1]);
            if(sql.Contains("FROM sys.columns C JOIN sys.types T",StringComparison.Ordinal))return Schema(command,Plan,"additive");
            if(sql.Contains("SELECT TOP(2) U.UserName,U.[Password]",StringComparison.Ordinal))return Rows([Identity.PrincipalId,"synthetic-stored-value",false,"qa-group",false]);
            if(sql==SqlLegacyBranchScope.NativeUserText)
            {var t=Table(typeof(string),typeof(string),typeof(bool),typeof(string),typeof(bool),typeof(string));t.Rows.Add(Identity.PrincipalId,"synthetic-stored-value",false,"qa-group",false,"QA-A");return t.CreateDataReader();}
            if(sql==SqlLegacyBranchScope.RestrictedText){var t=Table(typeof(string));t.Rows.Add("QA-A");return t.CreateDataReader();}
            if(sql.Contains(ErpSqlAuthority.GrantProjection,StringComparison.Ordinal))return Rows([Plan.Screen.MenuId,Plan.Screen.FormId,false,DBNull.Value,1,AllowWrites?1:0,AllowWrites?1:0,AllowWrites?1:0]);
            if(sql.StartsWith("SELECT SingletonId,SchemaVersion,DatabaseBindingId",StringComparison.Ordinal))return Rows([(byte)1,JournalVersion,JournalBinding]);
            if(sql.StartsWith("SELECT KeyBytes,IntentBytes,ReceiptJson",StringComparison.Ordinal))
                return receipt is null?Rows():Rows([journalKey!,journalIntent!,receipt,"QA-DOC",JsonSerializer.Deserialize<ErpCommandReceipt>(receipt,new JsonSerializerOptions(JsonSerializerDefaults.Web))!.StateToken!,audit]);
            if(sql==Plan.HeaderText||sql==Plan.ListText)return Project("header",Header is null?[]:[Header]);
            if(sql==Plan.LinesText("lines"))return Project("lines",lines.Values);
            if(sql.StartsWith("SELECT (SELECT COUNT_BIG(*)",StringComparison.Ordinal))return Rows([Header is null?0L:1L,(long)lines.Count]);
            if(sql.Contains("FROM dbo.SY_FrmDrdwTbl",StringComparison.Ordinal))
            {
                var field=(string)command.Parameters["@column"].Value!;var lookup=Plan.Screen.Lookups.Single(l=>l.Field==field&&(l.Grid??(object)DBNull.Value).Equals(command.Parameters["@grid"].Value));
                var source=field switch{"CurrencyID"=>"VND","ObjectID"=>"OBJECT","ItemID"=>"ITEM",_=>"1"};
                return Rows([source,lookup.ValueField,lookup.DisplayField,lookup.Parameters??(object)DBNull.Value,lookup.RequiredParameters??(object)DBNull.Value,false,lookup.MultiSelect,
                    lookup.LinkedFields??(object)DBNull.Value,lookup.AllowUnlisted]);
            }
            throw new InvalidOperationException("Unexpected reader: "+sql);
        }
        private DbDataReader Project(string section,IEnumerable<Dictionary<string,object?>> rows)
        {var fields=Plan.Screen.Fields[section];var t=Table(Enumerable.Repeat(typeof(object),fields.Count).ToArray());foreach(var row in rows)t.Rows.Add(fields.Select(f=>row.GetValueOrDefault(f.Name)??DBNull.Value).ToArray());return t.CreateDataReader();}
        internal int Write(DbCommand command)
        {
            Track(command);var sql=command.CommandText;
            if(sql.StartsWith("INSERT dbo.MedcomErpCommandJournal",StringComparison.Ordinal))
            {journalKey=(byte[])command.Parameters["@key"].Value!;journalIntent=(byte[])command.Parameters["@intent"].Value!;audit=(Guid)command.Parameters["@audit"].Value!;return 1;}
            if(sql.StartsWith("UPDATE dbo.MedcomErpCommandJournal",StringComparison.Ordinal)){receipt=(string)command.Parameters["@receipt"].Value!;return 1;}
            Effects++;
            if(sql.StartsWith("DELETE dbo.[AP_PurchaseRequestDetailTbl]",StringComparison.Ordinal)){var count=lines.Count;lines.Clear();return count;}
            if(sql.StartsWith("DELETE dbo.[AP_PurchaseRequestTbl]",StringComparison.Ordinal)){Header=null;return 1;}
            var isHeader=sql.Contains("dbo.[AP_PurchaseRequestTbl]",StringComparison.Ordinal);var fields=Plan.Screen.Fields[isHeader?"header":"lines"];
            var columns=sql.StartsWith("INSERT",StringComparison.Ordinal)?Regex.Match(sql,@"\]\(([^)]+)\)").Groups[1].Value.Split(',').Select(s=>s.Trim('[',']')).ToArray()
                :Regex.Matches(sql,@"\[([^\]]+)\]=@value\d+").Select(m=>m.Groups[1].Value).ToArray();
            var row=isHeader?Header??=new(StringComparer.Ordinal):new Dictionary<string,object?>(StringComparer.Ordinal);
            for(var i=0;i<columns.Length;i++)row[fields.Single(f=>f.Column==columns[i]).Name]=command.Parameters["@value"+i].Value is DBNull?null:command.Parameters["@value"+i].Value;
            if(!isHeader)lines[(string)row["userAutoId"]!]=row;
            return 1;
        }
        private sealed class Number:IErpDocumentNumberAllocator
        {public bool IsQualified(string module)=>true;public Task<string?> AllocateAsync(DbTransaction tx,string module,JsonElement header,CancellationToken token)=>Task.FromResult<string?>("QA-DOC");}
    }
    private sealed class WireConnection(RuntimeWire wire):DbConnection
    {
        private ConnectionState state;[AllowNull]public override string ConnectionString{get;set;}="";
        public override string Database=>"Synthetic";public override string DataSource=>"Recording";public override string ServerVersion=>"Recording";
        public override ConnectionState State=>state;public override void Open()=>state=ConnectionState.Open;public override void Close()=>state=ConnectionState.Closed;
        public override void ChangeDatabase(string database)=>throw new NotSupportedException();
        protected override DbCommand CreateDbCommand()=>new WireCommand(this,wire);
        protected override DbTransaction BeginDbTransaction(IsolationLevel level)=>new WireTransaction(this,wire,level);
    }
    private sealed class WireTransaction(WireConnection connection,RuntimeWire wire,IsolationLevel level):DbTransaction
    {public override IsolationLevel IsolationLevel=>level;protected override DbConnection DbConnection=>connection;public override void Commit()=>wire.Commits++;public override void Rollback(){} }
    private sealed class WireCommand(WireConnection connection,RuntimeWire wire):DbCommand
    {
        private readonly QueryParameters parameters=new();[AllowNull]public override string CommandText{get;set;}="";
        public override int CommandTimeout{get;set;}public override CommandType CommandType{get;set;}public override bool DesignTimeVisible{get;set;}public override UpdateRowSource UpdatedRowSource{get;set;}
        protected override DbConnection? DbConnection{get;set;}=connection;protected override DbTransaction? DbTransaction{get;set;}
        protected override DbParameterCollection DbParameterCollection=>parameters;protected override DbParameter CreateDbParameter()=>new QueryParameter();
        public override object? ExecuteScalar()=>wire.Scalar(this);protected override DbDataReader ExecuteDbDataReader(CommandBehavior behavior)=>wire.Read(this);
        public override int ExecuteNonQuery()=>wire.Write(this);public override void Cancel(){}public override void Prepare(){}
    }
}
