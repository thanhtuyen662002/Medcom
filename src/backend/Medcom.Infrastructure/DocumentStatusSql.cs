using System.Data.Common;
namespace Medcom.Infrastructure;

// Fixed source-backed dictionary bindings. Group before joining so even a corrupt
// duplicate ID cannot multiply documents, alter pagination, or choose a label.
internal static class DocumentStatusSql
{
    internal const string PurchaseRequests = "LEFT JOIN (SELECT StatusID, MAX(StatusName) AS StatusName, COUNT_BIG(*) AS StatusRows FROM dbo.AP_PurchaseStatusTbl GROUP BY StatusID) S ON S.StatusID=D.StatusID";
    internal const string PurchaseOrders = "LEFT JOIN (SELECT StatusID, MAX(StatusName) AS StatusName, COUNT_BIG(*) AS StatusRows FROM dbo.AP_OrderStatusTbl GROUP BY StatusID) S ON S.StatusID=D.StatusID";
    internal const string InboundRequests = "LEFT JOIN (SELECT StatusID, MAX(StatusName) AS StatusName, COUNT_BIG(*) AS StatusRows FROM dbo.IV_InboundRequestStatusTbl GROUP BY StatusID) S ON S.StatusID=D.StatusID";

    internal static string? ReadName(DbDataReader reader, int nameOrdinal, int maximumLength)
    {
        if (reader.IsDBNull(nameOrdinal + 1) || reader.GetInt64(nameOrdinal + 1) != 1
            || reader.IsDBNull(nameOrdinal)) return null;
        var name = reader.GetString(nameOrdinal);
        return ValidName(name, maximumLength) ? name : null;
    }
    internal static bool ValidName(string? name, int maximumLength)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Length > maximumLength) return false;
        for (var i = 0; i < name.Length; i++)
        {
            if (char.IsControl(name[i]) || char.IsLowSurrogate(name[i])) return false;
            if (!char.IsHighSurrogate(name[i])) continue;
            if (i + 1 >= name.Length || !char.IsLowSurrogate(name[++i])) return false;
        }
        return true;
    }
}
