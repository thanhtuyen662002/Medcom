using System.Runtime.InteropServices;
using Microsoft.Data.SqlClient;

namespace Medcom.TargetInspect;

public enum InspectionStatus { PASS, FAIL, BLOCKED, NOT_RUN }
public sealed record InspectionCheck(string Check, InspectionStatus Status, string Code)
{
    public string NextStep => Code switch
    {
        "EXPECTED_BINDING_NOT_SUPPLIED" => "Optionally supply the existing binding in an external owner-local options file.",
        "COMPLETE_METADATA_VISIBILITY_UNPROVED" or "SERVER_METADATA_VISIBILITY_UNPROVED" => "Ask the owner or DBA to review visibility; this tool never changes permissions.",
        "SOURCE_EXPECTATION_UNAVAILABLE" or "DEFAULT_SEMANTICS_UNPROVED" or "PREDICATE_EQUIVALENCE_UNPROVED" => "Independent source and metadata review is required; do not alter the database to force a pass.",
        "INPUT_OR_PACKAGE_REJECTED" => "Check the verified package and explicit private input paths against the README.",
        "CANCELLED_OR_TIMED_OUT" or "INSPECTION_QUERY_OR_PROVIDER_FAILED" => "Have the owner review the failed stage locally; do not share settings or exception text.",
        "OBSERVED_METADATA_MISMATCH" or "DURABILITY_SETTINGS_MISMATCH" or "TARGET_OR_TRANSACTION_MISMATCH" or "DISPOSAL_FAILED" => "Stop qualification and review this mismatch with the owner; no automatic repair is permitted.",
        "OUTSIDE_READONLY_INSPECT" => "Requires separate authorized runtime qualification.",
        _ => "No write or release permission is established."
    };
}

public sealed class InspectionReport
{
    private readonly List<InspectionCheck> checks = [];
    public string Mode => "Inspect";
    public string Runtime => RuntimeInformation.FrameworkDescription;
    public string ProviderPackage => "7.0.3";
    public string ProviderAssembly => typeof(SqlConnection).Assembly.GetName().Version?.ToString() ?? "";
    public bool ReleaseStillBlocked => true;
    public string? SourceRevision { get; set; }
    public string? SourceTree { get; set; }
    public IReadOnlyList<InspectionCheck> Checks => checks;
    public void Add(string check, InspectionStatus status, string code)
    {
        var index = checks.FindIndex(item => item.Check == check);
        if (index >= 0) checks[index] = new(check, status, code);
        else checks.Add(new(check, status, code));
    }
    public void PrepareDatabaseChecks()
    {
        foreach (var stage in new[] { "connection", "target.environment", "database.durability_settings", "catalog.visibility",
            "purchase.foreign_key", "inbound.native_constraint_semantics", "purchase.additional_constraint_semantics",
            "database.binding", "server.trigger_events", "connection.cleanup" })
            Add(stage, InspectionStatus.NOT_RUN, "PREREQUISITE_NOT_ESTABLISHED");
        foreach (var prefix in new[] { "catalog.columns", "catalog.keys", "catalog.triggers_security" })
            foreach (var table in InspectionSql.Tables) Add(prefix + "." + table, InspectionStatus.NOT_RUN, "PREREQUISITE_NOT_ESTABLISHED");
        foreach (var definition in InspectionRunner.ExpectedDefinitions.Keys) Add("check." + definition, InspectionStatus.NOT_RUN, "PREREQUISITE_NOT_ESTABLISHED");
        foreach (var name in new[] { "WebInboundRequestCommandJournalV1.CreatedAtUtc", "IV_InboundRequestLogTbl.UserAutoID", "IV_InboundRequestLogTbl.ThoiGian" })
            Add("default." + name, InspectionStatus.NOT_RUN, "PREREQUISITE_NOT_ESTABLISHED");
    }
    public void AddUnexercised()
    {
        foreach (var check in new[] { "runtime.login", "runtime.native_grants", "runtime.sessions", "runtime.documents",
            "runtime.concurrency", "runtime.commit_durability", "runtime.receipts", "runtime.numbering", "runtime.send_rights",
            "runtime.acceptance" }) Add(check, InspectionStatus.NOT_RUN, "OUTSIDE_READONLY_INSPECT");
    }
}
