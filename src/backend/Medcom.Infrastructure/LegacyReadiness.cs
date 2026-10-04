using Medcom.Application;
using Medcom.Contracts;
namespace Medcom.Infrastructure;

public sealed class LegacyReadiness : IPlatformReadiness
{
    private PlatformHealth snapshot = Snapshot(false,false);
    public PlatformHealth Check() => Volatile.Read(ref snapshot);
    public void Update(bool database, bool legacy) => Volatile.Write(ref snapshot,Snapshot(database,legacy));
    private static PlatformHealth Snapshot(bool database,bool legacy) => new("not_ready",Array.AsReadOnly(new[]
    {
        new DependencyHealth("process","healthy"),
        new DependencyHealth("database",database?"healthy":"unavailable"),
        new DependencyHealth("legacy_adapter",legacy?"healthy":"unavailable"),
        new DependencyHealth("business_release","unavailable")
    }));
}
