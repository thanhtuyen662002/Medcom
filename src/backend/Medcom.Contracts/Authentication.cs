namespace Medcom.Contracts;

public sealed record LoginRequest(string Username, string Password);

public sealed record SessionView(string DisplayName, string TenantId, string CompanyId,
    string CompanyName, long AuthorityVersion, DateTimeOffset IdleExpiresAt,
    DateTimeOffset AbsoluteExpiresAt, IReadOnlyList<string> Capabilities);

public sealed record NavigationItem(string Id, string Label, string Href);

// Presentation semantics from successful native resolution, never a branch grant.
// Null means unavailable (including older identities without metadata).
public sealed record BranchSelection(string Mode, string? AssignedBranchId, bool FilterLocked);

public sealed record WorkspaceView(SessionView Session, IReadOnlyList<NavigationItem> Navigation,
    IReadOnlyList<string> BranchIds, BranchSelection? BranchSelection = null);
