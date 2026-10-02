namespace Medcom.Contracts;

public sealed record DependencyHealth(string Component, string Status);

public sealed record PlatformHealth(string Status, IReadOnlyList<DependencyHealth> Checks);
