using System.Buffers.Binary;
using System.Data.Common;
using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Medcom.Application.Transfers;

namespace Medcom.Infrastructure.Execution.PmReturn;

// Technical persistence decoding only. A database marker/row is not current authority.
public static class PmReturnJournalCodec
{
    public const int MaximumSlotBytes = 871;
    public const string SubmissionPrefix = "pmr-submission-v1:";
    public static IReadOnlyList<string> Columns { get; } = Array.AsReadOnly(new[]
    {
        "DatabaseBindingId", "Slot", "TenantId", "CompanyId", "Actor", "ActionId", "IdempotencyKey",
        "DocumentKey", "SubmissionIdentity", "SourceProcedureSha256", "State", "AttemptId",
        "OriginalExecutionFingerprint", "AuditId", "ReceiptJson"
    });

    // Full length-framed tuple, not a hash. UTF-8 is strict, strings are never folded/trimmed.
    // GUID is the other PK component; <=871+16 bytes, within the 900-byte clustered-key limit.
    public static byte[] EncodeSlot(PmReturnJournalKey key)
    {
        if (!ValidKey(key)) throw new ArgumentException("Invalid journal key.", nameof(key));
        using var output = new MemoryStream();
        output.WriteByte(1);
        Span<byte> length = stackalloc byte[4];
        foreach (var value in new[] { key.TenantId, key.CompanyId, key.Actor, key.ActionId, key.IdempotencyKey })
        {
            var bytes = new UTF8Encoding(false, true).GetBytes(value);
            BinaryPrimitives.WriteInt32LittleEndian(length, bytes.Length);
            output.Write(length);
            output.Write(bytes);
        }
        if (output.Length > MaximumSlotBytes) throw new ArgumentException("Oversized journal key.", nameof(key));
        return output.ToArray();
    }

    internal static bool ValidKey(PmReturnJournalKey? key) => key is not null
        && key.DatabaseBindingId != Guid.Empty && Identifier(key.TenantId, 100) && Identifier(key.CompanyId, 100)
        && LosslessAnsiValue.TryCreate(key.Actor, 50, out _)
        && key.ActionId == PmReturnPreparation.ActionId
        && LosslessAnsiValue.TryCreate(key.IdempotencyKey, 100, out _) && key.IdempotencyKey.Length >= 16;

    internal static bool Hex(string? value) => value is { Length: 64 }
        && value.All(c => c is >= '0' and <= '9' or >= 'a' and <= 'f');

    private static bool Identifier(string? value, int limit)
    {
        if (value is not { Length: > 0 } || value.Length > limit || value != value.Trim()) return false;
        try
        {
            _ = new UTF8Encoding(false, true).GetByteCount(value);
            return value.IsNormalized(NormalizationForm.FormC) && !value.EnumerateRunes().Any(r =>
                Rune.GetUnicodeCategory(r) is UnicodeCategory.Control or UnicodeCategory.Format);
        }
        catch (ArgumentException) { return false; }
    }

    internal static bool Shape(DbDataReader reader, IReadOnlyList<string> names) =>
        reader.FieldCount == names.Count && names.Select((name, i) => reader.GetName(i) == name).All(x => x);

    // Verify the four small CHECK predicates, including engine-added brackets/parentheses.
    // A bounded allowlisted parser avoids trusting constraint names or stripping precedence.
    public static bool ConstraintMatches(string kind, string definition)
    {
        try
        {
            var predicate = new CheckParser(definition).Parse();
            foreach (var state in new[] { -1, 0, 1, 2, 3, 4, 5, int.MaxValue })
            foreach (var length in new[] { 0, 1, 871 })
            foreach (var singleton in new[] { 0, 1, 2, 3, 4, 5, 255 })
            for (var nulls = 0; nulls < 8; nulls++)
            {
                var expected = kind switch
                {
                    "Singleton" => singleton == 1,
                    "State" => state is >= 1 and <= 4,
                    "Slot" => length > 0,
                    "Phase" => state == 1 && nulls == 0 || state is >= 2 and <= 4 && nulls == 7,
                    _ => false
                };
                if (kind is not ("Singleton" or "State" or "Slot" or "Phase")
                    || predicate(new(state, length, singleton, nulls)) != expected) return false;
            }
            return true;
        }
        catch (Exception error) when (error is not OutOfMemoryException) { return false; }
    }

    private readonly record struct CheckState(int State, int Length, int Singleton, int Nulls);
    private sealed class CheckParser
    {
        private readonly string[] tokens;
        private int index;
        private int depth;
        internal CheckParser(string text)
        {
            if (text.Length > 1000) throw new FormatException();
            var code = text.Replace("[", "", StringComparison.Ordinal).Replace("]", "", StringComparison.Ordinal);
            tokens = Regex.Matches(code, @"[A-Za-z_][A-Za-z_0-9]*|[0-9]+|[()=><]").Select(m => m.Value.ToUpperInvariant()).ToArray();
            if (string.Concat(tokens) != Regex.Replace(code, @"\s+", "").ToUpperInvariant()) throw new FormatException();
        }
        internal Func<CheckState, bool> Parse()
        {
            var result = Or();
            if (index != tokens.Length) throw new FormatException();
            return result;
        }
        private string Next() => index < tokens.Length ? tokens[index++] : throw new FormatException();
        private bool Take(string value)
        { if (index == tokens.Length || tokens[index] != value) return false; index++; return true; }
        private void Require(string value) { if (!Take(value)) throw new FormatException(); }
        private Func<CheckState, bool> Or()
        {
            var left = And();
            while (Take("OR")) { var previous = left; var right = And(); left = s => previous(s) || right(s); }
            return left;
        }
        private Func<CheckState, bool> And()
        {
            var left = Factor();
            while (Take("AND")) { var previous = left; var right = Factor(); left = s => previous(s) && right(s); }
            return left;
        }
        private Func<CheckState, bool> Factor()
        {
            if (++depth > 20) throw new FormatException();
            try
            {
                if (Take("(")) { var nested = Or(); Require(")"); return nested; }
                var field = Next();
                if (field == "DATALENGTH")
                {
                    Require("("); Require("SLOT"); Require(")"); Require(">");
                    if (Number() != 0) throw new FormatException();
                    return s => s.Length > 0;
                }
                if (field is "STATE" or "SINGLETONID")
                {
                    Require("="); var number = Number();
                    if (number is < 1 or > 4) throw new FormatException();
                    return field == "STATE" ? s => s.State == number : s => s.Singleton == number;
                }
                var bit = field switch { "ORIGINALEXECUTIONFINGERPRINT" => 1, "AUDITID" => 2, "RECEIPTJSON" => 4, _ => throw new FormatException() };
                Require("IS"); var not = Take("NOT"); Require("NULL");
                return s => ((s.Nulls & bit) != 0) != not;
            }
            finally { depth--; }
        }
        private int Number()
        {
            if (++depth > 20) throw new FormatException();
            try
            {
                if (Take("(")) { var number = Number(); Require(")"); return number; }
                return int.Parse(Next(), CultureInfo.InvariantCulture);
            }
            finally { depth--; }
        }
    }

    public static PmReturnStoredObservation? Decode(DbDataReader reader, PmReturnJournalKey expected)
    {
        try
        {
            if (!ValidKey(expected) || !Shape(reader, Columns)) return null;
            var key = new PmReturnJournalKey(reader.GetGuid(0), reader.GetString(2), reader.GetString(3),
                reader.GetString(4), reader.GetString(5), reader.GetString(6));
            if (!ValidKey(key) || key != expected || reader.GetValue(1) is not byte[] slot
                || !slot.AsSpan().SequenceEqual(EncodeSlot(key))) return null;
            var document = reader.GetString(7);
            var submission = reader.GetString(8);
            var source = reader.GetString(9);
            var state = (PmReturnJournalState)reader.GetInt32(10);
            var attempt = reader.GetGuid(11);
            if (!LosslessAnsiValue.TryCreate(document, 30, out _) || attempt == Guid.Empty || !Hex(source)
                || submission.Length != 82 || !submission.StartsWith(SubmissionPrefix, StringComparison.Ordinal)
                || !Hex(submission[SubmissionPrefix.Length..])) return null;
            if (state is PmReturnJournalState.InProgress or PmReturnJournalState.OutcomeUnknown or PmReturnJournalState.Tombstone)
            {
                if (!reader.IsDBNull(12) || !reader.IsDBNull(13) || !reader.IsDBNull(14)) return null;
                return new(new(TransferSnapshotOrigin.DatabaseAuthority, key, state), document, submission, source, attempt);
            }
            if (state != PmReturnJournalState.Committed) return null;
            var execution = reader.GetString(12);
            var audit = reader.GetString(13);
            var json = reader.GetString(14);
            if (!Hex(execution) || !LosslessAnsiValue.TryCreate(audit, 100, out _) || json.Length > 4000) return null;
            var receipt = Receipt(json, key, document, submission, source, execution, audit);
            if (receipt is null) return null;
            var envelope = new PmReturnJournalReceipt(key, document, submission, source, execution, audit, receipt);
            var record = new PmReturnJournalRecord(key, document, submission, source, execution, audit, envelope);
            return new(new(TransferSnapshotOrigin.DatabaseAuthority, key, state, record), document, submission, source, attempt);
        }
        catch (Exception error) when (error is not OutOfMemoryException) { return null; }
    }

    private static TransferGatewayReceipt? Receipt(string text, PmReturnJournalKey key, string document,
        string submission, string source, string execution, string audit)
    {
        using var parsed = JsonDocument.Parse(text, new() { MaxDepth = 4 });
        var root = parsed.RootElement;
        string[] fields = ["version", "bindingId", "tenantId", "companyId", "actor", "actionId", "idempotencyKey",
            "documentKey", "submissionIdentity", "sourceProcedureSha256", "originalExecutionFingerprint",
            "auditId", "outcome", "observedPostStatus", "rejectionCode"];
        if (root.ValueKind != JsonValueKind.Object) return null;
        var names = root.EnumerateObject().Select(p => p.Name).ToArray();
        if (names.Length != fields.Length || names.Distinct(StringComparer.Ordinal).Count() != fields.Length
            || !names.ToHashSet(StringComparer.Ordinal).SetEquals(fields)) return null;
        if (root.GetProperty("version").GetInt32() != 1
            || root.GetProperty("bindingId").GetString() != key.DatabaseBindingId.ToString("D")
            || root.GetProperty("outcome").GetString() != "Committed"
            || root.GetProperty("observedPostStatus").GetInt32() != 30
            || root.GetProperty("rejectionCode").ValueKind != JsonValueKind.Null) return null;
        foreach (var pair in new[] { ("tenantId", key.TenantId), ("companyId", key.CompanyId), ("actor", key.Actor),
            ("actionId", key.ActionId), ("idempotencyKey", key.IdempotencyKey), ("documentKey", document),
            ("submissionIdentity", submission), ("sourceProcedureSha256", source),
            ("originalExecutionFingerprint", execution), ("auditId", audit) })
            if (root.GetProperty(pair.Item1).GetString() != pair.Item2) return null;
        return new(TransferGatewayOutcome.Committed, key.ActionId, document, key.IdempotencyKey, execution, 30, audit);
    }
}

public sealed record PmReturnStoredObservation(PmReturnJournalObservation Observation, string DocumentKey,
    string SubmissionIdentity, string SourceProcedureSha256, Guid AttemptId)
{
    public bool Matches(PmReturnSubmittedIntent intent) => Observation.Key == intent.Key
        && DocumentKey == intent.DocumentKey && SubmissionIdentity == intent.SubmissionIdentity
        && SourceProcedureSha256 == intent.SourceProcedureSha256;
}
