using System.Collections.ObjectModel;
using System.Data;
using System.Data.Common;
using System.Globalization;
using Medcom.Application;
using Medcom.Contracts;
namespace Medcom.Infrastructure.Erp;

public sealed partial class SqlErpScreenService
{
    private const int LookupMaximum=100_000;
    // PM popups are action parameters, separate from the 106 field dropdown bindings.
    // Project only public selection metadata; SY_User passwords and tokens never leave SQL.
    public Task<ErpReadResult<ErpChoicePage>> PmOptionsAsync(string module,ErpPmLookupQuery query,CancellationToken token)
    {
        if(module is not ("sales-orders" or "internal-transfer-requests")||query is null||!ErpInputRules.Page(query.Page,query.PageSize)
            ||query.Role is not ("primary" or "supporting")||module=="sales-orders"&&query.Role!="primary"
            ||query.Search is {Length:>100}||!ErpInputRules.Text(query.Search,false))return Invalid<ErpChoicePage>();
        return reader.Run<ErpChoicePage>(module,query.BranchId,async(transaction,identity,plan,rights)=>
        {
            if(!rights.Update)return new(ErpReadOutcome.Denied);
            await using var command=ErpSqlPlan.Command(transaction,"""
                SELECT U.UserName,U.HoTen,U.BranchID FROM dbo.SY_User U WITH(HOLDLOCK)
                WHERE U.Disable=0 AND U.PM=1
                  AND (@restrict=0 OR U.BranchID=@branch OR EXISTS(SELECT 1 FROM dbo.SY_UserBranch B WITH(HOLDLOCK) WHERE B.UserName=U.UserName AND B.BranchID=@branch))
                  AND (@search IS NULL OR U.UserName LIKE @search ESCAPE N'~' OR U.HoTen LIKE @search ESCAPE N'~')
                ORDER BY U.UserName COLLATE Latin1_General_100_BIN2,U.HoTen COLLATE Latin1_General_100_BIN2
                OFFSET @offset ROWS FETCH NEXT @take ROWS ONLY;
                """);
            ErpSqlPlan.Parameter(command,"@restrict",DbType.Boolean,module=="internal-transfer-requests"&&query.Role=="primary");
            ErpSqlPlan.Parameter(command,"@branch",DbType.AnsiString,query.BranchId,50);
            ErpSqlPlan.Parameter(command,"@search",DbType.String,query.Search is null?null:"%"+query.Search.Replace("~","~~",StringComparison.Ordinal)
                .Replace("%","~%",StringComparison.Ordinal).Replace("_","~_",StringComparison.Ordinal).Replace("[","~[",StringComparison.Ordinal)+"%",404);
            ErpSqlPlan.Parameter(command,"@offset",DbType.Int32,(query.Page-1)*query.PageSize);ErpSqlPlan.Parameter(command,"@take",DbType.Int32,query.PageSize+1);
            await using var data=await command.ExecuteReaderAsync(token);var choices=new List<ErpChoice>();var seen=new HashSet<string>(StringComparer.Ordinal);
            while(await data.ReadAsync(token))
            {
                if(choices.Count>query.PageSize||data.IsDBNull(0)||!seen.Add(data.GetString(0)))throw new InvalidOperationException("Invalid PM selection shape.");
                var user=data.GetString(0);var name=data.IsDBNull(1)?null:data.GetString(1);var branch=data.IsDBNull(2)?null:data.GetString(2);
                choices.Add(new(user,name,new ReadOnlyDictionary<string,object?>(new Dictionary<string,object?>{{"UserName",user},{"HoTen",name},{"BranchID",branch}})));
            }
            if(await data.NextResultAsync(token))return new(ErpReadOutcome.Unavailable);
            return new(ErpReadOutcome.Success,new(choices.Take(query.PageSize).ToArray(),query.Page,query.PageSize,choices.Count>query.PageSize,[]));
        },token);
    }
    public Task<ErpReadResult<ErpChoicePage>> OptionsAsync(string module,ErpLookupQuery query,CancellationToken token)
    {
        if(!LookupInput(module,query,out var definition,out var arguments,out var values,out var required))return Invalid<ErpChoicePage>();
        return reader.Run<ErpChoicePage>(module,query.BranchId,async(transaction,identity,plan,rights)=>
        {
            var rows=await Choices(transaction,identity,plan,definition!,arguments,values,query.BranchId,query.Search,token);
            if(rows is null)return new(ErpReadOutcome.Unavailable,Code:"erp_lookup_binding_or_capacity_changed");
            return new(ErpReadOutcome.Success,new(rows.Skip((query.Page-1)*query.PageSize).Take(query.PageSize).ToArray(),
                query.Page,query.PageSize,rows.Count>query.Page*query.PageSize,required));
        },token);
    }
    private static bool LookupInput(string module,ErpLookupQuery? query,out ErpLookupDefinition? definition,
        out string[] arguments,out string[] values,out string[] required)
    {
        definition=ErpScreenCatalog.Get(module)?.Lookups.SingleOrDefault(lookup=>lookup.Id==query?.LookupId);
        arguments=[];values=[];required=[];
        if(query is null||definition is null||definition.Disabled||!ErpInputRules.Page(query.Page,query.PageSize)
            ||query.Page>1000||query.Search is {Length:>100}||!ErpInputRules.Text(query.Search,false))return false;
        arguments=(definition.Parameters??"").Split(';',StringSplitOptions.RemoveEmptyEntries);
        required=(definition.RequiredParameters??"").Split(';',StringSplitOptions.RemoveEmptyEntries);
        var context=query.Context??new Dictionary<string,string?>();var names=arguments;
        if(context.Count>16||context.Keys.Any(key=>!names.Contains(key,StringComparer.Ordinal))
            ||context.Values.Any(value=>value is not null&&(value.Length>250||!ErpInputRules.Text(value,false)))
            ||required.Any(argument=>string.IsNullOrEmpty(context.GetValueOrDefault(argument))))return false;
        values=arguments.Select(argument=>context.GetValueOrDefault(argument)??"").ToArray();return true;
    }
    // Filtering and deterministic ordering precede page slicing, including DECLARE/procedure bindings.
    // Capacity overflow returns no partial page. Serializable reads fence the entire selection.
    internal static async Task<IReadOnlyList<ErpChoice>?> Choices(DbTransaction transaction,AuthoritativeIdentity identity,
        ErpSqlPlan plan,ErpLookupDefinition definition,string[] arguments,string[] values,string branch,string? search,CancellationToken token,string? selectedKey=null)
    {
        var source=await ErpLookupSql.Source(transaction,plan.Screen,definition,token);
        var bound=source is null?null:ErpLookupSql.Bind(source,arguments,values,identity.PrincipalId,branch);
        if(bound is null)return null;
        var expression=selectedKey is null?null:ErpLookupSql.SelectExpression(bound.Text);
        var valueColumn="Q.["+definition.ValueField.Replace("]","]]",StringComparison.Ordinal)+"]";
        await using var command=ErpSqlPlan.Command(transaction,expression is null?"SET ROWCOUNT 100001;\n"+bound.Text+"\n;SET ROWCOUNT 0;"
            :"SELECT TOP(3) Q.* FROM ("+expression+") Q WHERE "+valueColumn+"=@selectedKey AND "+ErpSqlPlan.Exact(valueColumn,"@selectedKey")+";");
        if(expression is not null)ErpSqlPlan.Parameter(command,"@selectedKey",DbType.String,selectedKey,250);
        foreach(var parameter in bound.Parameters)ErpSqlPlan.Parameter(command,parameter.Name,DbType.String,parameter.Value,1000);
        await using var data=await command.ExecuteReaderAsync(token);
        var ids=Enumerable.Range(0,data.FieldCount).Where(i=>data.GetName(i)==definition.ValueField).ToArray();
        var labels=Enumerable.Range(0,data.FieldCount).Where(i=>data.GetName(i)==definition.DisplayField).ToArray();
        if(ids.Length!=1||labels.Length!=1||ErpLookupSql.Sensitive(definition.ValueField)||ErpLookupSql.Sensitive(definition.DisplayField))return null;
        var rows=new List<ErpChoice>();var count=0;
        while(await data.ReadAsync(token))
        {
            if(++count>LookupMaximum)return null;
            var fields=new Dictionary<string,object?>(StringComparer.Ordinal);
            for(var i=0;i<data.FieldCount;i++)if(!ErpLookupSql.Sensitive(data.GetName(i)))
                if(!fields.TryAdd(data.GetName(i),ErpLookupSql.Scalar(data,i)))return null;
            var id=Convert.ToString(ErpLookupSql.Scalar(data,ids[0]),CultureInfo.InvariantCulture);
            var label=Convert.ToString(ErpLookupSql.Scalar(data,labels[0]),CultureInfo.InvariantCulture);
            if(id is null||!ErpInputRules.Text(id,false))continue;
            if(selectedKey is not null&&id!=selectedKey)continue;
            var transferBranch=plan.Module=="internal-transfer-requests"&&definition.Field is "FromBranchID" or "ToBranchID";
            if(!transferBranch&&fields.TryGetValue("BranchID",out var rowBranch)&&rowBranch is string b&&b.Length>0&&b!=branch)continue;
            if(!transferBranch&&definition.ValueField=="BranchID"&&identity.BranchIds?.Contains(id,StringComparer.Ordinal)!=true)continue;
            if(search is not null&&!id.Contains(search,StringComparison.OrdinalIgnoreCase)&&label?.Contains(search,StringComparison.OrdinalIgnoreCase)!=true)continue;
            rows.Add(new(id,label,new ReadOnlyDictionary<string,object?>(fields)));
        }
        if(await data.NextResultAsync(token))return null;
        return OrderChoices(rows);
    }
    internal static IReadOnlyList<ErpChoice> OrderChoices(IEnumerable<ErpChoice> rows)=>rows.OrderBy(row=>row.Id,StringComparer.Ordinal)
        .ThenBy(row=>row.Label,StringComparer.Ordinal).ThenBy(row=>ErpInputRules.Fingerprint(row.Fields),StringComparer.Ordinal).ToArray();
    public Task<ErpReadResult<ErpDraftSelection>> SelectionAsync(string module,ErpSelectionRequest request,CancellationToken token)
    {
        if(request?.SelectedKeys is not {Count:>0 and <=ErpInputRules.MaximumLines})return Invalid<ErpDraftSelection>();
        var keys=request.SelectedKeys.ToArray();
        if(keys.Distinct(StringComparer.Ordinal).Count()!=keys.Length||keys.Any(key=>!ErpInputRules.Identifier(key,100)))return Invalid<ErpDraftSelection>();
        var lookup=(module,request.SourceId) switch
        {
            ("sales-orders","contract-items")=>"lines.ItemID",
            ("purchase-requests" or "internal-transfer-requests","items")=>"lines.ItemID",
            ("machine-movements" or "machine-repairs","machines")=>"lines.AssetID",_=>null
        };
        var query=new ErpLookupQuery(request.BranchId,lookup??"",Context:request.Context);
        if(!LookupInput(module,query,out var definition,out var arguments,out var values,out _))return Invalid<ErpDraftSelection>();
        return reader.Run<ErpDraftSelection>(module,request.BranchId,async(transaction,identity,plan,rights)=>
        {
            if(!rights.Add&&!rights.Update)return new(ErpReadOutcome.Denied);
            var choices=await Choices(transaction,identity,plan,definition!,arguments,values,request.BranchId,null,token);
            if(choices is null)return new(ErpReadOutcome.Unavailable,Code:"erp_lookup_binding_or_capacity_changed");
            var found=new List<ErpNewLine>();
            foreach(var key in keys)
            {
                var matches=choices.Where(choice=>choice.Id==key).Take(2).ToArray();
                if(matches.Length!=1)return new(ErpReadOutcome.NotFound,Code:"selection_missing_or_ambiguous");
                var choice=matches[0];var row=new Dictionary<string,object?>(StringComparer.Ordinal);
                foreach(var column in plan.Screen.Fields["lines"].Where(column=>column.Writable))
                    if(choice.Fields.TryGetValue(column.Column,out var value))row.Add(column.Name,value);
                row[module.StartsWith("machine-",StringComparison.Ordinal)?"assetId":"itemId"]=choice.Id;
                found.Add(new(Guid.NewGuid().ToString("N"),ErpInputRules.Serialize(row)));
            }
            return new(ErpReadOutcome.Success,new(found.AsReadOnly(),new Dictionary<string,object?>(),plan.Screen.Evidence,true));
        },token);
    }
}
