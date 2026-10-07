using System.Data;
using System.Data.Common;
using Medcom.Application;

namespace Medcom.Infrastructure.Inbound;

// Inbound-only admission prerequisites, not runtime acceptance. Fixed source metadata:
// schemas/backend/inbound-request-command-journal-v1.sql and the checkout's
// tools/inspect/Medcom.TargetInspect/InspectionSql.cs inbound catalog inventory.
// Native defaults/complete constraint behavior remain externally unqualified.
internal static class InboundDraftTargetQualification
{
    private sealed record Column(string Table,string Name,string Type,int Length,int Nullable,int Precision,int Scale,string Collation);
    private static readonly Column[] Columns =
    [
        new("IV_InboundRequestLogTbl","UserAutoID","varchar",50,0,0,0,""),
        new("IV_InboundRequestLogTbl","DocumentID","varchar",50,0,0,0,""),
        new("IV_InboundRequestLogTbl","ThoiGian","datetime",8,0,23,3,""),
        new("IV_InboundRequestLogTbl","UserName","varchar",50,1,0,0,""),
        new("IV_InboundRequestLogTbl","StatusID","int",4,1,10,0,""),
        new("IV_InboundRequestLogTbl","SendTo","nvarchar",-1,1,0,0,""),
        new("IV_InboundRequestLogTbl","Notes","nvarchar",400,1,0,0,""),
        new("IV_InboundRequestNoSuitableTbl","UserAutoID","varchar",50,0,0,0,""),
        new("IV_InboundRequestNoSuitableTbl","DocumentID","varchar",50,0,0,0,""),
        new("IV_InboundRequestNoSuitableTbl","ItemID","nvarchar",100,0,0,0,""),
        new("IV_InboundRequestNoSuitableTbl","Lot","nvarchar",100,1,0,0,""),
        new("IV_InboundRequestNoSuitableTbl","ExpireDate","datetime",8,1,23,3,""),
        new("IV_InboundRequestNoSuitableTbl","QuantityByDocument","decimal",9,1,18,0,""),
        new("IV_InboundRequestNoSuitableTbl","QuantityByReal","decimal",9,1,18,0,""),
        new("IV_InboundRequestNoSuitableTbl","QuantityChecked","decimal",9,1,18,0,""),
        new("IV_InboundRequestNoSuitableTbl","QuantityNoSuitable","decimal",9,1,18,0,""),
        new("IV_InboundRequestNoSuitableTbl","Status","nvarchar",510,1,0,0,""),
        new("IV_InboundRequestNoSuitableTbl","Solution","nvarchar",510,1,0,0,""),
        new("IV_InboundRequestNoSuitableTbl","Conclude","nvarchar",510,1,0,0,""),
        new("IV_InboundRequestNoSuitableTbl","Suggestion","nvarchar",510,1,0,0,""),
        new("IV_InboundRequestDetailsTbl","UserAutoID","varchar",50,0,0,0,""),
        new("IV_InboundRequestDetailsTbl","DocumentID","varchar",50,0,0,0,""),
        new("IV_InboundRequestDetailsTbl","ContractID","nvarchar",200,1,0,0,""),
        new("IV_InboundRequestDetailsTbl","ItemID","varchar",50,0,0,0,""),
        new("IV_InboundRequestDetailsTbl","HangSX","nvarchar",200,1,0,0,""),
        new("IV_InboundRequestDetailsTbl","UnitFactor","float",8,1,53,0,""),
        new("IV_InboundRequestDetailsTbl","Unit2","nvarchar",100,1,0,0,""),
        new("IV_InboundRequestDetailsTbl","Additional","bit",1,1,1,0,""),
        new("IV_InboundRequestDetailsTbl","LotNumberByDocument","nvarchar",100,1,0,0,""),
        new("IV_InboundRequestDetailsTbl","SetQuantityByDocument","decimal",9,1,18,0,""),
        new("IV_InboundRequestDetailsTbl","BarrelQuantityByDocument","decimal",9,1,18,0,""),
        new("IV_InboundRequestDetailsTbl","ExpireDateByDocument","datetime",8,1,23,3,""),
        new("IV_InboundRequestDetailsTbl","LotNumberByReal","nvarchar",100,1,0,0,""),
        new("IV_InboundRequestDetailsTbl","SetQuantityByReal","decimal",9,1,18,0,""),
        new("IV_InboundRequestDetailsTbl","BarrelQuantityByReal","decimal",9,1,18,0,""),
        new("IV_InboundRequestDetailsTbl","ExpireDateByReal","datetime",8,1,23,3,""),
        new("IV_InboundRequestDetailsTbl","SourceAmount","decimal",9,1,18,0,""),
        new("IV_InboundRequestDetailsTbl","UnitPrice","decimal",9,1,18,0,""),
        new("IV_InboundRequestDetailsTbl","Amount","decimal",9,1,18,0,""),
        new("IV_InboundRequestDetailsTbl","RandomTestQuantity","decimal",9,1,18,0,""),
        new("IV_InboundRequestDetailsTbl","TestStatus","nvarchar",200,1,0,0,""),
        new("IV_InboundRequestDetailsTbl","NoPalletNote","nvarchar",1000,1,0,0,""),
        new("IV_InboundRequestDetailsTbl","PalletNote","nvarchar",1000,1,0,0,""),
        new("IV_InboundRequestDetailsTbl","CheckerNote","nvarchar",1000,1,0,0,""),
        new("IV_InboundRequestDetailsTbl","ItemCode","nvarchar",100,1,0,0,""),
        new("IV_InboundRequestTbl","DocumentID","varchar",50,0,0,0,""),
        new("IV_InboundRequestTbl","DocumentDate","datetime",8,0,23,3,""),
        new("IV_InboundRequestTbl","OrderNumber","nvarchar",100,0,0,0,""),
        new("IV_InboundRequestTbl","BranchID","varchar",50,1,0,0,""),
        new("IV_InboundRequestTbl","InvoiceNo","nvarchar",100,0,0,0,""),
        new("IV_InboundRequestTbl","DeclarationNumber","varchar",50,1,0,0,""),
        new("IV_InboundRequestTbl","DeparturePoint","nvarchar",200,0,0,0,""),
        new("IV_InboundRequestTbl","DestinationPoint","nvarchar",200,0,0,0,""),
        new("IV_InboundRequestTbl","IsRain","bit",1,1,1,0,""),
        new("IV_InboundRequestTbl","OrderTypeID","nvarchar",100,0,0,0,""),
        new("IV_InboundRequestTbl","ObjectID","varchar",50,1,0,0,""),
        new("IV_InboundRequestTbl","TotalPalletQuantityByDocument","decimal",9,1,18,0,""),
        new("IV_InboundRequestTbl","TotalBarrelQuantityByDocument","decimal",9,1,18,0,""),
        new("IV_InboundRequestTbl","TotalPalletQuantityByReal","decimal",9,1,18,0,""),
        new("IV_InboundRequestTbl","TotalBarrelQuantityByReal","decimal",9,1,18,0,""),
        new("IV_InboundRequestTbl","ExcessPackageQuantity","decimal",9,1,18,0,""),
        new("IV_InboundRequestTbl","LackOfPackageQuantity","decimal",9,1,18,0,""),
        new("IV_InboundRequestTbl","DamagedPackageQuantity","decimal",9,1,18,0,""),
        new("IV_InboundRequestTbl","PackageTypeID","nvarchar",100,1,0,0,""),
        new("IV_InboundRequestTbl","IsDamageOutsidePackage","bit",1,1,1,0,""),
        new("IV_InboundRequestTbl","DamageDescription","nvarchar",1000,1,0,0,""),
        new("IV_InboundRequestTbl","DamageInsideStatusID","nvarchar",100,1,0,0,""),
        new("IV_InboundRequestTbl","LocationDamageDetectedID","nvarchar",100,1,0,0,""),
        new("IV_InboundRequestTbl","LocationDamageDescription","nvarchar",1000,1,0,0,""),
        new("IV_InboundRequestTbl","ResultDesciption","nvarchar",-1,1,0,0,""),
        new("IV_InboundRequestTbl","TotalQuantityInboundResult","decimal",9,1,18,0,""),
        new("IV_InboundRequestTbl","GoodAwaitingInboundResult","decimal",9,1,18,0,""),
        new("IV_InboundRequestTbl","ResultNote","nvarchar",1000,1,0,0,""),
        new("IV_InboundRequestTbl","DatetimeRecorded","datetime",8,1,23,3,""),
        new("IV_InboundRequestTbl","StatusID","int",4,0,10,0,""),
        new("IV_InboundRequestTbl","CurrencyID","varchar",3,1,0,0,""),
        new("IV_InboundRequestTbl","RateExchange","decimal",13,1,28,10,""),
        new("IV_InboundRequestTbl","ImageURL","varchar",255,1,0,0,""),
        new("IV_InboundRequestTbl","BBKCUrl","varchar",255,1,0,0,""),
        new("IV_InboundRequestTbl","Notes","nvarchar",1000,1,0,0,""),
        new("IV_InboundRequestTbl","SendTo","nvarchar",-1,1,0,0,""),
        new("IV_InboundRequestTbl","QRPrintType","varchar",10,0,0,0,""),
        new("IV_InboundRequestCTCPTbl","UserAutoID","nvarchar",100,0,0,0,""),
        new("IV_InboundRequestCTCPTbl","DocumentID","varchar",50,0,0,0,""),
        new("IV_InboundRequestCTCPTbl","ObjectID","varchar",100,0,0,0,""),
        new("IV_InboundRequestCTCPTbl","NCC","varchar",100,1,0,0,""),
        new("IV_InboundRequestCTCPTbl","Memo","nvarchar",400,1,0,0,""),
        new("IV_InboundRequestCTCPTbl","Cost","decimal",9,1,18,2,""),
        new("IV_InboundRequestCTCPTbl","VATAmount","decimal",9,1,18,2,""),
        new("IV_InboundRequestCTCPTbl","Notes","nvarchar",400,1,0,0,""),
        new("IV_InboundRequestCTCPTbl","CostType","varchar",30,1,0,0,""),
        new("IV_InboundRequestCTCPTbl","CurrencyID","varchar",3,1,0,0,""),
        new("IV_InboundRequestCTCPTbl","RateExchange","decimal",13,1,28,10,""),
        new("IV_InboundRequestCTCPTbl","SourceAmount","decimal",13,1,28,4,""),
        new("IV_InboundRequestCTCPTbl","VATID","varchar",50,1,0,0,""),
        new("IV_InboundRequestCTCPTbl","VATPercent","decimal",9,1,18,2,""),
        new("IV_InboundRequestCTCPTbl","ExpenseAccID","varchar",50,1,0,0,""),
        new("IV_InboundRequestCTCPTbl","InvoiceNo","varchar",50,1,0,0,""),
        new("IV_InboundRequestCTCPTbl","InvoiceDate","datetime",8,1,23,3,""),
        new("IV_InboundRequestCTCPTbl","AllocateKind","varchar",5,1,0,0,""),
        new("IV_InboundRequestCTCPTbl","IsAllocatable","bit",1,1,1,0,""),
        new("IV_InboundRequestCTCPTbl","ServiceDocumentID","varchar",30,1,0,0,""),
        new("IV_InboundRequestCTCPTbl","ServiceDetailID","varchar",40,1,0,0,""),
        new("IV_InboundRequestCTCPTbl","Status","int",4,1,10,0,""),
        new("IV_InboundRequestCTCPTbl","UserCreate","varchar",50,1,0,0,""),
        new("IV_InboundRequestCTCPTbl","UserUpdate","varchar",50,1,0,0,""),
        new("IV_InboundRequestCTCPTbl","DateCreate","datetime",8,1,23,3,""),
        new("IV_InboundRequestCTCPTbl","DateUpdate","datetime",8,1,23,3,""),
        new("IV_InboundRequestCTCPTbl","IsActive","bit",1,0,1,0,""),
        new("WebInboundRequestCommandJournalV1","DatabaseBindingId","uniqueidentifier",16,0,0,0,""),
        new("WebInboundRequestCommandJournalV1","TenantId","nvarchar",200,0,0,0,"Latin1_General_100_BIN2"),
        new("WebInboundRequestCommandJournalV1","CompanyId","nvarchar",200,0,0,0,"Latin1_General_100_BIN2"),
        new("WebInboundRequestCommandJournalV1","Actor","varchar",50,0,0,0,"Latin1_General_100_BIN2"),
        new("WebInboundRequestCommandJournalV1","OperationId","uniqueidentifier",16,0,0,0,""),
        new("WebInboundRequestCommandJournalV1","IntentHash","binary",32,0,0,0,""),
        new("WebInboundRequestCommandJournalV1","Action","varchar",32,0,0,0,"Latin1_General_100_BIN2"),
        new("WebInboundRequestCommandJournalV1","AttemptId","uniqueidentifier",16,0,0,0,""),
        new("WebInboundRequestCommandJournalV1","State","tinyint",1,0,3,0,""),
        new("WebInboundRequestCommandJournalV1","BranchId","varchar",50,0,0,0,"Latin1_General_100_BIN2"),
        new("WebInboundRequestCommandJournalV1","DocumentId","varchar",50,1,0,0,"Latin1_General_100_BIN2"),
        new("WebInboundRequestCommandJournalV1","BeforeState","char",64,1,0,0,"Latin1_General_100_BIN2"),
        new("WebInboundRequestCommandJournalV1","AfterState","char",64,1,0,0,"Latin1_General_100_BIN2"),
        new("WebInboundRequestCommandJournalV1","StatusAfter","int",4,1,10,0,""),
        new("WebInboundRequestCommandJournalV1","AuditId","uniqueidentifier",16,1,0,0,""),
        new("WebInboundRequestCommandJournalV1","CreatedAtUtc","datetime2",8,0,27,7,""),
        new("WebInboundRequestCommandJournalV1","CommittedAtUtc","datetime2",8,1,27,7,""),
        new("WebInboundRequestCommandBindingV1","SingletonId","tinyint",1,0,3,0,""),
        new("WebInboundRequestCommandBindingV1","SchemaVersion","int",4,0,10,0,""),
        new("WebInboundRequestCommandBindingV1","DatabaseBindingId","uniqueidentifier",16,0,0,0,""),
        new("WebInboundRequestCommandBindingV1","TenantId","nvarchar",200,0,0,0,"Latin1_General_100_BIN2"),
        new("WebInboundRequestCommandBindingV1","CompanyId","nvarchar",200,0,0,0,"Latin1_General_100_BIN2"),
    ];
    private const string Journal = "WebInboundRequestCommandJournalV1";
    private const string Marker = "WebInboundRequestCommandBindingV1";
    private static readonly string[] Tables = Columns.Select(x=>x.Table).Distinct(StringComparer.Ordinal).ToArray();
    private static readonly string[] JournalKey = ["DatabaseBindingId","TenantId","CompanyId","Actor","OperationId"];
    private static readonly Dictionary<string,string> Definitions = new(StringComparer.Ordinal)
    {
        ["CK_WebInboundJournal_Action"] = "(Action IN ('Create','Save','SendToWarehouse'))",
        ["CK_WebInboundJournal_State"] = "((State=0 AND BeforeState IS NULL AND AfterState IS NULL AND StatusAfter IS NULL AND AuditId IS NULL AND CommittedAtUtc IS NULL) OR (State=1 AND BranchId IS NOT NULL AND DocumentId IS NOT NULL AND BeforeState IS NOT NULL AND AfterState IS NOT NULL AND StatusAfter IN (0,1,2) AND AuditId IS NOT NULL AND CommittedAtUtc IS NOT NULL))",
        ["CK_WebInboundBinding_Identity"] = "(SingletonId=1 AND SchemaVersion=1)",
        ["DF_WebInboundJournal_Created"] = "(SYSUTCDATETIME())"
    };

    internal static async Task VerifyAsync(DbConnection connection,DbTransaction transaction,Guid binding,LegacyCompany company,CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        Ensure(System.Transactions.Transaction.Current is null && connection.State==ConnectionState.Open
            && ReferenceEquals(transaction.Connection,connection) && transaction.IsolationLevel==IsolationLevel.Serializable);
        var environment=await Read(transaction,InboundDraftSql.TargetEnvironmentText,1,10,token);
        Ensure(environment.Count==1 && environment[0].All(v=>v is int n && n==1));
        var tables=await Read(transaction,InboundDraftSql.TargetTablesText,Tables.Length,2,token);
        Ensure(tables.Count==Tables.Length && tables.Select(x=>x[0]).Distinct().Count()==Tables.Length
            && tables.All(x=>x[0] is string t && Tables.Contains(t,StringComparer.Ordinal) && x[1] is int n && n==0));
        var columns=await Read(transaction,InboundDraftSql.TargetColumnsText,Columns.Length,9,token);
        Ensure(columns.Count==Columns.Length);
        var seen=new HashSet<(string,string)>();
        foreach(var row in columns)
        {
            Ensure(row[0] is string && row[1] is string);
            var table=(string)row[0];var name=(string)row[1];
            Ensure(seen.Add((table,name)));
            var expected=Columns.SingleOrDefault(c=>c.Table==table && c.Name==name);
            Ensure(expected is not null);
            Ensure(Equals(row[2],expected!.Type) && Equals(row[3],expected.Length) && Equals(row[4],expected.Nullable)
                && Equals(row[5],expected.Precision) && Equals(row[6],expected.Scale) && Equals(row[8],0));
            // Native collation semantics are not inferred. Web identity/receipt text is exact BIN2.
            Ensure(expected.Collation.Length==0 || Equals(row[7],expected.Collation));
        }
        var keys=await Read(transaction,InboundDraftSql.TargetKeysText,11,4,token);
        Ensure(keys.Count==11);
        var keySeen=new HashSet<(string,int)>();
        foreach(var row in keys)
        {
            Ensure(row[0] is string && row[1] is string && row[2] is int && Equals(row[3],0));
            var table=(string)row[0];var ordinal=(int)row[2];
            var expected=table==Journal ? JournalKey : table==Marker ? ["SingletonId"]
                : table=="IV_InboundRequestTbl" ? ["DocumentID"] : new[]{"UserAutoID"};
            Ensure(Tables.Contains(table,StringComparer.Ordinal) && keySeen.Add((table,ordinal))
                && ordinal>0 && ordinal<=expected.Length && Equals(row[1],expected[ordinal-1]));
        }
        var definitions=await Read(transaction,InboundDraftSql.TargetDefinitionsText,4,5,token);
        Ensure(definitions.Count==4);
        var names=new HashSet<string>(StringComparer.Ordinal);
        foreach(var row in definitions)
        {
            Ensure(row[0] is string name && names.Add(name) && Definitions.ContainsKey(name)
                && row[1] is string && Equals(row[2],0) && Equals(row[3],0));
            Ensure(Equals(row[4],(string)row[0]=="CK_WebInboundBinding_Identity" ? Marker : Journal));
            Ensure(Normalize((string)row[1])==Normalize(Definitions[(string)row[0]]));
        }
        // No WHERE filtering: a duplicate/wrong singleton cannot be hidden by predicates.
        var identity=await Read(transaction,InboundDraftSql.TargetBindingText,2,5,token);
        Ensure(identity.Count==1 && Equals(identity[0][0],(byte)1) && Equals(identity[0][1],1)
            && binding!=Guid.Empty && Equals(identity[0][2],binding)
            && Equals(identity[0][3],company.TenantId) && Equals(identity[0][4],company.CompanyId));
        token.ThrowIfCancellationRequested();
        Ensure(connection.State==ConnectionState.Open && ReferenceEquals(transaction.Connection,connection));
    }
    private static async Task<List<object[]>> Read(DbTransaction tx,string sql,int limit,int width,CancellationToken token)
    {
        await using var command=InboundDraftSql.Command(tx,sql);
        await using var reader=await command.ExecuteReaderAsync(token);
        Ensure(reader.FieldCount==width);
        var rows=new List<object[]>();
        while(await reader.ReadAsync(token))
        {
            Ensure(rows.Count<limit);
            var row=new object[width];reader.GetValues(row);
            Ensure(row.All(x=>x is not DBNull && (x is not string text || text.Length<=16384)));
            rows.Add(row);
        }
        Ensure(!await reader.NextResultAsync(token));
        return rows;
    }
    // Conservative lexical equality only; preserves quoted literals and parentheses.
    // Unsupported SQL Server rewrites fail closed for owner review.
    private static string Normalize(string text)
    {
        var result=new System.Text.StringBuilder();var literal=false;
        for(var i=0;i<text.Length;i++)
        {
            var ch=text[i];
            if(ch=='\'') {result.Append(ch);if(literal && i+1<text.Length && text[i+1]=='\''){result.Append(text[++i]);continue;}literal=!literal;}
            else if(literal)result.Append(ch);
            else if(ch=='[')
            {
                var end=text.IndexOf(']',i+1);Ensure(end>i+1);
                var name=text[(i+1)..end];Ensure(name.All(c=>char.IsAsciiLetterOrDigit(c)||c=='_'));
                result.Append(name.ToLowerInvariant());i=end;
            }
            else if(!char.IsWhiteSpace(ch))result.Append(char.ToLowerInvariant(ch));
        }
        Ensure(!literal);return result.ToString();
    }
    private static void Ensure(bool condition)
    {if(!condition)throw new InvalidOperationException("Inbound target prerequisites are not qualified.");}
}
