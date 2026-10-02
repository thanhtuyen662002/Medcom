using System.Globalization;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

// One credential check per process. No Connector, SQL, UI or legacy system-password call.
const string approvedSha256 = "AA8910F3BA244FC405CCAD2D322D142D40F938BE3DA94277CCD8D0814082DD61";
var outcome = "unavailable";
try
{
    if (args.Length != 1 || !Path.IsPathFullyQualified(args[0])) throw new InvalidOperationException();
    var bytes = File.ReadAllBytes(args[0]);
    if (!Convert.ToHexString(SHA256.HashData(bytes)).Equals(approvedSha256, StringComparison.Ordinal))
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
        var decoder = assembly.GetType("hX7hrsFgi84QvlErSUI.t7Pw3nFo1Rgi635jkXA", true)!;
        var separator = (string)decoder.GetMethod("f7NQzhAovq8", BindingFlags.Static | BindingFlags.NonPublic)!
            .Invoke(null, [32224])!;
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
