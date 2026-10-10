using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Runtime.CompilerServices;
using Medcom.Application;
using Medcom.Contracts;
using Medcom.Infrastructure.Erp;
namespace Medcom.Infrastructure;

public sealed class SqlNotificationQueries : INotificationQueries
{
    private readonly LegacyCompany company;
    private readonly Func<DbConnection> connections;
    private readonly Func<CancellationToken,Task<AuthoritativeIdentity?>> resolve,inspect;
    private readonly ConditionalWeakTable<DbConnection,object> issued=new();
    public SqlNotificationQueries(LegacyCompany company,SqlLegacyUserStore store,
        Func<CancellationToken,Task<AuthoritativeIdentity?>> resolve,Func<CancellationToken,Task<AuthoritativeIdentity?>> inspect)
        :this(company,()=>store.CreateErpCommandConnection(),resolve,inspect) { }
    internal SqlNotificationQueries(LegacyCompany company,Func<DbConnection> connections,
        Func<CancellationToken,Task<AuthoritativeIdentity?>> resolve,Func<CancellationToken,Task<AuthoritativeIdentity?>> inspect)
    {this.company=company;this.connections=connections;this.resolve=resolve;this.inspect=inspect;}
    private const string Visible="N.ToUserID=@username AND N.ShowWeb=1 AND N.IsActive=1";
    private const string Columns="N.ID,N.FromUserID,N.ToUserID,N.Title,N.[Message],N.MsgTime,N.NotifyType,N.ColorHex,N.SourceSystem,N.ERPFormName,N.WebFormName,N.WebRoute,N.DocumentID,N.OrderNo,N.StatusID,N.IsView,N.ViewDate,N.IsActive,N.ShowERP,N.ShowWeb,N.ExpireAt,N.EventKey";
    public Task<ErpReadResult<NotificationPage>> ListAsync(int page,int size,bool unreadOnly,CancellationToken token)
    {
        if(page is <1 or >1000 || size is <1 or >100) return Task.FromResult(new ErpReadResult<NotificationPage>(ErpReadOutcome.Invalid));
        return Run<NotificationPage>(async (transaction,identity) => {
            long total,unread;
            await using(var command=Command(transaction,$"SELECT COUNT_BIG(CASE WHEN @unread=0 OR N.IsView=0 THEN 1 END),COUNT_BIG(CASE WHEN N.IsView=0 THEN 1 END) FROM dbo.SY_NotifyMsgTbl N WITH(HOLDLOCK) WHERE {Visible};",identity))
            {
                ErpSqlPlan.Parameter(command,"@unread",DbType.Boolean,unreadOnly);
                await using var reader=await command.ExecuteReaderAsync(token);if(!await reader.ReadAsync(token))throw new InvalidOperationException();
                total=reader.GetInt64(0);unread=reader.GetInt64(1);
            }
            var rows=new List<NotificationRow>();
            await using(var command=Command(transaction,$"SELECT {Columns} FROM dbo.SY_NotifyMsgTbl N WITH(HOLDLOCK) WHERE {Visible} AND (@unread=0 OR N.IsView=0) ORDER BY N.ID DESC OFFSET @offset ROWS FETCH NEXT @size ROWS ONLY;",identity))
            {
                ErpSqlPlan.Parameter(command,"@unread",DbType.Boolean,unreadOnly);ErpSqlPlan.Parameter(command,"@offset",DbType.Int32,(page-1)*size);ErpSqlPlan.Parameter(command,"@size",DbType.Int32,size);
                await using var reader=await command.ExecuteReaderAsync(token);while(await reader.ReadAsync(token))rows.Add(Row(reader));
            }
            return new(ErpReadOutcome.Success,new(page,size,total,unread,rows.AsReadOnly()));
        },false,token);
    }
    public Task<ErpReadResult<NotificationRow>> DetailAsync(int id,CancellationToken token)
        => id<=0?Task.FromResult(new ErpReadResult<NotificationRow>(ErpReadOutcome.Invalid)):
            Run<NotificationRow>((transaction,identity)=>ReadRow(transaction,identity,id,token),false,token);
    public Task<ErpReadResult<NotificationRow>> SetReadAsync(int id,bool isView,CancellationToken token)
        => id<=0?Task.FromResult(new ErpReadResult<NotificationRow>(ErpReadOutcome.Invalid)):
            Run<NotificationRow>(async(transaction,identity)=>{
                // Do not execute a changed native procedure or truncate its varchar(50) user argument.
                if(identity.PrincipalId.Length>50)return new(ErpReadOutcome.NotFound);
                await using(var pin=ErpSqlPlan.Command(transaction,"SELECT CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),definition)),2) FROM sys.sql_modules WHERE object_id=OBJECT_ID('dbo.SY_NotifyMarkReadStp');"))
                    if(await pin.ExecuteScalarAsync(token) as string != "7AF88E6DAB52888EBABC92DEC8CEA6F63EEC0C3B280FDD2225CFDFA3ABA9DB63")return new(ErpReadOutcome.Unavailable,Code:"notification_source_changed");
                await using(var command=Command(transaction,"EXEC dbo.SY_NotifyMarkReadStp @ID=@id,@User=@username,@IsView=@view;",identity))
                {
                    ErpSqlPlan.Parameter(command,"@id",DbType.Int32,id);ErpSqlPlan.Parameter(command,"@view",DbType.Boolean,isView);
                    await using var reader=await command.ExecuteReaderAsync(token);
                    if(!await reader.ReadAsync(token)||reader.FieldCount!=1)return new(ErpReadOutcome.Unavailable);
                    var count=reader.GetInt32(0);if(await reader.ReadAsync(token)||await reader.NextResultAsync(token)||count is <0 or >1)return new(ErpReadOutcome.Unavailable);
                    if(count==0)return new(ErpReadOutcome.NotFound);
                }
                return await ReadRow(transaction,identity,id,token);
            },true,token);
    private static DbCommand Command(DbTransaction transaction,string sql,AuthoritativeIdentity identity)
    {var command=ErpSqlPlan.Command(transaction,sql);ErpSqlPlan.Parameter(command,"@username",DbType.AnsiString,identity.PrincipalId,100);return command;}
    private static async Task<ErpReadResult<NotificationRow>> ReadRow(DbTransaction transaction,AuthoritativeIdentity identity,int id,CancellationToken token)
    {
        await using var command=Command(transaction,$"SELECT {Columns} FROM dbo.SY_NotifyMsgTbl N WITH(HOLDLOCK) WHERE {Visible} AND N.ID=@id;",identity);
        ErpSqlPlan.Parameter(command,"@id",DbType.Int32,id);await using var reader=await command.ExecuteReaderAsync(token);
        if(!await reader.ReadAsync(token))return new(ErpReadOutcome.NotFound);
        var row=Row(reader);if(await reader.ReadAsync(token)||await reader.NextResultAsync(token))return new(ErpReadOutcome.Unavailable);
        return new(ErpReadOutcome.Success,row);
    }
    private static NotificationRow Row(DbDataReader r)
    {
        string? Text(int i)=>r.IsDBNull(i)?null:r.GetString(i);
        string? Date(int i)=>r.IsDBNull(i)?null:r.GetDateTime(i).ToString("yyyy-MM-ddTHH:mm:ss",CultureInfo.InvariantCulture);
        return new(r.GetInt32(0),r.GetString(1),r.GetString(2),r.GetString(3),r.GetString(4),Date(5)!,r.GetString(6),Text(7),r.GetString(8),Text(9),Text(10),Text(11),Text(12),Text(13),r.IsDBNull(14)?null:r.GetInt32(14),r.GetBoolean(15),Date(16),r.GetBoolean(17),r.GetBoolean(18),r.GetBoolean(19),Date(20),Text(21));
    }
    private async Task<bool> CurrentUser(DbTransaction transaction,AuthoritativeIdentity identity,CancellationToken token)
    {
        // This principal is the canonical stored SY_User.UserName, not a client identifier.
        // Parameterization and the exact credential recheck protect it without imposing
        // document-key ASCII rules on otherwise valid ERP account names.
        if(identity.TenantId!=company.TenantId||identity.CompanyId!=company.CompanyId||string.IsNullOrEmpty(identity.CredentialStamp)
            ||string.IsNullOrWhiteSpace(identity.PrincipalId)||identity.PrincipalId.Length>100)return false;
        await using var command=Command(transaction,"SELECT TOP(2) U.UserName,U.[Password],U.[Disable],U.UserGroupID,G.IsDisable FROM dbo.SY_User U WITH(HOLDLOCK) LEFT JOIN dbo.SY_UserGroup G WITH(HOLDLOCK) ON G.UserGroupID=U.UserGroupID WHERE U.UserName=@username;",identity);
        await using var reader=await command.ExecuteReaderAsync(token);
        if(!await reader.ReadAsync(token)||Enumerable.Range(0,5).Any(reader.IsDBNull))return false;
        var user=new LegacyUser(reader.GetString(0),"",reader.GetString(1),reader.GetBoolean(2),reader.GetString(3),!reader.GetBoolean(4));
        return !await reader.ReadAsync(token)&&!await reader.NextResultAsync(token)&&user.Username==identity.PrincipalId&&!user.Disabled&&user.GroupEnabled&&LegacyIdentityAuthority.Stamp(user)==identity.CredentialStamp;
    }
    private async Task<ErpReadResult<T>> Run<T>(Func<DbTransaction,AuthoritativeIdentity,Task<ErpReadResult<T>>> operation,bool write,CancellationToken token)
    {
        if(System.Transactions.Transaction.Current is not null)return new(ErpReadOutcome.Unavailable);
        DbConnection? connection=null;DbTransaction? transaction=null;AuthoritativeIdentity? identity=null;
        var committed=false;var attempted=false;var cleaned=true;var result=new ErpReadResult<T>(ErpReadOutcome.Unavailable);
        async Task<ErpReadResult<T>> Observe() {
            identity=await resolve(token);
            if(identity is null)return new(ErpReadOutcome.Denied);
            var candidate=connections();
            if(candidate.State!=ConnectionState.Closed||issued.TryGetValue(candidate,out _))return new(ErpReadOutcome.Unavailable);
            connection=candidate;
            issued.Add(connection,new object());await connection.OpenAsync(token);
            transaction=await connection.BeginTransactionAsync(IsolationLevel.Serializable,token);
            if(!ReferenceEquals(transaction.Connection,connection)||!await SqlErpScreenReader.TransactionValid(transaction,token)||!await CurrentUser(transaction,identity,token))return new(ErpReadOutcome.Denied);
            result=await operation(transaction,identity);
            if(!await SqlErpScreenReader.TransactionValid(transaction,token))result=new(ErpReadOutcome.Unavailable);
            else if(!await CurrentUser(transaction,identity,token)||!SqlErpScreenReader.SameSession(identity,await inspect(token)))result=new(ErpReadOutcome.Denied);
            token.ThrowIfCancellationRequested();
            if(write&&result.Outcome==ErpReadOutcome.Success){attempted=true;await transaction.CommitAsync(token);committed=true;}
            return result;
        }
        try {result=await Observe();}
        catch(OperationCanceledException){result=new(ErpReadOutcome.Cancelled,Code:attempted?"notification_outcome_unknown":null);}
        catch(Exception){result=new(ErpReadOutcome.Unavailable,Code:attempted?"notification_outcome_unknown":null);}
        finally {
            if(transaction is not null){if(!committed){try{await transaction.RollbackAsync(CancellationToken.None);}catch{cleaned=false;}}try{await transaction.DisposeAsync();}catch{cleaned=false;}}
            if(connection is not null){try{await connection.DisposeAsync();}catch{cleaned=false;}}
        }
        if(!cleaned)return new(ErpReadOutcome.Unavailable,Code:attempted?"notification_outcome_unknown":null);
        if(result.Outcome==ErpReadOutcome.Success){try{token.ThrowIfCancellationRequested();if(identity is null||!SqlErpScreenReader.SameSession(identity,await inspect(token)))return new(ErpReadOutcome.Denied);}catch(OperationCanceledException){return new(ErpReadOutcome.Cancelled);}catch(Exception){return new(ErpReadOutcome.Unavailable);}}
        return result;
    }
}
