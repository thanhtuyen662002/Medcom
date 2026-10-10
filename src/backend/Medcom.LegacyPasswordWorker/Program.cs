using System.Globalization;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

// One credential check per process. No Connector, SQL, UI or legacy system-password call.
// Two separately identified owner builds. The stored-password path is verified per
// exact binary; never fall back to the legacy system-password method.
var approved = new Dictionary<string, (string Decoder, string Method, int Offset)>(StringComparer.Ordinal)
{
    ["AA8910F3BA244FC405CCAD2D322D142D40F938BE3DA94277CCD8D0814082DD61"] =
        ("hX7hrsFgi84QvlErSUI.t7Pw3nFo1Rgi635jkXA", "f7NQzhAovq8", 32224),
    ["7019A26A5129EDF44716601678EA1AADAEBDE5082DEFEBD195FF47A7452D7EC8"] =
        ("p5vE08Y4atxft941s00.OHVgRRY6BxP8p0kLAfH", "cBmkzSLbTdI", 32250)
};
var outcome = "unavailable";
try
{
    if (args.Length != 1 || !Path.IsPathFullyQualified(args[0])) throw new InvalidOperationException();
    var bytes = File.ReadAllBytes(args[0]);
    if (!approved.TryGetValue(Convert.ToHexString(SHA256.HashData(bytes)), out var profile))
        throw new InvalidOperationException();
    var chars = new char[8193];
    var length = 0;
    while (length < chars.Length)
    {
        var count = await Console.In.ReadAsync(chars.AsMemory(length));
        if (count == 0) break;
        length += count;
    }
    if (length == chars.Length) throw new InvalidOperationException();
    var request = JsonSerializer.Deserialize<PasswordCheck>(new string(chars, 0, length),
        new JsonSerializerOptions { UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow });
    if (request is null || string.IsNullOrWhiteSpace(request.Username) || request.Username.Length > 100
        || request.Password is null || request.Password.Length is 0 or > 1024
        || request.StoredHash is null || request.StoredHash.Length is 0 or > 200)
        outcome = "rejected";
    else
    {
        CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo("vi-VN");
        var assembly = Assembly.Load(bytes);
        var hashType = assembly.GetType("Tools.MD5", true)!;
        // This offset and member are verified against the pinned EncryptUserPass IL.
        // Resolve the exact DLL's normal password composition; do not copy its algorithm.
        var decoder = assembly.GetType(profile.Decoder, true)!;
        var separator = (string)decoder.GetMethod(profile.Method, BindingFlags.Static | BindingFlags.NonPublic)!
            .Invoke(null, [profile.Offset])!;
        var hash = Activator.CreateInstance(hashType)!;
        try
        {
            var accepted = (bool)hashType.GetMethod("Verify", [typeof(string), typeof(string)])!
                .Invoke(hash, [request.Username.ToUpper() + separator + request.Password, request.StoredHash])!;
            outcome = accepted ? "accepted" : "rejected";
        }
        catch (TargetInvocationException) { outcome = "rejected"; }
    }
}
catch (Exception) { outcome = "unavailable"; }
// Do not include exceptions, usernames, passwords, hashes or decoder output in diagnostics.
Console.WriteLine(JsonSerializer.Serialize(new { outcome }));
return outcome == "unavailable" ? 2 : 0;

internal sealed record PasswordCheck(string Username, string Password, string StoredHash);
