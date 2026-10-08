using System.Data.Common;
using Medcom.Application;
using Medcom.Application.PurchaseRequests;
using Microsoft.Data.SqlClient;

namespace Medcom.Infrastructure.PurchaseRequests;

/// <summary>
/// Server-owned permission to conduct one bounded existing-document experiment.
/// This is NOT evidence that the target has passed runtime acceptance. Only the
/// integrating owner may supply it after approving that exact target and scope.
/// No HTTP/configuration binder, launcher or production registration constructs it.
/// </summary>
public sealed class PurchaseRequestPilotAuthorization
{
    public Guid DatabaseBindingId { get; }
    public string TenantId { get; }
    public string CompanyId { get; }
    public string ActorId { get; }
    public string BranchId { get; }
    public string DocumentId { get; }
    public string AuthorizationReference { get; }
    public DateTimeOffset WriteStartsAtUtc { get; }
    public DateTimeOffset WriteExpiresAtUtc { get; }
    private readonly string server;
    private readonly string database;

    public PurchaseRequestPilotAuthorization(string server, string database, Guid databaseBindingId,
        string tenantId, string companyId, string actorId, string branchId, string documentId,
        string authorizationReference, DateTimeOffset writeStartsAtUtc, DateTimeOffset writeExpiresAtUtc)
    {
        if (!Target(server, 256) || !Target(database, 128)
            || database.Equals("master", StringComparison.OrdinalIgnoreCase)
            || server.Contains("(localdb)", StringComparison.OrdinalIgnoreCase)
            || databaseBindingId == Guid.Empty
            || !PurchaseRequestCommandRules.Identifier(tenantId, 100)
            || !PurchaseRequestCommandRules.Identifier(companyId, 100)
            || !PurchaseRequestCommandRules.Identifier(actorId, 100)
            || !PurchaseRequestCommandRules.Identifier(branchId, 50)
            || !PurchaseRequestCommandRules.Identifier(documentId, 50)
            || !PurchaseRequestCommandRules.Identifier(authorizationReference, 256)
            || writeStartsAtUtc.Offset != TimeSpan.Zero || writeExpiresAtUtc.Offset != TimeSpan.Zero
            || writeExpiresAtUtc <= writeStartsAtUtc
            || writeExpiresAtUtc - writeStartsAtUtc > TimeSpan.FromHours(8))
            throw new ArgumentException("An exact, bounded purchase pilot authorization is required.");
        this.server = server; this.database = database;
        DatabaseBindingId = databaseBindingId; TenantId = tenantId; CompanyId = companyId;
        ActorId = actorId; BranchId = branchId; DocumentId = documentId;
        AuthorizationReference = authorizationReference;
        WriteStartsAtUtc = writeStartsAtUtc; WriteExpiresAtUtc = writeExpiresAtUtc;
    }

    private static bool Target(string value, int maximum) =>
        PurchaseRequestCommandRules.Identifier(value, maximum) && value == value.Trim()
        && !value.Any(c => c is '*' or '?' or ';' or '=' or '\r' or '\n');

    internal bool Covers(Guid binding, LegacyCompany company) => DatabaseBindingId == binding
        && TenantId == company.TenantId && CompanyId == company.CompanyId;
    internal bool CoversDocument(string? document, string branch) =>
        document == DocumentId && branch == BranchId;
    internal bool CoversIdentity(AuthoritativeIdentity identity) => identity.PrincipalId == ActorId
        && identity.TenantId == TenantId && identity.CompanyId == CompanyId
        && identity.BranchIds?.Contains(BranchId, StringComparer.Ordinal) == true;
    internal bool CanObserve(DateTimeOffset now) => now >= WriteStartsAtUtc;
    internal bool CanWrite(DateTimeOffset now) => CanObserve(now) && now < WriteExpiresAtUtc;

    // Checked before AND after Open. No target aliases, failover, attached file or
    // read-only routing may inherit the owner's exact-target permission.
    internal void VerifyTarget(DbConnection connection)
    {
        if (connection.DataSource != server || connection.Database != database)
            throw new InvalidOperationException("Purchase pilot target mismatch.");
        if (connection is SqlConnection sql)
        {
            var settings = new SqlConnectionStringBuilder(sql.ConnectionString);
            if (settings.DataSource != server || settings.InitialCatalog != database
                || !string.IsNullOrWhiteSpace(settings.FailoverPartner)
                || !string.IsNullOrWhiteSpace(settings.AttachDBFilename) || settings.UserInstance
                || settings.ApplicationIntent != ApplicationIntent.ReadWrite)
                throw new InvalidOperationException("Purchase pilot target mismatch.");
        }
    }
}
