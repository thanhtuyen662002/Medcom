using Medcom.Application;
using Medcom.Contracts;

namespace Medcom.Infrastructure;

// No database or legacy adapter is configured by this bootstrap.
public sealed class UnconfiguredPlatformReadiness : IPlatformReadiness
{
    public PlatformHealth Check() => new("not_ready", Array.AsReadOnly(new[]
    {
        new DependencyHealth("process", "healthy"),
        new DependencyHealth("database", "not_configured"),
        new DependencyHealth("legacy_adapter", "not_configured")
    }));
}
