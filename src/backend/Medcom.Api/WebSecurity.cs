using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace Medcom.Api;

internal static partial class WebSecurity
{
    public static string ContentSecurityPolicy(string? webRoot)
    {
        var hashes = new HashSet<string>(StringComparer.Ordinal);
        if (webRoot is not null && Directory.Exists(webRoot))
        {
            // Exported Next pages contain build-generated inline hydration scripts.
            // Hash their exact bytes rather than enabling arbitrary inline scripts.
            foreach (var file in Directory.EnumerateFiles(webRoot, "*.html", SearchOption.AllDirectories))
                foreach (Match match in InlineScripts().Matches(File.ReadAllText(file)))
                    if (!ScriptSource().IsMatch(match.Groups[1].Value))
                        hashes.Add("'sha256-" + Convert.ToBase64String(SHA256.HashData(
                            Encoding.UTF8.GetBytes(match.Groups[2].Value))) + "'");
        }
        return "default-src 'self'; script-src 'self' " + string.Join(' ', hashes.Order(StringComparer.Ordinal))
            + "; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self';"
            + " frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'";
    }

    [GeneratedRegex("<script\\b([^>]*)>([\\s\\S]*?)</script>", RegexOptions.IgnoreCase)]
    private static partial Regex InlineScripts();
    [GeneratedRegex("\\bsrc\\s*=", RegexOptions.IgnoreCase)]
    private static partial Regex ScriptSource();
}
