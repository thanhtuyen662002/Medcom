using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Medcom.Contracts;

namespace Medcom.Application.PurchaseRequests;

public interface IPurchaseRequestCommands
{
    Task<PurchaseRequestCommandResult> CreateAsync(CreatePurchaseRequestDraft request, CancellationToken token = default);
    Task<PurchaseRequestCommandResult> SaveAsync(SavePurchaseRequestDraft request, CancellationToken token = default);
    Task<PurchaseRequestCommandResult> SubmitAsync(SubmitPurchaseRequest request, CancellationToken token = default);
    // Supply the retained original DTO, not a form rebuilt from the document's latest state.
    // Read-only reconciliation; no overload grants permission to run a write command.
    Task<PurchaseRequestLookupResult> LookupAsync(CreatePurchaseRequestDraft originalIntent, CancellationToken token = default);
    Task<PurchaseRequestLookupResult> LookupAsync(SavePurchaseRequestDraft originalIntent, CancellationToken token = default);
    Task<PurchaseRequestLookupResult> LookupAsync(SubmitPurchaseRequest originalIntent, CancellationToken token = default);
}

public static class PurchaseRequestCommandRules
{
    public const string CreateAction = "purchase-request.create-draft";
    public const string CreateSubmitAction = "purchase-request.create-and-submit";
    public const string SaveAction = "purchase-request.save-draft";
    public const string SubmitAction = "purchase-request.submit";
    public const string MenuId = "05011";
    public const string FormId = "AP_PurposeRequestListFrm";
    // Web resource bounds; these are not claims about legacy business limits.
    public const int MaxLines = 500;
    public const int MaxText = 65536;
    public const int MaxIntentBytes = 1048576;
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    { UnmappedMemberHandling = System.Text.Json.Serialization.JsonUnmappedMemberHandling.Disallow };
    private static readonly UTF8Encoding StrictUtf8 = new(false, true);

    public static bool Text(string? value, int limit, bool nullable = false)
    {
        if (value is null) return nullable;
        if (value.Length > limit) return false;
        try { _ = StrictUtf8.GetByteCount(value); return !value.Contains('\0'); }
        catch (EncoderFallbackException) { return false; }
    }
    public static bool Identifier(string? value, int limit) => Text(value, limit)
        && !string.IsNullOrWhiteSpace(value) && !char.IsWhiteSpace(value![^1])
        && !value.Any(char.IsControl);
    public static bool StateToken(string? value) => value is { Length: 69 }
        && value.StartsWith("prs1.", StringComparison.Ordinal) && value[5..].All(char.IsAsciiHexDigit);

    public static string? Decimal(string? value, byte scale, bool nullable = false)
    {
        if (value is null) { if (nullable) return null; throw new ArgumentException("Decimal required."); }
        if (value.Length > 40 || !System.Text.RegularExpressions.Regex.IsMatch(value, @"^[+-]?\d+(\.\d+)?$",
                System.Text.RegularExpressions.RegexOptions.CultureInvariant)
            || !decimal.TryParse(value, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint,
                CultureInfo.InvariantCulture, out var number)) throw new ArgumentException("Invalid decimal.");
        var dot = value.IndexOf('.');
        if (dot >= 0 && value[(Math.Min(value.Length, dot + 1 + scale))..].Any(c => c != '0'))
            throw new ArgumentException("Nonrepresentable fractional digits.");
        var maximum = scale == 0 ? 999999999999999999m : 9999999999999999.99m;
        if (number > maximum || number < -maximum || decimal.Round(number, scale) != number)
            throw new ArgumentException("Decimal exceeds source precision.");
        return number.ToString(scale == 0 ? "0" : "0.00", CultureInfo.InvariantCulture);
    }
    public static string? Date(string? value)
    {
        if (value is null) return null;
        if (!DateTime.TryParseExact(value, "yyyy-MM-dd'T'HH:mm:ss.fff", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var date) || date.Year < 1753)
            throw new ArgumentException("SQL datetime required without an inferred offset.");
        // SQL datetime representability, not timezone conversion or silent rounding.
        try
        {
            if (new System.Data.SqlTypes.SqlDateTime(date).Value != date)
                throw new ArgumentException("SQL datetime precision mismatch.");
        }
        catch (System.Data.SqlTypes.SqlTypeException)
        { throw new ArgumentException("SQL datetime range mismatch."); }
        catch (OverflowException)
        { throw new ArgumentException("SQL datetime range mismatch."); }
        return date.ToString("yyyy-MM-dd'T'HH:mm:ss.fff", CultureInfo.InvariantCulture);
    }
    public static PurchaseRequestHeaderInput Header(PurchaseRequestHeaderInput? input)
    {
        if (input is null || !Text(input.PersonSuggest, 500) || !Text(input.Department, 100)
            || !Text(input.PurposeDescOrClient, MaxText, true) || !Text(input.Notes, MaxText, true)
            || !Identifier(input.CurrencyId, 3) || !Identifier(input.ObjectId, 100)
            || !double.IsFinite(input.RateExchange)) throw new ArgumentException("Invalid header.");
        return input with { PurchaseDate = Date(input.PurchaseDate), Price = Decimal(input.Price, 2, true),
            RateExchange = input.RateExchange == 0d ? 0d : input.RateExchange };
    }
    public static PurchaseRequestLineValues Line(PurchaseRequestLineValues? input)
    {
        if (input is null || !Identifier(input.ItemId, 50) || !Text(input.TimeRequired, 200, true)
            || !Text(input.Model, 50, true)) throw new ArgumentException("Invalid line.");
        return input with { Quantity = Decimal(input.Quantity, 0)!, UnitPrice = Decimal(input.UnitPrice, 0)!,
            Budget = Decimal(input.Budget, 0, true), TotalPrice = Decimal(input.TotalPrice, 0, true) };
    }
    public static CreatePurchaseRequestDraft Freeze(CreatePurchaseRequestDraft input)
    {
        Common(input.IdempotencyKey, input.BranchId);
        if (input.Lines is null || input.Lines.Count > MaxLines) throw new ArgumentException("Line bound.");
        var lines = input.Lines.Select(l => l is not null && Identifier(l.ClientLineKey, 100)
            ? l with { Values = Line(l.Values) } : throw new ArgumentException("Invalid line key.")).ToArray();
        if (lines.Select(l => l.ClientLineKey).Distinct(StringComparer.Ordinal).Count() != lines.Length)
            throw new ArgumentException("Duplicate client line key.");
        return input with { Header = Header(input.Header), Lines = Array.AsReadOnly(lines) };
    }
    public static SavePurchaseRequestDraft Freeze(SavePurchaseRequestDraft input)
    {
        Common(input.IdempotencyKey, input.BranchId);
        if (!Identifier(input.PurchaseRequestId, 50) || !StateToken(input.ExpectedStateToken)
            || input.LineChanges is null || input.LineChanges.Count > MaxLines) throw new ArgumentException("Invalid save.");
        var changes = input.LineChanges.Select(l =>
        {
            if (l is null || !Enum.IsDefined(l.Kind)) throw new ArgumentException("Invalid change.");
            if (l.Kind == PurchaseRequestLineChangeKind.Add)
            {
                if (l.LineId is not null || !Identifier(l.ClientLineKey, 100)) throw new ArgumentException("Invalid add.");
                return l with { Values = Line(l.Values) };
            }
            if (!Identifier(l.LineId, 50) || l.ClientLineKey is not null) throw new ArgumentException("Invalid line identity.");
            if (l.Kind == PurchaseRequestLineChangeKind.Remove && l.Values is not null) throw new ArgumentException("Remove values.");
            return l with { Values = l.Kind == PurchaseRequestLineChangeKind.Update ? Line(l.Values) : null };
        }).ToArray();
        if (changes.Where(l => l.LineId is not null).Select(l => l.LineId).Distinct(StringComparer.Ordinal).Count()
                != changes.Count(l => l.LineId is not null)
            || changes.Where(l => l.ClientLineKey is not null).Select(l => l.ClientLineKey).Distinct(StringComparer.Ordinal).Count()
                != changes.Count(l => l.ClientLineKey is not null)) throw new ArgumentException("Duplicate changes.");
        return input with { Header = Header(input.Header), LineChanges = Array.AsReadOnly(changes) };
    }
    public static SubmitPurchaseRequest Freeze(SubmitPurchaseRequest input)
    {
        Common(input.IdempotencyKey, input.BranchId);
        if (!Identifier(input.PurchaseRequestId, 50) || !StateToken(input.ExpectedStateToken)) throw new ArgumentException("Invalid submit.");
        return input;
    }
    private static void Common(string key, string branch)
    {
        if (!Identifier(key, 100) || !Identifier(branch, 50)) throw new ArgumentException("Invalid command identity.");
    }
    public static byte[] IntentBytes<T>(T input)
    {
        var bytes = JsonSerializer.SerializeToUtf8Bytes(input, Json);
        if (bytes.Length > MaxIntentBytes) throw new ArgumentException("Intent bound.");
        return bytes;
    }
    public static PurchaseRequestAggregate Normalize(PurchaseRequestAggregate input)
    {
        if (!Identifier(input.PurchaseRequestId, 50) || !Identifier(input.BranchId, 50) || input.Lines.Count > MaxLines)
            throw new ArgumentException("Invalid persisted aggregate.");
        var lines = input.Lines.Select(l => Identifier(l.LineId, 50)
                ? l with { Values = Line(l.Values) } : throw new ArgumentException("Invalid persisted line.")).OrderBy(l => l.LineId, StringComparer.Ordinal).ToArray();
        if (lines.Select(l => l.LineId).Distinct(StringComparer.Ordinal).Count() != lines.Length) throw new ArgumentException("Duplicate persisted ID.");
        return input with { Header = Header(input.Header), Lines = Array.AsReadOnly(lines) };
    }
    // Aggregate STATE EQUALITY only. Delete/reinsert ABA and monotonic history are not detected.
    public static string EqualityToken(PurchaseRequestAggregate input) => "prs1." + Convert.ToHexStringLower(
        SHA256.HashData(IntentBytes(Normalize(input))));
}
