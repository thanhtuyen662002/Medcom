using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using Medcom.Application;
using Medcom.Application.WarehouseQr;
using Medcom.Contracts;
namespace Medcom.Infrastructure.Erp;

public sealed partial class SqlErpScreenCommands
{
    private static async Task<IReadOnlyList<ErpAllocatedLine>> Apply(DbTransaction transaction,AuthoritativeIdentity identity,
        ErpSqlPlan plan,ErpFrozenCommand request,string document,ErpReadSnapshot? before,CancellationToken token)
    {
        await VerifyNativeMetadata(transaction,token);
        await VerifyScreenConfiguration(transaction,plan,token);
        if(before is not null)await PhysicalKeys(transaction,plan,document,before.Lines.Count,token);
        var allocated=new List<ErpAllocatedLine>();
        if(request.Operation=="delete")
        {
            await DomainDeleteGuard(transaction,plan,document,token);
            await DeleteRows(transaction,plan.LineTable,plan.HeaderKey,document,null,before!.Lines.Count,token);
            // Native history is retained as evidence; a native FK/trigger can reject document deletion.
            await DeleteRows(transaction,plan.HeaderTable,plan.HeaderKey,document,null,1,token);
        }
        else if(request.Operation is "create" or "save")
        {
            var header=Map(request.Header!.Value);
            await References(transaction,identity,plan,"header",header,header,request.BranchId,token);
            if(plan.Module=="internal-transfer-requests")
                Require(header["fromBranchId"].GetString()!=header["toBranchId"].GetString(),ErpCommandOutcome.InvalidInput,"transfer_branches_equal");
            await HeaderWrite(transaction,identity,plan,header,document,request.BranchId,request.Operation=="create",token);
            var remaining=before?.Lines.ToDictionary(line=>line.LineId,line=>line.Fields,StringComparer.Ordinal)
                ??new Dictionary<string,IReadOnlyDictionary<string,object?>>(StringComparer.Ordinal);
            foreach(var change in request.Changes)
            {
                if(change.Kind!=ErpLineChangeKind.Add)
                    Require(remaining.ContainsKey(change.LineId!),ErpCommandOutcome.Conflict,"line_state_changed");
                var line=change.LineId??Guid.NewGuid().ToString("D");
                if(change.Kind==ErpLineChangeKind.Remove)
                {
                    await DomainLineGuard(transaction,plan,document,line,token);
                    await DeleteRows(transaction,plan.LineTable,plan.HeaderKey,document,line,1,token);remaining.Remove(line);continue;
                }
                var fields=Map(change.Values!.Value);
                var source=await References(transaction,identity,plan,"lines",fields,header,request.BranchId,token);
                if(plan.Module is "machine-movements" or "machine-repairs")
                {
                    await MachineBranch(transaction,fields["assetId"].GetString()!,request.BranchId,token);
                    if(change.Kind==ErpLineChangeKind.Update)await DomainLineGuard(transaction,plan,document,line,token);
                }
                Calculate(plan,fields,source,change.Kind==ErpLineChangeKind.Add?null:remaining[line]);
                await RowWrite(transaction,plan,fields,document,line,change.Kind==ErpLineChangeKind.Add,token);
                if(change.Kind==ErpLineChangeKind.Add)allocated.Add(new(change.ClientLineKey!,line));
                remaining[line]=fields.ToDictionary(pair=>pair.Key,pair=>(object?)pair.Value,StringComparer.Ordinal);
            }
            Require(remaining.Count is >0 and <=ErpInputRules.MaximumLines,ErpCommandOutcome.InvalidInput,"document_line_count");
            if(plan.Module=="sales-orders")await SalesAfterSave(transaction,document,token);
        }
        else if(plan.Module=="purchase-requests")
        {
            if(request.Operation=="submit")await PurchaseSubmit(transaction,plan,document,token);
            else if(request.Operation=="send-purchase-order")await PurchaseOrder(transaction,plan,before!,document,token);
            else throw new Stop(ErpCommandOutcome.InvalidInput,"invalid_action");
        }
        else if(plan.Module=="sales-orders")
        {
            if(request.Operation=="recall")await Procedure(transaction,"AR_Order_SalesRecallFromPMStp",
                [("@DocumentID",DbType.AnsiString,document,50),("@User",DbType.String,identity.PrincipalId,50)],token);
            else
            {
                var payload=request.Payload;var pm=payload.GetProperty("pmId").GetString()!;
                await Pm(transaction,pm,null,token);
                await Procedure(transaction,"AR_OrderTbl_UpdateStatusStp",[("@DocumentID",DbType.AnsiString,document,50),
                    ("@User",DbType.String,identity.PrincipalId,4000),("@StatusID",DbType.Int32,12,0),
                    ("@Notes",DbType.String,Text(payload,"notes"),-1),("@SendTo",DbType.String,pm,-1)],token);
                await using var send=ErpSqlPlan.Command(transaction,"UPDATE dbo.AR_OrderTbl SET SendTo=@pm,UserUpdate=@actor,DateUpdate=GETDATE() WHERE DocumentID=@document;");
                ErpSqlPlan.Parameter(send,"@pm",DbType.String,pm,-1);ErpSqlPlan.Parameter(send,"@actor",DbType.AnsiString,identity.PrincipalId,100);
                ErpSqlPlan.Parameter(send,"@document",DbType.AnsiString,document,50);await One(send,token);
            }
        }
        else if(plan.Module=="internal-transfer-requests")
        {
            if(request.Operation=="recall")await Procedure(transaction,"IV_InternalTransfer_RequestRecallFromPMStp",
                [("@DocumentID",DbType.AnsiString,document,50),("@User",DbType.AnsiString,identity.PrincipalId,100)],token);
            else
            {
                var payload=request.Payload;var primary=payload.GetProperty("primaryPmId").GetString()!;
                var support=payload.GetProperty("supportingPmId").GetString()!;
                await Pm(transaction,primary,request.BranchId,token);if(support!="")await Pm(transaction,support,null,token);
                await Procedure(transaction,"IV_InternalTransfer_RequestSendPMStp",[("@DocumentID",DbType.AnsiString,document,30),
                    ("@User",DbType.AnsiString,identity.PrincipalId,100),("@AssignedPM1",DbType.AnsiString,primary,100),
                    ("@AssignedPM2",DbType.AnsiString,support==""?null:support,100),("@Notes",DbType.String,Text(payload,"notes"),-1)],token);
            }
        }
        else if(plan.Module is "warehouse-qr" or "sales-qr")
        {
            Require(WarehouseQrParser.ValidateAsciiNoTruncation(request.Barcode).Issues.Count==0,ErpCommandOutcome.InvalidInput,"qr_profile_rejected");
            await Procedure(transaction,"CF_QRcodeStp",[("@Barcode",DbType.AnsiString,request.Barcode,250),
                ("@DocumentID",DbType.AnsiString,document,50),("@Target",DbType.String,plan.Module=="warehouse-qr"?"IV_OUTPUT":"AR_INVOICE",100),
                ("@Action",DbType.String,request.Operation=="scan-add"?"ADD":"DELETE",50)],token);
        }
        else throw new Stop(ErpCommandOutcome.InvalidInput,"invalid_action");
        if(request.Operation is "submit" or "send-purchase-order" or "send-pm" or "recall")
        {
            var expected=(plan.Module,request.Operation) switch
            {("purchase-requests","submit")=>2,("purchase-requests","send-purchase-order")=>5,
                ("sales-orders","send-pm")=>12,("sales-orders","recall")=>11,
                ("internal-transfer-requests","send-pm")=>10,("internal-transfer-requests","recall")=>0,_=>int.MinValue};
            await using var status=ErpSqlPlan.Command(transaction,$"SELECT StatusID FROM dbo.[{plan.HeaderTable}] WITH(HOLDLOCK) WHERE [{plan.HeaderKey}]=@document;");
            ErpSqlPlan.Parameter(status,"@document",DbType.String,document,50);
            Require(await status.ExecuteScalarAsync(token)is int value&&value==expected,ErpCommandOutcome.Unavailable,"native_action_postcondition");
        }
        return allocated.AsReadOnly();
    }
    private static Dictionary<string,JsonElement> Map(JsonElement value)=>value.EnumerateObject().ToDictionary(p=>p.Name,p=>p.Value.Clone(),StringComparer.Ordinal);
    private static string? Text(JsonElement value,string key)=>value.TryGetProperty(key,out var text)&&text.ValueKind!=JsonValueKind.Null?text.GetString():null;
    private static async Task<IReadOnlyDictionary<string,object?>> References(DbTransaction transaction,AuthoritativeIdentity identity,
        ErpSqlPlan plan,string section,Dictionary<string,JsonElement> row,Dictionary<string,JsonElement> header,string branch,CancellationToken token)
    {
        var projected=new Dictionary<string,object?>(StringComparer.Ordinal);
        foreach(var column in plan.Screen.Fields[section].Where(c=>c.Writable&&c.Column.EndsWith("ID",StringComparison.Ordinal)))
        {
            if(!row.TryGetValue(column.Name,out var value)||value.ValueKind==JsonValueKind.Null||value.ValueKind==JsonValueKind.String&&value.GetString()=="")continue;
            var definition=plan.Screen.Lookups.SingleOrDefault(l=>l.Id==section+"."+column.Column&&!l.Disabled);
            if(definition is null)continue;
            var args=(definition.Parameters??"").Split(';',StringSplitOptions.RemoveEmptyEntries);
            var vals=args.Select(arg=>header.GetValueOrDefault(NativeJsonName(arg)).ValueKind==JsonValueKind.String
                ?header[NativeJsonName(arg)].GetString()??"":row.GetValueOrDefault(NativeJsonName(arg)).ValueKind==JsonValueKind.String
                    ?row[NativeJsonName(arg)].GetString()??"":"").ToArray();
            var key=value.ValueKind==JsonValueKind.String?value.GetString():value.GetRawText();
            var choices=await SqlErpScreenService.Choices(transaction,identity,plan,definition,args,vals,branch,null,token,key);
            Require(choices is not null,ErpCommandOutcome.QualificationRequired,"reference_binding_unavailable");
            var matches=choices!.Where(choice=>choice.Id==key).Take(2).ToArray();
            Require(matches.Length==1,ErpCommandOutcome.InvalidInput,"reference_missing_or_ambiguous");
            if(column.Column is "ItemID" or "AssetID")foreach(var pair in matches[0].Fields)projected[pair.Key]=pair.Value;
        }
        return projected;
    }
    private static string NativeJsonName(string native)
    {var name=native.Replace("ID","Id",StringComparison.Ordinal).Replace("QR","Qr",StringComparison.Ordinal);return char.ToLowerInvariant(name[0])+name[1..];}
    private static void Calculate(ErpSqlPlan plan,Dictionary<string,JsonElement> row,IReadOnlyDictionary<string,object?> source,
        IReadOnlyDictionary<string,object?>? existing)
    {
        JsonElement Element(object? value)=>ErpInputRules.Serialize(value);
        void Set(string name,object? value)
        {
            var field=plan.Screen.Fields["lines"].Single(column=>column.Name==name);
            if(value is not null&&field.SqlType is "decimal" or "numeric" or "money" or "smallmoney")
                value=Convert.ToDecimal(value,CultureInfo.InvariantCulture).ToString(CultureInfo.InvariantCulture);
            else if(value is not null&&field.SqlType=="float")value=Convert.ToDouble(value,CultureInfo.InvariantCulture);
            row[name]=Element(value);
        }
        decimal? Number(string name)=>row.TryGetValue(name,out var value)&&value.ValueKind!=JsonValueKind.Null
            ?decimal.Parse(value.GetString()!,CultureInfo.InvariantCulture):null;
        void Decimal(string name,decimal? value)
        {
            var field=plan.Screen.Fields["lines"].Single(c=>c.Name==name);var json=Element(value?.ToString(CultureInfo.InvariantCulture));
            Require(ErpInputRules.Value(field,json),ErpCommandOutcome.InvalidInput,"calculated_value_requires_rounding");row[name]=json;
        }
        if(plan.Module=="purchase-requests")Decimal("totalPrice",Number("quantity")*Number("unitPrice"));
        if(plan.Module=="sales-orders")
        {
            foreach(var native in new[]{"UnitFactor","Unit2","SoLuongHopDong","DeliveryQuantity"})
            {
                var name=NativeJsonName(native);var value=source.GetValueOrDefault(native);
                if(value is not null)Set(name,value);else if(existing?.TryGetValue(name,out value)==true)Set(name,value);else Set(name,null);
            }
            var amount=Number("quantity")*Number("unitPrice");var vat=amount*Number("vATPercent")/100m;
            Decimal("amount",amount);Decimal("vATAmount",vat);Decimal("totalAmount",amount+vat);
            decimal? factor=row["unitFactor"].ValueKind==JsonValueKind.Null?null:
                row["unitFactor"].ValueKind==JsonValueKind.Number?checked((decimal)row["unitFactor"].GetDouble()):decimal.Parse(row["unitFactor"].GetString()!,CultureInfo.InvariantCulture);
            Decimal("quantity2",Number("quantity")*factor);
            var contractQty=row["soLuongHopDong"].ValueKind==JsonValueKind.Null?0m:decimal.Parse(row["soLuongHopDong"].GetString()!,CultureInfo.InvariantCulture);
            var delivered=row["deliveryQuantity"].ValueKind==JsonValueKind.Null?0m:decimal.Parse(row["deliveryQuantity"].GetString()!,CultureInfo.InvariantCulture);
            Require(contractQty<=0||(Number("quantity")??0)<=contractQty-delivered,ErpCommandOutcome.Conflict,"order_quantity_exceeds_contract");
            // Disabled native discount expressions do not establish a calculation. Preserve existing server values.
        }
        // Repair Amount/PartsAmount are native-maintained: existing values are preserved;
        // creation leaves nullable values null until qualified service/part processing supplies them.
        foreach(var pair in row)
        {var field=plan.Screen.Fields["lines"].Single(c=>c.Name==pair.Key);Require(ErpInputRules.Value(field,pair.Value),ErpCommandOutcome.InvalidInput,"invalid_calculation_or_reference_type");}
    }
    private static async Task HeaderWrite(DbTransaction transaction,AuthoritativeIdentity actor,ErpSqlPlan plan,Dictionary<string,JsonElement> row,
        string document,string branch,bool create,CancellationToken token)
    {
        var values=new Dictionary<string,object?>(StringComparer.Ordinal);
        foreach(var column in plan.Screen.Fields["header"].Where(c=>c.Writable))values[column.Column]=Cell(column,row[column.Name]);
        if(create)
        {
            values[plan.HeaderKey]=document;
            if(plan.Screen.Fields["header"].Any(c=>c.Column=="BranchID"))values["BranchID"]=branch;
            if(plan.Screen.Fields["header"].Any(c=>c.Column=="StatusID"))values["StatusID"]=plan.Module switch{"purchase-requests"=>1,"sales-orders"=>-1,_=>0};
            values["isLock"]=false;
            if(plan.Module=="internal-transfer-requests")values["SalesUser"]=actor.PrincipalId;
        }
        foreach(var name in new[]{"UserCreate","UserUpdate","DateCreate","DateUpdate"})
            if(plan.Screen.Fields["header"].Any(c=>c.Column==name)&&(create||name is "UserUpdate" or "DateUpdate"))
                values[name]=name.StartsWith("User",StringComparison.Ordinal)?actor.PrincipalId:null;
        await Write(transaction,plan.HeaderTable,plan.HeaderKey,document,null,values,plan.Screen.Fields["header"],create,token);
    }
    private static async Task RowWrite(DbTransaction transaction,ErpSqlPlan plan,Dictionary<string,JsonElement> row,string document,string line,bool create,CancellationToken token)
    {
        var fields=plan.Screen.Fields["lines"];var values=row.ToDictionary(pair=>fields.Single(c=>c.Name==pair.Key).Column,pair=>Cell(fields.Single(c=>c.Name==pair.Key),pair.Value),StringComparer.Ordinal);
        if(create){values[plan.HeaderKey]=document;values["UserAutoID"]=line;}
        await Write(transaction,plan.LineTable,plan.HeaderKey,document,line,values,fields,create,token);
    }
    private static object? Cell(ErpFieldDefinition field,JsonElement value)=>value.ValueKind==JsonValueKind.Null?null:field.SqlType switch
    {"nvarchar" or "varchar" or "char" or "nchar"=>value.GetString(),"datetime" or "datetime2" or "date"=>DateTime.Parse(value.GetString()!,CultureInfo.InvariantCulture),
     "decimal" or "numeric" or "money" or "smallmoney"=>decimal.Parse(value.GetString()!,CultureInfo.InvariantCulture),"bit"=>value.GetBoolean(),
     "int"=>value.GetInt32(),"bigint"=>value.GetInt64(),"smallint"=>value.GetInt16(),"tinyint"=>value.GetByte(),"float"=>value.GetDouble(),"real"=>value.GetSingle(),_=>throw new InvalidOperationException()};
    private static async Task Write(DbTransaction transaction,string table,string key,string document,string? line,Dictionary<string,object?> values,
        IReadOnlyList<ErpFieldDefinition> fields,bool insert,CancellationToken token)
    {
        // Table/columns originate in fixed server plans after fixed typed DTO decoding, never in HTTP SQL.
        await using var command=ErpSqlPlan.Command(transaction,"");var expressions=new List<(string Column,string Value)>();
        foreach(var entry in values)
        {
            var column=fields.Single(c=>c.Column==entry.Key);var parameter="@value"+expressions.Count.ToString(CultureInfo.InvariantCulture);
            if(entry.Key is "DateCreate" or "DateUpdate"){expressions.Add((entry.Key,"GETDATE()"));continue;}
            AddCell(command,parameter,column,entry.Value);expressions.Add((entry.Key,parameter));
        }
        command.CommandText=insert?$"INSERT dbo.[{table}]({string.Join(',',expressions.Select(e=>"["+e.Column+"]"))}) VALUES({string.Join(',',expressions.Select(e=>e.Value))});"
            :$"UPDATE dbo.[{table}] SET {string.Join(',',expressions.Select(e=>"["+e.Column+"]="+e.Value))} WHERE [{key}]=@document AND {ErpSqlPlan.Exact("["+key+"]","@document")}"+
                (line is null?"":$" AND UserAutoID=@line AND {ErpSqlPlan.Exact("UserAutoID","@line")}")+";";
        if(!insert){ErpSqlPlan.Parameter(command,"@document",DbType.String,document,50);if(line is not null)ErpSqlPlan.Parameter(command,"@line",DbType.String,line,50);}
        await One(command,token);
    }
    private static void AddCell(DbCommand command,string name,ErpFieldDefinition field,object? value)
    {
        var type=field.SqlType switch{"nvarchar" or "nchar"=>DbType.String,"varchar" or "char"=>DbType.AnsiString,
            "datetime"=>DbType.DateTime,"datetime2"=>DbType.DateTime2,"date"=>DbType.Date,"bit"=>DbType.Boolean,
            "int"=>DbType.Int32,"bigint"=>DbType.Int64,"smallint"=>DbType.Int16,"tinyint"=>DbType.Byte,"float"=>DbType.Double,"real"=>DbType.Single,_=>DbType.Decimal};
        var args=field.TypeArguments?.Trim('(',')').Split(',');
        ErpSqlPlan.Parameter(command,name,type,value,type is DbType.String or DbType.AnsiString?(args is["max"]?-1:int.Parse(args![0],CultureInfo.InvariantCulture)):0);
        if(type==DbType.Decimal)
        {var parameter=(DbParameter)command.Parameters[^1];parameter.Precision=(byte)(field.SqlType is "money" or "smallmoney"?19:int.Parse(args![0],CultureInfo.InvariantCulture));
         parameter.Scale=(byte)(field.SqlType is "money" or "smallmoney"?4:int.Parse(args![1],CultureInfo.InvariantCulture));}
    }
    private static async Task One(DbCommand command,CancellationToken token)
    {Require(await command.ExecuteNonQueryAsync(token)==1,ErpCommandOutcome.Unavailable,"unexpected_affected_rows");}
    private static async Task DeleteRows(DbTransaction transaction,string table,string key,string document,string? line,int expected,CancellationToken token)
    {
        await using var command=ErpSqlPlan.Command(transaction,$"DELETE dbo.[{table}] WHERE [{key}]=@document AND {ErpSqlPlan.Exact("["+key+"]","@document")}"+
            (line is null?"":$" AND UserAutoID=@line AND {ErpSqlPlan.Exact("UserAutoID","@line")}")+";");
        ErpSqlPlan.Parameter(command,"@document",DbType.String,document,50);if(line is not null)ErpSqlPlan.Parameter(command,"@line",DbType.String,line,50);
        Require(await command.ExecuteNonQueryAsync(token)==expected,ErpCommandOutcome.Conflict,"delete_affected_rows_changed");
    }
    private static async Task PhysicalKeys(DbTransaction transaction,ErpSqlPlan plan,string document,int lines,CancellationToken token)
    {
        await using var command=ErpSqlPlan.Command(transaction,$"SELECT (SELECT COUNT_BIG(*) FROM dbo.[{plan.HeaderTable}] WITH(UPDLOCK,HOLDLOCK) WHERE [{plan.HeaderKey}]=@document),(SELECT COUNT_BIG(*) FROM dbo.[{plan.LineTable}] WITH(UPDLOCK,HOLDLOCK) WHERE [{plan.HeaderKey}]=@document);");
        ErpSqlPlan.Parameter(command,"@document",DbType.String,document,50);await using var reader=await command.ExecuteReaderAsync(token);
        Require(await reader.ReadAsync(token)&&reader.GetInt64(0)==1&&reader.GetInt64(1)==lines&&!await reader.ReadAsync(token)&&!await reader.NextResultAsync(token),ErpCommandOutcome.Conflict,"physical_key_alias_or_line_count_changed");
    }
    private static async Task MachineBranch(DbTransaction transaction,string asset,string branch,CancellationToken token)
    {
        await using var command=ErpSqlPlan.Command(transaction,$"SELECT COUNT_BIG(*) FROM dbo.FA_AssetTbl WITH(UPDLOCK,HOLDLOCK) WHERE AssetID=@asset AND {ErpSqlPlan.Exact("AssetID","@asset")} AND BranchID=@branch;");
        ErpSqlPlan.Parameter(command,"@asset",DbType.AnsiString,asset,50);ErpSqlPlan.Parameter(command,"@branch",DbType.AnsiString,branch,50);
        Require(await command.ExecuteScalarAsync(token)is long count&&count==1,ErpCommandOutcome.Denied,"machine_branch_denied");
    }
    private static async Task DomainDeleteGuard(DbTransaction transaction,ErpSqlPlan plan,string document,CancellationToken token)
    {
        if(plan.Module!="machine-repairs")return;
        await using var command=ErpSqlPlan.Command(transaction,"SELECT COUNT_BIG(*) FROM (SELECT ServiceDocumentID FROM dbo.FA_PartReplacementTbl WITH(UPDLOCK,HOLDLOCK) WHERE IsActive=1 AND ServiceDocumentID=@document UNION ALL SELECT RepairDocumentID FROM dbo.FA_PartServiceLinkTbl WITH(UPDLOCK,HOLDLOCK) WHERE IsActive=1 AND RepairDocumentID=@document) R;");
        ErpSqlPlan.Parameter(command,"@document",DbType.String,document,50);
        Require(await command.ExecuteScalarAsync(token)is long n&&n==0,ErpCommandOutcome.Conflict,"repair_has_active_part_references");
    }
    private static async Task DomainLineGuard(DbTransaction transaction,ErpSqlPlan plan,string document,string line,CancellationToken token)
    {
        if(plan.Module!="machine-repairs")return;
        await using var command=ErpSqlPlan.Command(transaction,"SELECT COUNT_BIG(*) FROM dbo.FA_PartServiceLinkTbl WITH(UPDLOCK,HOLDLOCK) WHERE IsActive=1 AND RepairDocumentID=@document AND RepairDetailID=@line;");
        ErpSqlPlan.Parameter(command,"@document",DbType.String,document,50);ErpSqlPlan.Parameter(command,"@line",DbType.String,line,50);
        Require(await command.ExecuteScalarAsync(token)is long n&&n==0,ErpCommandOutcome.Conflict,"repair_line_has_active_part_references");
    }
    private static async Task Pm(DbTransaction transaction,string pm,string? branch,CancellationToken token)
    {
        await using var command=ErpSqlPlan.Command(transaction,$"SELECT COUNT_BIG(*) FROM dbo.SY_User U WITH(UPDLOCK,HOLDLOCK) WHERE U.UserName=@pm AND {ErpSqlPlan.Exact("U.UserName","@pm")} AND U.Disable=0 AND U.PM=1 AND (@branch IS NULL OR U.BranchID=@branch OR EXISTS(SELECT 1 FROM dbo.SY_UserBranch B WITH(HOLDLOCK) WHERE B.UserName=U.UserName AND B.BranchID=@branch));");
        ErpSqlPlan.Parameter(command,"@pm",DbType.AnsiString,pm,100);ErpSqlPlan.Parameter(command,"@branch",DbType.AnsiString,branch,50);
        Require(await command.ExecuteScalarAsync(token)is long count&&count==1,ErpCommandOutcome.InvalidInput,"pm_assignment_invalid");
    }
    private static async Task Procedure(DbTransaction transaction,string name,(string Name,DbType Type,object? Value,int Size)[] parameters,CancellationToken token)
    {
        await using var command=ErpSqlPlan.Command(transaction,"EXEC dbo.["+name+"] "+string.Join(',',parameters.Select(p=>p.Name))+";");
        foreach(var p in parameters)ErpSqlPlan.Parameter(command,p.Name,p.Type,p.Value,p.Size);
        await using var reader=await command.ExecuteReaderAsync(token);var count=0;var success=false;
        do
        {
            var msg=Enumerable.Range(0,reader.FieldCount).SingleOrDefault(i=>reader.GetName(i)=="MsgType",-1);
            while(await reader.ReadAsync(token))
            {Require(++count<=1000,ErpCommandOutcome.Unavailable,"native_result_capacity");
             if(msg>=0){var result=Convert.ToInt32(reader.GetValue(msg),CultureInfo.InvariantCulture);Require(result!=1,ErpCommandOutcome.Conflict,"native_action_rejected");
                 Require(result==NativeSuccessCode(name),ErpCommandOutcome.Unavailable,"native_result_changed");success=true;}}
        }while(await reader.NextResultAsync(token));
        Require(success,ErpCommandOutcome.Unavailable,"native_success_not_observed");
    }
    internal static int NativeSuccessCode(string name)=>name=="CF_QRcodeStp"?0:3;
    internal static async Task VerifyNativeMetadata(DbTransaction transaction,CancellationToken token)
    {
        // Pin the finite observed static closure. Dynamic dependencies remain the external acceptance owner’s responsibility.
        await VerifyModuleHashes(transaction,token);
        foreach(var field in ErpScreenCatalog.SourceMetadata.GetProperty("defaultEvidence").EnumerateArray())
        {
            await using var command=ErpSqlPlan.Command(transaction,"SELECT CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),D.definition)),2) FROM sys.columns C JOIN sys.default_constraints D ON D.object_id=C.default_object_id WHERE C.object_id=OBJECT_ID(@table) AND C.name=@column;");
            ErpSqlPlan.Parameter(command,"@table",DbType.String,"dbo."+field.GetProperty("table").GetString(),255);ErpSqlPlan.Parameter(command,"@column",DbType.String,field.GetProperty("column").GetString(),255);
            Require((await command.ExecuteScalarAsync(token)as string)?.ToLowerInvariant()==field.GetProperty("sha256Utf16LE").GetString(),ErpCommandOutcome.QualificationRequired,"native_default_changed");
        }
    }
    internal static async Task VerifyModuleHashes(DbTransaction transaction,CancellationToken token)
    {
        var expected=ErpScreenCatalog.SourceMetadata.GetProperty("modules").EnumerateArray().ToDictionary(row=>row.GetProperty("name").GetString()!,
            row=>row.GetProperty("definitionSha256Utf16LE").GetString()!,StringComparer.Ordinal);
        await using var command=ErpSqlPlan.Command(transaction,"SELECT O.name,CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),M.definition)),2) FROM sys.objects O JOIN sys.sql_modules M ON M.object_id=O.object_id JOIN sys.schemas S ON S.schema_id=O.schema_id WHERE S.name='dbo' AND O.name IN("+
            string.Join(',',Enumerable.Range(0,expected.Count).Select(i=>"@module"+i.ToString(CultureInfo.InvariantCulture)))+");");
        var index=0;foreach(var name in expected.Keys)ErpSqlPlan.Parameter(command,"@module"+(index++).ToString(CultureInfo.InvariantCulture),DbType.String,name,255);
        await using var reader=await command.ExecuteReaderAsync(token);var seen=new HashSet<string>(StringComparer.Ordinal);
        while(await reader.ReadAsync(token))Require(!reader.IsDBNull(1)&&expected.TryGetValue(reader.GetString(0),out var hash)
            &&seen.Add(reader.GetString(0))&&hash==reader.GetString(1).ToLowerInvariant(),ErpCommandOutcome.QualificationRequired,"native_module_changed");
        Require(seen.Count==expected.Count&&!await reader.NextResultAsync(token),ErpCommandOutcome.QualificationRequired,"native_module_changed");
    }
    internal static async Task VerifyScreenConfiguration(DbTransaction transaction,ErpSqlPlan plan,CancellationToken token)
    {
        var screen=ErpScreenCatalog.SourceMetadata.GetProperty("screens").EnumerateArray().Single(s=>s.GetProperty("id").GetString()==plan.Module);
        var expected=screen.GetProperty("configuration").EnumerateArray().ToDictionary(row=>JsonSerializer.Serialize(new string?[]{row.GetProperty("key").GetString(),
            row.GetProperty("control").GetString(),row.GetProperty("property").GetString()}),StringComparer.Ordinal);
        await using var command=ErpSqlPlan.Command(transaction,"SELECT KeyID,SubID,SubValue,CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),COALESCE(KeyValue,N''))),2),CASE WHEN KeyValue IS NULL THEN 1 ELSE 0 END FROM dbo.SY_FrmCfg WITH(HOLDLOCK) WHERE FID=@form;");
        ErpSqlPlan.Parameter(command,"@form",DbType.String,plan.Screen.FormId,255);await using var reader=await command.ExecuteReaderAsync(token);var seen=new HashSet<string>(StringComparer.Ordinal);
        while(await reader.ReadAsync(token))
        {
            var address=JsonSerializer.Serialize(Enumerable.Range(0,3).Select(i=>reader.IsDBNull(i)?null:reader.GetString(i)).ToArray());
            Require(expected.TryGetValue(address,out var row)&&seen.Add(address)
                &&row.GetProperty("sha256Utf16LE").GetString()==reader.GetString(3).ToLowerInvariant()
                &&row.GetProperty("valueIsNull").GetBoolean()==(reader.GetInt32(4)==1),ErpCommandOutcome.QualificationRequired,"native_form_configuration_changed");
        }
        Require(seen.Count==expected.Count&&!await reader.NextResultAsync(token),ErpCommandOutcome.QualificationRequired,"native_form_configuration_changed");
    }
    private static async Task SalesAfterSave(DbTransaction transaction,string document,CancellationToken token)
    {
        // Scoped replacement for the native hook's observed unscoped first UPDATE.
        await using var command=ErpSqlPlan.Command(transaction,"UPDATE O SET AddressA=B.Address FROM dbo.AR_OrderTbl O LEFT JOIN dbo.CF_ContractTbl C ON C.ContractID=O.ContractID LEFT JOIN dbo.CF_ObjectTbl B ON B.ObjectID=C.ObjectID WHERE O.DocumentID=@document; UPDATE O SET BaseTotal=D.TotalAmount FROM dbo.AR_OrderTbl O JOIN (SELECT SUM(TotalAmount) TotalAmount FROM dbo.AR_OrderDetailTbl WHERE DocumentID=@document) D ON 1=1 WHERE O.DocumentID=@document;");
        ErpSqlPlan.Parameter(command,"@document",DbType.AnsiString,document,50);
        Require(await command.ExecuteNonQueryAsync(token)==2,ErpCommandOutcome.Unavailable,"sales_after_save_failed");
    }
    private static async Task PurchaseSubmit(DbTransaction transaction,ErpSqlPlan plan,string document,CancellationToken token)
    {
        await using var command=ErpSqlPlan.Command(transaction,"UPDATE dbo.AP_PurchaseRequestTbl SET StatusID=@status,isLock=@locked WHERE PurchaseRequestID=@document;");
        ErpSqlPlan.Parameter(command,"@status",DbType.Int32,2);ErpSqlPlan.Parameter(command,"@locked",DbType.Boolean,true);ErpSqlPlan.Parameter(command,"@document",DbType.String,document,50);await One(command,token);
    }
    private static async Task PurchaseOrder(DbTransaction transaction,ErpSqlPlan plan,ErpReadSnapshot before,string document,CancellationToken token)
    {
        Require(ErpInputRules.AnsiIdentifier(document,50)&&before.Header.GetValueOrDefault("purchaseDate")is string,ErpCommandOutcome.InvalidInput,"purchase_order_transport_invalid");
        var header=new Dictionary<string,object?>(StringComparer.Ordinal)
        {
            ["DocumentID"]=document,["DocumentDate"]=DateTime.Parse((string)before.Header["purchaseDate"]!,CultureInfo.InvariantCulture),
            ["Memo"]=before.Header.GetValueOrDefault("notes"),["Notes"]=before.Header.GetValueOrDefault("purposeDescOrClient"),
            ["ObjectID"]=before.Header["objectId"],["CurrencyID"]=before.Header["currencyId"],["RateExchange"]=before.Header["rateExchange"],
            ["BranchID"]=before.Branch,["isLock"]=false
        };
        // New Web line identities are UUIDs within the source varchar(50); not the legacy timestamp identity format.
        await using(var command=ErpSqlPlan.Command(transaction,"INSERT dbo.AP_OrderTbl(DocumentID,DocumentDate,Memo,Notes,ObjectID,CurrencyID,RateExchange,BranchID,isLock) VALUES(@id,@date,@memo,@notes,@object,@currency,@rate,@branch,@lock);"))
        {
            ErpSqlPlan.Parameter(command,"@id",DbType.AnsiString,document,50);ErpSqlPlan.Parameter(command,"@date",DbType.DateTime,header["DocumentDate"]);
            ErpSqlPlan.Parameter(command,"@memo",DbType.String,header["Memo"],-1);ErpSqlPlan.Parameter(command,"@notes",DbType.String,header["Notes"],-1);
            ErpSqlPlan.Parameter(command,"@object",DbType.AnsiString,header["ObjectID"],50);ErpSqlPlan.Parameter(command,"@currency",DbType.AnsiString,header["CurrencyID"],50);
            ErpSqlPlan.Parameter(command,"@rate",DbType.Double,header["RateExchange"]);ErpSqlPlan.Parameter(command,"@branch",DbType.AnsiString,before.Branch,50);
            ErpSqlPlan.Parameter(command,"@lock",DbType.Boolean,false);await One(command,token);
        }
        foreach(var line in before.Lines)
        {
            await using var command=ErpSqlPlan.Command(transaction,"INSERT dbo.AP_OrderDetailTbl(UserAutoID,DocumentID,ItemID,Quantity,UnitPrice,Notes) VALUES(@line,@document,@item,@quantity,@price,@notes);");
            ErpSqlPlan.Parameter(command,"@line",DbType.AnsiString,Guid.NewGuid().ToString("D"),50);ErpSqlPlan.Parameter(command,"@document",DbType.AnsiString,document,50);
            ErpSqlPlan.Parameter(command,"@item",DbType.AnsiString,line.Fields["itemId"],50);
            ErpSqlPlan.Parameter(command,"@quantity",DbType.Decimal,decimal.Parse((string)line.Fields["quantity"]!,CultureInfo.InvariantCulture));
            ErpSqlPlan.Parameter(command,"@price",DbType.Decimal,decimal.Parse((string)line.Fields["unitPrice"]!,CultureInfo.InvariantCulture));
            ErpSqlPlan.Parameter(command,"@notes",DbType.String,line.Fields.GetValueOrDefault("timeRequired"),-1);await One(command,token);
        }
        await using var status=ErpSqlPlan.Command(transaction,"UPDATE dbo.AP_PurchaseRequestTbl SET StatusID=@status WHERE PurchaseRequestID=@document;");
        ErpSqlPlan.Parameter(status,"@status",DbType.Int32,5);ErpSqlPlan.Parameter(status,"@document",DbType.String,document,50);await One(status,token);
    }
}
