using System.Data;
using System.Data.Common;
using Medcom.Application.PurchaseRequests;
using Medcom.Contracts;
using Medcom.Infrastructure;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class NativeIdentityBatchTests
{
    private static readonly LegacyUser User = new("fixture.actor", "Synthetic actor", "synthetic.hash", false, "fixture.group", true);

    [Theory]
    [InlineData("assigned", "allowed")][InlineData("all-null", "allowed")][InlineData("all-empty", "allowed")]
    [InlineData("assigned-supplemental", "allowed")][InlineData("assigned-duplicate", "allowed")]
    [InlineData("disabled", "denied")][InlineData("disabled-group", "denied")][InlineData("changed-password", "denied")]
    [InlineData("wrong-actor", "denied")][InlineData("missing-user", "denied")][InlineData("duplicate-user", "denied")]
    [InlineData("null-group", "denied")][InlineData("empty-hash", "denied")]
    [InlineData("whitespace", "invalid")][InlineData("invalid-branch", "invalid")][InlineData("excess-assigned", "invalid")]
    [InlineData("all-duplicate", "invalid")][InlineData("all-alias", "invalid")][InlineData("all-overflow", "invalid")]
    [InlineData("all-null-branch", "invalid")][InlineData("all-invalid-shape", "invalid")]
    [InlineData("all-extra-shape-row", "invalid")][InlineData("missing-scope-result", "invalid")]
    [InlineData("missing-catalog-result", "invalid")][InlineData("extra-result", "invalid")]
    [InlineData("wrong-user-type", "invalid")][InlineData("extra-user-column", "invalid")]
    [InlineData("wrong-branch-type", "invalid")]
    public async Task Batched_authority_keeps_native_identity_scope_and_result_boundaries(string scenario, string expected)
    {
        var sets = NativeSets(scenario); var reads = 0;
        await using var connection = new DisplayConnection(command =>
        {
            reads++; Assert.Equal(SqlNativeIdentity.Text, command.CommandText);
            Assert.Equal(DbType.String, command.Parameters["@actor"].DbType);
            Assert.Equal(User.Username, command.Parameters["@actor"].Value);
            return new DataTableReader(sets.ToArray());
        });
        await connection.OpenAsync();
        await using var transaction = await connection.BeginTransactionAsync(IsolationLevel.Serializable);
        Task<SqlNativeIdentity.Observation?> Read() => SqlNativeIdentity.ReadAsync(transaction, User.Username,
            current => LegacyIdentityAuthority.Stamp(current) == LegacyIdentityAuthority.Stamp(User), default);
        if (expected == "invalid") await Assert.ThrowsAsync<InvalidOperationException>(Read);
        else
        {
            var result = await Read();
            if (expected == "denied") Assert.Null(result);
            else
            {
                Assert.NotNull(result); Assert.Equal(User.Username, result.User.Username);
                Assert.Equal(scenario.StartsWith("all-", StringComparison.Ordinal)
                    ? new BranchSelection("all", null, false) : new BranchSelection("assigned", "QA-A", true), result.Scope.BranchSelection);
                Assert.Equal(scenario == "assigned-supplemental" ? new[] { "QA-A", "QA-B" } : new[] { "QA-A" }, result.Scope.BranchIds);
            }
        }
        Assert.Equal(1, reads);
        await transaction.RollbackAsync();
    }

    [Theory]
    [InlineData("allowed", true)][InlineData("purchase-no-run", false)][InlineData("purchase-parent-disabled", false)]
    [InlineData("purchase-parent-missing", false)][InlineData("purchase-menu-disabled", false)]
    [InlineData("purchase-form-changed", false)][InlineData("purchase-parameterized", false)]
    [InlineData("purchase-duplicate", false)][InlineData("purchase-missing", false)]
    [InlineData("credential-missing", false)][InlineData("credential-duplicate", false)]
    [InlineData("credential-changed", false)][InlineData("credential-disabled", false)]
    [InlineData("credential-group-disabled", false)][InlineData("credential-long-group", false)]
    public async Task Identity_capabilities_use_one_batch_and_keep_strict_purchase_read_policy(string scenario, bool purchaseAllowed)
    {
        var source = new PurchaseQuerySource();
        source.PermissionRead = command =>
        {
            Assert.Equal(SqlIdentityCapabilities.Text, command.CommandText);
            Assert.Equal(DbType.AnsiString, command.Parameters["@username"].DbType);
            Assert.Equal(DbType.AnsiString, command.Parameters["@group"].DbType);
            Assert.Equal(DbType.String, command.Parameters["@purchaseUsername"].DbType);
            Assert.Equal(DbType.String, command.Parameters["@purchaseGroup"].DbType);
            Assert.Equal(PurchaseRequestCommandRules.MenuId, command.Parameters["@menu"].Value);
            Assert.Equal(DbType.AnsiString, command.Parameters["@menuSeek"].DbType);
            Assert.Equal(PurchaseRequestCommandRules.MenuId, command.Parameters["@menuSeek"].Value);
            return new DataTableReader(CapabilitySets(scenario).ToArray());
        };
        await using var connection = new QueryConnection(source); await connection.OpenAsync();
        await using var transaction = await connection.BeginTransactionAsync(IsolationLevel.Serializable);
        var result = await SqlIdentityCapabilities.ReadAsync(transaction, User, default);
        Assert.Equal(User.DisplayName, result.DisplayName); Assert.Equal(User.StoredHash, result.StoredHash);
        Assert.Equal(new[] { "QA-A" }, result.BranchIds);
        var capabilities = Assert.IsAssignableFrom<IReadOnlyCollection<string>>(result.Capabilities);
        Assert.Equal(purchaseAllowed, capabilities.Contains("purchase-requests.read"));
        Assert.Contains("purchase-orders.read", capabilities);
        Assert.DoesNotContain("sales-orders.read", capabilities);
        Assert.Equal(purchaseAllowed ? 2 : 1, capabilities.Count);
        Assert.Single(source.Commands); Assert.Equal(1, source.CommandDisposals); Assert.Equal(1, source.ReaderDisposals);
        await transaction.RollbackAsync(); Assert.Equal(0, source.Commits);
    }

    [Theory]
    [InlineData("missing-capabilities")][InlineData("missing-credential")][InlineData("missing-grant")]
    [InlineData("extra-result")][InlineData("wrong-capability-shape")][InlineData("wrong-credential-shape")]
    [InlineData("wrong-grant-shape")][InlineData("native-changed")]
    public async Task Partial_or_changed_capability_batches_never_publish_an_identity(string scenario)
    {
        var source = new PurchaseQuerySource { PermissionRead = _ => new DataTableReader(CapabilitySets(scenario).ToArray()) };
        await using var connection = new QueryConnection(source); await connection.OpenAsync();
        await using var transaction = await connection.BeginTransactionAsync(IsolationLevel.Serializable);
        await Assert.ThrowsAsync<InvalidOperationException>(() => SqlIdentityCapabilities.ReadAsync(transaction, User, default));
        Assert.Equal(1, source.CommandDisposals); Assert.Equal(1, source.ReaderDisposals);
        await transaction.RollbackAsync(); Assert.Equal(0, source.Commits);
    }

    [Fact]
    public void Purchase_menu_narrowing_preserves_every_original_physical_authority_predicate()
    {
        var normalized = SqlIdentityCapabilities.PurchaseGrantsText
            .Replace("WHERE P.MenuID=@menuSeek AND DATALENGTH", "WHERE DATALENGTH", StringComparison.Ordinal)
            .Replace("@purchaseUsername", "@username", StringComparison.Ordinal)
            .Replace("@purchaseGroup", "@group", StringComparison.Ordinal);
        Assert.Equal(Medcom.Infrastructure.PurchaseRequests.SqlPurchaseRequestQueries.GrantsText, normalized);
        Assert.Equal(3, SqlIdentityCapabilities.PurchaseGrantsText.Split("P.MenuID=@menuSeek", StringSplitOptions.None).Length - 1);
        Assert.All(ErpScreenCatalog.ModuleIds, id => Assert.Matches("^[0-9]+$", ErpScreenCatalog.Get(id)!.MenuId));
    }

    [Fact]
    public async Task Each_observation_reads_fresh_authority_and_nonserializable_calls_are_rejected()
    {
        var current = User; var reads = 0;
        await using var connection = new DisplayConnection(_ =>
        {
            reads++; return new DataTableReader(NativeSets(current.Disabled ? "disabled" : "assigned").ToArray());
        });
        await connection.OpenAsync();
        await using (var transaction = await connection.BeginTransactionAsync(IsolationLevel.Serializable))
        {
            Assert.NotNull(await SqlNativeIdentity.ReadAsync(transaction, User.Username, _ => true, default));
            current = current with { Disabled = true };
            Assert.Null(await SqlNativeIdentity.ReadAsync(transaction, User.Username, _ => true, default));
        }
        await using (var transaction = await connection.BeginTransactionAsync(IsolationLevel.ReadCommitted))
            await Assert.ThrowsAsync<InvalidOperationException>(() => SqlNativeIdentity.ReadAsync(transaction, User.Username, _ => true, default));
        Assert.Equal(2, reads);
    }

    private static List<DataTable> NativeSets(string scenario)
    {
        var native = Table([typeof(string), typeof(string), typeof(bool), typeof(string), typeof(bool), typeof(string)],
            [User.Username, User.StoredHash, false, User.GroupId, false, scenario.StartsWith("all-", StringComparison.Ordinal) ? null : "QA-A"]);
        if (scenario == "all-empty") native.Rows[0][5] = "";
        if (scenario == "disabled") native.Rows[0][2] = true;
        if (scenario == "disabled-group") native.Rows[0][4] = true;
        if (scenario == "changed-password") native.Rows[0][1] = "changed";
        if (scenario == "wrong-actor") native.Rows[0][0] = "other.actor";
        if (scenario == "missing-user") native.Rows.Clear();
        if (scenario == "duplicate-user") native.Rows.Add(native.Rows[0].ItemArray);
        if (scenario == "null-group") native.Rows[0][3] = DBNull.Value;
        if (scenario == "empty-hash") native.Rows[0][1] = "";
        if (scenario == "whitespace") native.Rows[0][5] = " ";
        if (scenario == "wrong-user-type") native = Table([typeof(int)], [1]);
        if (scenario == "extra-user-column") native.Columns.Add("extra", typeof(int));
        var result = new List<DataTable> { native };
        if (scenario.StartsWith("all-", StringComparison.Ordinal) || scenario == "missing-catalog-result")
        {
            if (scenario == "missing-catalog-result") native.Rows[0][5] = DBNull.Value;
            result.Add(Table([typeof(int)], [scenario == "all-invalid-shape" ? 0 : 1]));
            if (scenario == "all-extra-shape-row") result[^1].Rows.Add(1);
            if (scenario == "missing-catalog-result") return result;
            var catalog = Table([typeof(string), typeof(int)], ["QA-A", scenario == "all-alias" ? 1 : 0]);
            if (scenario == "all-duplicate") catalog.Rows.Add("QA-A", 0);
            if (scenario == "all-null-branch") catalog.Rows[0][0] = DBNull.Value;
            if (scenario == "all-overflow") for (var i = 0; i < 200; i++) catalog.Rows.Add("QA-" + i, 0);
            result.Add(catalog);
        }
        else
        {
            var branches = Table([typeof(string)], [scenario == "invalid-branch" ? " QA-A " : "QA-A"]);
            if (scenario == "assigned-supplemental") branches.Rows.Add("QA-B");
            if (scenario == "assigned-duplicate") branches.Rows.Add("QA-A");
            if (scenario == "excess-assigned") for (var i = 0; i < 400; i++) branches.Rows.Add("QA-A");
            if (scenario == "wrong-branch-type") branches = Table([typeof(int)], [1]);
            result.Add(branches);
        }
        if (scenario == "missing-scope-result") result.RemoveAt(1);
        if (scenario == "extra-result") result.Add(Table([typeof(int)], [1]));
        return result;
    }

    private static List<DataTable> CapabilitySets(string scenario)
    {
        var sets = NativeSets("assigned");
        var order = ErpScreenCatalog.Get("purchase-orders")!;
        sets.Add(Table([typeof(string), typeof(string)], [order.MenuId, order.FormId], ["unknown-menu", "UnknownFrm"]));
        sets.Add(Table([typeof(string), typeof(string), typeof(bool), typeof(string), typeof(bool)],
            [User.Username, User.StoredHash, false, User.GroupId, false]));
        sets.Add(Table([typeof(string), typeof(string), typeof(string), typeof(bool), typeof(string), typeof(bool), typeof(int), typeof(int)],
            [PurchaseRequestCommandRules.MenuId, PurchaseRequestCommandRules.FormId, null, false, "05", false, 1, 1]));
        var credential = sets[3]; var grant = sets[4];
        if (scenario == "purchase-no-run") grant.Rows[0][6] = 0;
        if (scenario == "purchase-parent-disabled") grant.Rows[0][5] = true;
        if (scenario == "purchase-parent-missing") grant.Rows[0][4] = DBNull.Value;
        if (scenario == "purchase-menu-disabled") grant.Rows[0][3] = true;
        if (scenario == "purchase-form-changed") grant.Rows[0][1] = "OtherFrm";
        if (scenario == "purchase-parameterized") grant.Rows[0][2] = "argument";
        if (scenario == "purchase-duplicate") grant.Rows.Add(grant.Rows[0].ItemArray);
        if (scenario == "purchase-missing") grant.Rows.Clear();
        if (scenario == "credential-missing") credential.Rows.Clear();
        if (scenario == "credential-duplicate") credential.Rows.Add(credential.Rows[0].ItemArray);
        if (scenario == "credential-changed") credential.Rows[0][1] = "changed";
        if (scenario == "credential-disabled") credential.Rows[0][2] = true;
        if (scenario == "credential-group-disabled") credential.Rows[0][4] = true;
        if (scenario == "credential-long-group") credential.Rows[0][3] = new string('x', 21);
        if (scenario == "native-changed") sets[0].Rows[0][1] = "changed";
        if (scenario == "wrong-capability-shape") sets[2].Columns.Add("extra");
        if (scenario == "wrong-credential-shape") sets[3].Columns.Add("extra");
        if (scenario == "wrong-grant-shape") sets[4].Columns.Add("extra");
        if (scenario == "missing-capabilities") sets.RemoveRange(2, 3);
        if (scenario == "missing-credential") sets.RemoveRange(3, 2);
        if (scenario == "missing-grant") sets.RemoveAt(4);
        if (scenario == "extra-result") sets.Add(Table([typeof(int)], [1]));
        return sets;
    }

    private static DataTable Table(Type[] types, params object?[][] rows)
    {
        var table = new DataTable(); foreach (var type in types) table.Columns.Add("c" + table.Columns.Count, type);
        foreach (var row in rows) table.Rows.Add(row.Select(value => value ?? DBNull.Value).ToArray()); return table;
    }
}
