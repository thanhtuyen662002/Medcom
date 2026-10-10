using System.Collections.ObjectModel;
using System.Data;
using Medcom.Application;
using Medcom.Contracts;
namespace Medcom.Infrastructure.Erp;
public sealed partial class SqlErpScreenService
{
    public Task<ErpReadResult<ErpContractInfo>> ContractAsync(string module,string branch,string document,CancellationToken token)
    {
        if(module is not ("sales-orders" or "sales-qr")||!ErpInputRules.Identifier(document,50))return Invalid<ErpContractInfo>();
        return reader.Run<ErpContractInfo>(module,branch,async(transaction,identity,plan,rights)=>
        {
            var header=await SqlErpScreenReader.Header(transaction,identity,plan,branch,document,token);
            if(header?.GetValueOrDefault("contractId")is not string contract||contract=="")return new(ErpReadOutcome.NotFound);
            await using var command=ErpSqlPlan.Command(transaction,"SELECT TOP(2) C.* FROM dbo.CF_ContractTbl C WITH(HOLDLOCK) WHERE C.ContractID=@contract AND "+ErpSqlPlan.Exact("C.ContractID","@contract")+" AND C.BranchID=@branch;");
            ErpSqlPlan.Parameter(command,"@contract",DbType.String,contract,500);ErpSqlPlan.Parameter(command,"@branch",DbType.AnsiString,branch,50);
            await using var data=await command.ExecuteReaderAsync(token);
            if(!await data.ReadAsync(token))return new(ErpReadOutcome.NotFound);
            var fields=new Dictionary<string,object?>(StringComparer.Ordinal);
            for(var i=0;i<data.FieldCount;i++)if(!ErpLookupSql.Sensitive(data.GetName(i)))
                if(!fields.TryAdd(data.GetName(i),ErpLookupSql.Scalar(data,i)))return new(ErpReadOutcome.Unavailable);
            if(await data.ReadAsync(token)||await data.NextResultAsync(token))return new(ErpReadOutcome.Unavailable);
            return new(ErpReadOutcome.Success,new(document,contract,new ReadOnlyDictionary<string,object?>(fields)));
        },token);
    }
}
