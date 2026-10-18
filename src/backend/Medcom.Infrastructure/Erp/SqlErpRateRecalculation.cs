using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using Medcom.Application;
using Medcom.Contracts;
namespace Medcom.Infrastructure.Erp;

public sealed partial class SqlErpScreenCommands
{
    internal static async Task RevalueUnchangedLines(DbTransaction transaction,ErpSqlPlan plan,
        ErpFrozenCommand request,string document,ErpReadSnapshot? before,Dictionary<string,JsonElement> header,
        IReadOnlyDictionary<string,IReadOnlyDictionary<string,object?>> remaining,CancellationToken token)
    {
        if(before is null||plan.Module is not ("purchase-orders" or "inbound-requests")
            ||JsonElement.DeepEquals(ErpInputRules.Serialize(before.Header.GetValueOrDefault("rateExchange")),header["rateExchange"]))return;
        var touched=request.Changes.Where(c=>c.LineId is not null).Select(c=>c.LineId!).ToHashSet(StringComparer.Ordinal);
        var lines=before.Lines.Where(line=>remaining.ContainsKey(line.LineId)&&!touched.Contains(line.LineId)).ToArray();
        if(lines.Length==0)return;
        Require(lines.Length<=ErpInputRules.MaximumLines,ErpCommandOutcome.InvalidInput,"document_line_count");
        var field=plan.Screen.Fields["lines"].Single(f=>f.Name=="amount");
        await using var command=ErpSqlPlan.Command(transaction,"");var tuples=new List<string>();
        for(var i=0;i<lines.Length;i++)
        {
            Require(ErpCalculationRules.RateAmount(plan.Module,lines[i].Fields,header["rateExchange"],out var amount),
                ErpCommandOutcome.InvalidInput,"calculated_value_out_of_range");
            var suffix=i.ToString(CultureInfo.InvariantCulture);tuples.Add("(@line"+suffix+",@amount"+suffix+")");
            ErpSqlPlan.Parameter(command,"@line"+suffix,DbType.AnsiString,lines[i].LineId,50);
            AddCell(command,"@amount"+suffix,field,amount is null?null:decimal.Parse(amount,CultureInfo.InvariantCulture));
        }
        command.CommandText=$"UPDATE D SET [Amount]=V.Amount FROM dbo.[{plan.LineTable}] D JOIN (VALUES {string.Join(',',tuples)}) V(LineId,Amount) ON D.UserAutoID=V.LineId AND {ErpSqlPlan.Exact("D.UserAutoID","V.LineId")} WHERE D.[{plan.HeaderKey}]=@document AND {ErpSqlPlan.Exact("D.["+plan.HeaderKey+"]","@document")};";
        ErpSqlPlan.Parameter(command,"@document",DbType.String,document,50);
        Require(await command.ExecuteNonQueryAsync(token)==lines.Length,ErpCommandOutcome.Conflict,"line_state_changed");
    }
}
