using System.Text.Json;
using Medcom.Application;
using Medcom.Contracts;
using Xunit;

namespace Medcom.Api.Tests;

// Thủ kho "Từ chối" on production was refused as invalid_erp_intent: the notes limit looked up
// IV_InboundRequest_ChangeWorkflowStatusStp, which has no module metadata, and Single() threw.
public sealed class ErpWorkflowNotesLimitTests
{
    public static TheoryData<string, string> Buttons()
    {
        var data = new TheoryData<string, string>();
        foreach (var screen in ErpScreenCatalog.WorkflowMetadata.GetProperty("screens").EnumerateArray())
            foreach (var button in screen.GetProperty("buttons").EnumerateArray())
                data.Add(screen.GetProperty("id").GetString()!, button.GetProperty("operation").GetString()!);
        return data;
    }

    [Theory, MemberData(nameof(Buttons))]
    public void Every_workflow_button_has_a_notes_limit(string module, string operation)
    {
        var limit = ErpWorkflowRules.MaximumNotes(module, operation);
        Assert.InRange(limit, 1, 4000);
    }

    [Theory]
    [InlineData("inbound-warehouse", "reject")] [InlineData("inbound-warehouse", "send-sa")] [InlineData("inbound-bld", "approve")]
    public void Inbound_notes_actions_freeze(string module, string operation)
    {
        var raw = JsonDocument.Parse("{\"idempotencyKey\":\"act-qa-1\",\"branchId\":\"MB\",\"documentId\":\"QA-DOC\",\"expectedStateToken\":\""
            + new string('a', 64) + "\",\"payload\":{\"notes\":\"Thủ kho từ chối\"}}").RootElement;
        Assert.True(ErpCommandRules.Freeze(module, operation, raw, out _));
    }
}
