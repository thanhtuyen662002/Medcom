using System.Security.Cryptography;
using System.Text;
using Medcom.Contracts;
using Medcom.Infrastructure.Erp;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class ErpFormConfigCheckTests
{
    [Fact]
    public void A_changed_button_flag_and_lock_expression_are_named_with_their_live_value()
    {
        // ERP 30/10 re-ticked flags on the sales approval form's Từ chối nhanh / Chọn bước gửi về buttons.
        var metadata = ErpScreenCatalog.Metadata("sales-order-sa");
        var rows = metadata.GetProperty("configuration").EnumerateArray().Select(row => new ErpLookupDiagnostics.LiveConfig(
            row.GetProperty("key").GetString()!, row.GetProperty("control").GetString(), row.GetProperty("property").GetString(), null)).ToList();
        // Rebuild the exact catalog values from their hashes is impossible; a row whose value is unknown reads as changed,
        // so compare only the shape of the report for rows we alter.
        var changes = ErpLookupDiagnostics.CompareForm("sales-order-sa", metadata, [
            new("LYS1", "ExecSQLWithParaButtonCtl_5", "LBEX", "StatusID NOT IN (14)"),
            new("LYS1", "ExecSQLWithParaButtonCtl_9", "BT", "Nút mới")]).ToList();
        Assert.Contains(changes, change => change.Property == "LBEX" && change.Change == "changed" && change.Live == "StatusID NOT IN (14)");
        Assert.Contains(changes, change => change.Control == "ExecSQLWithParaButtonCtl_9" && change.Change == "added" && change.Live == "Nút mới");
        Assert.Contains(changes, change => change.Property == "C4" && change.Change == "missing" && change.Live is null);
        Assert.DoesNotContain(changes, change => change.Property == "C4" && change.Live is not null);
        Assert.NotEmpty(rows);
    }

    [Fact]
    public void An_unchanged_row_is_not_reported()
    {
        var metadata = ErpScreenCatalog.Metadata("sales-order-sa");
        var lbex = metadata.GetProperty("configuration").EnumerateArray()
            .First(row => row.GetProperty("control").GetString() == "ExecSQLWithParaButtonCtl_5" && row.GetProperty("property").GetString() == "LBEX");
        var value = "StatusID NOT IN (14, 15)";
        Assert.Equal(lbex.GetProperty("sha256Utf16LE").GetString(), Convert.ToHexString(SHA256.HashData(Encoding.Unicode.GetBytes(value))).ToLowerInvariant());
        var changes = ErpLookupDiagnostics.CompareForm("sales-order-sa", metadata, [new("LYS1", "ExecSQLWithParaButtonCtl_5", "LBEX", value)]);
        Assert.DoesNotContain(changes, change => change.Property == "LBEX" && change.Control == "ExecSQLWithParaButtonCtl_5");
    }
}
