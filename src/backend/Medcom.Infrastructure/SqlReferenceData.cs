using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Runtime.CompilerServices;
using Medcom.Application;
using Medcom.Contracts;
using Medcom.Infrastructure.Erp;
namespace Medcom.Infrastructure;

public sealed class SqlReferenceData:IReferenceData
{
    internal const int MaximumKeys=1000;
    private readonly LegacyCompany company;
    private readonly Func<DbConnection> connections;
    private readonly Func<CancellationToken,Task<AuthoritativeIdentity?>> resolve,inspect;
    private readonly ConditionalWeakTable<DbConnection,object> issued=new();
    public SqlReferenceData(LegacyCompany company,SqlLegacyUserStore store,
        Func<CancellationToken,Task<AuthoritativeIdentity?>> resolve,Func<CancellationToken,Task<AuthoritativeIdentity?>> inspect)
        :this(company,()=>store.CreateErpCommandConnection(),resolve,inspect) { }
    internal SqlReferenceData(LegacyCompany company,Func<DbConnection> connections,
        Func<CancellationToken,Task<AuthoritativeIdentity?>> resolve,Func<CancellationToken,Task<AuthoritativeIdentity?>> inspect)
    {this.company=company;this.connections=connections;this.resolve=resolve;this.inspect=inspect;}
    public Task<ErpReadResult<IReadOnlyDictionary<ReferenceKey,ReferenceValue>>> ReadAsync(IReadOnlyList<ReferenceKey> keys,CancellationToken token)
    {
        if(keys.Count>MaximumKeys||keys.Any(x=>ApiReferenceCatalog.Get(x.Binding)is null||x.Key.Length>250))
            return Task.FromResult(new ErpReadResult<IReadOnlyDictionary<ReferenceKey,ReferenceValue>>(ErpReadOutcome.Invalid));
        var copy=keys.Distinct().ToArray();
        return Run<IReadOnlyDictionary<ReferenceKey,ReferenceValue>>(async(transaction,identity)=>
        {
            var result=new Dictionary<ReferenceKey,ReferenceValue>();
            var groups=copy.GroupBy(x=>x.Binding,StringComparer.Ordinal).ToArray();
            var shapes=await Shapes(transaction,groups.Select(g=>ApiReferenceCatalog.Get(g.Key)!).ToArray(),token);
            foreach(var group in groups)
            {
                var binding=ApiReferenceCatalog.Get(group.Key)!;
                if(!shapes[binding.Id])
                {foreach(var key in group)result[key]=new(null,"unavailable",new Dictionary<string,string?>());continue;}
                foreach(var batch in group.Chunk(100))
                    foreach(var pair in await ReadBatch(transaction,binding,batch,token))result.Add(pair.Key,pair.Value);
            }
            return new(ErpReadOutcome.Success,result);
        },token);
    }
    public Task<ErpReadResult<BranchChoicePage>> BranchesAsync(int page,int size,string? search,CancellationToken token)
    {
        if(page is <1 or >1000||size is <1 or >100||search?.Length>100||!ErpInputRules.Text(search,false))
            return Task.FromResult(new ErpReadResult<BranchChoicePage>(ErpReadOutcome.Invalid));
        return Run<BranchChoicePage>(async(transaction,identity)=>
        {
            var binding=ApiReferenceCatalog.Get("branch")!;
            if(!await Shape(transaction,binding,token))return new(ErpReadOutcome.Unavailable);
            var keys=(identity.BranchIds??[]).Select(x=>new ReferenceKey("branch",x)).ToArray();
            var values=new Dictionary<ReferenceKey,ReferenceValue>();
            foreach(var batch in keys.Chunk(100))foreach(var pair in await ReadBatch(transaction,binding,batch,token))values.Add(pair.Key,pair.Value);
            if(values.Values.Any(x=>x.State!="available"||x.Name is null))return new(ErpReadOutcome.Unavailable);
            var rows=keys.Select(x=>new BranchChoice(x.Key,values[x].Name!))
                .Where(x=>search is null||x.BranchId.Contains(search,StringComparison.OrdinalIgnoreCase)||x.BranchName.Contains(search,StringComparison.OrdinalIgnoreCase))
                .OrderBy(x=>x.BranchId,StringComparer.Ordinal).ToArray();
            return new(ErpReadOutcome.Success,new(rows.Skip((page-1)*size).Take(size).ToArray(),page,size,rows.Length>page*size));
        },token);
    }
    internal static async Task<bool> Shape(DbTransaction transaction,ReferenceBinding binding,CancellationToken token)
    {
        await using var command=ErpSqlPlan.Command(transaction,"SELECT C.name,T.name,C.max_length,C.is_nullable FROM sys.columns C JOIN sys.types T ON T.user_type_id=C.user_type_id WHERE C.object_id=OBJECT_ID(@table) AND T.is_user_defined=0;");
        ErpSqlPlan.Parameter(command,"@table",DbType.String,"dbo."+binding.Table,255);
        await using var reader=await command.ExecuteReaderAsync(token);
        return await ReadShape(reader,binding,token)&&!await reader.NextResultAsync(token);
    }
    internal static async Task<IReadOnlyDictionary<string,bool>> Shapes(DbTransaction transaction,ReferenceBinding[] bindings,CancellationToken token)
    {
        if(bindings.Any(b=>ApiReferenceCatalog.Get(b.Id)!=b)||bindings.Select(b=>b.Id).Distinct(StringComparer.Ordinal).Count()!=bindings.Length)
            throw new InvalidOperationException("Finite distinct reference bindings required.");
        var result=new Dictionary<string,bool>(StringComparer.Ordinal);
        if(bindings.Length==0)return result;
        await using var command=ErpSqlPlan.Command(transaction,"");
        for(var i=0;i<bindings.Length;i++)
        {
            var parameter="@table"+i.ToString(CultureInfo.InvariantCulture);
            command.CommandText+="SELECT C.name,T.name,C.max_length,C.is_nullable FROM sys.columns C JOIN sys.types T ON T.user_type_id=C.user_type_id WHERE C.object_id=OBJECT_ID("+parameter+") AND T.is_user_defined=0;\n";
            ErpSqlPlan.Parameter(command,parameter,DbType.String,"dbo."+bindings[i].Table,255);
        }
        await using var reader=await command.ExecuteReaderAsync(token);
        for(var i=0;i<bindings.Length;i++)
        {
            result.Add(bindings[i].Id,await ReadShape(reader,bindings[i],token));
            if(await reader.NextResultAsync(token)!=(i+1<bindings.Length))throw new InvalidOperationException("Reference metadata result count changed.");
        }
        return result;
    }
    private static async Task<bool> ReadShape(DbDataReader reader,ReferenceBinding binding,CancellationToken token)
    {
        if(reader.FieldCount!=4)return false;
        var seen=new HashSet<string>(StringComparer.Ordinal);
        while(await reader.ReadAsync(token))
        {
            var name=reader.GetString(0);var column=binding.Columns.SingleOrDefault(x=>x.Name==name);
            if(column is null)continue;
            if(!seen.Add(name)||column.Type!=reader.GetString(1)||column.Nullable!=reader.GetBoolean(3))return false;
            if(column.Type is "varchar" or "nvarchar" or "char" or "nchar")
            {
                var length=column.TypeArguments=="(max)"?-1:int.Parse(column.TypeArguments!.Trim('(',')'),CultureInfo.InvariantCulture);
                if(length>0&&column.Type.StartsWith('n'))length*=2;
                if(reader.GetInt16(2)!=length)return false;
            }
        }
        return seen.Count==binding.Columns.Count;
    }
    internal static string BatchText(ReferenceBinding binding,int count)
    {
        if(ApiReferenceCatalog.Get(binding.Id)!=binding||count is <1 or >100)throw new InvalidOperationException("Finite binding required.");
        var relation=string.Join(',',Enumerable.Range(0,count).Select(i=>$"({i},@k{i})"));
        var fields=string.Join(',',new[]{binding.Key,binding.Label}.Concat(binding.Extras).Select(x=>$"S.[{x}]"));
        return $"SELECT V.Ordinal,R.* FROM (VALUES {relation}) V(Ordinal,K) OUTER APPLY (SELECT TOP(2) {fields} FROM dbo.[{binding.Table}] S WITH(HOLDLOCK) WHERE S.[{binding.Key}]=V.K AND {ErpSqlPlan.Exact("S.["+binding.Key+"]","V.K")}) R ORDER BY V.Ordinal;";
    }
    internal static async Task<IReadOnlyDictionary<ReferenceKey,ReferenceValue>> ReadBatch(DbTransaction transaction,ReferenceBinding binding,ReferenceKey[] keys,CancellationToken token)
    {
        if(keys.Length==0)return new Dictionary<ReferenceKey,ReferenceValue>();
        await using var command=ErpSqlPlan.Command(transaction,BatchText(binding,keys.Length));
        var keyColumn=binding.Columns[0];
        for(var i=0;i<keys.Length;i++)
        {
            object key=keys[i].Key;
            if(keyColumn.Type=="int")key=int.Parse(keys[i].Key,CultureInfo.InvariantCulture);
            ErpSqlPlan.Parameter(command,"@k"+i,keyColumn.Type=="int"?DbType.Int32:DbType.String,key,keyColumn.Type=="int"?0:250);
        }
        await using var reader=await command.ExecuteReaderAsync(token);
        if(reader.FieldCount!=3+binding.Extras.Count)throw new InvalidOperationException("Reference shape changed.");
        var matches=new List<(string? Name,Dictionary<string,string?> Extra)>[keys.Length];
        for(var i=0;i<matches.Length;i++)matches[i]=[];
        while(await reader.ReadAsync(token))
        {
            var index=reader.GetInt32(0);if(index<0||index>=keys.Length||matches[index].Count>=2)throw new InvalidOperationException("Reference cardinality changed.");
            if(reader.IsDBNull(1))continue;
            var exact=Convert.ToString(reader.GetValue(1),CultureInfo.InvariantCulture);
            if(exact!=keys[index].Key)throw new InvalidOperationException("Reference identity alias.");
            var extra=new Dictionary<string,string?>(StringComparer.Ordinal);
            for(var i=0;i<binding.Extras.Count;i++)extra.Add(binding.Extras[i],reader.IsDBNull(3+i)?null:reader.GetString(3+i));
            matches[index].Add((reader.IsDBNull(2)?null:reader.GetString(2),extra));
        }
        if(await reader.NextResultAsync(token))throw new InvalidOperationException("Unexpected reference result.");
        var result=new Dictionary<ReferenceKey,ReferenceValue>();
        for(var i=0;i<keys.Length;i++)
        {
            var rows=matches[i];var state=rows.Count==0?"missing":rows.Count!=1?"ambiguous"
                :rows[0].Name is null&&!binding.Columns[1].Nullable||rows[0].Name is not null&&!string.IsNullOrWhiteSpace(rows[0].Name)&&!DocumentStatusSql.ValidName(rows[0].Name,65536)
                    ||rows[0].Extra.Values.Any(x=>x?.Length>65536)?"invalid":string.IsNullOrWhiteSpace(rows[0].Name)?"unnamed":"available";
            var safe=state is "available" or "unnamed";
            result.Add(keys[i],new(safe?rows[0].Name:null,state,safe?rows[0].Extra:new Dictionary<string,string?>()));
        }
        return result;
    }
    private async Task<bool> Authority(DbTransaction transaction,AuthoritativeIdentity identity,CancellationToken token)
    {
        if(identity.TenantId!=company.TenantId||identity.CompanyId!=company.CompanyId||!ErpInputRules.AnsiIdentifier(identity.PrincipalId,100))return false;
        var observation=await SqlNativeIdentity.ReadAsync(transaction,identity.PrincipalId,
            user=>LegacyIdentityAuthority.Stamp(user)==identity.CredentialStamp,token);
        if(observation is null)return false;
        var scope=observation.Scope;
        return (identity.BranchIds??[]).Order(StringComparer.Ordinal).SequenceEqual(scope.BranchIds.Order(StringComparer.Ordinal))&&identity.BranchSelection==scope.BranchSelection;
    }
    private async Task<ErpReadResult<T>> Run<T>(Func<DbTransaction,AuthoritativeIdentity,Task<ErpReadResult<T>>> read,CancellationToken token)
    {
        if(System.Transactions.Transaction.Current is not null)return new(ErpReadOutcome.Unavailable);
        DbConnection? connection=null;DbTransaction? transaction=null;AuthoritativeIdentity? identity=null;
        var cleaned=true;var result=new ErpReadResult<T>(ErpReadOutcome.Unavailable);
        try
        {
            identity=await resolve(token);
            if(identity is null)return new(ErpReadOutcome.Denied);
            var candidate=connections();if(candidate.State!=ConnectionState.Closed||issued.TryGetValue(candidate,out _))return new(ErpReadOutcome.Unavailable);
            connection=candidate;issued.Add(connection,new object());await connection.OpenAsync(token);
            transaction=await connection.BeginTransactionAsync(IsolationLevel.Serializable,token);
            if(!ReferenceEquals(transaction.Connection,connection)||!await SqlErpScreenReader.TransactionValid(transaction,token)||!await Authority(transaction,identity,token))result=new(ErpReadOutcome.Denied);
            else
            {
                result=await read(transaction,identity);
                if(!await SqlErpScreenReader.TransactionValid(transaction,token))result=new(ErpReadOutcome.Unavailable);
                else if(!await Authority(transaction,identity,token)||!SqlErpScreenReader.SameSession(identity,await inspect(token)))result=new(ErpReadOutcome.Denied);
            }
        }
        catch(OperationCanceledException){result=new(ErpReadOutcome.Cancelled);}
        catch(Exception){result=new(ErpReadOutcome.Unavailable);}
        finally
        {
            if(transaction is not null){try{await transaction.RollbackAsync(CancellationToken.None);}catch{cleaned=false;}try{await transaction.DisposeAsync();}catch{cleaned=false;}}
            if(connection is not null){try{await connection.DisposeAsync();}catch{cleaned=false;}}
        }
        if(!cleaned)return new(ErpReadOutcome.Unavailable);
        if(result.Outcome==ErpReadOutcome.Success)
        {try{token.ThrowIfCancellationRequested();if(identity is null||!SqlErpScreenReader.SameSession(identity,await inspect(token)))return new(ErpReadOutcome.Denied);}catch(OperationCanceledException){return new(ErpReadOutcome.Cancelled);}catch(Exception){return new(ErpReadOutcome.Unavailable);}}
        return result;
    }
}
