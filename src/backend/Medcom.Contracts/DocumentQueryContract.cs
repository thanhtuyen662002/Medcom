namespace Medcom.Contracts;

public sealed record DocumentQueryContract(int Version, string Kind, string ListPath,
    int MaximumPage, int MaximumPageSize, string DateColumn, string IdentifierColumn,
    IReadOnlyList<string> SortFields, string DefaultSortBy, string DefaultSortDirection,
    string MinimumDate, string MaximumDate, string DateFormat, bool DateToInclusive,
    bool NullableDatesIncludedWithoutBounds, string StatusColumn);
