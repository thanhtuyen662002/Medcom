using System.Data;
using System.Data.Common;
using System.Runtime.CompilerServices;
using Medcom.Application;
using Medcom.Contracts;
namespace Medcom.Infrastructure.Erp;

// Reads only the finite native menu grants, never document tables, credentials in
// responses, caller-supplied roles or write qualification as an authority grant.
internal sealed class SqlErpPermissionsReader(LegacyCompany company,Func<DbConnection> connections,
    Func<CancellationToken,Task<AuthoritativeIdentity?>> resolve,
    Func<CancellationToken,Task<AuthoritativeIdentity?>>? inspect)
{
    private readonly ConditionalWeakTable<DbConnection,object> issued=new();
    internal async Task<ErpReadResult<ErpPermissions>> Read(string branch,CancellationToken token)
    {
        if(!ErpInputRules.AnsiIdentifier(branch,50))return new(ErpReadOutcome.Invalid);
        if(inspect is null||System.Transactions.Transaction.Current is not null)return new(ErpReadOutcome.Unavailable);
        DbConnection? connection=null;DbTransaction? transaction=null;AuthoritativeIdentity? identity=null;
        var cleaned=true;var result=new ErpReadResult<ErpPermissions>(ErpReadOutcome.Unavailable);
        async Task<ErpReadResult<ErpPermissions>> Observe()
        {
            identity=await resolve(token);
            if(identity is null||identity.BranchIds?.Contains(branch,StringComparer.Ordinal)!=true)return new(ErpReadOutcome.Denied);
            var candidate=connections();
            if(candidate is null||candidate.State!=ConnectionState.Closed||issued.TryGetValue(candidate,out _))return new(ErpReadOutcome.Unavailable);
            connection=candidate;issued.Add(connection,new object());await connection.OpenAsync(token);
            transaction=await connection.BeginTransactionAsync(IsolationLevel.Serializable,token);
            if(!ReferenceEquals(transaction.Connection,connection)||!await SqlErpScreenReader.TransactionValid(transaction,token))return new(ErpReadOutcome.Unavailable);
            var before=await ErpSqlAuthority.ReadAll(transaction,company,identity,branch,token);
            if(before is null)return new(ErpReadOutcome.Denied);
            var screens=ErpScreenCatalog.ModuleIds.Select(module=>ErpActionRules.Permissions(ErpScreenCatalog.Get(module)!,before[module])).ToArray();
            if(!await SqlErpScreenReader.TransactionValid(transaction,token))return new(ErpReadOutcome.Unavailable);
            var after=await ErpSqlAuthority.ReadAll(transaction,company,identity,branch,token);
            if(after is null||before.Any(pair=>!after.TryGetValue(pair.Key,out var value)||value!=pair.Value)
                ||!SqlErpScreenReader.SameSession(identity,await inspect(token)))return new(ErpReadOutcome.Denied);
            token.ThrowIfCancellationRequested();
            return new(ErpReadOutcome.Success,new(branch,Array.AsReadOnly(screens)));
        }
        try{result=await Observe();}
        catch(OperationCanceledException){result=new(ErpReadOutcome.Cancelled);}
        catch{result=new(ErpReadOutcome.Unavailable);}
        finally
        {
            if(transaction is not null)
            {try{await transaction.RollbackAsync(CancellationToken.None);}catch{cleaned=false;}
             try{await transaction.DisposeAsync();}catch{cleaned=false;}}
            if(connection is not null){try{await connection.DisposeAsync();}catch{cleaned=false;}}
        }
        if(!cleaned)return new(ErpReadOutcome.Unavailable);
        if(result.Outcome==ErpReadOutcome.Success)
        {
            try
            {
                token.ThrowIfCancellationRequested();
                if(identity is null||!SqlErpScreenReader.SameSession(identity,await inspect(token)))return new(ErpReadOutcome.Denied);
            }
            catch(OperationCanceledException){return new(ErpReadOutcome.Cancelled);}
            catch{return new(ErpReadOutcome.Unavailable);}
        }
        return result;
    }
}
