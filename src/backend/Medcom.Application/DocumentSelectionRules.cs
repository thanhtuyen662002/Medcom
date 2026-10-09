using System.Globalization;

namespace Medcom.Application;

// Fixed Web query semantics over qualified source columns; never legacy action semantics.
public static class DocumentSelectionRules
{
    public static readonly IReadOnlyList<string> SortFields = Array.AsReadOnly(new[] { "documentDate", "documentId", "statusId" });
    public static bool Valid(string? dateFrom, string? dateTo, string? sortBy, string? sortDirection)
        => Date(dateFrom, out var from) && Date(dateTo, out var to)
        && (from is null || to is null || from <= to)
        && (sortBy is null || SortFields.Contains(sortBy, StringComparer.Ordinal))
        && (sortDirection is null or "asc" or "desc");

    public static bool Date(string? value, out DateTime? date)
    {
        date = null;
        if (value is null) return true;
        if (value.Length != 10 || !DateTime.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture,
            DateTimeStyles.None, out var parsed) || parsed.Year < 1753
            || parsed.ToString("yyyy-MM-dd",CultureInfo.InvariantCulture)!=value) return false;
        date = parsed;
        return true;
    }

    public static DateTime? LowerBound(string? value) => Date(value, out var date) ? date
        : throw new ArgumentException("Invalid date bound.");
    public static DateTime? ExclusiveUpperBound(string? value)
    {
        var date = LowerBound(value);
        // SQL datetime cannot exceed its final day. Omitting this upper predicate
        // includes that entire day without overflowing DATEADD or inventing a timezone.
        return date is null || date == DateTime.MaxValue.Date ? null : date.Value.AddDays(1);
    }
}
