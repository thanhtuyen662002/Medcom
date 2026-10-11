using System.Data;
using System.Globalization;
using Medcom.Application;
using Medcom.Contracts;
namespace Medcom.Infrastructure.Erp;

public sealed partial class SqlErpScreenService
{
    public Task<ErpReadResult<ErpItemPrice>> ItemPriceAsync(ErpItemPriceQuery query,CancellationToken token)
    {
        if(query is null||!ErpInputRules.AnsiIdentifier(query.ObjectId,50)||!ErpInputRules.AnsiIdentifier(query.ItemId,50)
            ||query.CurrencyId is not null&&!ErpInputRules.AnsiIdentifier(query.CurrencyId,5)
            ||!DateTime.TryParseExact(query.DocumentDate,"yyyy-MM-dd'T'HH:mm:ss.fff",CultureInfo.InvariantCulture,DateTimeStyles.None,out var date))
            return Invalid<ErpItemPrice>();
        return reader.Run<ErpItemPrice>("purchase-orders",query.BranchId,async(transaction,actor,plan,rights)=>
        {
            if(!rights.Add&&!rights.Update)return new(ErpReadOutcome.Denied);
            // The native ItemID change action is a read-only three-parameter procedure.
            await using var command=ErpSqlPlan.Command(transaction,"EXEC dbo.AP_OrderGetItemPriceStp @object,@date,@item;");
            ErpSqlPlan.Parameter(command,"@object",DbType.AnsiString,query.ObjectId,50);
            ErpSqlPlan.Parameter(command,"@date",DbType.DateTime,date);ErpSqlPlan.Parameter(command,"@item",DbType.AnsiString,query.ItemId,50);
            await using var data=await command.ExecuteReaderAsync(token);
            if(data.FieldCount!=1||data.GetName(0)!="UnitPrice"||!await data.ReadAsync(token))return new(ErpReadOutcome.Unavailable);
            var price=data.IsDBNull(0)?null:data.GetDecimal(0).ToString(CultureInfo.InvariantCulture);
            if(await data.ReadAsync(token)||await data.NextResultAsync(token))return new(ErpReadOutcome.Unavailable);
            return new(ErpReadOutcome.Success,new(query.ItemId,price,query.CurrencyId));
        },token);
    }
}
