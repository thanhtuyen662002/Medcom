using System.Data;
using System.Data.Common;
using Medcom.Application;
using Medcom.Contracts;

namespace Medcom.Infrastructure.Erp;

internal static class SqlErpAttachmentStore
{
    internal static string? Table(string module)=>module switch
    {"purchase-orders"=>"AP_POAttachTbl","sales-orders" or "sales-order-pm" or "sales-order-sa"=>"AR_OrderAttachTbl",
        "inbound-requests"=>"IV_InboundRequestAttachTbl",_=>null};
    internal sealed record Row(string Id,string Name,int? Slot,int? FileType,long Length,string? ContentHash,string? PreviewHash)
    {
        internal string Token=>ErpInputRules.Fingerprint(new object?[]{Id,Name,Slot,FileType,Length,ContentHash,PreviewHash});
        internal ErpAttachmentRow Public(string module,string branch,string document)
        {
            var url="/api/erp/"+module+"/attachments/content?branchId="+Uri.EscapeDataString(branch)+"&documentId="+Uri.EscapeDataString(document)+"&attachmentId="+Uri.EscapeDataString(Id);
            return new(Id,Name,Slot,ErpAttachmentCatalog.Slots(module).FirstOrDefault(s=>s.SlotId==Slot)?.SlotName??"",
                FileType,FileType switch{0=>"Tệp",1=>"Ảnh",_=>""},Length,Token,url,url+"&preview=true");
        }
    }
    internal static string MetadataSql(string module,bool update=false)=>"""
        SELECT UserAutoID,FileName,TRY_CONVERT(int,STT),FileType,CONVERT(bigint,COALESCE(DATALENGTH(Content),0)),
          CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),Content)),2),
          CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),Content2)),2)
        FROM dbo.[
        """.TrimEnd()+Table(module)+"] WITH("+(update?"UPDLOCK,":"")+"HOLDLOCK) WHERE "+ErpSqlPlan.Exact("DocumentID","@document");
    internal static void Document(DbCommand command,string document)=>ErpSqlPlan.Parameter(command,"@document",DbType.AnsiString,document,50);
    private static Row Read(DbDataReader data)=>new(data.GetString(0),data.IsDBNull(1)?"":data.GetString(1),data.IsDBNull(2)?null:data.GetInt32(2),
        data.IsDBNull(3)?null:data.GetInt32(3),data.GetInt64(4),data.IsDBNull(5)?null:data.GetString(5),data.IsDBNull(6)?null:data.GetString(6));
    internal static async Task<IReadOnlyList<Row>> List(DbTransaction transaction,string module,string document,int page,int size,CancellationToken token)
    {
        await using var command=ErpSqlPlan.Command(transaction,MetadataSql(module)+" ORDER BY CONVERT(varbinary(100),UserAutoID) OFFSET @offset ROWS FETCH NEXT @take ROWS ONLY;");
        Document(command,document);ErpSqlPlan.Parameter(command,"@offset",DbType.Int32,(page-1)*size);ErpSqlPlan.Parameter(command,"@take",DbType.Int32,size+1);
        await using var data=await command.ExecuteReaderAsync(token);var result=new List<Row>();
        while(await data.ReadAsync(token)){if(result.Count>size)throw new InvalidOperationException("Attachment page limit.");result.Add(Read(data));}
        if(await data.NextResultAsync(token))throw new InvalidOperationException("Unexpected attachment result.");return result;
    }
    internal static async Task<Row?> Find(DbTransaction transaction,string module,string document,string attachment,CancellationToken token)
    {
        await using var command=ErpSqlPlan.Command(transaction,MetadataSql(module,true)+" AND "+ErpSqlPlan.Exact("UserAutoID","@attachment")+";");
        Document(command,document);ErpSqlPlan.Parameter(command,"@attachment",DbType.AnsiString,attachment,50);
        await using var data=await command.ExecuteReaderAsync(token);if(!await data.ReadAsync(token))return null;
        var row=Read(data);if(await data.ReadAsync(token)||await data.NextResultAsync(token))throw new InvalidOperationException("Ambiguous attachment.");return row;
    }
    internal static async Task<bool> SlotOccupied(DbTransaction transaction,string module,string document,int slot,CancellationToken token)
    {
        await using var command=ErpSqlPlan.Command(transaction,"SELECT COUNT_BIG(*) FROM dbo.["+Table(module)+"] WITH(UPDLOCK,HOLDLOCK) WHERE "+ErpSqlPlan.Exact("DocumentID","@document")+" AND TRY_CONVERT(int,STT)=@slot;");
        Document(command,document);ErpSqlPlan.Parameter(command,"@slot",DbType.Int32,slot);return (long)(await command.ExecuteScalarAsync(token))!>0;
    }
    internal static async Task<bool> Compatible(DbTransaction transaction,string module,CancellationToken token)
    {
        await using var command=ErpSqlPlan.Command(transaction,"SELECT C.name,T.name,C.max_length,C.is_identity,C.is_computed FROM sys.columns C JOIN sys.types T ON T.user_type_id=C.user_type_id WHERE C.object_id=OBJECT_ID(@table,'U');");
        ErpSqlPlan.Parameter(command,"@table",DbType.String,"dbo."+Table(module),255);
        var expected=new HashSet<string>(["UserAutoID","DocumentID","FileName","STT","FileType","Content","Content2"],StringComparer.Ordinal);
        await using var data=await command.ExecuteReaderAsync(token);
        while(await data.ReadAsync(token))
        {
            var column=data.GetString(0);if(!expected.Contains(column))continue;
            if(data.GetBoolean(3)||data.GetBoolean(4))return false;var type=data.GetString(1);var length=data.GetInt16(2);
            var valid=column switch
            {"UserAutoID"=>type=="varchar"&&length>=36,"DocumentID"=>type=="varchar"&&length>=(module=="purchase-orders"?30:50),
                "FileName"=>type=="nvarchar"&&(length==-1||length>=400),"STT"=>type is "int" or "nvarchar", "FileType"=>type=="int",
                _=>type=="image"||type=="varbinary"&&length==-1};
            if(!valid)return false;expected.Remove(column);
        }
        return expected.Count==0&&!await data.NextResultAsync(token);
    }
    internal static async Task<ErpAttachmentContent?> Content(DbTransaction transaction,string module,string document,string attachment,bool preview,CancellationToken token)
    {
        var value=preview?"CASE WHEN DATALENGTH(Content2)>0 THEN CONVERT(varbinary(max),Content2) ELSE CONVERT(varbinary(max),Content) END":"CONVERT(varbinary(max),Content)";
        await using var command=ErpSqlPlan.Command(transaction,"SELECT FileName,"+value+" FROM dbo.["+Table(module)+"] WITH(HOLDLOCK) WHERE "+ErpSqlPlan.Exact("DocumentID","@document")+" AND "+ErpSqlPlan.Exact("UserAutoID","@attachment")+" AND DATALENGTH("+value+") BETWEEN 1 AND @maximum;");
        Document(command,document);ErpSqlPlan.Parameter(command,"@attachment",DbType.AnsiString,attachment,50);
        ErpSqlPlan.Parameter(command,"@maximum",DbType.Int32,ErpAttachmentCatalog.MaximumFileBytes);
        await using var data=await command.ExecuteReaderAsync(token);if(!await data.ReadAsync(token))return null;
        var name=data.IsDBNull(0)?"attachment":data.GetString(0);await using var stream=data.GetStream(1);using var buffer=new MemoryStream();var chunk=new byte[81920];
        while(true){var count=await stream.ReadAsync(chunk,token);if(count==0)break;if(buffer.Length+count>ErpAttachmentCatalog.MaximumFileBytes)throw new InvalidOperationException("Attachment content limit.");buffer.Write(chunk,0,count);}
        if(await data.ReadAsync(token)||await data.NextResultAsync(token))throw new InvalidOperationException("Ambiguous attachment.");
        var bytes=buffer.ToArray();return new(bytes,ErpAttachmentRules.ImageType(bytes)??"application/octet-stream",ErpAttachmentRules.Name(name)?name:"attachment");
    }
    internal static async Task Write(DbTransaction transaction,string module,string document,string id,int? slot,string name,byte[] bytes,byte[] preview,string actor,bool update,CancellationToken token)
    {
        var table=Table(module)!;
        var sql=update?"UPDATE dbo.["+table+"] SET FileName=@name,FileType=1,Content=@content,Content2=@preview WHERE "+ErpSqlPlan.Exact("DocumentID","@document")+" AND "+ErpSqlPlan.Exact("UserAutoID","@id")+";"
            :"INSERT dbo.["+table+"](UserAutoID,DocumentID,FileName,FileType,STT,Content,Content2"+(module=="purchase-orders"?",UserCreate,DateCreate":"")+") VALUES(@id,@document,@name,1,@slot,@content,@preview"+(module=="purchase-orders"?",@actor,SYSUTCDATETIME()":"")+");";
        await using var command=ErpSqlPlan.Command(transaction,sql);Document(command,document);ErpSqlPlan.Parameter(command,"@id",DbType.AnsiString,id,50);
        ErpSqlPlan.Parameter(command,"@name",DbType.String,name,500);ErpSqlPlan.Parameter(command,"@slot",module=="purchase-orders"||module=="inbound-requests"?DbType.Int32:DbType.String,slot is null?null:module=="purchase-orders"||module=="inbound-requests"?slot.Value:slot.Value.ToString(System.Globalization.CultureInfo.InvariantCulture),100);
        ErpSqlPlan.Parameter(command,"@content",DbType.Binary,bytes,bytes.Length);ErpSqlPlan.Parameter(command,"@preview",DbType.Binary,preview,preview.Length);
        if(module=="purchase-orders")ErpSqlPlan.Parameter(command,"@actor",DbType.AnsiString,actor.Length<=50?actor:null,50);
        if(await command.ExecuteNonQueryAsync(token)!=1)throw new InvalidOperationException("Attachment write cardinality.");
    }
    internal static async Task Delete(DbTransaction transaction,string module,string document,string attachment,CancellationToken token)
    {
        await using var command=ErpSqlPlan.Command(transaction,"DELETE dbo.["+Table(module)+"] WHERE "+ErpSqlPlan.Exact("DocumentID","@document")+" AND "+ErpSqlPlan.Exact("UserAutoID","@id")+";");
        Document(command,document);ErpSqlPlan.Parameter(command,"@id",DbType.AnsiString,attachment,50);
        if(await command.ExecuteNonQueryAsync(token)!=1)throw new InvalidOperationException("Attachment delete cardinality.");
    }
    internal static async Task DeleteForDocument(DbTransaction transaction,string module,string document,CancellationToken token)
    {
        if(Table(module)is not {} table)return;
        await using var count=ErpSqlPlan.Command(transaction,"SELECT COUNT_BIG(*) FROM dbo.["+table+"] WITH(UPDLOCK,HOLDLOCK) WHERE "+ErpSqlPlan.Exact("DocumentID","@document")+";");Document(count,document);
        var expected=(long)(await count.ExecuteScalarAsync(token))!;
        if(expected==0)return;
        await using var command=ErpSqlPlan.Command(transaction,"DELETE dbo.["+table+"] WHERE "+ErpSqlPlan.Exact("DocumentID","@document")+";");Document(command,document);
        if(await command.ExecuteNonQueryAsync(token)!=expected)throw new InvalidOperationException("Attachment cleanup cardinality.");
    }
}
