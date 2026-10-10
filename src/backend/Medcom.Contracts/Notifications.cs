using System.Text.Json.Serialization;
namespace Medcom.Contracts;

// All 22 current SY_NotifyMsgTbl columns, including nullable values.
// Calendar timestamps retain SQL wall-clock values, without inventing a timezone.
public sealed record NotificationRow(int Id, string FromUserId, string ToUserId, string Title,
    string Message, string MsgTime, string NotifyType, string? ColorHex, string SourceSystem,
    string? ErpFormName, string? WebFormName, string? WebRoute, string? DocumentId, string? OrderNo,
    int? StatusId, bool IsView, string? ViewDate, bool IsActive, bool ShowErp, bool ShowWeb,
    string? ExpireAt, string? EventKey);
public sealed record NotificationPage(int Page, int PageSize, long TotalRows, long UnreadCount,
    IReadOnlyList<NotificationRow> Rows);
public sealed record NotificationReadRequest([property: JsonRequired] bool IsView);
public sealed record NotificationTarget(bool CanOpen, string? Reason, string? ModuleId,
    string? FormId, string? DocumentId, string? BranchId, string? DetailApi);
