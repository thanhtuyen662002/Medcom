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
        // A hidden batch reference the Web cannot edit (OutputDocumentID) is kept as saved.
        var saved = new Dictionary<string, object?> { ["outputDocumentId"] = "PX-001", ["batchDate"] = "2026-10-30" };
        Assert.True(SqlErpScreenCommands.UnchangedHidden("internal-transfer-batches", "header", "outputDocumentId", Text("PX-001"), saved));
        Assert.False(SqlErpScreenCommands.UnchangedHidden("internal-transfer-batches", "header", "outputDocumentId", Text("PX-002"), saved));
        Assert.False(SqlErpScreenCommands.UnchangedHidden("internal-transfer-batches", "header", "outputDocumentId", Text("PX-001"), null));
        // A visible field is still checked even when unchanged.
        Assert.False(SqlErpScreenCommands.UnchangedHidden("internal-transfer-batches", "header", "batchDate", Text("2026-10-30"), saved));
    }
}
