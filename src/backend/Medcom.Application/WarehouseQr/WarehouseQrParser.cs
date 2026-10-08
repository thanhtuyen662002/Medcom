using System.Text.RegularExpressions;
using Medcom.Contracts;

namespace Medcom.Application.WarehouseQr;

/// <summary>Pure ordinal syntax projection. SQL transport/collation equivalence remains UNKNOWN.</summary>
public static class WarehouseQrParser
{
    public const string ProfileId = "ascii-canonical-no-truncation-v1";
    private static readonly Regex CanonicalGuid = new(
        @"\A[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\z",
        RegexOptions.CultureInvariant);

    public static string TrimAsciiSpace(string? value) => (value ?? "").Trim(' ');
    public static string NormalizeBarcode(string? value) =>
        TrimAsciiSpace((value ?? "").Replace("\r", "", StringComparison.Ordinal)
            .Replace("\n", "", StringComparison.Ordinal));

    public static WarehouseQrParseResult Parse(string? raw)
    {
        var text = NormalizeBarcode(raw);
        WarehouseQrParseResult Result(string status, string? reason, WarehouseQrCandidate? candidate = null) =>
            new(status, reason, text, candidate);
        if (text.Length == 0) return Result("invalid-syntax", "empty-barcode");
        // ASCII-only prefix folding; never apply host Unicode casing as SQL UPPER equivalence.
        if (text.Length >= 5 && text[0] is 'P' or 'p' && text[1] is 'K' or 'k'
            && text[2] is 'G' or 'g' && text[3] == '1' && text[4] == ';')
        {
            if (text.Length != 41) return Result("unqualified", "package-length-outside-canonical-profile");
            var guid = text[5..];
            if (!CanonicalGuid.IsMatch(guid)) return Result("unqualified", "guid-outside-canonical-profile");
            return Result("candidate", null, new PackageWarehouseQrCandidate(guid.ToLowerInvariant()));
        }
        var fields = text.Split(';');
        if (fields.Length != 3) return Result("invalid-syntax", "delimiter-count");
        var item = TrimAsciiSpace(fields[0]);
        var code = TrimAsciiSpace(fields[1]);
        var lot = TrimAsciiSpace(fields[2]);
        if (item.Length == 0) return Result("invalid-syntax", "empty-item-id");
        if (lot.Length == 0) return Result("invalid-syntax", "empty-lot");
        // No truncation. Oversize/Unicode values can be projected but must fail the separate profile.
        return Result("candidate", null, new OrdinaryWarehouseQrCandidate(item, code, lot));
    }

    public static WarehouseQrProfileResult ValidateAsciiNoTruncation(string? raw)
    {
        var issues = new List<string>();
        var input = raw ?? "";
        var parsed = Parse(raw);
        if (input.Any(c => (c < ' ' || c > '~') && c != '\r' && c != '\n'))
            issues.Add("barcode-outside-ascii");
        // Within ASCII, code units equal bytes; non-ASCII transport is already unsupported.
        if (input.Length > 250) issues.Add("raw-barcode-over-250");
        if (parsed.NormalizedBarcode.Length > 200) issues.Add("normalized-barcode-over-200");
        if (parsed.Candidate is OrdinaryWarehouseQrCandidate ordinary)
        {
            if (ordinary.ItemId.Length > 50) issues.Add("item-id-over-50");
            if (ordinary.ItemCode.Length > 50) issues.Add("item-code-over-50");
            if (ordinary.Lot.Length > 50) issues.Add("lot-over-50");
        }
        if (parsed.Status != "candidate") issues.Add("syntax-outside-profile");
        return new(ProfileId, issues.AsReadOnly());
    }

    // Optional offline document transport validation. CR/LF removal is barcode-specific.
    public static WarehouseQrDocumentProfileResult ValidateDocumentAsciiNoTruncation(string? raw)
    {
        var input = raw ?? "";
        var normalized = TrimAsciiSpace(input);
        var issues = new List<string>();
        if (input.Any(c => c < ' ' || c > '~')) issues.Add("document-outside-ascii");
        if (input.Length > 50) issues.Add("raw-document-over-50");
        if (normalized.Length == 0) issues.Add("empty-document-id");
        return new(normalized, new(ProfileId, issues.AsReadOnly()));
    }
}
