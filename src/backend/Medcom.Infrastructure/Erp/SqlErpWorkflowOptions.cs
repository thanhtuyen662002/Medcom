using System.Collections.ObjectModel;
using System.Data;
using Medcom.Application;
using Medcom.Contracts;
namespace Medcom.Infrastructure.Erp;

public sealed partial class SqlErpScreenService
{
    public Task<ErpReadResult<ErpChoicePage>> ActionOptionsAsync(string module,string action,ErpActionOptionsQuery query,CancellationToken token)
    {
        if(query is null||!ErpInputRules.Page(query.Page,query.PageSize)||query.Search?.Length>100||!ErpInputRules.Text(query.Search,false)
            ||query.Role is not ("primary" or "supporting")
            ||query.DocumentId is not null&&!ErpInputRules.Identifier(query.DocumentId,50)
            ||!(action=="return-step"&&module is "sales-order-sa" or "internal-transfer-sa" or "internal-transfer-accounting" or "internal-transfer-warehouse-out"
                    or "inbound-sa" or "inbound-tech" or "inbound-pm"
                ||action=="send-sa"&&module=="internal-transfer-tech"||action=="send-pm"&&module is "inbound-sa" or "inbound-tech"))return Invalid<ErpChoicePage>();
        return reader.Run<ErpChoicePage>(module,query.BranchId,async(transaction,actor,plan,rights)=>
        {
            if(!rights.Update)return new(ErpReadOutcome.Denied);
            var sql=action=="send-sa"?"SELECT UserName ChoiceId,HoTen ChoiceName FROM dbo.SY_User WITH(HOLDLOCK) WHERE Disable=0 AND UserGroupID=@group"
                :action=="send-pm"?"SELECT UserName ChoiceId,HoTen ChoiceName FROM dbo.SY_User WITH(HOLDLOCK) WHERE Disable=0 AND PM=1"
                :SqlErpScreenCommands.InboundReturnSteps(module)is {} steps?"SELECT CONVERT(varchar(12),StatusID) ChoiceId,StatusName ChoiceName FROM dbo.IV_InboundRequestStatusTbl WITH(HOLDLOCK) WHERE "+steps
                :module=="sales-order-sa"?"SELECT CONVERT(varchar(12),StatusID) ChoiceId,StatusName ChoiceName FROM dbo.AR_OrderStatusTbl WITH(HOLDLOCK) WHERE IsReject=1 AND StatusID<14"
                :"SELECT CONVERT(varchar(12),StatusID) ChoiceId,StatusName ChoiceName FROM dbo.IV_InternalTransferBatchStatusTbl WITH(HOLDLOCK) WHERE IsReject=1 AND IsActive=1 AND StatusID IN(10,21,41,61)";
            var text="SELECT ChoiceId,ChoiceName FROM ("+sql+") X WHERE (@search IS NULL OR ChoiceId LIKE @search ESCAPE N'~' OR ChoiceName LIKE @search ESCAPE N'~') ORDER BY ChoiceId COLLATE Latin1_General_100_BIN2 OFFSET @offset ROWS FETCH NEXT @take ROWS ONLY;";
            await using var command=ErpSqlPlan.Command(transaction,text);
            var primary=query.BranchId=="MB"?"TPAdminHN":"TPAdminHCM";
            ErpSqlPlan.Parameter(command,"@group",DbType.AnsiString,query.Role=="primary"?primary:primary=="TPAdminHN"?"TPAdminHCM":"TPAdminHN",50);
            var search=query.Search is null?null:"%"+query.Search.Replace("~","~~",StringComparison.Ordinal).Replace("%","~%",StringComparison.Ordinal)
                .Replace("_","~_",StringComparison.Ordinal).Replace("[","~[",StringComparison.Ordinal)+"%";
            ErpSqlPlan.Parameter(command,"@search",DbType.String,search,404);ErpSqlPlan.Parameter(command,"@document",DbType.AnsiString,query.DocumentId,50);ErpSqlPlan.Parameter(command,"@offset",DbType.Int32,(query.Page-1)*query.PageSize);
            ErpSqlPlan.Parameter(command,"@take",DbType.Int32,query.PageSize+1);
            await using var data=await command.ExecuteReaderAsync(token);var items=new List<ErpChoice>();var seen=new HashSet<string>(StringComparer.Ordinal);
            while(await data.ReadAsync(token))
            {
                if(items.Count>query.PageSize||data.IsDBNull(0)||!seen.Add(data.GetString(0)))throw new InvalidOperationException("Action choices changed.");
                var id=data.GetString(0);var name=data.IsDBNull(1)?null:data.GetString(1);
                items.Add(new(id,name,new ReadOnlyDictionary<string,object?>(new Dictionary<string,object?>{{"id",id},{"name",name}})));
            }
            if(await data.NextResultAsync(token))return new(ErpReadOutcome.Unavailable);
            return new(ErpReadOutcome.Success,new(items.Take(query.PageSize).ToArray(),query.Page,query.PageSize,items.Count>query.PageSize,[]));
        },token);
    }
}
