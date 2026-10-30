using System.Text.Json;
using Medcom.Infrastructure.Erp;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class ErpLookupParameterValueTests
{
    private static Dictionary<string, JsonElement> Values(string json) =>
        JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json)!;

    [Fact]
    public void Master_parameters_read_the_header_and_others_fall_back_to_the_row()
    {
        // The batch request picker is bound to Master.FromBranchID;Master.ToBranchID (prod 30/10 refused every create).
        var header = Values("""{"fromBranchId":"MB","toBranchId":"MN","objectId":"KH01"}""");
        var row = Values("""{"requestId":"DCNB1026/0004","toBranchId":"XX","contractId":"HD01"}""");
        Assert.Equal("MB", SqlErpScreenCommands.ParameterValue("Master.FromBranchID", header, row));
        Assert.Equal("MN", SqlErpScreenCommands.ParameterValue("Master.ToBranchID", header, row));
        Assert.Equal("KH01", SqlErpScreenCommands.ParameterValue("ObjectID", header, row));
        Assert.Equal("HD01", SqlErpScreenCommands.ParameterValue("ContractID", header, row));
        Assert.Equal("", SqlErpScreenCommands.ParameterValue("Master.ContractID", header, row));
    }
}
