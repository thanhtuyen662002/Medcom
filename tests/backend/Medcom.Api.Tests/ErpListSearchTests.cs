using Medcom.Infrastructure.Erp;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class ErpListSearchTests
{
    [Fact]
    public void Lists_with_an_object_also_search_its_code_and_name()
    {
        // "Tìm mã, đối tượng…" found DN1026/0009 by its number but not by its supplier MINH PHƯƠNG (prod 30/10).
        var inbound = ErpSqlPlan.Get("inbound-requests")!;
        Assert.Contains("H.ObjectID LIKE @search", inbound.ListText);
        Assert.Contains("dbo.CF_ObjectTbl SO WITH(HOLDLOCK) WHERE SO.ObjectID=H.ObjectID AND SO.ObjectName LIKE @search", inbound.ListText);
        var batches = ErpSqlPlan.Get("internal-transfer-batches")!;
        Assert.DoesNotContain("CF_ObjectTbl", batches.ListText);
    }
}
