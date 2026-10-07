using System.Data;
using System.Data.Common;
using Medcom.Application;
using Medcom.Contracts.Inbound;
using Medcom.Infrastructure;
using Medcom.Infrastructure.Inbound;
using Xunit;

namespace Medcom.Api.Tests;

// Entirely synthetic catalog/marker rows. No target SQL is executed or certified.
internal sealed class InboundTargetModel
{
    internal readonly Dictionary<string,DataTable> Data=new(StringComparer.Ordinal);
    internal Func<string,DataTable,DataTable>? Change;
    internal InboundTargetModel()
    {
        var environment=InboundModel.Table(Enumerable.Range(0,10).Select(i=>("E"+i,typeof(int))).ToArray());
        environment.Rows.Add(Enumerable.Repeat<object>(1,10).ToArray());Data["target-environment"]=environment;
        var columns=InboundModel.Table(("Table",typeof(string)),("Column",typeof(string)),("Type",typeof(string)),
            ("Length",typeof(int)),("Nullable",typeof(int)),("Precision",typeof(int)),("Scale",typeof(int)),("Collation",typeof(string)),("Unsupported",typeof(int)));
        foreach(var line in ColumnFixture.Split('\n',StringSplitOptions.RemoveEmptyEntries))
        {
            var v=line.Trim().Split('|');
            columns.Rows.Add(v[0],v[1],v[2],int.Parse(v[3],System.Globalization.CultureInfo.InvariantCulture),
                int.Parse(v[4],System.Globalization.CultureInfo.InvariantCulture),int.Parse(v[5],System.Globalization.CultureInfo.InvariantCulture),
                int.Parse(v[6],System.Globalization.CultureInfo.InvariantCulture),v[7],0);
        }
        Data["target-columns"]=columns;
        var tables=InboundModel.Table(("Table",typeof(string)),("Unsafe",typeof(int)));
        foreach(var table in columns.Rows.Cast<DataRow>().Select(r=>(string)r[0]).Distinct())tables.Rows.Add(table,0);
        Data["target-tables"]=tables;
        var keys=InboundModel.Table(("Table",typeof(string)),("Column",typeof(string)),("Ordinal",typeof(int)),("Unsafe",typeof(int)));
        foreach(DataRow table in tables.Rows)
        {
            var name=(string)table[0];
            var key=name=="WebInboundRequestCommandJournalV1"?new[]{"DatabaseBindingId","TenantId","CompanyId","Actor","OperationId"}
                : name=="WebInboundRequestCommandBindingV1"?["SingletonId"]:name=="IV_InboundRequestTbl"?["DocumentID"]:["UserAutoID"];
            for(var i=0;i<key.Length;i++)keys.Rows.Add(name,key[i],i+1,0);
        }
        Data["target-keys"]=keys;
        var definitions=InboundModel.Table(("Name",typeof(string)),("Definition",typeof(string)),("Disabled",typeof(int)),("Untrusted",typeof(int)),("Table",typeof(string)));
        definitions.Rows.Add("CK_WebInboundJournal_Action","(Action IN ('Create','Save','SendToWarehouse'))",0,0,"WebInboundRequestCommandJournalV1");
        definitions.Rows.Add("CK_WebInboundJournal_State","((State=0 AND BeforeState IS NULL AND AfterState IS NULL AND StatusAfter IS NULL AND AuditId IS NULL AND CommittedAtUtc IS NULL) OR (State=1 AND BranchId IS NOT NULL AND DocumentId IS NOT NULL AND BeforeState IS NOT NULL AND AfterState IS NOT NULL AND StatusAfter IN (0,1,2) AND AuditId IS NOT NULL AND CommittedAtUtc IS NOT NULL))",0,0,"WebInboundRequestCommandJournalV1");
        definitions.Rows.Add("CK_WebInboundBinding_Identity","(SingletonId=1 AND SchemaVersion=1)",0,0,"WebInboundRequestCommandBindingV1");
        definitions.Rows.Add("DF_WebInboundJournal_Created","(SYSUTCDATETIME())",0,0,"WebInboundRequestCommandJournalV1");
        Data["target-definitions"]=definitions;
        var marker=InboundModel.Table(("SingletonId",typeof(byte)),("SchemaVersion",typeof(int)),("DatabaseBindingId",typeof(Guid)),("TenantId",typeof(string)),("CompanyId",typeof(string)));
        marker.Rows.Add((byte)1,1,Guid.Parse("11111111-1111-1111-1111-111111111111"),"synthetic-tenant","synthetic-company");
        Data["target-binding"]=marker;
    }
    internal DbDataReader Read(string tag)
    {var table=Data[tag].Copy();return (Change?.Invoke(tag,table)??table).CreateDataReader();}
    private const string ColumnFixture="""
        IV_InboundRequestLogTbl|UserAutoID|varchar|50|0|0|0|
        IV_InboundRequestLogTbl|DocumentID|varchar|50|0|0|0|
        IV_InboundRequestLogTbl|ThoiGian|datetime|8|0|23|3|
        IV_InboundRequestLogTbl|UserName|varchar|50|1|0|0|
        IV_InboundRequestLogTbl|StatusID|int|4|1|10|0|
        IV_InboundRequestLogTbl|SendTo|nvarchar|-1|1|0|0|
        IV_InboundRequestLogTbl|Notes|nvarchar|400|1|0|0|
        IV_InboundRequestNoSuitableTbl|UserAutoID|varchar|50|0|0|0|
        IV_InboundRequestNoSuitableTbl|DocumentID|varchar|50|0|0|0|
        IV_InboundRequestNoSuitableTbl|ItemID|nvarchar|100|0|0|0|
        IV_InboundRequestNoSuitableTbl|Lot|nvarchar|100|1|0|0|
        IV_InboundRequestNoSuitableTbl|ExpireDate|datetime|8|1|23|3|
        IV_InboundRequestNoSuitableTbl|QuantityByDocument|decimal|9|1|18|0|
        IV_InboundRequestNoSuitableTbl|QuantityByReal|decimal|9|1|18|0|
        IV_InboundRequestNoSuitableTbl|QuantityChecked|decimal|9|1|18|0|
        IV_InboundRequestNoSuitableTbl|QuantityNoSuitable|decimal|9|1|18|0|
        IV_InboundRequestNoSuitableTbl|Status|nvarchar|510|1|0|0|
        IV_InboundRequestNoSuitableTbl|Solution|nvarchar|510|1|0|0|
        IV_InboundRequestNoSuitableTbl|Conclude|nvarchar|510|1|0|0|
        IV_InboundRequestNoSuitableTbl|Suggestion|nvarchar|510|1|0|0|
        IV_InboundRequestDetailsTbl|UserAutoID|varchar|50|0|0|0|
        IV_InboundRequestDetailsTbl|DocumentID|varchar|50|0|0|0|
        IV_InboundRequestDetailsTbl|ContractID|nvarchar|200|1|0|0|
        IV_InboundRequestDetailsTbl|ItemID|varchar|50|0|0|0|
        IV_InboundRequestDetailsTbl|HangSX|nvarchar|200|1|0|0|
        IV_InboundRequestDetailsTbl|UnitFactor|float|8|1|53|0|
        IV_InboundRequestDetailsTbl|Unit2|nvarchar|100|1|0|0|
        IV_InboundRequestDetailsTbl|Additional|bit|1|1|1|0|
        IV_InboundRequestDetailsTbl|LotNumberByDocument|nvarchar|100|1|0|0|
        IV_InboundRequestDetailsTbl|SetQuantityByDocument|decimal|9|1|18|0|
        IV_InboundRequestDetailsTbl|BarrelQuantityByDocument|decimal|9|1|18|0|
        IV_InboundRequestDetailsTbl|ExpireDateByDocument|datetime|8|1|23|3|
        IV_InboundRequestDetailsTbl|LotNumberByReal|nvarchar|100|1|0|0|
        IV_InboundRequestDetailsTbl|SetQuantityByReal|decimal|9|1|18|0|
        IV_InboundRequestDetailsTbl|BarrelQuantityByReal|decimal|9|1|18|0|
        IV_InboundRequestDetailsTbl|ExpireDateByReal|datetime|8|1|23|3|
        IV_InboundRequestDetailsTbl|SourceAmount|decimal|9|1|18|0|
        IV_InboundRequestDetailsTbl|UnitPrice|decimal|9|1|18|0|
        IV_InboundRequestDetailsTbl|Amount|decimal|9|1|18|0|
        IV_InboundRequestDetailsTbl|RandomTestQuantity|decimal|9|1|18|0|
        IV_InboundRequestDetailsTbl|TestStatus|nvarchar|200|1|0|0|
        IV_InboundRequestDetailsTbl|NoPalletNote|nvarchar|1000|1|0|0|
        IV_InboundRequestDetailsTbl|PalletNote|nvarchar|1000|1|0|0|
        IV_InboundRequestDetailsTbl|CheckerNote|nvarchar|1000|1|0|0|
        IV_InboundRequestDetailsTbl|ItemCode|nvarchar|100|1|0|0|
        IV_InboundRequestTbl|DocumentID|varchar|50|0|0|0|
        IV_InboundRequestTbl|DocumentDate|datetime|8|0|23|3|
        IV_InboundRequestTbl|OrderNumber|nvarchar|100|0|0|0|
        IV_InboundRequestTbl|BranchID|varchar|50|1|0|0|
        IV_InboundRequestTbl|InvoiceNo|nvarchar|100|0|0|0|
        IV_InboundRequestTbl|DeclarationNumber|varchar|50|1|0|0|
        IV_InboundRequestTbl|DeparturePoint|nvarchar|200|0|0|0|
        IV_InboundRequestTbl|DestinationPoint|nvarchar|200|0|0|0|
        IV_InboundRequestTbl|IsRain|bit|1|1|1|0|
        IV_InboundRequestTbl|OrderTypeID|nvarchar|100|0|0|0|
        IV_InboundRequestTbl|ObjectID|varchar|50|1|0|0|
        IV_InboundRequestTbl|TotalPalletQuantityByDocument|decimal|9|1|18|0|
        IV_InboundRequestTbl|TotalBarrelQuantityByDocument|decimal|9|1|18|0|
        IV_InboundRequestTbl|TotalPalletQuantityByReal|decimal|9|1|18|0|
        IV_InboundRequestTbl|TotalBarrelQuantityByReal|decimal|9|1|18|0|
        IV_InboundRequestTbl|ExcessPackageQuantity|decimal|9|1|18|0|
        IV_InboundRequestTbl|LackOfPackageQuantity|decimal|9|1|18|0|
        IV_InboundRequestTbl|DamagedPackageQuantity|decimal|9|1|18|0|
        IV_InboundRequestTbl|PackageTypeID|nvarchar|100|1|0|0|
        IV_InboundRequestTbl|IsDamageOutsidePackage|bit|1|1|1|0|
        IV_InboundRequestTbl|DamageDescription|nvarchar|1000|1|0|0|
        IV_InboundRequestTbl|DamageInsideStatusID|nvarchar|100|1|0|0|
        IV_InboundRequestTbl|LocationDamageDetectedID|nvarchar|100|1|0|0|
        IV_InboundRequestTbl|LocationDamageDescription|nvarchar|1000|1|0|0|
        IV_InboundRequestTbl|ResultDesciption|nvarchar|-1|1|0|0|
        IV_InboundRequestTbl|TotalQuantityInboundResult|decimal|9|1|18|0|
        IV_InboundRequestTbl|GoodAwaitingInboundResult|decimal|9|1|18|0|
        IV_InboundRequestTbl|ResultNote|nvarchar|1000|1|0|0|
        IV_InboundRequestTbl|DatetimeRecorded|datetime|8|1|23|3|
        IV_InboundRequestTbl|StatusID|int|4|0|10|0|
        IV_InboundRequestTbl|CurrencyID|varchar|3|1|0|0|
        IV_InboundRequestTbl|RateExchange|decimal|13|1|28|10|
        IV_InboundRequestTbl|ImageURL|varchar|255|1|0|0|
        IV_InboundRequestTbl|BBKCUrl|varchar|255|1|0|0|
        IV_InboundRequestTbl|Notes|nvarchar|1000|1|0|0|
        IV_InboundRequestTbl|SendTo|nvarchar|-1|1|0|0|
        IV_InboundRequestTbl|QRPrintType|varchar|10|0|0|0|
        IV_InboundRequestCTCPTbl|UserAutoID|nvarchar|100|0|0|0|
        IV_InboundRequestCTCPTbl|DocumentID|varchar|50|0|0|0|
        IV_InboundRequestCTCPTbl|ObjectID|varchar|100|0|0|0|
        IV_InboundRequestCTCPTbl|NCC|varchar|100|1|0|0|
        IV_InboundRequestCTCPTbl|Memo|nvarchar|400|1|0|0|
        IV_InboundRequestCTCPTbl|Cost|decimal|9|1|18|2|
        IV_InboundRequestCTCPTbl|VATAmount|decimal|9|1|18|2|
        IV_InboundRequestCTCPTbl|Notes|nvarchar|400|1|0|0|
        IV_InboundRequestCTCPTbl|CostType|varchar|30|1|0|0|
        IV_InboundRequestCTCPTbl|CurrencyID|varchar|3|1|0|0|
        IV_InboundRequestCTCPTbl|RateExchange|decimal|13|1|28|10|
        IV_InboundRequestCTCPTbl|SourceAmount|decimal|13|1|28|4|
        IV_InboundRequestCTCPTbl|VATID|varchar|50|1|0|0|
        IV_InboundRequestCTCPTbl|VATPercent|decimal|9|1|18|2|
        IV_InboundRequestCTCPTbl|ExpenseAccID|varchar|50|1|0|0|
        IV_InboundRequestCTCPTbl|InvoiceNo|varchar|50|1|0|0|
        IV_InboundRequestCTCPTbl|InvoiceDate|datetime|8|1|23|3|
        IV_InboundRequestCTCPTbl|AllocateKind|varchar|5|1|0|0|
        IV_InboundRequestCTCPTbl|IsAllocatable|bit|1|1|1|0|
        IV_InboundRequestCTCPTbl|ServiceDocumentID|varchar|30|1|0|0|
        IV_InboundRequestCTCPTbl|ServiceDetailID|varchar|40|1|0|0|
        IV_InboundRequestCTCPTbl|Status|int|4|1|10|0|
        IV_InboundRequestCTCPTbl|UserCreate|varchar|50|1|0|0|
        IV_InboundRequestCTCPTbl|UserUpdate|varchar|50|1|0|0|
        IV_InboundRequestCTCPTbl|DateCreate|datetime|8|1|23|3|
        IV_InboundRequestCTCPTbl|DateUpdate|datetime|8|1|23|3|
        IV_InboundRequestCTCPTbl|IsActive|bit|1|0|1|0|
        WebInboundRequestCommandJournalV1|DatabaseBindingId|uniqueidentifier|16|0|0|0|
        WebInboundRequestCommandJournalV1|TenantId|nvarchar|200|0|0|0|Latin1_General_100_BIN2
        WebInboundRequestCommandJournalV1|CompanyId|nvarchar|200|0|0|0|Latin1_General_100_BIN2
        WebInboundRequestCommandJournalV1|Actor|varchar|50|0|0|0|Latin1_General_100_BIN2
        WebInboundRequestCommandJournalV1|OperationId|uniqueidentifier|16|0|0|0|
        WebInboundRequestCommandJournalV1|IntentHash|binary|32|0|0|0|
        WebInboundRequestCommandJournalV1|Action|varchar|32|0|0|0|Latin1_General_100_BIN2
        WebInboundRequestCommandJournalV1|AttemptId|uniqueidentifier|16|0|0|0|
        WebInboundRequestCommandJournalV1|State|tinyint|1|0|3|0|
        WebInboundRequestCommandJournalV1|BranchId|varchar|50|0|0|0|Latin1_General_100_BIN2
        WebInboundRequestCommandJournalV1|DocumentId|varchar|50|1|0|0|Latin1_General_100_BIN2
        WebInboundRequestCommandJournalV1|BeforeState|char|64|1|0|0|Latin1_General_100_BIN2
        WebInboundRequestCommandJournalV1|AfterState|char|64|1|0|0|Latin1_General_100_BIN2
        WebInboundRequestCommandJournalV1|StatusAfter|int|4|1|10|0|
        WebInboundRequestCommandJournalV1|AuditId|uniqueidentifier|16|1|0|0|
        WebInboundRequestCommandJournalV1|CreatedAtUtc|datetime2|8|0|27|7|
        WebInboundRequestCommandJournalV1|CommittedAtUtc|datetime2|8|1|27|7|
        WebInboundRequestCommandBindingV1|SingletonId|tinyint|1|0|3|0|
        WebInboundRequestCommandBindingV1|SchemaVersion|int|4|0|10|0|
        WebInboundRequestCommandBindingV1|DatabaseBindingId|uniqueidentifier|16|0|0|0|
        WebInboundRequestCommandBindingV1|TenantId|nvarchar|200|0|0|0|Latin1_General_100_BIN2
        WebInboundRequestCommandBindingV1|CompanyId|nvarchar|200|0|0|0|Latin1_General_100_BIN2
        """;
}

public sealed class InboundDraftTargetQualificationTests
{
    internal static InboundDraftCommandFactory Factory(InboundModel model)=>new(
        Guid.Parse("11111111-1111-1111-1111-111111111111"),new LegacyCompany("synthetic-tenant","synthetic-company","Synthetic"),
        (Func<DbConnection>)model.NewConnection,new(Guid.Parse("11111111-1111-1111-1111-111111111111"),
        "synthetic-tenant","synthetic-company","synthetic-only","synthetic-send-only"));
    internal static InboundModel Model()
    {var model=new InboundModel();var native=new InboundAuthorityComparison(model);native.Direct.Add(new("sample-user","07011"));return model;}
    public static IEnumerable<object[]> Faults()
    {
        foreach(var path in new[]{"admission","read","reservation","effects","reconcile"})
        foreach(var fault in new[]{"missing-marker","wrong-binding","duplicate-marker","wrong-singleton","wrong-version","wrong-tenant","wrong-company",
            "absent-journal","lookalike-journal","wrong-type","wrong-length","wrong-nullability","wrong-collation","wrong-pk","missing-pk",
            "untrusted-check","disabled-check","wrong-check","missing-check","wrong-default","unexpected-trigger","unexpected-security",
            "durability","hidden","ambient-count","broken-state","wrong-isolation","hidden-column","extra-column","duplicate-column","hidden-definition","wrong-constraint-owner","unsupported-column","wrong-precision","wrong-scale"})
            yield return [path,fault];
    }
    [Theory][MemberData(nameof(Faults))]
    public async Task Every_owned_phase_qualifies_before_business_reads_or_effects(string path,string fault)
    {
        var model=Model();var factory=Factory(model);var commands=factory.CreateCommands(model.ResolveAsync,model.InspectAsync);
        var read=await commands.ReadAsync("DOC-IN-1");Assert.Equal(InboundDraftOutcome.Observed,read.Outcome);
        var request=new InboundDraftCommand(Guid.NewGuid(),InboundDraftAction.Save,"DOC-IN-1",read.Document!.StateEqualityToken,InboundModel.Header);
        model.Events.Clear();model.Commands.Clear();var phase=0;
        model.OnEvent=tag=>{if(tag=="target-environment")phase++;};
        model.Target.Change=(tag,table)=>path=="effects" && phase==1?table:Corrupt(tag,table,fault);
        if(path=="admission")Assert.NotEqual(InboundDraftCommandAuthorityOutcome.Admitted,
            (await factory.CreateAuthorityReader(model.ResolveAsync,model.InspectAsync).ReadAsync("DOC-IN-1")).Outcome);
        else if(path=="read")Assert.NotEqual(InboundDraftOutcome.Observed,(await commands.ReadAsync("DOC-IN-1")).Outcome);
        else
        {
            var result=path=="reconcile"?await commands.ReconcileAsync(request):await commands.ExecuteAsync(request);
            Assert.Null(result.Receipt);Assert.NotEqual(InboundDraftOutcome.Committed,result.Outcome);
        }
        var last=model.Events.FindLastIndex(x=>x=="target-environment");Assert.True(last>=0);
        Assert.DoesNotContain(model.Events.Skip(last),x=>x is "user" or "grants" or "branch" or "snapshot-before" or "lookup" or "reserve" or "header" or "record");
        Assert.Equal(path=="effects"?1:0,model.CommitAcks);Assert.Equal(0,model.BusinessWrites);Assert.Equal(0,model.FullDuringTransaction);
        Assert.Equal(path=="effects"?1:0,model.Journal.Rows.Count);
        if(path=="effects")Assert.Equal(request.OperationId,model.Journal.Rows[0]["OperationId"]);
    }
    private static DataTable Corrupt(string tag,DataTable t,string fault)
    {
        if(tag=="target-binding")
        {
            if(fault=="missing-marker")t.Rows.Clear();
            if(fault=="duplicate-marker")t.ImportRow(t.Rows[0]);
            if(fault=="wrong-binding")t.Rows[0][2]=Guid.Empty;
            if(fault=="wrong-singleton")t.Rows[0][0]=(byte)2;
            if(fault=="wrong-version")t.Rows[0][1]=2;
            if(fault=="wrong-tenant")t.Rows[0][3]="other";
            if(fault=="wrong-company")t.Rows[0][4]="other";
        }
        if(tag=="target-tables")
        {
            var row=t.Rows.Cast<DataRow>().Single(r=>(string)r[0]=="WebInboundRequestCommandJournalV1");
            if(fault is "absent-journal" or "unexpected-trigger" or "unexpected-security")row[1]=1;
            if(fault=="lookalike-journal")row[0]="webinboundrequestcommandjournalv1";
        }
        if(tag=="target-columns")
        {
            var row=t.Rows.Cast<DataRow>().Single(r=>(string)r[0]=="WebInboundRequestCommandJournalV1" && (string)r[1]=="Actor");
            if(fault=="wrong-type")row[2]="nvarchar";
            if(fault=="wrong-length")row[3]=49;
            if(fault=="wrong-nullability")row[4]=1;
            if(fault=="unsupported-column")row[8]=1;
            if(fault=="wrong-precision")row[5]=1;
            if(fault=="wrong-scale")row[6]=1;
            if(fault=="wrong-collation")row[7]="SQL_Latin1_General_CP1_CI_AS";
            if(fault=="hidden-column")t.Rows.Remove(row);
            if(fault=="extra-column"){var v=row.ItemArray;v[1]="Extra";t.Rows.Add(v);}
            if(fault=="duplicate-column"){t.Rows.RemoveAt(0);t.ImportRow(row);}
        }
        if(tag=="target-keys")
        {
            if(fault=="wrong-pk")t.Rows.Cast<DataRow>().Single(r=>(string)r[0]=="WebInboundRequestCommandJournalV1" && (int)r[2]==2)[1]="CompanyId";
            if(fault=="missing-pk")t.Rows.RemoveAt(0);
        }
        if(tag=="target-definitions")
        {
            if(fault=="wrong-constraint-owner")t.Rows[0][4]="WebInboundRequestCommandBindingV1";
            if(fault=="untrusted-check")t.Rows[0][3]=1;
            if(fault=="disabled-check")t.Rows[0][2]=1;
            if(fault=="wrong-check")t.Rows[0][1]="(1=1)";
            if(fault=="missing-check")t.Rows.RemoveAt(0);
            if(fault=="wrong-default")t.Rows[3][1]="(GETDATE())";
            if(fault=="hidden-definition")t.Rows[0][1]=DBNull.Value;
        }
        if(tag=="target-environment")
        {
            if(fault=="durability")t.Rows[0][5]=0;
            if(fault=="hidden")t.Rows[0][8]=0;
            if(fault=="ambient-count")t.Rows[0][0]=0;
            if(fault=="broken-state")t.Rows[0][1]=0;
            if(fault=="wrong-isolation")t.Rows[0][2]=0;
        }
        return t;
    }
    [Theory]
    [InlineData("admission","foreign")][InlineData("read","foreign")][InlineData("execute","foreign")][InlineData("reconcile","foreign")]
    [InlineData("admission","broken")][InlineData("read","broken")][InlineData("execute","broken")][InlineData("reconcile","broken")]
    [InlineData("admission","isolation")][InlineData("read","isolation")][InlineData("execute","isolation")][InlineData("reconcile","isolation")]
    public async Task Foreign_broken_or_wrong_isolation_transactions_never_reach_business(string path,string fault)
    {
        var m=Model();m.ForeignTransaction=fault=="foreign";m.BrokenTransaction=fault=="broken";m.WrongIsolation=fault=="isolation";
        var f=Factory(m);var c=f.CreateCommands(m.ResolveAsync,m.InspectAsync);
        if(path=="admission")Assert.Equal(InboundDraftCommandAuthorityOutcome.Unavailable,(await f.CreateAuthorityReader(m.ResolveAsync,m.InspectAsync).ReadAsync("DOC-IN-1")).Outcome);
        else if(path=="read")Assert.Equal(InboundDraftOutcome.Unavailable,(await c.ReadAsync("DOC-IN-1")).Outcome);
        else
        {
            var r=new InboundDraftCommand(Guid.NewGuid(),InboundDraftAction.Save,"DOC-IN-1",new string('A',64),InboundModel.Header);
            Assert.Equal(InboundDraftOutcome.Unavailable,(path=="execute"?await c.ExecuteAsync(r):await c.ReconcileAsync(r)).Outcome);
        }
        Assert.Empty(m.Commands);Assert.Equal(fault=="isolation"?1:0,m.TransactionDisposes);
    }
    [Theory]
    [InlineData("admission")][InlineData("read")][InlineData("execute")][InlineData("reconcile")]
    public async Task Ambient_transaction_is_rejected_before_session_or_connection_work(string path)
    {
        var m=Model();var f=Factory(m);var calls=0;
        Task<AuthoritativeIdentity?> Resolve(CancellationToken ct){calls++;return m.ResolveAsync(ct);}
        using var ambient=new System.Transactions.TransactionScope(System.Transactions.TransactionScopeAsyncFlowOption.Enabled);
        var commands=f.CreateCommands(Resolve,m.InspectAsync);
        if(path=="admission")Assert.Equal(InboundDraftCommandAuthorityOutcome.Unavailable,(await f.CreateAuthorityReader(Resolve,m.InspectAsync).ReadAsync("DOC-IN-1")).Outcome);
        else if(path=="read")Assert.Equal(InboundDraftOutcome.Unavailable,(await commands.ReadAsync("DOC-IN-1")).Outcome);
        else
        {
            var r=new InboundDraftCommand(Guid.NewGuid(),InboundDraftAction.Save,"DOC-IN-1",new string('A',64),InboundModel.Header);
            Assert.Equal(InboundDraftOutcome.Unavailable,(path=="execute"?await commands.ExecuteAsync(r):await commands.ReconcileAsync(r)).Outcome);
        }
        Assert.Equal(0,calls);Assert.Equal(0,m.FactoryCalls);Assert.Empty(m.Commands);
    }

    [Theory]
    [InlineData("foreign")][InlineData("broken")][InlineData("isolation")]
    public async Task Effects_phase_rechecks_managed_transaction_ownership_after_durable_reservation(string fault)
    {
        var m=Model();var c=Factory(m).CreateCommands(m.ResolveAsync,m.InspectAsync);
        var read=await c.ReadAsync("DOC-IN-1");var r=new InboundDraftCommand(Guid.NewGuid(),InboundDraftAction.Save,"DOC-IN-1",read.Document!.StateEqualityToken,InboundModel.Header);
        var at=0;
        m.OnEvent=tag=>
        {
            if(tag!="connection-dispose" || m.CommitAcks!=1 || at!=0)return;
            at=m.Commands.Count;
            m.ForeignTransaction=fault=="foreign";m.BrokenTransaction=fault=="broken";m.WrongIsolation=fault=="isolation";
        };
        var result=await c.ExecuteAsync(r);Assert.Equal(InboundDraftOutcome.Unavailable,result.Outcome);Assert.Null(result.Receipt);
        Assert.True(at>0);Assert.Equal(at,m.Commands.Count);Assert.Equal(1,m.CommitAcks);Assert.Equal(0,m.BusinessWrites);
        Assert.Equal(r.OperationId,m.Journal.Rows[0]["OperationId"]);Assert.Equal(0,m.Journal.Rows[0]["State"]);
    }

}
