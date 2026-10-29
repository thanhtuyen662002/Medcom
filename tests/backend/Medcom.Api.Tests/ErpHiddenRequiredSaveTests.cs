using System.Text.Json;
using Medcom.Application;
using Xunit;

namespace Medcom.Api.Tests;

// IV_InternalTransferRequestFrm hides FromBranchID/ToBranchID (HDE), so the detail omits them and an edit
// cannot send them back; the save must still freeze and keep the saved branches.
public sealed class ErpHiddenRequiredSaveTests
{
    private static bool Save(string header, out ErpFrozenCommand? command) => ErpCommandRules.Freeze("internal-transfer-requests", "save",
        JsonDocument.Parse("{\"idempotencyKey\":\"save-qa\",\"branchId\":\"MB\",\"documentId\":\"QA-DOC\",\"expectedStateToken\":\"" + new string('a', 64)
            + "\",\"header\":{" + header + "},\"lineChanges\":[]}").RootElement, out command);
    private const string Visible = "\"documentDate\":\"2026-10-29T00:00:00.000\",\"requestedTransferDate\":null,\"transferReason\":\"QA\",\"transportMethod\":null,\"notes\":null";

    [Fact]
    public void An_edit_without_the_hidden_branches_freezes_and_does_not_invent_them()
    {
        Assert.True(Save(Visible, out var command));
        var header = command!.Header!.Value;
        Assert.False(header.TryGetProperty("fromBranchId", out _));
        Assert.False(header.TryGetProperty("toBranchId", out _));
        Assert.Equal("QA", header.GetProperty("transferReason").GetString());
    }

    [Fact]
    public void Sent_branches_are_still_validated_and_create_still_requires_them()
    {
        Assert.True(Save(Visible + ",\"fromBranchId\":\"MB\",\"toBranchId\":\"MN\"", out _));
        Assert.False(Save(Visible + ",\"fromBranchId\":\"\",\"toBranchId\":\"MN\"", out _));
        Assert.False(ErpCommandRules.Freeze("internal-transfer-requests", "create",
            JsonDocument.Parse("{\"idempotencyKey\":\"crt-qa\",\"branchId\":\"MB\",\"header\":{" + Visible + "},\"lines\":[{\"clientLineKey\":\"k\",\"values\":{\"itemId\":\"QA\",\"requestedQty\":\"1\"}}]}").RootElement, out _));
    }
}
