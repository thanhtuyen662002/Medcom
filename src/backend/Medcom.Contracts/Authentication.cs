namespace Medcom.Contracts;

public sealed record LoginRequest(string Username, string Password);

public sealed record SessionView(string DisplayName, string TenantId, string CompanyId,
    string CompanyName, long AuthorityVersion, DateTimeOffset IdleExpiresAt,
    DateTimeOffset AbsoluteExpiresAt, IReadOnlyList<string> Capabilities);

public sealed record NavigationItem(string Id, string Label, string Href);

public sealed record WorkspaceView(SessionView Session, IReadOnlyList<NavigationItem> Navigation);
