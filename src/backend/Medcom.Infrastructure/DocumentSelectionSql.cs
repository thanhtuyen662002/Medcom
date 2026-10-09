using System.Data;
using System.Data.Common;
using Medcom.Application;

namespace Medcom.Infrastructure;

internal static class DocumentSelectionSql
{
    internal static string Predicate(string dateColumn) => $"""
        AND (@dateFrom IS NULL OR {dateColumn} >= @dateFrom)
        AND (@dateToExclusive IS NULL OR {dateColumn} < @dateToExclusive)
        AND (@dateBounded = 0 OR {dateColumn} IS NOT NULL)
        AND (@statusId IS NULL OR D.StatusID = @statusId)
        """;

    internal static string Order(string dateColumn, string idColumn, string? sortBy, string? direction)
    {
        if (!DocumentSelectionRules.Valid(null, null, sortBy, direction))
            throw new ArgumentException("Invalid document ordering.");
        var field = (sortBy ?? "documentDate") switch
        {
            "documentDate" => dateColumn,
            "documentId" => $"CONVERT(varbinary(max),{idColumn})",
            "statusId" => "D.StatusID",
            _ => throw new ArgumentException("Invalid document ordering.")
        };
        var order = direction == "asc" ? "ASC" : "DESC";
        return sortBy == "documentId" ? $"{field} {order}"
            : $"{field} {order},CONVERT(varbinary(max),{idColumn}) ASC";
    }

    internal static void Bind(DbCommand command, string? from, string? to, int? status)
    {
        Add("@dateFrom", DbType.DateTime, DocumentSelectionRules.LowerBound(from));
        Add("@dateToExclusive", DbType.DateTime, DocumentSelectionRules.ExclusiveUpperBound(to));
        Add("@dateBounded", DbType.Boolean, from is not null || to is not null);
        Add("@statusId", DbType.Int32, status);
        void Add(string name, DbType type, object? value)
        {
            var parameter = command.CreateParameter();
            parameter.ParameterName = name; parameter.DbType = type; parameter.Value = value ?? DBNull.Value;
            command.Parameters.Add(parameter);
        }
    }
}
