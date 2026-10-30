using Medcom.Infrastructure.Erp;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class ErpSavedParameterTests
{
    [Fact]
    public void A_header_parameter_the_step_does_not_send_comes_from_the_saved_document()
    {
        // Kế toán điều chuyển sends only OutputDocumentID; its picker is bound to FromStoreHouseID (prod 30/10).
        var saved = new Dictionary<string, object?> { ["fromStoreHouseId"] = "CL1" };
        Assert.Equal("CL1", SqlErpScreenCommands.SavedParameter("", "FromStoreHouseID", "header", saved));
        Assert.Equal("CL2", SqlErpScreenCommands.SavedParameter("CL2", "FromStoreHouseID", "header", saved));
        Assert.Equal("", SqlErpScreenCommands.SavedParameter("", "FromStoreHouseID", "lines", saved));
        Assert.Equal("", SqlErpScreenCommands.SavedParameter("", "ToStoreHouseID", "header", saved));
        Assert.Equal("", SqlErpScreenCommands.SavedParameter("", "FromStoreHouseID", "header", null));
    }
}
