using Medcom.Application;
using Medcom.Contracts;
using Medcom.Infrastructure.Erp;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration.Memory;
using Microsoft.Extensions.Configuration.EnvironmentVariables;

namespace Medcom.Api;

public sealed record ErpWriteSettings(Guid Binding, string Database, string[] Modules);

public static class ErpWriteStartup
{
    public const string Section = "Medcom:ErpWrites";
    internal static ErpWriteSettings? Read(ConfigurationManager configuration)
    {
        if (!configuration.GetSection(Section).Exists()) return null;
        try
        {
            var providers = ((IConfigurationRoot)configuration).Providers.ToArray();
            var markers = configuration.Sources.Select((source, index) => (source, index))
                .Where(item => item.source is MemoryConfigurationSource { InitialData: Dictionary<string, string?> values }
                    && values.Count == 1 && values.ContainsKey(ServerConfiguration.PrivateConfigPathKey)).Select(item => item.index).ToArray();
            if (providers.Length != configuration.Sources.Count) throw new InvalidOperationException();
            string[] ActiveKeys(IConfigurationProvider provider)=>provider.GetChildKeys([],Section)
                .Where(key=>!key.Equals("SchemaFingerprint",StringComparison.OrdinalIgnoreCase))
                .Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToArray();
            // Retired fingerprint-only environment/file settings are inert, including overlays.
            var candidates = providers.Where(provider => provider.TryGet(Section, out _) || ActiveKeys(provider).Length>0).ToArray();
            if(candidates.Length==0)return null;
            var source = candidates[^1];
            // The ordinary host adds environment variables before and after loading its
            // private file. These repeated snapshots must agree byte-for-byte.
            if (candidates.Length > 1)
            {
                if (candidates.Any(provider => provider is not EnvironmentVariablesConfigurationProvider)) throw new InvalidOperationException();
                var names = ActiveKeys(source);
                foreach (var provider in candidates)
                {
                    if (!names.SequenceEqual(ActiveKeys(provider))) throw new InvalidOperationException();
                    foreach (var name in names)
                    {
                        source.TryGet(Section + ":" + name, out var expected); provider.TryGet(Section + ":" + name, out var actual);
                        if (actual != expected) throw new InvalidOperationException();
                    }
                }
            }
            var protectedFile = markers.Length == 1 && markers[0] > 0
                && configuration.Sources[markers[0] - 1] is MemoryConfigurationSource && ReferenceEquals(source, providers[markers[0] - 1]);
            // Container operators already supply SQL/legacy settings through environment
            // variables. Accept one complete operator provider, never public appsettings,
            // HTTP or command-line activation, and never merge an incomplete permit.
            if (!protectedFile && source is not EnvironmentVariablesConfigurationProvider) throw new InvalidOperationException();
            var fields = ActiveKeys(source);
            var allowed = new[] { "DatabaseBindingId", "Database", "Modules" };
            if (fields.Except(allowed, StringComparer.Ordinal).Any()) throw new InvalidOperationException();
            string? Value(string field)
            {
                var key = Section + ":" + field;
                if (!source.TryGet(key, out var value) || string.IsNullOrEmpty(value))
                    throw new InvalidOperationException();
                if (value != value.Trim() || value.Any(char.IsControl) || source.GetChildKeys([], key).Any()) throw new InvalidOperationException();
                return value;
            }
            if (!Guid.TryParseExact(Value("DatabaseBindingId"), "D", out var binding) || binding == Guid.Empty) throw new InvalidOperationException();
            var database = Value("Database")!;
            var target = new SqlConnectionStringBuilder(ServerConfiguration.ResolveConnectionString(configuration));
            if (database != target.InitialCatalog) throw new InvalidOperationException();
            var modules = Value("Modules")!.Split(';');
            if (modules.Length == 0 || modules.Length != modules.Distinct(StringComparer.Ordinal).Count()
                || modules.Any(module => ErpScreenCatalog.Get(module) is null)) throw new InvalidOperationException();
            return new(binding, database, modules);
        }
        catch (Exception error) when (error is ArgumentException or InvalidOperationException or FormatException)
        { throw new InvalidOperationException("Complete protected ERP write configuration required."); }
    }
}
