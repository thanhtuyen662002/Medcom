using System.Security.AccessControl;
using System.Security.Principal;
using System.Text.Json;
using Medcom.Application;

namespace Medcom.Infrastructure;

// Durable copy of the Web session table so a deploy/restart does not sign every
// user out. Only SHA-256 token hashes are written (never a token or password);
// every restored session is still revalidated against ERP on its next use.
public sealed class WebSessionFileStore
{
    public sealed record Snapshot(string TokenHash, AuthoritativeIdentity Identity,
        DateTimeOffset LastActivity, DateTimeOffset AbsoluteExpiry);

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly string path;

    public WebSessionFileStore(string path)
    {
        if (string.IsNullOrWhiteSpace(path) || !Path.IsPathFullyQualified(path))
            throw new ArgumentException("A fully qualified session store path is required.", nameof(path));
        this.path = path;
    }

    /// <summary>
    /// Default location: the service account's own local profile, which it can write
    /// and other users cannot read (the deploy config folder is read-only to the service).
    /// Null when the account has no profile.
    /// </summary>
    public static string? DefaultPath
    {
        get
        {
            var profile = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            return Path.IsPathFullyQualified(profile) ? Path.Combine(profile, "Medcom", "web-sessions.json") : null;
        }
    }

    /// <summary>Configured store; null when disabled with "none" or no default location exists.</summary>
    public static WebSessionFileStore? Create(string? configured)
    {
        if (string.Equals(configured?.Trim(), "none", StringComparison.OrdinalIgnoreCase)) return null;
        var path = string.IsNullOrWhiteSpace(configured) ? DefaultPath : configured.Trim();
        return path is null ? null : new WebSessionFileStore(path);
    }

    public IReadOnlyList<Snapshot> Load()
    {
        try
        {
            if (!File.Exists(path)) return [];
            var items = JsonSerializer.Deserialize<List<Snapshot>>(File.ReadAllBytes(path), Json);
            return items?.Where(item => item is { TokenHash.Length: 64, Identity: not null }).ToArray() ?? [];
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or JsonException or NotSupportedException)
        {
            // A missing, locked or corrupt file only means users sign in again.
            return [];
        }
    }

    public bool Save(IReadOnlyList<Snapshot> items)
    {
        try
        {
            var directory = Path.GetDirectoryName(path)!;
            if (!Directory.Exists(directory))
            {
                Directory.CreateDirectory(directory);
                Protect(directory);
            }
            var temporary = path + ".tmp";
            File.WriteAllBytes(temporary, JsonSerializer.SerializeToUtf8Bytes(items, Json));
            File.Move(temporary, path, overwrite: true);
            return true;
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or NotSupportedException)
        {
            // Not writable: sessions stay in memory exactly as before.
            return false;
        }
    }

    // Only the service account, SYSTEM and Administrators may read session data.
    private static void Protect(string directory)
    {
        if (!OperatingSystem.IsWindows()) return;
        var security = new DirectorySecurity();
        security.SetAccessRuleProtection(true, false);
        foreach (var identity in new IdentityReference[] { WindowsIdentity.GetCurrent().User!,
                     new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null),
                     new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null) })
            security.AddAccessRule(new FileSystemAccessRule(identity, FileSystemRights.FullControl,
                InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
        new DirectoryInfo(directory).SetAccessControl(security);
    }
}
