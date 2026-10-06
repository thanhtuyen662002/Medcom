using System.Globalization;

namespace Medcom.LocalFrontendHost;

public static class Program
{
    public static async Task<int> Main(string[] args)
    {
        try
        {
            var values = new Dictionary<string, string>(StringComparer.Ordinal);
            var checkOnly = false;
            for (var index = 0; index < args.Length; index++)
            {
                var name = args[index];
                if (name == "--check-certificate")
                {
                    if (checkOnly) return Usage();
                    checkOnly = true;
                    continue;
                }
                if (name is not ("--certificate-thumbprint" or "--https-port" or "--node-port") ||
                    index + 1 >= args.Length || !values.TryAdd(name, args[++index])) return Usage();
            }
            if (!values.TryGetValue("--certificate-thumbprint", out var thumbprint)) return Usage();
            using var certificate = DevelopmentCertificateSelector.Select(thumbprint);
            if (checkOnly)
            {
                Console.WriteLine("Local frontend certificate validated.");
                return 0;
            }
            if (!TryPort(values.GetValueOrDefault("--https-port", "5187"), out var httpsPort) ||
                !TryPort(values.GetValueOrDefault("--node-port", "3100"), out var nodePort) || httpsPort == nodePort)
                return Usage();
            await using var app = LoopbackRelay.Build(new LoopbackRelayOptions(httpsPort, nodePort), certificate);
            Console.WriteLine($"Local frontend HTTPS listener: https://localhost:{httpsPort.ToString(CultureInfo.InvariantCulture)}");
            await app.RunAsync();
            return 0;
        }
        catch (CertificateSelectionException exception)
        {
            Console.Error.WriteLine($"Local frontend certificate rejected: {exception.Code}.");
            return 78;
        }
        catch (Exception)
        {
            // Do not echo store, key, environment, request or upstream exception details.
            Console.Error.WriteLine("Local frontend HTTPS listener could not start or stopped unexpectedly.");
            return 1;
        }
    }

    private static bool TryPort(string value, out int port) =>
        int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out port) && port is >= 1024 and <= 65535;

    private static int Usage()
    {
        Console.Error.WriteLine("Usage: Medcom.LocalFrontendHost --certificate-thumbprint <40 hex characters> [--https-port 5187] [--node-port 3100] [--check-certificate]");
        return 64;
    }
}
