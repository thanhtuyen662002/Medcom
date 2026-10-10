using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using Medcom.Application;
using Medcom.Contracts;
namespace Medcom.Infrastructure.Erp;

// Implementations are bound by the integrating server to private target acceptance.
// No request field, schema probe or metadata flag can construct an accepted writer.
public interface IErpSqlCommandExecutor
{
    bool IsQualified(string module);
    bool CanExecute(string module,string operation)=>IsQualified(module);
    Task<ErpCommandResult> ExecuteAsync(string module,string operation,JsonElement intent,CancellationToken token);
    Task<ErpReadResult<ErpCommandObservation>> ObserveAsync(string module,ErpCommandLookupRequest request,CancellationToken token);
}
public sealed partial class SqlErpScreenService:IErpScreenService
{
    private readonly SqlErpScreenReader reader;
    private readonly IErpSqlCommandExecutor? commands;
    public SqlErpScreenService(SqlLegacyUserStore store,LegacyCompany company,
        Func<CancellationToken,Task<AuthoritativeIdentity?>> resolveLiveSession,
        Func<CancellationToken,Task<AuthoritativeIdentity?>>? inspectLocalSession=null,
        IErpSqlCommandExecutor? commands=null)
        :this(company,()=>store.CreateConnection(),resolveLiveSession,inspectLocalSession,commands){ }
    internal SqlErpScreenService(LegacyCompany company,Func<DbConnection> connections,
        Func<CancellationToken,Task<AuthoritativeIdentity?>> resolveLiveSession,
        Func<CancellationToken,Task<AuthoritativeIdentity?>>? inspectLocalSession=null,
        IErpSqlCommandExecutor? commands=null)
    {reader=new(company,connections,resolveLiveSession,inspectLocalSession);this.commands=commands;}
    public Task<ErpReadResult<ErpDocumentPage>> ListAsync(string module,ErpPageQuery query,CancellationToken token)
    {
        if(query is null||!ErpInputRules.Page(query.Page,query.PageSize)||query.Search?.Length>100||!ErpInputRules.Text(query.Search,false)
            ||!Date(query.DateFrom,out var from)||!Date(query.DateTo,out var through)||from is not null&&through is not null&&from>through
            ||through==DateTime.MaxValue.Date)return Invalid<ErpDocumentPage>();
        return reader.Run<ErpDocumentPage>(module,query.BranchId,async(transaction,identity,plan,rights)=>
        {
            if(query.StatusId is not null&&!plan.Screen.Fields["header"].Any(column=>column.Column=="StatusID"))return new(ErpReadOutcome.Invalid);
            await using var command=ErpSqlPlan.Command(transaction,plan.ListText);ErpSqlPlan.Scope(command,identity,query.BranchId);
            var search=query.Search is null?null:"%"+query.Search.Replace("~","~~",StringComparison.Ordinal)
                .Replace("%","~%",StringComparison.Ordinal).Replace("_","~_",StringComparison.Ordinal).Replace("[","~[",StringComparison.Ordinal)+"%";
            ErpSqlPlan.Parameter(command,"@search",DbType.String,search,404);
            ErpSqlPlan.Parameter(command,"@from",DbType.DateTime,from);ErpSqlPlan.Parameter(command,"@to",DbType.DateTime,through?.AddDays(1));
            ErpSqlPlan.Parameter(command,"@status",DbType.Int32,query.StatusId);
            ErpSqlPlan.Parameter(command,"@offset",DbType.Int32,(query.Page-1)*query.PageSize);ErpSqlPlan.Parameter(command,"@take",DbType.Int32,query.PageSize+1);
            await using var data=await command.ExecuteReaderAsync(token);var rows=new List<ErpDocumentRow>();
            while(await data.ReadAsync(token))
            {
                if(rows.Count>query.PageSize)throw new InvalidOperationException("Unbounded list response.");
                var header=await ErpSqlPlan.Row(data,plan.Screen.Fields["header"],token);
                var id=header.GetValueOrDefault(module=="purchase-requests"?"purchaseRequestId":"documentId")as string;
                if(!ErpInputRules.Identifier(id,50))throw new InvalidOperationException("Invalid document identity.");
                rows.Add(new(id!,header));
            }
            if(await data.NextResultAsync(token))throw new InvalidOperationException("Unexpected list result.");
            return new(ErpReadOutcome.Success,new ErpDocumentPage(rows.Take(query.PageSize).ToArray(),query.Page,query.PageSize,rows.Count>query.PageSize));
        },token);
    }
    public Task<ErpReadResult<ErpDocumentDetail>> DetailAsync(string module,string branch,string document,int page,int size,CancellationToken token)
    {
        if(!ErpInputRules.Identifier(document,50)||!ErpInputRules.Page(page,size))return Invalid<ErpDocumentDetail>();
        return reader.Run<ErpDocumentDetail>(module,branch,async(transaction,identity,plan,rights)=>
        {
            var snapshot=await SqlErpScreenReader.Snapshot(transaction,identity,plan,branch,document,token);
            if(snapshot is null)return new(ErpReadOutcome.NotFound);
            async Task<ErpLinePage> Section(string section)
            {
                var rows=await SqlErpScreenReader.Lines(transaction,plan,section,document,(page-1)*size,size+1,token);
                return new(rows.Take(size).ToArray(),page,size,rows.Count>size);
            }
            var lines=await Section("lines");var history=plan.HistoryTable is null?null:await Section("history");
            var comparison=plan.ComparisonTable is null?null:await Section("comparison");
            var state=await SqlErpScreenReader.ActionContext(transaction,identity,plan,branch,rights,snapshot,commands?.IsQualified(module)==true,token);
            state=state with{NumberingQualified=commands?.CanExecute(module,"create")==true};
            return new(ErpReadOutcome.Success,new ErpDocumentDetail(document,branch,SqlErpScreenReader.StateToken(snapshot),snapshot.Header,
                lines,history,comparison,ErpActionRules.Evaluate(state)));
        },token);
    }
    public Task<ErpReadResult<IReadOnlyList<ErpActionState>>> ActionsAsync(string module,string branch,string? document,CancellationToken token)
    {
        if(document is not null&&!ErpInputRules.Identifier(document,50))return Invalid<IReadOnlyList<ErpActionState>>();
        return reader.Run<IReadOnlyList<ErpActionState>>(module,branch,async(transaction,identity,plan,rights)=>
        {
            var snapshot=document is null?null:await SqlErpScreenReader.Snapshot(transaction,identity,plan,branch,document,token);
            if(document is not null&&snapshot is null)return new(ErpReadOutcome.NotFound);
            var state=await SqlErpScreenReader.ActionContext(transaction,identity,plan,branch,rights,snapshot,commands?.IsQualified(module)==true,token);
            state=state with{NumberingQualified=commands?.CanExecute(module,"create")==true};
            return new(ErpReadOutcome.Success,ErpActionRules.Evaluate(state));
        },token);
    }
    public Task<ErpReadResult<ErpDraftSelection>> PasteAsync(string module,ErpPasteRequest request,CancellationToken token)
    {
        if(request?.Rows is not {Count:>0 and <=ErpInputRules.MaximumLines}||ErpInputRules.LineType(module)is null)return Invalid<ErpDraftSelection>();
        // Snapshot before async work; no mutable caller collection is retained.
        var normalized=new List<ErpNewLine>();var count=request.Rows.Count;
        try
        {
            foreach(var row in request.Rows)
            {
                if(normalized.Count>=count||!ErpInputRules.Normalize(module,"lines",row,out var value))return Invalid<ErpDraftSelection>();
                normalized.Add(new(Guid.NewGuid().ToString("N"),value));
            }
            if(normalized.Count!=count)return Invalid<ErpDraftSelection>();
        }
        catch(Exception error)when(error is ArgumentException or InvalidOperationException){return Invalid<ErpDraftSelection>();}
        return reader.Run(module,request.BranchId,(_,_,plan,rights)=>Task.FromResult(rights.Add||rights.Update
            ?new ErpReadResult<ErpDraftSelection>(ErpReadOutcome.Success,new(normalized.AsReadOnly(),new Dictionary<string,object?>(),
                plan.Screen.Evidence,true)):new(ErpReadOutcome.Denied)),token);
    }
    public Task<ErpCommandResult> CreateAsync(string module,ErpCreateRequest request,CancellationToken token)=>Dispatch(module,"create",request,token);
    public Task<ErpCommandResult> SaveAsync(string module,ErpSaveRequest request,CancellationToken token)=>Dispatch(module,"save",request,token);
    public Task<ErpCommandResult> DeleteAsync(string module,ErpDeleteRequest request,CancellationToken token)=>Dispatch(module,"delete",request,token);
    public Task<ErpCommandResult> ActionAsync(string module,string action,ErpActionRequest request,CancellationToken token)=>Dispatch(module,action,request,token);
    public Task<ErpCommandResult> ScanAsync(string module,string action,ErpScanRequest request,CancellationToken token)=>Dispatch(module,action,request,token);
    public Task<ErpReadResult<ErpCommandObservation>> ObserveAsync(string module,ErpCommandLookupRequest request,CancellationToken token)
        =>commands?.ObserveAsync(module,request,token)??Task.FromResult(new ErpReadResult<ErpCommandObservation>(ErpReadOutcome.Unavailable,Code:"erp_write_unqualified"));
    private Task<ErpCommandResult> Dispatch<T>(string module,string operation,T request,CancellationToken token)
    {
        if(ErpScreenCatalog.Get(module)?.Actions.Any(action=>action.Operation==operation)!=true||request is null)
            return Task.FromResult(new ErpCommandResult(ErpCommandOutcome.InvalidInput,"invalid_erp_operation"));
        return commands?.ExecuteAsync(module,operation,ErpInputRules.Serialize(request),token)
            ??Task.FromResult(new ErpCommandResult(ErpCommandOutcome.QualificationRequired,"erp_write_unqualified"));
    }
    private static Task<ErpReadResult<T>> Invalid<T>()=>Task.FromResult(new ErpReadResult<T>(ErpReadOutcome.Invalid));
    private static bool Date(string? text,out DateTime? value)
    {
        value=null;if(text is null)return true;
        if(!DateTime.TryParseExact(text,"yyyy-MM-dd",CultureInfo.InvariantCulture,DateTimeStyles.None,out var parsed)||parsed<new DateTime(1753,1,1))return false;
        value=parsed;return true;
    }
}
