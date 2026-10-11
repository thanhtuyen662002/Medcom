using System.Data;
using System.Data.Common;
using Medcom.Application;
using Medcom.Contracts;
namespace Medcom.Infrastructure.Erp;

public sealed partial class SqlErpScreenCommands
{
    private static async Task TransferSync(DbTransaction transaction,AuthoritativeIdentity actor,string batch,CancellationToken token)
    {
        // The pinned native sync has an unscoped UPDATE of every orphan status-40 request.
        // Preserve its batch/detail/asset effects with explicit batch custody. Only the
        // most recent native batch-association log can identify a removed request owner.
        await using var guard=ErpSqlPlan.Command(transaction,"""
            SELECT COUNT_BIG(*) FROM dbo.IV_InternalTransferBatchRequestTbl X
            LEFT JOIN dbo.IV_InternalTransferRequestTbl R ON R.DocumentID=X.RequestID
            JOIN dbo.IV_InternalTransferBatchTbl B ON B.BatchID=X.BatchID
            LEFT JOIN dbo.IV_InternalTransferRequestDetailTbl D ON D.DocumentID=R.DocumentID
            LEFT JOIN dbo.FA_AssetTbl A ON A.AssetID=D.RequestedAssetID
            WHERE X.BatchID=@batch AND (R.DocumentID IS NULL OR R.StatusID IS NULL OR R.StatusID NOT IN(20,40) OR R.FromBranchID<>B.FromBranchID OR R.ToBranchID<>B.ToBranchID
              OR (D.IsEquipment=1 AND NULLIF(D.RequestedAssetID,'') IS NOT NULL AND (A.AssetID IS NULL OR A.ItemID<>D.ItemID)));
            """);
        ErpSqlPlan.Parameter(guard,"@batch",DbType.AnsiString,batch,30);
        Require(await guard.ExecuteScalarAsync(token)is long invalid&&invalid==0,ErpCommandOutcome.Conflict,"transfer_sync_request_invalid");
        await using var command=ErpSqlPlan.Command(transaction,"""
            DECLARE @added TABLE(DocumentID varchar(30),AssignedPM varchar(100));
            DECLARE @removed TABLE(DocumentID varchar(30),AssignedPM varchar(100));
            UPDATE dbo.IV_InternalTransferBatchRequestTbl SET AddedBy=COALESCE(AddedBy,@actor),AddedAt=COALESCE(AddedAt,GETDATE()) WHERE BatchID=@batch;
            INSERT dbo.IV_InternalTransferBatchDetailTbl(UserAutoID,BatchID,RequestID,RequestDetailID,ItemID,RequestedQty,ApprovedQty,RequestedLot,IsEquipment,Notes)
              SELECT CONVERT(varchar(40),NEWID()),@batch,R.DocumentID,D.UserAutoID,D.ItemID,D.RequestedQty,D.PMApprovedQty,D.RequestedLot,D.IsEquipment,D.Notes
              FROM dbo.IV_InternalTransferBatchRequestTbl X JOIN dbo.IV_InternalTransferRequestTbl R ON R.DocumentID=X.RequestID
              JOIN dbo.IV_InternalTransferRequestDetailTbl D ON D.DocumentID=R.DocumentID WHERE X.BatchID=@batch AND D.PMApprovedQty>0
                AND NOT EXISTS(SELECT 1 FROM dbo.IV_InternalTransferBatchDetailTbl B WHERE B.BatchID=@batch AND B.RequestDetailID=D.UserAutoID);
            INSERT dbo.IV_InternalTransferBatchAssetTbl(UserAutoID,BatchID,BatchDetailID,AssetID,AssetCondition,TechStatus,BBKCUrl,TechNotes,Technician,CheckedAt,IsDispatched,IsReceived)
              SELECT CONVERT(varchar(40),NEWID()),@batch,D.UserAutoID,R.RequestedAssetID,NULL,NULL,NULL,NULL,NULL,NULL,0,0
              FROM dbo.IV_InternalTransferBatchDetailTbl D JOIN dbo.IV_InternalTransferRequestDetailTbl R ON R.UserAutoID=D.RequestDetailID
              JOIN dbo.FA_AssetTbl A ON A.AssetID=R.RequestedAssetID AND A.ItemID=D.ItemID WHERE D.BatchID=@batch AND D.IsEquipment=1
                AND NULLIF(R.RequestedAssetID,'') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM dbo.IV_InternalTransferBatchAssetTbl X WHERE X.BatchID=@batch AND X.AssetID=R.RequestedAssetID);
            DELETE A FROM dbo.IV_InternalTransferBatchAssetTbl A WHERE A.BatchID=@batch
              AND NOT EXISTS(SELECT 1 FROM dbo.IV_InternalTransferBatchDetailTbl D
                JOIN dbo.IV_InternalTransferBatchRequestTbl X ON X.BatchID=D.BatchID AND X.RequestID=D.RequestID
                WHERE D.UserAutoID=A.BatchDetailID AND D.BatchID=@batch);
            DELETE D FROM dbo.IV_InternalTransferBatchDetailTbl D WHERE D.BatchID=@batch
              AND NOT EXISTS(SELECT 1 FROM dbo.IV_InternalTransferBatchRequestTbl X WHERE X.BatchID=@batch AND X.RequestID=D.RequestID);
            UPDATE R SET StatusID=40,UserUpdate=@actor,DateUpdate=GETDATE() OUTPUT inserted.DocumentID,inserted.AssignedPM INTO @added
              FROM dbo.IV_InternalTransferRequestTbl R JOIN dbo.IV_InternalTransferBatchRequestTbl X ON X.RequestID=R.DocumentID
              WHERE X.BatchID=@batch AND R.StatusID=20;
            UPDATE R SET StatusID=20,UserUpdate=@actor,DateUpdate=GETDATE() OUTPUT inserted.DocumentID,inserted.AssignedPM INTO @removed
              FROM dbo.IV_InternalTransferRequestTbl R JOIN dbo.IV_InternalTransferBatchTbl B ON B.BatchID=@batch
              CROSS APPLY(SELECT TOP(1) Notes FROM dbo.IV_InternalTransferRequestLogTbl L WHERE L.DocumentID=R.DocumentID AND L.StatusID=40 ORDER BY ThoiGian DESC,UserAutoID DESC) L
              WHERE R.StatusID=40 AND R.FromBranchID=B.FromBranchID AND R.ToBranchID=B.ToBranchID
                AND L.Notes=N'Đã vào đợt điều chuyển '+@batch
                AND NOT EXISTS(SELECT 1 FROM dbo.IV_InternalTransferBatchRequestTbl X WHERE X.RequestID=R.DocumentID);
            INSERT dbo.IV_InternalTransferRequestLogTbl(UserAutoID,DocumentID,ThoiGian,UserName,StatusID,SendTo,Notes)
              SELECT CONVERT(varchar(50),NEWID()),DocumentID,GETDATE(),LEFT(@actor,50),40,AssignedPM,N'Đã vào đợt điều chuyển '+@batch FROM @added;
            INSERT dbo.IV_InternalTransferRequestLogTbl(UserAutoID,DocumentID,ThoiGian,UserName,StatusID,SendTo,Notes)
              SELECT CONVERT(varchar(50),NEWID()),DocumentID,GETDATE(),LEFT(@actor,50),20,AssignedPM,N'Đã bỏ khỏi đợt điều chuyển '+@batch FROM @removed;
            UPDATE dbo.IV_InternalTransferBatchTbl SET AssignedPM=COALESCE(AssignedPM,@actor),SendTo=COALESCE(AssignedPM,@actor),
              HasEquipment=CONVERT(bit,CASE WHEN EXISTS(SELECT 1 FROM dbo.IV_InternalTransferBatchDetailTbl WHERE BatchID=@batch AND IsEquipment=1) THEN 1 ELSE 0 END),
              UserUpdate=@actor,DateUpdate=GETDATE() WHERE BatchID=@batch;
            SELECT StatusID,AssignedPM FROM dbo.IV_InternalTransferBatchTbl WHERE BatchID=@batch;
            """);
        ErpSqlPlan.Parameter(command,"@batch",DbType.AnsiString,batch,30);ErpSqlPlan.Parameter(command,"@actor",DbType.AnsiString,actor.PrincipalId,100);
        int status;string recipient;
        await using(var data=await command.ExecuteReaderAsync(token))
        {Require(await data.ReadAsync(token),ErpCommandOutcome.Unavailable,"transfer_sync_failed");status=data.GetInt32(0);recipient=data.GetString(1);
         Require(!await data.ReadAsync(token)&&!await data.NextResultAsync(token),ErpCommandOutcome.Unavailable,"transfer_sync_failed");}
        // Same native journal helper; it leaves the owned outer transaction open.
        await NativeCheck(transaction,"IV_InternalTransfer_BatchLogStp",[("@BatchID",DbType.AnsiString,batch,50),("@User",DbType.String,actor.PrincipalId,4000),
            ("@StatusID",DbType.Int32,status,0),("@SendTo",DbType.String,recipient,-1),("@Notes",DbType.String,"Đồng bộ danh sách đề nghị",-1)],token);
    }
}
