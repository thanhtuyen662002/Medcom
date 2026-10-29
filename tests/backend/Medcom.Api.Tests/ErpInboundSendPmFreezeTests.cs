using System.Text.Json;
using Medcom.Application;
using Medcom.Contracts;
using Xunit;

namespace Medcom.Api.Tests;

// TP SA / Kỹ thuật "Gửi PM" carries payloadType "inbound-pm", which Freeze did not handle: every send was refused.
public sealed class ErpInboundSendPmFreezeTests
{
    private static bool Freeze(string module, string payload) => ErpCommandRules.Freeze(module, "send-pm",
        JsonDocument.Parse("{\"idempotencyKey\":\"act-qa-1\",\"branchId\":\"MB\",\"documentId\":\"QA-DOC\",\"expectedStateToken\":\""
            + new string('a', 64) + "\",\"payload\":" + payload + "}").RootElement, out _);

    [Theory, InlineData("inbound-sa"), InlineData("inbound-tech")]
    public void Send_pm_takes_a_pm_and_optional_notes(string module)
    {
        Assert.Equal("inbound-pm", ErpWorkflowRules.PayloadType(module, "send-pm"));
        Assert.True(Freeze(module, "{\"pmId\":\"Admin\",\"notes\":\"QA\"}"));
        Assert.True(Freeze(module, "{\"pmId\":\"Admin\",\"notes\":null}"));
        Assert.False(Freeze(module, "{\"notes\":\"QA\"}"));
        Assert.False(Freeze(module, "{\"pmId\":\"\",\"notes\":null}"));
    }

    [Fact]
    public void Every_workflow_payload_type_is_handled()
    {
        var handled = new[] { "notes", "return", "transfer-tech", "pm", "inbound-pm", "empty" };
        foreach (var screen in ErpScreenCatalog.WorkflowMetadata.GetProperty("screens").EnumerateArray())
            foreach (var button in screen.GetProperty("buttons").EnumerateArray())
                if (button.GetProperty("payloadType").ValueKind == JsonValueKind.String)
                    Assert.Contains(button.GetProperty("payloadType").GetString(), handled);
    }
}
