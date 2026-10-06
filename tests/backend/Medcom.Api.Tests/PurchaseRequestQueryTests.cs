using System.Collections;
using System.Data;
using System.Data.Common;
using System.Diagnostics.CodeAnalysis;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Medcom.Application;
using Medcom.Application.PurchaseRequests;
using Medcom.Contracts;
using Medcom.Infrastructure;
using Medcom.Infrastructure.PurchaseRequests;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class PurchaseRequestQueryTests
{
    [Fact]
    public async Task Complete_read_preserves_101_lines_hidden_values_and_exact_I14_token()
    {
        var source = new PurchaseQuerySource(); source.Seed(101);
        var result = await source.Service().OpenAsync("QA-DOC");
        Assert.Equal(PurchaseRequestQueryOutcome.Success, result.Outcome);
        Assert.Equal(101, result.Value!.Document.Lines.Count);
        Assert.Equal("999999999999999999", result.Value.Document.Lines[0].Values.Quantity);
        Assert.Equal("15.25", result.Value.Document.Header.Price); Assert.Equal(1.25, result.Value.Document.Header.RateExchange);
        Assert.Equal("2026-10-06T13:14:15.000", result.Value.Document.Header.PurchaseDate);
        Assert.Null(result.Value.Document.Header.Notes); Assert.Null(result.Value.Document.IsLocked);
        Assert.Equal(PurchaseRequestCommandRules.EqualityToken(source.Documents[0]), result.Value.StateToken);
        Assert.Equal(0, source.Commits); Assert.Equal(1, source.Rollbacks);
        Assert.All(source.Commands, command => Assert.True(command.Sql.TrimStart().StartsWith("SELECT", StringComparison.Ordinal)
            || command.Sql.TrimStart().StartsWith("WITH", StringComparison.Ordinal)));
    }
    [Fact]
    public async Task Incompatible_source_shape_fails_before_any_document_projection()
    {
        var source=new PurchaseQuerySource();source.Seed();source.ShapeOk=false;
        Assert.Equal(PurchaseRequestQueryOutcome.Unavailable,(await source.Service().OpenAsync("QA-DOC")).Outcome);
        Assert.DoesNotContain(source.Commands,command=>command.Sql.Contains("FROM dbo.AP_PurchaseRequestTbl",StringComparison.Ordinal));
        Assert.DoesNotContain(source.Commands,command=>command.Sql.Contains("MedcomPurchaseRequestCommandJournal",StringComparison.Ordinal));
    }
    [Theory]
    [InlineData("quantity")] [InlineData("price")] [InlineData("date")]
    public async Task Raw_nonrepresentable_values_are_rejected_before_formatting_can_round_them(string field)
    {
        var source=new PurchaseQuerySource();source.Seed();var document=source.Documents[0];
        source.Documents[0]=field switch {
            "quantity"=>document with {Lines=[document.Lines[0] with {Values=document.Lines[0].Values with {Quantity="0.5"}}]},
            "price"=>document with {Header=document.Header with {Price="15.251"}},
            _=>document with {Header=document.Header with {PurchaseDate="2026-10-06T13:14:15.001"}}};
        var result=await source.Service().OpenAsync("QA-DOC");Assert.Equal(PurchaseRequestQueryOutcome.Unavailable,result.Outcome);Assert.Null(result.Value);
    }
    [Theory]
    [InlineData("qa-doc")] [InlineData("QA-DOC ")] [InlineData("QA-DÓC")]
    public async Task Native_SQL_equal_hidden_children_are_fetched_then_rejected(string foreignKey)
    {
        var source = new PurchaseQuerySource(); source.Seed(); source.ExtraChildren.Add((foreignKey, source.Documents[0].Lines[0] with { LineId = "QA-HIDDEN" }));
        var result = await source.Service().OpenAsync("QA-DOC");
        Assert.Equal(PurchaseRequestQueryOutcome.Unavailable, result.Outcome); Assert.Null(result.Value);
    }
    [Theory]
    [InlineData("qa-doc")] [InlineData("QA-DOC ")]
    public async Task Native_equal_master_alias_never_selects_one_arbitrary_document(string documentId)
    {
        var source = new PurchaseQuerySource(); source.Seed();
        source.Documents.Add(source.Documents[0] with { PurchaseRequestId = documentId, BranchId = "QA-B" });
        Assert.Equal(PurchaseRequestQueryOutcome.NotFound, (await source.Service().OpenAsync("QA-DOC")).Outcome);
        Assert.Equal(PurchaseRequestQueryOutcome.Unavailable, (await source.Service().ListAsync(new())).Outcome);
    }
    [Fact]
    public async Task Native_equal_line_identity_in_another_parent_is_rejected()
    {
        var source = new PurchaseQuerySource(); source.Seed();
        source.ExtraChildren.Add(("QA-OTHER", source.Documents[0].Lines[0] with { LineId = source.Documents[0].Lines[0].LineId.ToLowerInvariant() }));
        Assert.Equal(PurchaseRequestQueryOutcome.Unavailable, (await source.Service().OpenAsync("QA-DOC")).Outcome);
    }
    [Fact]
    public async Task Byte_identical_master_duplicate_in_an_unlisted_branch_is_ambiguous()
    {
        var source = new PurchaseQuerySource(); source.Seed();
        source.Documents.Add(source.Documents[0] with { BranchId = "QA-HIDDEN" });
        var result = await source.Service().ListAsync(new(BranchId: "QA-A"));
        Assert.Equal(PurchaseRequestQueryOutcome.Unavailable, result.Outcome);
        Assert.Null(result.Value);
    }
    [Fact]
    public async Task Byte_identical_line_identity_in_another_parent_is_ambiguous()
    {
        var source = new PurchaseQuerySource(); source.Seed();
        source.ExtraChildren.Add(("QA-OTHER", source.Documents[0].Lines[0]));
        var result = await source.Service().OpenAsync("QA-DOC");
        Assert.Equal(PurchaseRequestQueryOutcome.Unavailable, result.Outcome);
        Assert.Null(result.Value);
    }
    [Fact]
    public async Task Physical_branch_filter_excludes_collation_aliases_and_new_native_revocation()
    {
        var source = new PurchaseQuerySource(); source.Seed();
        source.Documents.Add(source.Documents[0] with { PurchaseRequestId = "QA-ALIAS-BRANCH", BranchId = "qa-a" });
        var list = await source.Service().ListAsync(new(BranchId: "QA-A"));
        Assert.Equal("QA-DOC", Assert.Single(list.Value!.Rows).DocumentId);
        source.NativeBranches = ["QA-B"];
        Assert.Equal(PurchaseRequestQueryOutcome.Denied, (await source.Service().ListAsync(new(BranchId: "QA-A"))).Outcome);
        Assert.Equal(PurchaseRequestQueryOutcome.NotFound, (await source.Service().OpenAsync("QA-DOC")).Outcome);
    }
    [Theory]
    [InlineData("principal")] [InlineData("group")] [InlineData("disabled")] [InlineData("stamp")]
    public async Task Current_credential_and_group_are_checked_inside_the_read_transaction(string mutation)
    {
        var source = new PurchaseQuerySource(); source.Seed();
        switch (mutation) { case "principal": source.Username="QA-USER"; break; case "group": source.Group="qa-alias-group"; break; case "disabled": source.Disabled=true; break; case "stamp": source.StoredHash="changed-synthetic-value"; break; }
        Assert.Equal(PurchaseRequestQueryOutcome.Denied, (await source.Service().OpenAsync("QA-DOC")).Outcome);
        Assert.DoesNotContain(source.Commands, command => command.Sql.Contains("AP_PurchaseRequestTbl", StringComparison.Ordinal));
    }
    [Theory]
    [InlineData("run")] [InlineData("menu")] [InlineData("form")] [InlineData("parameter")] [InlineData("parent")]
    public async Task Exact_native_Run_menu_form_parameter_and_parent_are_required(string mutation)
    {
        var source = new PurchaseQuerySource(); source.Seed();
        switch (mutation) { case "run": source.CanRun=false; break; case "menu": source.Menu="050129"; break; case "form": source.Form="AP_OrderFrm"; break; case "parameter": source.Parameter="unexpected"; break; case "parent": source.Parent="05 "; break; }
        Assert.Equal(PurchaseRequestQueryOutcome.Denied, (await source.Service().OpenAsync("QA-DOC")).Outcome);
    }
    [Theory]
    [InlineData("logout")] [InlineData("branch")] [InlineData("capability")] [InlineData("company")]
    public async Task Revocation_during_a_read_suppresses_the_entire_result(string mutation)
    {
        var source = new PurchaseQuerySource(); source.Seed();
        source.AfterData = () => source.Identity = mutation switch {
            "logout" => null, "branch" => source.Identity! with { BranchIds=["QA-B"] },
            "capability" => source.Identity! with { Capabilities=[] }, _ => source.Identity! with { CompanyId="other" } };
        var result = await source.Service().OpenAsync("QA-DOC");
        Assert.Equal(PurchaseRequestQueryOutcome.Denied, result.Outcome); Assert.Null(result.Value);
    }
    [Fact]
    public async Task Invalid_queries_and_ineligible_sessions_never_open_a_connection()
    {
        var source = new PurchaseQuerySource();
        foreach (var query in new[] { new PurchaseRequestListQuery(0), new(1001), new(PageSize:51), new(Search:new string('x',101)), new(BranchId:"QA-A ") })
            Assert.Equal(PurchaseRequestQueryOutcome.Invalid, (await source.Service().ListAsync(query)).Outcome);
        Assert.Equal(PurchaseRequestQueryOutcome.Invalid, (await source.Service().OpenAsync("QA-DOC ")).Outcome);
        Assert.Equal(PurchaseRequestQueryOutcome.Invalid, (await source.Service().LookupAsync("dbo.SY_User", "", 1)).Outcome);
        source.Identity=source.Identity! with { TenantId="other" };
        Assert.Equal(PurchaseRequestQueryOutcome.Denied, (await source.Service().WorkspaceAsync()).Outcome); Assert.Equal(0,source.Opens);
    }
    [Fact]
    public async Task Parameterized_paging_search_and_lookup_qualification_have_real_results()
    {
        var source=new PurchaseQuerySource(); source.Seed();
        for(var i=0;i<21;i++)source.Documents.Add(source.Documents[0] with { PurchaseRequestId=$"QA-{i:000}" });
        var page=await source.Service().ListAsync(new(PageSize:20));
        Assert.Equal(20,page.Value!.Rows.Count); Assert.True(page.Value.HasMore);
        var second=await source.Service().ListAsync(new(Page:2,PageSize:20)); Assert.Equal(2,second.Value!.Rows.Count); Assert.False(second.Value.HasMore);
        await source.Service().ListAsync(new(Search:"%'_[]~"));
        var command=source.Commands.Last(c=>c.Sql.Contains("OFFSET @skip",StringComparison.Ordinal));
        Assert.Equal("%~%'~_~[]~~%",command.Parameters["@search"]);
        Assert.DoesNotContain("%'_[]~",command.Sql,StringComparison.Ordinal);
        var bootstrap=await source.Service().WorkspaceAsync(); Assert.False(bootstrap.Value!.WriteAvailable);
        var items=await source.Service().LookupAsync("items","",1); Assert.False(items.Value!.Available); Assert.Empty(items.Value.Items);
        var branches=await source.Service().LookupAsync("branches","QA-A",1); Assert.Equal(new PurchaseRequestChoice("QA-A","QA-A"),Assert.Single(branches.Value!.Items));
        Assert.DoesNotContain(source.Commands,c=>c.Sql.Contains("CF_ItemTbl",StringComparison.Ordinal));
    }
}

// Synthetic source rows only. Native-equality behavior deliberately includes case/accent/space aliases.
internal sealed class PurchaseQuerySource
{
    public static readonly LegacyCompany Company=new("qa-tenant","qa-company","Synthetic company");
    public AuthoritativeIdentity? Identity=NewIdentity();
    public string Username="qa-user",StoredHash="synthetic-stored-value",Group="qa-group",Menu="05011",Form="AP_PurposeRequestListFrm",Parent="05";
    public string? Parameter; public bool Disabled,CanRun=true,ShapeOk=true;
    public string[] NativeBranches=["QA-A","QA-B"];
    public readonly List<PurchaseRequestAggregate> Documents=[];
    public readonly List<(string ForeignKey,PurchaseRequestPersistedLine Line)> ExtraChildren=[];
    public readonly List<(string Sql,Dictionary<string,object?> Parameters)> Commands=[];
    public int Opens,Commits,Rollbacks; public Action? AfterData;
    public static AuthoritativeIdentity NewIdentity()=>new("qa-user",Company.TenantId,Company.CompanyId,Company.CompanyName,"Synthetic user",1,
        ["platform.status","purchase-requests.read"],Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes("qa-user\0synthetic-stored-value\0qa-group"))),["QA-A","QA-B"]);
    public SqlPurchaseRequestQueries Service()=>new(Company,()=>new QueryConnection(this),_=>Task.FromResult(Identity));
    public void Seed(int count=1)=>Documents.Add(new("QA-DOC","QA-A",new("2026-10-06T13:14:15.000",1,"Synthetic requester","Synthetic department",null,"15.25",null,"VND","QA-OBJECT",1.25),1,null,
        Enumerable.Range(1,count).Select(i=>new PurchaseRequestPersistedLine($"QA-L{i:000}",new("QA-ITEM",null,"synthetic time","999999999999999999","2","7",null))).ToArray()));
    private static string Fold(string input)=>new string(input.TrimEnd().Normalize(NormalizationForm.FormD).Where(c=>CharUnicodeInfo.GetUnicodeCategory(c)!=UnicodeCategory.NonSpacingMark).ToArray()).ToUpperInvariant();
    public DbDataReader Read(QueryCommand command)
    {
        var parameters=command.Parameters.Cast<DbParameter>().ToDictionary(p=>p.ParameterName,p=>p.Value==DBNull.Value?null:p.Value,StringComparer.Ordinal);
        Commands.Add((command.CommandText,parameters));
        if(command.CommandText==SqlPurchaseRequestQueries.ShapeText)return Rows(1,[[ShapeOk?1:0]]);
        if(command.CommandText==SqlPurchaseRequestQueries.CredentialText)
        {
            Assert.Contains("DATALENGTH(@actor)",command.CommandText);Assert.Equal(DbType.String,command.Parameters["@actor"].DbType);
            return Rows(5,[[Username,StoredHash,Disabled,Group,false]]);
        }
        if(command.CommandText==SqlPurchaseRequestQueries.GrantsText)
        {
            Assert.Contains("G.IsRun=1 THEN 1",command.CommandText);Assert.Contains("DATALENGTH(@username)",command.CommandText);
            return Rows(8,[[Menu,Form,Parameter??(object)DBNull.Value,false,Parent,false,CanRun?1:0,1]]);
        }
        if(command.CommandText==SqlPurchaseRequestQueries.BranchesText)return Rows(1,NativeBranches.Select(branch=>new object[]{branch}));
        var id=parameters.GetValueOrDefault("@document") as string;
        IEnumerable<object[]> result;
        if(command.CommandText.Contains("OFFSET @skip",StringComparison.Ordinal))
        {
            var branches=parameters.Where(p=>p.Key.StartsWith("@branch",StringComparison.Ordinal)).Select(p=>(string)p.Value!).ToArray();
            var exact=command.CommandText.Contains("DATALENGTH(@branch0)",StringComparison.Ordinal);
            result=Documents.Where(d=>branches.Any(branch=>exact?d.BranchId==branch:Fold(d.BranchId)==Fold(branch)))
                .OrderBy(d=>d.PurchaseRequestId,StringComparer.Ordinal).Skip((int)parameters["@skip"]!).Take((int)parameters["@take"]!)
                .Select(d=>new object[]{d.PurchaseRequestId,Date(d.Header.PurchaseDate),d.BranchId,d.Header.PersonSuggest,d.Header.Department,d.StatusId,d.IsLocked??(object)DBNull.Value,
                    command.CommandText.Contains("AS IdentityAlias",StringComparison.Ordinal)
                        &&(command.CommandText.Contains("SELECT COUNT_BIG(*)",StringComparison.Ordinal)
                            ? Documents.Count(a=>Fold(a.PurchaseRequestId)==Fold(d.PurchaseRequestId))>1
                            : Documents.Any(a=>Fold(a.PurchaseRequestId)==Fold(d.PurchaseRequestId)&&a.PurchaseRequestId!=d.PurchaseRequestId))?1:0});
            var reader=Rows(8,result);AfterData?.Invoke();return reader;
        }
        if(command.CommandText.Contains("FROM dbo.AP_PurchaseRequestTbl",StringComparison.Ordinal))
        {
            var native=command.CommandText.Contains("WHERE PurchaseRequestID=@document",StringComparison.Ordinal);
            result=Documents.Where(d=>native?Fold(d.PurchaseRequestId)==Fold(id!):d.PurchaseRequestId==id).Take(2).Select(d=>new object[]{d.PurchaseRequestId,Date(d.Header.PurchaseDate),d.Header.PurposeId??(object)DBNull.Value,
                d.Header.PersonSuggest,d.Header.Department,d.Header.PurposeDescOrClient??(object)DBNull.Value,Number(d.Header.Price),d.Header.Notes??(object)DBNull.Value,d.StatusId,d.IsLocked??(object)DBNull.Value,
                d.Header.CurrencyId,d.Header.ObjectId,d.Header.RateExchange,d.BranchId});return Rows(14,result);
        }
        if(command.CommandText.Contains("FROM dbo.AP_PurchaseRequestDetailTbl C",StringComparison.Ordinal))
        {
            var all=Documents.SelectMany(d=>d.Lines.Select(line=>(ForeignKey:d.PurchaseRequestId,Line:line))).Concat(ExtraChildren).ToArray();
            var native=command.CommandText.Contains("WHERE C.PurchaseRequestID=@document",StringComparison.Ordinal);
            result=all.Where(row=>native?Fold(row.ForeignKey)==Fold(id!):row.ForeignKey==id).Take(501).Select(row=>new object[]{row.Line.LineId,row.Line.Values.ItemId,Number(row.Line.Values.Budget),row.Line.Values.TimeRequired??(object)DBNull.Value,
                Number(row.Line.Values.Quantity),Number(row.Line.Values.UnitPrice),Number(row.Line.Values.TotalPrice),row.Line.Values.Model??(object)DBNull.Value,row.ForeignKey,
                command.CommandText.Contains("AS IdentityAlias",StringComparison.Ordinal)
                    &&(command.CommandText.Contains("SELECT COUNT_BIG(*)",StringComparison.Ordinal)
                        ? all.Count(a=>Fold(a.Line.LineId)==Fold(row.Line.LineId))>1
                        : all.Any(a=>Fold(a.Line.LineId)==Fold(row.Line.LineId)&&a.Line.LineId!=row.Line.LineId))?1:0});
            var reader=Rows(10,result);AfterData?.Invoke();return reader;
        }
        throw new InvalidOperationException("Unrecognized synthetic query.");
    }
    private static object Date(string? text)=>text is null?DBNull.Value:DateTime.ParseExact(text,"yyyy-MM-dd'T'HH:mm:ss.fff",CultureInfo.InvariantCulture);
    private static object Number(string? text)=>text is null?DBNull.Value:decimal.Parse(text,CultureInfo.InvariantCulture);
    private static DbDataReader Rows(int columns,IEnumerable<object[]> rows){var table=new DataTable();for(var i=0;i<columns;i++)table.Columns.Add($"c{i}",typeof(object));foreach(var row in rows)table.Rows.Add(row);return table.CreateDataReader();}
}

internal sealed class QueryConnection(PurchaseQuerySource source):DbConnection
{
    private ConnectionState state;
    [AllowNull] public override string ConnectionString{get;set;}="";public override string Database=>"synthetic";public override string DataSource=>"synthetic";public override string ServerVersion=>"synthetic";public override ConnectionState State=>state;
    public override void ChangeDatabase(string name)=>throw new NotSupportedException();public override void Close()=>state=ConnectionState.Closed;
    public override void Open(){source.Opens++;state=ConnectionState.Open;}
    protected override DbTransaction BeginDbTransaction(IsolationLevel level)=>new QueryTransaction(this,source,level);
    protected override DbCommand CreateDbCommand()=>new QueryCommand(this,source);
}
internal sealed class QueryTransaction(QueryConnection connection,PurchaseQuerySource source,IsolationLevel level):DbTransaction
{public override IsolationLevel IsolationLevel=>level;protected override DbConnection DbConnection=>connection;public override void Commit(){source.Commits++;throw new InvalidOperationException("Read must not commit.");}public override void Rollback()=>source.Rollbacks++;}
internal sealed class QueryCommand(QueryConnection connection,PurchaseQuerySource source):DbCommand
{
    private readonly QueryParameters parameters=new();[AllowNull] public override string CommandText{get;set;}="";public override int CommandTimeout{get;set;}public override CommandType CommandType{get;set;}public override bool DesignTimeVisible{get;set;}public override UpdateRowSource UpdatedRowSource{get;set;}
    protected override DbConnection? DbConnection{get;set;}=connection;protected override DbTransaction? DbTransaction{get;set;}protected override DbParameterCollection DbParameterCollection=>parameters;
    public override void Cancel(){}public override int ExecuteNonQuery()=>throw new InvalidOperationException("No DML allowed.");public override object? ExecuteScalar()=>throw new NotSupportedException();public override void Prepare(){}
    protected override DbParameter CreateDbParameter()=>new QueryParameter();protected override DbDataReader ExecuteDbDataReader(CommandBehavior behavior){Assert.NotNull(DbTransaction);Assert.Equal(IsolationLevel.Serializable,DbTransaction!.IsolationLevel);return source.Read(this);}
}
internal sealed class QueryParameter:DbParameter
{public override DbType DbType{get;set;}public override ParameterDirection Direction{get;set;}=ParameterDirection.Input;public override bool IsNullable{get;set;}[AllowNull] public override string ParameterName{get;set;}="";[AllowNull] public override string SourceColumn{get;set;}="";public override object? Value{get;set;}public override bool SourceColumnNullMapping{get;set;}public override int Size{get;set;}public override void ResetDbType(){}}
internal sealed class QueryParameters:DbParameterCollection
{
 private readonly List<DbParameter> values=[];public override int Count=>values.Count;public override object SyncRoot=>this;public override int Add(object value){values.Add((DbParameter)value);return values.Count-1;}public override void AddRange(Array array){foreach(var value in array)Add(value!);}public override void Clear()=>values.Clear();public override bool Contains(object value)=>values.Contains((DbParameter)value);public override bool Contains(string name)=>IndexOf(name)>=0;public override void CopyTo(Array array,int index)=>((ICollection)values).CopyTo(array,index);public override IEnumerator GetEnumerator()=>values.GetEnumerator();public override int IndexOf(object value)=>values.IndexOf((DbParameter)value);public override int IndexOf(string name)=>values.FindIndex(value=>value.ParameterName==name);public override void Insert(int index,object value)=>values.Insert(index,(DbParameter)value);public override void Remove(object value)=>values.Remove((DbParameter)value);public override void RemoveAt(int index)=>values.RemoveAt(index);public override void RemoveAt(string name)=>RemoveAt(IndexOf(name));protected override DbParameter GetParameter(int index)=>values[index];protected override DbParameter GetParameter(string name)=>values[IndexOf(name)];protected override void SetParameter(int index,DbParameter value)=>values[index]=value;protected override void SetParameter(string name,DbParameter value){var index=IndexOf(name);if(index<0)values.Add(value);else values[index]=value;}
}
