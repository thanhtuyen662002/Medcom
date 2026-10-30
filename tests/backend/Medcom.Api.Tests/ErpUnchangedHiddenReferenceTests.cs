using System.Text.Json;
using Medcom.Infrastructure.Erp;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class ErpUnchangedHiddenReferenceTests
{
    private static JsonElement Text(string value) => JsonSerializer.SerializeToElement(value);

    [Fact]
    public void Only_an_unchanged_hidden_reference_skips_the_picker_check()
    {
        // A batch created by Administrator keeps AssignedPM=Administrator, who is not in the PM list (prod 30/10).
        var saved = new Dictionary<string, object?> { ["assignedPM"] = "Administrator", ["batchDate"] = "2026-10-30" };
        Assert.True(SqlErpScreenCommands.UnchangedHidden("internal-transfer-batches", "header", "assignedPM", Text("Administrator"), saved));
        Assert.False(SqlErpScreenCommands.UnchangedHidden("internal-transfer-batches", "header", "assignedPM", Text("other"), saved));
        Assert.False(SqlErpScreenCommands.UnchangedHidden("internal-transfer-batches", "header", "assignedPM", Text("Administrator"), null));
        // A visible field is still checked even when unchanged.
        Assert.False(SqlErpScreenCommands.UnchangedHidden("internal-transfer-batches", "header", "batchDate", Text("2026-10-30"), saved));
    }
}
