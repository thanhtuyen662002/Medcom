using System.Data;
using System.Data.Common;
using System.Diagnostics.CodeAnalysis;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Medcom.Contracts;
using Medcom.Infrastructure;
using Xunit;

namespace Medcom.Api.Tests;

// Offline execution of the production enrichment reader. SQL Server behavior remains a runtime gate.
public sealed class ItemDisplayContextTests
{
    [Theory]
    [InlineData(true,false,1)] [InlineData(false,true,1)] [InlineData(true,true,1)]
    [InlineData(true,false,500)] [InlineData(false,true,500)] [InlineData(true,true,500)]
    public void Production_projection_never_aggregates_an_outer_line_reference(bool master,bool stored,int count)
    {
        var sql=ItemDisplayContextReader.ProjectionText(count,master,stored);
        Assert.DoesNotContain(AggregateArguments(sql),argument=>Regex.IsMatch(argument,@"\bL\s*\.",RegexOptions.IgnoreCase));
        Assert.Contains("ORDER BY L.Ordinal",sql);
        Assert.Equal(master,sql.Contains("FROM dbo.CF_ItemTbl I WITH (HOLDLOCK) WHERE I.ItemID=L.ItemId",StringComparison.Ordinal));
        Assert.Equal(stored,sql.Contains("WHERE C.DocumentID=@document AND C.UserAutoID=L.LineId",StringComparison.Ordinal));
    }
    [Fact]
    public void Aggregate_guard_detects_both_original_8124_shapes_but_allows_where_correlation()
    {
        const string originalMaster="MAX(CASE WHEN DATALENGTH(I.ItemName)>131072 OR DATALENGTH(I.ItemID)<>DATALENGTH(L.ItemId) OR CONVERT(varbinary(max),I.ItemID)<>CONVERT(varbinary(max),L.ItemId) THEN 1 ELSE 0 END)";
        const string originalStored="MAX(CASE WHEN DATALENGTH(CONVERT(nvarchar(max),C.DocumentID))<>DATALENGTH(CONVERT(nvarchar(max),@document)) OR CONVERT(varbinary(max),CONVERT(nvarchar(max),C.DocumentID))<>CONVERT(varbinary(max),CONVERT(nvarchar(max),@document)) OR DATALENGTH(CONVERT(nvarchar(max),C.UserAutoID))<>DATALENGTH(L.LineId) OR CONVERT(varbinary(max),CONVERT(nvarchar(max),C.UserAutoID))<>CONVERT(varbinary(max),L.LineId) OR DATALENGTH(CONVERT(nvarchar(max),C.ItemID))<>DATALENGTH(L.ItemId) OR CONVERT(varbinary(max),CONVERT(nvarchar(max),C.ItemID))<>CONVERT(varbinary(max),L.ItemId) THEN 1 ELSE 0 END)";
        // The rewrite retains both complete per-row CASE expressions byte-for-byte
        // apart from formatting; only their position relative to MAX has changed.
        var production=Regex.Replace(ItemDisplayContextReader.ProjectionText(1,true,true),@"\s+"," ");
        Assert.Contains(originalMaster[4..^1],production);
        Assert.Contains(originalStored[4..^1],production);
        Assert.Contains(AggregateArguments(originalMaster),argument=>argument.Contains("L.ItemId",StringComparison.Ordinal));
        Assert.Contains(AggregateArguments(originalStored),argument=>argument.Contains("L.LineId",StringComparison.Ordinal));
        Assert.DoesNotContain(AggregateArguments("SELECT COUNT_BIG(*),MAX(R.InvalidMaster) FROM Rows R WHERE R.ItemId=L.ItemId"),
            argument=>argument.Contains("L.",StringComparison.Ordinal));
    }
    // A bounded structural guard for these fixed generated SQL shapes, not a SQL Server compiler.
    // Balanced parentheses include nested DATALENGTH/CONVERT arguments in the inspected aggregate.
    private static IEnumerable<string> AggregateArguments(string sql)
    {
        foreach(Match match in Regex.Matches(sql,@"\b(?:COUNT_BIG|COUNT|MAX|MIN|SUM|AVG)\s*\(",RegexOptions.IgnoreCase))
        {
            var start=match.Index+match.Length;var end=start;var depth=1;
            for(;end<sql.Length && depth>0;end++)
            {
                if(sql[end]=='(')depth++;
                else if(sql[end]==')')depth--;
            }
            Assert.Equal(0,depth);
            yield return sql[start..(end-1)];
        }
    }

    private static async Task<ItemDisplayContext> Read(ItemDisplayRecordingSource source,string kind="purchase-requests",int count=1)
    {
        await using var connection=new DisplayConnection(source.Read);await connection.OpenAsync();
        await using var tx=await connection.BeginTransactionAsync(IsolationLevel.Serializable);
        return Assert.IsType<ItemDisplayContext>(await ItemDisplayContextReader.ReadAsync(tx,kind,"DOC","BR","TOKEN",1,null,null,null,
            Enumerable.Range(0,count).Select(i=>($"L{i}","ITEM")).ToArray(),default));
    }
    [Theory]
    [InlineData("purchase-orders")] [InlineData("inbound-requests")]
    public async Task Unsafe_or_duplicate_original_row_binding_omits_context_without_lookup_or_row_mutation(string kind)
    {
        // Except empty storage-compatible keys, these are synthetic robustness cases,
        // not a claim about production data or primary-key behavior.
        foreach(var lineId in new[]{"",new string('x',51),new string('x',101),"bad\0key","\ud800","\udfff"})
        {
            var source=new ItemDisplayRecordingSource{MasterQualified=true,InboundQualified=true};
            await using var connection=new DisplayConnection(source.Read);await connection.OpenAsync();
            await using var tx=await connection.BeginTransactionAsync(IsolationLevel.Serializable);
            var keys=new[]{(lineId,"ITEM"),("ORDINARY","ITEM")};var before=keys.ToArray();
            Assert.Null(await ItemDisplayContextReader.ReadAsync(tx,kind,"DOC","BR",null,1,null,1,20,keys,default));
            Assert.Equal(before,keys);Assert.Empty(source.Commands);
        }
        var duplicates=new ItemDisplayRecordingSource{MasterQualified=true};
        await using var duplicateConnection=new DisplayConnection(duplicates.Read);await duplicateConnection.OpenAsync();
        await using var duplicateTx=await duplicateConnection.BeginTransactionAsync(IsolationLevel.Serializable);
        Assert.Null(await ItemDisplayContextReader.ReadAsync(duplicateTx,kind,"DOC","BR",null,1,null,1,20,
            [("SAME","ITEM"),("SAME","OTHER")],default));Assert.Empty(duplicates.Commands);
        var ordinary=new ItemDisplayRecordingSource{MasterQualified=true};ordinary.Items.Add(("ITEM","NSX","Name","Unit",true));
        Assert.Equal("available",Assert.Single((await Read(ordinary,kind)).Lines).ReferenceState);
    }
    [Theory]
    [InlineData("purchase-orders")] [InlineData("inbound-requests")]
    public async Task Unqualified_source_keys_preserve_original_bytes_with_explicit_unavailable_metadata(string kind)
    {
        foreach(var itemId in new[]{"",new string('x',51),"bad\0key","\ud800"})
        {
            var source=new ItemDisplayRecordingSource{MasterQualified=true,InboundQualified=true};
            source.Items.Add(("ITEM","master","Name","Unit",true));
            source.Stored.Add(("DOC","L0",itemId,"must not attach"));
            await using var connection=new DisplayConnection(source.Read);await connection.OpenAsync();
            await using var tx=await connection.BeginTransactionAsync(IsolationLevel.Serializable);
            Task<ItemDisplayContext?> ReadKeys((string LineId,string ItemId)[] keys)=>ItemDisplayContextReader.ReadAsync(
                tx,kind,"DOC","BR",null,1,null,1,20,keys,default);
            var only=Assert.Single(Assert.IsType<ItemDisplayContext>(await ReadKeys([("L0",itemId)])).Lines);
            Assert.Equal(itemId,only.ItemId);Assert.Equal("unavailable",only.ReferenceState);
            Assert.Null(only.ManufacturerItemCode);Assert.Null(only.ItemName);Assert.Null(only.Unit);
            Assert.Empty(source.Commands);
            var mixed=Assert.IsType<ItemDisplayContext>(await ReadKeys([("L0",itemId),("L1","ITEM")]));
            Assert.Equal(2,mixed.Lines.Count);Assert.Equal(itemId,mixed.Lines[0].ItemId);
            Assert.Equal("unavailable",mixed.Lines[0].ReferenceState);Assert.Equal("unavailable",mixed.Lines[0].ManufacturerCodeSource);
            Assert.Null(mixed.Lines[0].ManufacturerItemCode);Assert.Null(mixed.Lines[0].ItemName);Assert.Null(mixed.Lines[0].Unit);
            Assert.Equal("available",mixed.Lines[1].ReferenceState);
            var command=Assert.Single(source.Commands,c=>c.CommandText.Contains("item-display:rows",StringComparison.Ordinal));
            Assert.Equal(DBNull.Value,command.Parameters["@item0"].Value);Assert.Equal("ITEM",command.Parameters["@item1"].Value);
            Assert.All(source.Commands,c=>Assert.StartsWith("SELECT",c.CommandText));
            foreach(var failure in new[]{"duplicate-row","missing-row","extra-result","wrong-column"})
            {source.Failure=failure;await Assert.ThrowsAsync<InvalidOperationException>(()=>ReadKeys([("L0",itemId),("L1","ITEM")]));}
            source.Commands.Clear();
            Assert.Null(await ReadKeys([("L0",itemId),("L0",itemId)]));
            Assert.Empty(source.Commands);
        }
    }
    [Theory]
    [InlineData(null)] [InlineData("")] [InlineData("  Bộ thử nghiệm 😀  ")]
    public async Task Exact_null_empty_and_unicode_values_are_not_normalized(string? value)
    {
        var source=new ItemDisplayRecordingSource{MasterQualified=true};source.Items.Add(("ITEM",value,value,value,true));
        var line=Assert.Single((await Read(source)).Lines);
        Assert.Equal(value,line.ManufacturerItemCode);Assert.Equal(value,line.ItemName);Assert.Equal(value,line.Unit);
        Assert.Equal("available",line.ReferenceState);Assert.Equal("master",line.ManufacturerCodeSource);
        Assert.All(source.Commands,command=>Assert.StartsWith("SELECT",command.CommandText));
    }
    [Theory]
    [InlineData("absent","missing")] [InlineData("duplicate","ambiguous")]
    [InlineData("case","ambiguous")] [InlineData("accent","ambiguous")] [InlineData("padded","ambiguous")]
    [InlineData("single-alias","invalid")] [InlineData("shape","unavailable")]
    public async Task Missing_unqualified_and_SQL_equal_references_never_delete_or_fanout_lines(string scenario,string state)
    {
        var source=new ItemDisplayRecordingSource{MasterQualified=scenario!="shape"};
        if(scenario is not ("absent" or "shape"))source.Items.Add(("ITEM","CODE","Name","Unit",true));
        if(scenario=="single-alias") {source.Items.Clear();source.Items.Add(("item","CODE","Name","Unit",false));}
        if(scenario is "duplicate" or "case" or "accent" or "padded")source.Items.Add((scenario switch
            {"case"=>"item","accent"=>"ÍTEM","padded"=>"ITEM ",_=>"ITEM"},"other","other","other",false));
        var result=await Read(source,count:20);Assert.Equal(20,result.Lines.Count);
        Assert.All(result.Lines,line=>{Assert.Equal(state,line.ReferenceState);Assert.Null(line.ItemName);Assert.Null(line.Unit);
            Assert.Null(line.ManufacturerItemCode);Assert.Equal("unavailable",line.ManufacturerCodeSource);});
        Assert.Equal(Enumerable.Range(0,20).Select(i=>$"L{i}"),result.Lines.Select(line=>line.LineId));
    }
    [Theory]
    [InlineData(null)] [InlineData("")] [InlineData("persisted differs")]
    public async Task Inbound_uses_only_persisted_code_even_when_master_is_missing_or_disabled(string? code)
    {
        var source=new ItemDisplayRecordingSource{MasterQualified=true,InboundQualified=true};
        source.Items.Add(("ITEM","current master","Name","base unit",true));
        source.Stored.Add(("DOC","L0","ITEM",code));
        var line=Assert.Single((await Read(source,"inbound-requests")).Lines);
        Assert.Equal(code,line.ManufacturerItemCode);Assert.Equal("document",line.ManufacturerCodeSource);
        Assert.Equal("base unit",line.Unit);
        source.Items.Clear();line=Assert.Single((await Read(source,"inbound-requests")).Lines);
        Assert.Equal(code,line.ManufacturerItemCode);Assert.Equal("document",line.ManufacturerCodeSource);Assert.Equal("missing",line.ReferenceState);
        source.MasterQualified=false;line=Assert.Single((await Read(source,"inbound-requests")).Lines);
        Assert.Equal(code,line.ManufacturerItemCode);Assert.Equal("unavailable",line.ReferenceState);
    }
    [Theory]
    [InlineData("absent")] [InlineData("duplicate")] [InlineData("foreign")] [InlineData("alias")]
    public async Task Invalid_persisted_relation_never_falls_back_to_master_code(string scenario)
    {
        var source=new ItemDisplayRecordingSource{MasterQualified=true,InboundQualified=true};
        source.Items.Add(("ITEM","MASTER","Name",null,false));
        if(scenario!="absent")source.Stored.Add((scenario=="foreign"?"OTHER":"DOC",scenario=="alias"?"l0":"L0","ITEM","stored"));
        if(scenario=="duplicate")source.Stored.Add(("DOC","L0","ITEM","second"));
        var line=Assert.Single((await Read(source,"inbound-requests")).Lines);
        Assert.Null(line.ManufacturerItemCode);Assert.Equal("unavailable",line.ManufacturerCodeSource);Assert.Equal("Name",line.ItemName);
    }
    [Theory]
    [InlineData(20)] [InlineData(21)] [InlineData(50)] [InlineData(51)] [InlineData(100)] [InlineData(101)] [InlineData(500)]
    public async Task Reader_preserves_exact_cardinality_and_internal_order(int count)
    {var source=new ItemDisplayRecordingSource{MasterQualified=true};source.Items.Add(("ITEM",null,"Name",null,false));
     var result=await Read(source,count:count);Assert.Equal(count,result.Lines.Count);
     var command=Assert.Single(source.Commands,c=>c.CommandText.Contains("item-display:rows",StringComparison.Ordinal));
     Assert.Equal(2*count+1,command.Parameters.Count);Assert.Equal(5,command.CommandTimeout);}
    [Fact]
    public async Task Overflow_input_is_rejected_without_SQL()
    {var source=new ItemDisplayRecordingSource();await Assert.ThrowsAsync<InvalidOperationException>(()=>Read(source,count:501));Assert.Empty(source.Commands);}
    [Theory]
    [InlineData("long-name")] [InlineData("nul")] [InlineData("surrogate")] [InlineData("long-unit")] [InlineData("long-code")]
    public async Task Invalid_metadata_is_unknown_without_truncation(string invalid)
    {var source=new ItemDisplayRecordingSource{MasterQualified=true};source.Items.Add(("ITEM",invalid=="long-code"?new string('c',101):"C",
       invalid switch {"long-name"=>new string('n',65537),"nul"=>"bad\0value","surrogate"=>"\ud800",_=>"Name"},invalid=="long-unit"?new string('u',51):"U",false));
     Assert.Equal("invalid",Assert.Single((await Read(source)).Lines).ReferenceState);}
    [Fact]
    public async Task Metadata_budget_keeps_the_document_lines_but_discards_oversized_supplement()
    {var source=new ItemDisplayRecordingSource{MasterQualified=true};source.Items.Add(("ITEM","C",new string('n',65536),"U",false));
     var result=await Read(source,count:20);Assert.Equal(20,result.Lines.Count);Assert.All(result.Lines,l=>Assert.Equal("unavailable",l.ReferenceState));}
    [Theory]
    [InlineData("duplicate-row")] [InlineData("missing-row")] [InlineData("extra-result")] [InlineData("wrong-column")]
    public async Task Malformed_projection_is_rejected(string failure)
    {var source=new ItemDisplayRecordingSource{MasterQualified=true,Failure=failure};
     await Assert.ThrowsAsync<InvalidOperationException>(()=>Read(source,count:2));}
}

internal sealed class ItemDisplayRecordingSource
{
    internal bool MasterQualified,InboundQualified;
    internal string? Failure;
    internal Action? AfterRows;
    internal readonly List<(string Id,string? Code,string? Name,string? Unit,bool Disabled)> Items=[];
    internal readonly List<(string Document,string Line,string Item,string? Code)> Stored=[];
    internal readonly List<DbCommand> Commands=[];
    internal static bool Matches(string sql)=>sql.Contains("item-display:",StringComparison.Ordinal);
    private static string Fold(string s)=>new string(s.TrimEnd().Normalize(NormalizationForm.FormD)
        .Where(c=>CharUnicodeInfo.GetUnicodeCategory(c)!=UnicodeCategory.NonSpacingMark).ToArray()).ToUpperInvariant();
    internal DbDataReader Read(DbCommand command)
    {
        Commands.Add(command);Assert.Equal(IsolationLevel.Serializable,command.Transaction!.IsolationLevel);
        if(command.CommandText==ItemDisplayContextReader.MasterShapeText || command.CommandText==ItemDisplayContextReader.InboundShapeText)
        {var t=InboundModel.Table(("ShapeOk",typeof(int)));t.Rows.Add(command.CommandText==ItemDisplayContextReader.MasterShapeText?MasterQualified?1:0:InboundQualified?1:0);return t.CreateDataReader();}
        Assert.Contains("ORDER BY L.Ordinal",command.CommandText);Assert.DoesNotContain("isDisable",command.CommandText);
        var result=InboundModel.Table(("Ordinal",typeof(int)),("MasterRows",typeof(long)),("ItemName",typeof(string)),("Unit",typeof(string)),
            ("MasterCode",typeof(string)),("InvalidMaster",typeof(int)),("StoredRows",typeof(long)),("StoredCode",typeof(string)),("InvalidStored",typeof(int)));
        object Db(string? value)=>value??(object)DBNull.Value;
        var document=(string)command.Parameters["@document"].Value!;
        for(var i=0;command.Parameters.Contains($"@line{i}");i++)
        {
            Assert.Equal(DbType.String,command.Parameters[$"@item{i}"].DbType);Assert.Equal(50,command.Parameters[$"@item{i}"].Size);
            var id=command.Parameters[$"@item{i}"].Value as string;var line=(string)command.Parameters[$"@line{i}"].Value!;
            var items=MasterQualified&&id is not null?Items.Where(x=>Fold(x.Id)==Fold(id)).ToArray():[];
            var stored=InboundQualified&&command.CommandText.Contains("dbo.IV_InboundRequestDetailsTbl",StringComparison.Ordinal)?Stored.Where(x=>Fold(x.Document)==Fold(document)&&Fold(x.Line)==Fold(line)).ToArray():[];
            var item=items.Length==1?items[0]:default;var saved=stored.Length==1?stored[0]:default;
            var invalid=items.Any(x=>x.Id!=id||x.Name?.Length>65536)?1:0;
            result.Rows.Add(i,(long)items.Length,Db(item.Name?.Length>65536?null:item.Name),Db(item.Unit),Db(item.Code),invalid,
                (long)stored.Length,Db(saved.Code),stored.Any(x=>x.Document!=document||x.Line!=line||x.Item!=id)?1:0);
        }
        if(Failure=="duplicate-row")result.Rows[1][0]=0;
        if(Failure=="missing-row")result.Rows.RemoveAt(1);
        if(Failure=="wrong-column")result.Columns[0].ColumnName="Wrong";
        AfterRows?.Invoke();
        return Failure=="extra-result"?new DataTableReader([result,result.Clone()]):result.CreateDataReader();
    }
}
internal sealed class DisplayConnection(Func<DbCommand,DbDataReader> read):DbConnection
{
    private ConnectionState state;
    [AllowNull] public override string ConnectionString{get;set;}="";
    public override string Database=>"Synthetic";public override string DataSource=>"Recording";public override string ServerVersion=>"Recording";
    public override ConnectionState State=>state;public override void Open()=>state=ConnectionState.Open;public override void Close()=>state=ConnectionState.Closed;
    public override void ChangeDatabase(string name)=>throw new NotSupportedException();
    protected override DbTransaction BeginDbTransaction(IsolationLevel level)=>new DisplayTransaction(this,level);
    protected override DbCommand CreateDbCommand()=>new DisplayCommand(this,read);
}
internal sealed class DisplayTransaction(DisplayConnection connection,IsolationLevel level):DbTransaction
{public override IsolationLevel IsolationLevel=>level;protected override DbConnection DbConnection=>connection;
 public override void Commit()=>throw new InvalidOperationException("Read committed");public override void Rollback(){}}
internal sealed class DisplayCommand(DisplayConnection connection,Func<DbCommand,DbDataReader> read):DbCommand
{
    private readonly QueryParameters parameters=new();
    [AllowNull] public override string CommandText{get;set;}="";public override int CommandTimeout{get;set;}public override CommandType CommandType{get;set;}
    public override bool DesignTimeVisible{get;set;}public override UpdateRowSource UpdatedRowSource{get;set;}
    protected override DbConnection? DbConnection{get;set;}=connection;protected override DbTransaction? DbTransaction{get;set;}
    protected override DbParameterCollection DbParameterCollection=>parameters;
    protected override DbParameter CreateDbParameter()=>new QueryParameter();
    protected override DbDataReader ExecuteDbDataReader(CommandBehavior behavior)=>read(this);
    public override int ExecuteNonQuery()=>throw new InvalidOperationException("No writes");public override object? ExecuteScalar()=>throw new NotSupportedException();
    public override void Cancel(){}public override void Prepare(){}
}
