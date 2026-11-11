using System.Text.Json;
using System.Text.Json.Serialization;

namespace Medcom.Contracts;

// Web activity log ("Nhật ký thao tác"). The server stamps who/when/where on every
// row; nothing a browser sends can choose the user, session, IP or server time.

/// <summary>One browser-side interaction (screen change, button click, print...).</summary>
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record WebAuditClientEvent(Guid Id, DateTimeOffset At, string Type,
    string? Page = null, string? Target = null, string? Module = null, string? DocumentId = null,
    string? BranchId = null, JsonElement? Detail = null);

/// <summary>A batch sent by the browser. <c>SentAt</c> lets the server correct client clock skew.</summary>
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record WebAuditEventBatch(DateTimeOffset SentAt, IReadOnlyList<WebAuditClientEvent> Events);

public sealed record WebAuditEventsAccepted(int Accepted, int Rejected);

/// <summary>List row: everything except the (possibly large) request/result payloads.</summary>
public sealed record WebAuditRow(long Id, DateTimeOffset OccurredAt, string Source, string Category, string Action,
    string Outcome, string? UserName, string? DisplayName, string? RoleName, string? SessionRef, string? BranchId,
    string? Module, string? DocumentId, string? HttpMethod, string? Path, int? StatusCode, int? DurationMs,
    string? CorrelationId, string? ClientAddress, string? Page, string? Target, string? ErrorCode,
    bool HasRequestData, bool HasResultData);

public sealed record WebAuditPage(IReadOnlyList<WebAuditRow> Items, int Page, int PageSize, int TotalRows);

public sealed record WebAuditDetail(long Id, DateTimeOffset OccurredAt, string Source, string Category, string Action,
    string Outcome, string? UserName, string? DisplayName, string? RoleName, string? SessionRef, string? BranchId,
    string? Module, string? DocumentId, string? HttpMethod, string? Path, string? QueryText, int? StatusCode,
    int? DurationMs, string? CorrelationId, string? ClientAddress, string? PeerAddress, string? UserAgent,
    string? Page, string? Target, Guid? ClientEventId, DateTimeOffset? ClientTime, string? RequestData,
    string? ResultData, string? ErrorCode);
