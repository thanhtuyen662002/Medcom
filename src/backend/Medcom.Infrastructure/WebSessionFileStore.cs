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
    /// Candidate folders, most private first. Under IIS the app pool may run without a
    /// loaded profile (LocalApplicationData then points at a folder it cannot write)
    /// and the deploy config folder is read-only to it, so fall back to a shared data
    /// folder and finally the process temp folder. Each folder is created private.
    /// </summary>
    public static IEnumerable<string> DefaultDirectories()
    {
        foreach (var directory in new[]
                 {
                     Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Medcom"),
                     Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Medcom", "sessions"),
                     Combine(Path.GetTempPath(), "Medcom-sessions")
                 })
            if (directory is not null) yield return directory;
    }

    /// <summary>
    /// Configured store (used as given), or the first default folder that can really be
    /// written; null when disabled with "none" or nothing is writable.
    /// </summary>
    public static WebSessionFileStore? Create(string? configured, IEnumerable<string>? candidates = null)
    {
        if (string.Equals(configured?.Trim(), "none", StringComparison.OrdinalIgnoreCase)) return null;
        if (!string.IsNullOrWhiteSpace(configured)) return new WebSessionFileStore(configured.Trim());
        foreach (var directory in candidates ?? DefaultDirectories())
        {
            var store = new WebSessionFileStore(Path.Combine(directory, "web-sessions.json"));
            if (store.CanWrite()) return store;
        }
        return null;
    }

    private static string? Combine(string root, params string[] parts) =>
        Path.IsPathFullyQualified(root) ? Path.Combine([root, .. parts]) : null;

    private bool CanWrite()
    {
        try
        {
            EnsureDirectory(Path.GetDirectoryName(path)!);
            var probe = path + ".probe";
            File.WriteAllBytes(probe, []);
            File.Delete(probe);
            return true;
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or NotSupportedException
            or InvalidOperationException or System.Security.SecurityException) { return false; }
    }

    private static void EnsureDirectory(string directory)
    {
        if (Directory.Exists(directory)) return;
        Directory.CreateDirectory(directory);
        Protect(directory);
    }

    public string FilePath => path;

    /// <summary>Private folder beside the session file, also used for the cookie key ring.</summary>
    public string EnsurePrivateDirectory(string name)
    {
        var directory = Path.Combine(Path.GetDirectoryName(path)!, name);
        EnsureDirectory(directory);
        return directory;
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
            EnsureDirectory(Path.GetDirectoryName(path)!);
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
