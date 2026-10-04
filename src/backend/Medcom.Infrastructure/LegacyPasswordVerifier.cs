using System.Diagnostics;
using System.Text.Json;

namespace Medcom.Infrastructure;

public enum PasswordOutcome { Accepted, Rejected, Unavailable }
public interface ILegacyPasswordVerifier
{
    Task<PasswordOutcome> VerifyAsync(string username, string password, string storedHash,
        CancellationToken cancellationToken);
}

public sealed record LegacyPasswordOptions(string DotnetPath, string WorkerPath, string ToolsPath);

public sealed class LegacyPasswordVerifier(LegacyPasswordOptions options) : ILegacyPasswordVerifier
{
    public async Task<PasswordOutcome> VerifyAsync(string username, string password, string storedHash,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(username) || username.Length > 100 || password.Length is 0 or > 1024
            || storedHash.Length is 0 or > 200) return PasswordOutcome.Rejected;
        if (!Path.IsPathFullyQualified(options.WorkerPath) || !Path.IsPathFullyQualified(options.ToolsPath)
            || !File.Exists(options.WorkerPath) || !File.Exists(options.ToolsPath)) return PasswordOutcome.Unavailable;
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(5));
        using var process = new Process
        {
            StartInfo = new ProcessStartInfo(options.DotnetPath)
            {
                UseShellExecute = false, RedirectStandardInput = true,
                RedirectStandardOutput = true, RedirectStandardError = true,
                CreateNoWindow = true
            }
        };
        process.StartInfo.ArgumentList.Add(options.WorkerPath);
        process.StartInfo.ArgumentList.Add(options.ToolsPath);
        try
        {
            if (!process.Start()) return PasswordOutcome.Unavailable;
            using var stop = timeout.Token.Register(() =>
            {
                try { if (!process.HasExited) process.Kill(entireProcessTree: true); }
                catch (InvalidOperationException) { }
            });
            await process.StandardInput.WriteAsync(JsonSerializer.Serialize(new
                { Username = username, Password = password, StoredHash = storedHash }).AsMemory(), timeout.Token);
            process.StandardInput.Close();
            var buffer = new char[129];
            var length = 0;
            while (length < buffer.Length)
            {
                var count = await process.StandardOutput.ReadAsync(buffer.AsMemory(length), timeout.Token);
                if (count == 0) break;
                length += count;
            }
            if (length == buffer.Length) return PasswordOutcome.Unavailable;
            await process.WaitForExitAsync(timeout.Token);
            if (process.ExitCode != 0) return PasswordOutcome.Unavailable;
            using var response = JsonDocument.Parse(new string(buffer, 0, length));
            if (response.RootElement.ValueKind != JsonValueKind.Object
                || response.RootElement.EnumerateObject().Count() != 1) return PasswordOutcome.Unavailable;
            return response.RootElement.GetProperty("outcome").GetString() switch
            {
                "accepted" => PasswordOutcome.Accepted,
                "rejected" => PasswordOutcome.Rejected,
                _ => PasswordOutcome.Unavailable
            };
        }
        catch (Exception) when (!cancellationToken.IsCancellationRequested) { return PasswordOutcome.Unavailable; }
        finally
        {
            try { if (!process.HasExited) process.Kill(entireProcessTree: true); }
            catch (InvalidOperationException) { }
        }
    }
}
