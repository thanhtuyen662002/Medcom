using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Runtime.CompilerServices;
using Medcom.Application;
using Medcom.Contracts;
namespace Medcom.Infrastructure.Erp;

internal sealed record ErpReadSnapshot(ErpSqlPlan Plan,string Branch,string DocumentId,
    IReadOnlyDictionary<string,object?> Header,IReadOnlyList<ErpLineRow> Lines,bool LineLimitExceeded,IReadOnlyList<ErpLineRow>? Comparison=null);

internal sealed class SqlErpScreenReader
{
    private readonly LegacyCompany company;
    private readonly Func<DbConnection> connections;
    private readonly Func<CancellationToken,Task<AuthoritativeIdentity?>> resolve;
    private readonly Func<CancellationToken,Task<AuthoritativeIdentity?>>? inspect;
    private readonly ConditionalWeakTable<DbConnection,object> issued=new();
    internal SqlErpScreenReader(LegacyCompany company,Func<DbConnection> connections,
        Func<CancellationToken,Task<AuthoritativeIdentity?>> resolve,
        Func<CancellationToken,Task<AuthoritativeIdentity?>>? inspect)
    {this.company=company;this.connections=connections;this.resolve=resolve;this.inspect=inspect;}

    internal async Task<ErpReadResult<T>> Run<T>(string module,string branch,
        Func<DbTransaction,AuthoritativeIdentity,ErpSqlPlan,ErpNativeRights,Task<ErpReadResult<T>>> read,CancellationToken token)
    {
        if(ErpSqlPlan.Get(module)is not {} plan||!ErpInputRules.AnsiIdentifier(branch,50))return new(ErpReadOutcome.Invalid);
        if(inspect is null||System.Transactions.Transaction.Current is not null)return new(ErpReadOutcome.Unavailable);
        DbConnection? connection=null;DbTransaction? transaction=null;var cleaned=true;
        AuthoritativeIdentity? originalIdentity=null;
        var result=new ErpReadResult<T>(ErpReadOutcome.Unavailable);
        async Task<ErpReadResult<T>> Observe()
        {
            var identity=await resolve(token);
            originalIdentity=identity;
            if(identity is null||identity.BranchIds?.Contains(branch,StringComparer.Ordinal)!=true)return new(ErpReadOutcome.Denied);
            var candidate=connections();
            if(candidate is null||candidate.State!=ConnectionState.Closed||issued.TryGetValue(candidate,out _))
                return new(ErpReadOutcome.Unavailable);
            connection=candidate;
            issued.Add(connection,new object());
            await connection.OpenAsync(token);transaction=await connection.BeginTransactionAsync(IsolationLevel.Serializable,token);
            if(!ReferenceEquals(transaction.Connection,connection)||!await TransactionValid(transaction,token))return new(ErpReadOutcome.Unavailable);
            var rights=await ErpSqlAuthority.Read(transaction,company,identity,plan.Screen,branch,token);
            if(rights is null)return new(ErpReadOutcome.Denied);
            if(!await SchemaMatches(transaction,plan,token))return new(ErpReadOutcome.Unavailable,Code:"erp_source_schema_changed");
            await SqlErpScreenCommands.VerifyModuleHashes(transaction,token);
            await SqlErpScreenCommands.VerifyScreenConfiguration(transaction,plan,token);
            var observed=await read(transaction,identity,plan,rights);
            if(!await TransactionValid(transaction,token))observed=new(ErpReadOutcome.Unavailable);
            else if(await ErpSqlAuthority.Read(transaction,company,identity,plan.Screen,branch,token) is not {} after||after!=rights
                ||!SameSession(identity,await inspect(token)))observed=new(ErpReadOutcome.Denied);
            token.ThrowIfCancellationRequested();
            return observed;
        }
        try{result=await Observe();}
        catch(OperationCanceledException){result=new(ErpReadOutcome.Cancelled);}
        catch(Exception){result=new(ErpReadOutcome.Unavailable);}
        finally
        {
            // Read-only transaction cleanup is part of acceptance, including negative observations.
            if(transaction is not null)
            {try{await transaction.RollbackAsync(CancellationToken.None);}catch{cleaned=false;}
             try{await transaction.DisposeAsync();}catch{cleaned=false;}}
            if(connection is not null){try{await connection.DisposeAsync();}catch{cleaned=false;}}
        }
        if(!cleaned)return new(ErpReadOutcome.Unavailable);
        if(result.Outcome==ErpReadOutcome.Success)
        {
            try{token.ThrowIfCancellationRequested();if(originalIdentity is null||!SameSession(originalIdentity,await inspect(token)))return new(ErpReadOutcome.Denied);}
            catch(OperationCanceledException){return new(ErpReadOutcome.Cancelled);}
            catch{return new(ErpReadOutcome.Unavailable);}
        }
        return result;
    }
    internal static bool SameSession(AuthoritativeIdentity first,AuthoritativeIdentity? last)=>last is not null
        &&first.PrincipalId==last.PrincipalId&&first.TenantId==last.TenantId&&first.CompanyId==last.CompanyId
        &&first.CredentialStamp==last.CredentialStamp&&first.BranchSelection==last.BranchSelection
        &&first.Capabilities.Order(StringComparer.Ordinal).SequenceEqual(last.Capabilities.Order(StringComparer.Ordinal))
        &&(first.BranchIds??[]).Order(StringComparer.Ordinal).SequenceEqual((last.BranchIds??[]).Order(StringComparer.Ordinal));
    internal static async Task<bool> TransactionValid(DbTransaction transaction,CancellationToken token)
    {
        await using var command=ErpSqlPlan.Command(transaction,"SELECT @@TRANCOUNT,CONVERT(int,XACT_STATE());");
        await using var reader=await command.ExecuteReaderAsync(token);
        return await reader.ReadAsync(token)&&reader.FieldCount==2&&reader.GetInt32(0)==1&&reader.GetInt32(1)==1
            &&!await reader.ReadAsync(token)&&!await reader.NextResultAsync(token);
    }
    internal static async Task<bool> SchemaMatches(DbTransaction transaction,ErpSqlPlan plan,CancellationToken token)
    {
        foreach(var section in plan.Screen.Fields)
        {
            var table=section.Key switch{"header"=>plan.HeaderTable,"lines"=>plan.LineTable,"history"=>plan.HistoryTable,_=>plan.ComparisonTable};
            await using var command=ErpSqlPlan.Command(transaction,"""
                SELECT C.name,T.name,C.max_length,C.precision,C.scale,C.is_nullable,C.is_identity,C.is_computed,C.column_id
                FROM sys.columns C JOIN sys.types T ON T.user_type_id=C.user_type_id
                WHERE C.object_id=OBJECT_ID(@table,'U') AND T.is_user_defined=0 ORDER BY C.column_id;
                """);
            ErpSqlPlan.Parameter(command,"@table",DbType.String,"dbo."+table,255);
            await using var reader=await command.ExecuteReaderAsync(token);var index=0;
            while(await reader.ReadAsync(token))
            {
                if(index>=section.Value.Count)return false;
                var field=section.Value[index++];
                if(reader.GetString(0)!=field.Column||reader.GetString(1)!=field.SqlType||reader.GetBoolean(5)!=field.Nullable
                    ||reader.GetBoolean(6)||reader.GetBoolean(7)||reader.GetInt32(8)!=field.Ordinal)return false;
                var args=field.TypeArguments?.Trim('(',')').Split(',');
                if(field.SqlType is "nvarchar" or "varchar" or "char" or "nchar")
                {
                    var length=args is ["max"]?-1:int.Parse(args![0],CultureInfo.InvariantCulture)*(field.SqlType.StartsWith("n",StringComparison.Ordinal)?2:1);
                    if(reader.GetInt16(2)!=length)return false;
                }
                if(field.SqlType is "decimal" or "numeric"
                    &&(reader.GetByte(3)!=int.Parse(args![0],CultureInfo.InvariantCulture)||reader.GetByte(4)!=int.Parse(args[1],CultureInfo.InvariantCulture)))return false;
            }
            if(index!=section.Value.Count||await reader.NextResultAsync(token))return false;
        }
        return true;
    }
    internal static async Task<IReadOnlyDictionary<string,object?>?> Header(DbTransaction transaction,AuthoritativeIdentity identity,
        ErpSqlPlan plan,string branch,string document,CancellationToken token)
    {
        await using var command=ErpSqlPlan.Command(transaction,plan.HeaderText);ErpSqlPlan.Scope(command,identity,branch);
        ErpSqlPlan.Parameter(command,"@document",DbType.String,document,50);
        await using var reader=await command.ExecuteReaderAsync(token);
        if(!await reader.ReadAsync(token))return null;
        var row=await ErpSqlPlan.Row(reader,plan.Screen.Fields["header"],token);
        if(await reader.ReadAsync(token)||await reader.NextResultAsync(token))throw new InvalidOperationException("Ambiguous document identity.");
        return row;
    }
    internal static async Task<IReadOnlyList<ErpLineRow>> Lines(DbTransaction transaction,ErpSqlPlan plan,string section,
        string document,int offset,int take,CancellationToken token)
    {
        await using var command=ErpSqlPlan.Command(transaction,plan.LinesText(section));
        ErpSqlPlan.Parameter(command,"@document",DbType.String,document,50);
        ErpSqlPlan.Parameter(command,"@offset",DbType.Int32,offset);ErpSqlPlan.Parameter(command,"@take",DbType.Int32,take);
        await using var reader=await command.ExecuteReaderAsync(token);var rows=new List<ErpLineRow>();
        while(await reader.ReadAsync(token))
        {
            if(rows.Count>=take)throw new InvalidOperationException("Unbounded source response.");
            var fields=await ErpSqlPlan.Row(reader,plan.Screen.Fields[section],token);
            if(fields.GetValueOrDefault("userAutoId")is not string lineId||!ErpInputRules.Identifier(lineId,50))
                throw new InvalidOperationException("Invalid source line identity.");
            rows.Add(new(lineId,fields));
        }
        if(await reader.NextResultAsync(token))throw new InvalidOperationException("Unexpected source result set.");
        return rows.AsReadOnly();
    }
    internal static async Task<ErpReadSnapshot?> Snapshot(DbTransaction transaction,AuthoritativeIdentity identity,ErpSqlPlan plan,
        string branch,string document,CancellationToken token)
    {
        var header=await Header(transaction,identity,plan,branch,document,token);if(header is null)return null;
        var limit=plan.Module is "warehouse-qr" or "sales-qr"?ErpInputRules.MaximumScans:ErpInputRules.MaximumLines;
        var lines=await Lines(transaction,plan,"lines",document,0,limit+1,token);
        var comparison=plan.ComparisonTable is null?null:await Lines(transaction,plan,"comparison",document,0,ErpInputRules.MaximumLines+1,token);
        return new(plan,branch,document,header,lines,lines.Count>limit||comparison?.Count>ErpInputRules.MaximumLines,comparison);
    }
    internal static string StateToken(ErpReadSnapshot snapshot)=>snapshot.LineLimitExceeded?"":ErpInputRules.Fingerprint(new object[]
    {"medcom.erp.document-state.v1",snapshot.Plan.Module,snapshot.Branch,snapshot.DocumentId,snapshot.Header,snapshot.Lines,snapshot.Comparison??[]});
    internal static async Task<ErpActionContext> ActionContext(DbTransaction transaction,AuthoritativeIdentity identity,
        ErpSqlPlan plan,string branch,ErpNativeRights rights,ErpReadSnapshot? snapshot,bool qualified,CancellationToken token)
    {
        var purchase=false;var transfer=false;
        if(snapshot is not null&&plan.Module is "purchase-requests" or "internal-transfer-requests")
        {
            await using var command=ErpSqlPlan.Command(transaction,plan.Module=="purchase-requests"
                ?"SELECT CONVERT(bit,CASE WHEN EXISTS(SELECT 1 FROM dbo.AP_OrderTbl WITH(HOLDLOCK) WHERE DocumentID=@document) THEN 1 ELSE 0 END);"
                :"SELECT CONVERT(bit,CASE WHEN EXISTS(SELECT 1 FROM dbo.IV_InternalTransferBatchRequestTbl WITH(HOLDLOCK) WHERE RequestID=@document) THEN 1 ELSE 0 END);");
            ErpSqlPlan.Parameter(command,"@document",DbType.String,snapshot.DocumentId,50);
            var linked=await command.ExecuteScalarAsync(token)is true;
            purchase=plan.Module=="purchase-requests"&&linked;transfer=plan.Module=="internal-transfer-requests"&&linked;
        }
        var parts=false;
        if(snapshot is not null&&plan.Module=="machine-repairs")
        {
            await using var command=ErpSqlPlan.Command(transaction,"SELECT CONVERT(bit,CASE WHEN EXISTS(SELECT 1 FROM dbo.FA_PartServiceLinkTbl WITH(HOLDLOCK) WHERE IsActive=1 AND RepairDocumentID=@document) OR EXISTS(SELECT 1 FROM dbo.FA_PartReplacementTbl WITH(HOLDLOCK) WHERE IsActive=1 AND ServiceDocumentID=@document) THEN 1 ELSE 0 END);");
            ErpSqlPlan.Parameter(command,"@document",DbType.String,snapshot.DocumentId,50);parts=await command.ExecuteScalarAsync(token)is true;
        }
        var header=snapshot?.Header;
        return new(plan.Module,identity.PrincipalId,snapshot?.DocumentId,header?.GetValueOrDefault("statusId")as int?,
            header?.GetValueOrDefault("isLocked")is true,header?.GetValueOrDefault(plan.Module=="internal-transfer-requests"?"salesUser":"userCreate")as string,
            header?.GetValueOrDefault("contractId")as string,snapshot?.Lines.Count??0,purchase,transfer,rights,
            qualified&&snapshot?.LineLimitExceeded!=true,ContractReadQualified:plan.Module is "sales-orders" or "sales-qr",HasActivePartReferences:parts);
    }
}
