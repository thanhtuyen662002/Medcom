using System.Data;
using Medcom.Application;
using Medcom.Contracts;
using Medcom.Infrastructure;
using Medcom.Infrastructure.PurchaseRequests;
using Xunit;

namespace Medcom.Api.Tests;
public sealed class DocumentStatusTests
{
    [Fact]
    public void Every_document_type_has_one_fixed_live_dictionary_not_a_universal_code_map()
    {
        Assert.Contains("dbo.AP_PurchaseStatusTbl", SqlPurchaseRequestQueries.HeadText);
        Assert.Contains("dbo.AP_PurchaseStatusTbl", SqlPurchaseRequestQueries.ListText(1));
        foreach (var kind in new[] { DocumentKind.PurchaseOrders, DocumentKind.InboundRequests })
        {
            var expected = kind == DocumentKind.PurchaseOrders ? "dbo.AP_OrderStatusTbl" : "dbo.IV_InboundRequestStatusTbl";
            foreach (var sql in new[] { SqlDocumentReader.ListSql(kind, 1), SqlDocumentReader.DetailSql(kind, 1) })
            {
                Assert.Contains(expected, sql); Assert.Contains("LEFT JOIN", sql);
                Assert.Contains("COUNT_BIG(*) AS StatusRows", sql); Assert.Contains("GROUP BY StatusID", sql);
                Assert.Contains("S.StatusName,S.StatusRows", sql.Replace(", ", ",", StringComparison.Ordinal));
                Assert.DoesNotContain("UPDATE ", sql, StringComparison.OrdinalIgnoreCase);
                Assert.DoesNotContain("INSERT ", sql, StringComparison.OrdinalIgnoreCase);
                Assert.DoesNotContain("DELETE ", sql, StringComparison.OrdinalIgnoreCase);
            }
        }
    }
    [Theory]
    [InlineData("Đã duyệt", 1L, "Đã duyệt")]
    [InlineData("Đã sản xuất xong", 1L, "Đã sản xuất xong")]
    [InlineData("Yêu cầu thủ kho xem lại", 1L, "Yêu cầu thủ kho xem lại")]
    [InlineData("duplicate", 2L, null)]
    [InlineData("unknown", 0L, null)]
    [InlineData(null, 1L, null)]
    [InlineData("", 1L, null)]
    [InlineData(" ", 1L, null)]
    [InlineData("bad\0label", 1L, null)]
    public void Source_labels_preserve_text_and_ambiguous_or_invalid_rows_never_forge_a_name(string? name, long count, string? expected)
    {
        var table = new DataTable(); table.Columns.Add("name", typeof(string)); table.Columns.Add("count", typeof(long));
        table.Rows.Add(name ?? (object)DBNull.Value, count);
        using var reader = table.CreateDataReader(); Assert.True(reader.Read());
        Assert.Equal(expected, DocumentStatusSql.ReadName(reader, 0, 100));
    }
    [Fact]
    public void Missing_dictionary_join_and_overlong_names_are_unknown()
    {
        var table = new DataTable(); table.Columns.Add("name", typeof(string)); table.Columns.Add("count", typeof(long));
        table.Rows.Add(DBNull.Value, DBNull.Value);
        using var reader = table.CreateDataReader(); Assert.True(reader.Read());
        Assert.Null(DocumentStatusSql.ReadName(reader, 0, 50));
        Assert.False(DocumentStatusSql.ValidName(new string('x', 51), 50));
        Assert.True(DocumentStatusSql.ValidName("Hoàn tất ✅ 🟢", 50));
        Assert.False(DocumentStatusSql.ValidName("bad\uD800", 50));
    }
    [Fact]
    public void Read_status_metadata_does_not_change_command_document_serialization()
    {
        var source = new PurchaseQuerySource(); source.Seed();
        var before = System.Text.Json.JsonSerializer.Serialize(source.Documents[0]);
        var readback = new PurchaseRequestReadback(source.Documents[0], "token", StatusName: "Nháp");
        Assert.Equal(before, System.Text.Json.JsonSerializer.Serialize(readback.Document));
        Assert.DoesNotContain("StatusName", before);
        Assert.Null(new DocumentSummary("id", "2026-10-07", "branch", null, null).StatusName);
    }
}
