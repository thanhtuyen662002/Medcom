using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using Medcom.Contracts;

namespace Medcom.Application.Audit;

/// <summary>
/// One activity-log row before it is stored. Server code fills identity, time and
/// network fields; browser events only contribute Page/Target/Module/Detail.
/// </summary>
public sealed record WebAuditEntry(DateTimeOffset OccurredAt, string Source, string Category, string Action, string Outcome)
{
    public string? UserName { get; init; }
    public string? DisplayName { get; init; }
    public string? RoleName { get; init; }
    public string? SessionRef { get; init; }
    public string? BranchId { get; init; }
    public string? Module { get; init; }
    public string? DocumentId { get; init; }
    public string? HttpMethod { get; init; }
    public string? Path { get; init; }
    public string? QueryText { get; init; }
    public int? StatusCode { get; init; }
    public int? DurationMs { get; init; }
    public string? CorrelationId { get; init; }
    public string? ClientAddress { get; init; }
    public string? PeerAddress { get; init; }
    public string? UserAgent { get; init; }
    public string? Page { get; init; }
    public string? Target { get; init; }
    public Guid? ClientEventId { get; init; }
    public DateTimeOffset? ClientTime { get; init; }
    public string? RequestData { get; init; }
    public string? ResultData { get; init; }
    public string? ErrorCode { get; init; }
}

public static class WebAuditSources { public const string Server = "server"; public const string Client = "client"; }

/// <summary>Row categories shown as filters in the log screen.</summary>
public static class WebAuditCategories
{
    public const string Auth = "auth";        // sign-in, sign-out
    public const string Command = "command";  // create/save/delete/send/approve/QR...
    public const string Import = "import";    // paste from Excel, pick lines from a source document
    public const string Read = "read";        // open a list or a document
    public const string File = "file";        // attachment upload/download/delete
    public const string Ui = "ui";            // browser interactions
    public const string Audit = "audit";      // someone looked at this log
    public static readonly IReadOnlyList<string> All = [Auth, Command, Import, Read, File, Ui, Audit];
}

/// <summary>Accepts rows without blocking the request; storage happens in the background.</summary>
public interface IWebAuditSink
{
    bool Enabled { get; }
    void Write(WebAuditEntry entry);
}

public sealed class DisabledWebAuditSink : IWebAuditSink
{
    public bool Enabled => false;
    public void Write(WebAuditEntry entry) { }
}

public sealed record WebAuditQuery(DateTimeOffset? From, DateTimeOffset? To, string? UserName, string? Module,
    string? Category, string? Action, string? Outcome, string? DocumentId, string? BranchId, string? Search,
    int Page, int PageSize);

public interface IWebAuditQueries
{
    Task<WebAuditPage?> SearchAsync(WebAuditQuery query, CancellationToken cancellationToken);
    Task<WebAuditDetail?> DetailAsync(long id, CancellationToken cancellationToken);
}

/// <summary>Used when no SQL log store is configured: the log screen answers 503.</summary>
public sealed class UnavailableWebAuditQueries : IWebAuditQueries
{
    public Task<WebAuditPage?> SearchAsync(WebAuditQuery query, CancellationToken cancellationToken) => Task.FromResult<WebAuditPage?>(null);
    public Task<WebAuditDetail?> DetailAsync(long id, CancellationToken cancellationToken) => Task.FromResult<WebAuditDetail?>(null);
}

/// <summary>Which ERP accounts may open the activity log (private server configuration).</summary>
public sealed class WebAuditViewerPolicy(IEnumerable<string>? users, IEnumerable<string>? groups)
{
    public const string Capability = "audit.read";
    private readonly HashSet<string> users = new((users ?? []).Select(u => u.Trim()).Where(u => u.Length > 0), StringComparer.OrdinalIgnoreCase);
    private readonly HashSet<string> groups = new((groups ?? []).Select(g => g.Trim()).Where(g => g.Length > 0), StringComparer.OrdinalIgnoreCase);
    public static WebAuditViewerPolicy None { get; } = new(null, null);
    public bool Allows(string userName, string? groupId, string? groupName) =>
        users.Contains(userName.Trim())
        || (groupId is not null && groups.Contains(groupId.Trim()))
        || (groupName is not null && groups.Contains(groupName.Trim()));
}

/// <summary>Payload shaping: hide secrets and bound size, always producing valid JSON.</summary>
public static class WebAuditPayload
{
    public const int MaximumChars = 262_144;
    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping, WriteIndented = false };

    public static bool Secret(string name)
    {
        var key = name.Replace("_", "", StringComparison.Ordinal).Replace("-", "", StringComparison.Ordinal);
        return key.Contains("password", StringComparison.OrdinalIgnoreCase) || key.Contains("passwd", StringComparison.OrdinalIgnoreCase)
            || key.Contains("secret", StringComparison.OrdinalIgnoreCase) || key.Equals("pwd", StringComparison.OrdinalIgnoreCase)
            || key.Equals("token", StringComparison.OrdinalIgnoreCase) || key.Equals("accesstoken", StringComparison.OrdinalIgnoreCase)
            || key.Equals("refreshtoken", StringComparison.OrdinalIgnoreCase) || key.Equals("csrftoken", StringComparison.OrdinalIgnoreCase)
            || key.Equals("connectionstring", StringComparison.OrdinalIgnoreCase);
    }

    public static string? Json(JsonElement? value, int maximumChars = MaximumChars)
    {
        if (value is not { } element || element.ValueKind == JsonValueKind.Undefined) return null;
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer, new JsonWriterOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping, MaxDepth = 64 }))
            WriteRedacted(writer, element, 0);
        return Bound(Encoding.UTF8.GetString(buffer.ToArray()), maximumChars);
    }

    public static string? Json<T>(T? value, int maximumChars = MaximumChars) =>
        value is null ? null : Json(JsonSerializer.SerializeToElement(value, Options), maximumChars);

    public static string Bound(string text, int maximumChars = MaximumChars) => text.Length <= maximumChars ? text
        : JsonSerializer.Serialize(new { truncated = true, originalLength = text.Length, text = text[..Math.Max(0, maximumChars - 200)] }, Options);

    /// <summary>Plain text field bound (labels, paths, user agents).</summary>
    public static string? Text(string? value, int maximum)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var builder = new StringBuilder(Math.Min(value.Length, maximum));
        var space = false;
        foreach (var c in value.Trim())
        {
            if (char.IsControl(c) || char.IsWhiteSpace(c)) { space = true; continue; }
            if (space && builder.Length > 0) builder.Append(' ');
            space = false;
            builder.Append(c);
            if (builder.Length >= maximum) break;
        }
        return builder.Length == 0 ? null : builder.ToString(0, Math.Min(builder.Length, maximum));
    }

    private static void WriteRedacted(Utf8JsonWriter writer, JsonElement element, int depth)
    {
        if (depth > 32) { writer.WriteStringValue("…"); return; }
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                writer.WriteStartObject();
                foreach (var property in element.EnumerateObject())
                {
                    writer.WritePropertyName(property.Name);
                    if (Secret(property.Name) && property.Value.ValueKind != JsonValueKind.Null) writer.WriteStringValue("***");
                    else WriteRedacted(writer, property.Value, depth + 1);
                }
                writer.WriteEndObject();
                break;
            case JsonValueKind.Array:
                writer.WriteStartArray();
                foreach (var item in element.EnumerateArray()) WriteRedacted(writer, item, depth + 1);
                writer.WriteEndArray();
                break;
            default:
                element.WriteTo(writer);
                break;
        }
    }
}
