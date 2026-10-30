using Medcom.Contracts;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class ErpBatchWarehouseVisibilityTests
{
    [Fact]
    public void The_batch_form_shows_its_branches_and_warehouses_but_keeps_assignees_hidden()
    {
        // Owner 30/10: Kho nguồn / Đến kho are on the ERP batch form; ERP refuses Gửi TP SA without them.
        foreach (var field in new[] { "fromBranchId", "toBranchId", "fromStoreHouseId", "toStoreHouseId" })
            Assert.False(ErpVisibleFields.IsHidden("internal-transfer-batches", "header", field), field);
        Assert.True(ErpVisibleFields.IsHidden("internal-transfer-batches", "header", "assignedPM"));
        Assert.True(ErpVisibleFields.IsHidden("internal-transfer-requests", "header", "fromBranchId"));
    }
}
