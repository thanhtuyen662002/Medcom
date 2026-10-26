using Medcom.Application;
using Medcom.Contracts;
namespace Medcom.Infrastructure;

public sealed class LegacyReadiness : IPlatformReadiness
{
    private readonly object gate = new();
    private bool database, legacy, sessionStore, cookieKeys;
    private string erpConfig = "unavailable";
    private PlatformHealth snapshot = Snapshot(false,false,false,false,"unavailable");
    public PlatformHealth Check() => Volatile.Read(ref snapshot);
    public void Update(bool database, bool legacy)
    {
        lock (gate) { this.database = database; this.legacy = legacy; Publish(); }
    }
    // Whether sign-ins survive a restart: the session table and the cookie key ring are
    // both written to disk. Only a status is exposed, never a path.
    public void UpdateSessionPersistence(bool sessionStore, bool cookieKeys)
    {
        lock (gate) { this.sessionStore = sessionStore; this.cookieKeys = cookieKeys; Publish(); }
    }
    // "healthy", "drifted" or "unavailable": whether ERP still matches the configuration the Web was built on.
    public void UpdateErpConfig(string status)
    {
        lock (gate) { erpConfig = status is "healthy" or "drifted" ? status : "unavailable"; Publish(); }
    }
    private void Publish() => Volatile.Write(ref snapshot,Snapshot(database,legacy,sessionStore,cookieKeys,erpConfig));
    private static PlatformHealth Snapshot(bool database,bool legacy,bool sessionStore,bool cookieKeys,string erpConfig) => new("not_ready",Array.AsReadOnly(new[]
    {
        new DependencyHealth("process","healthy"),
        new DependencyHealth("database",database?"healthy":"unavailable"),
        new DependencyHealth("legacy_adapter",legacy?"healthy":"unavailable"),
        new DependencyHealth("session_store",sessionStore?"healthy":"unavailable"),
        new DependencyHealth("cookie_keys",cookieKeys?"healthy":"unavailable"),
        new DependencyHealth("erp_config",erpConfig),
        new DependencyHealth("business_release","unavailable")
    }));
}
