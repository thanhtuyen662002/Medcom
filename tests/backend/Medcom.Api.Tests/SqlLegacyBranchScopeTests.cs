using System.Data;
using Medcom.Infrastructure;
using Medcom.Contracts;
using Xunit;

namespace Medcom.Api.Tests;

// Recording DbConnection orchestration tests, not SQL Server execution evidence.
public sealed class SqlLegacyBranchScopeTests
{
    private static readonly LegacyUser User = new("qa-user", "Synthetic", "synthetic-stored-value", false, "qa-group", true);
    private static async Task<string[]> Resolve(PurchaseQuerySource source)
        => (await ResolveMetadata(source)).BranchIds;

    private static async Task<SqlLegacyBranchScope.Resolution> ResolveMetadata(PurchaseQuerySource source)
    {
        await using var connection = new QueryConnection(source);
        await connection.OpenAsync();
        await using var transaction = await connection.BeginTransactionAsync(IsolationLevel.Serializable);
        return await SqlLegacyBranchScope.ResolveAsync(transaction, User, default);
    }

    [Theory]
    [InlineData(null, true)] [InlineData("", true)] [InlineData(" ", false)] [InlineData("\t", false)] [InlineData("QA-A", false)]
    public void Only_native_null_or_zero_length_is_all(string? native, bool expected)
        => Assert.Equal(expected, SqlLegacyBranchScope.NativeAll(native));

    [Theory]
    [InlineData(null)] [InlineData("")]
    public async Task Native_blank_returns_validated_catalog_without_userbranch_fallback(string? native)
    {
        var source = new PurchaseQuerySource { NativeBranch = native, NativeBranches = ["OUTSIDE"], CatalogBranches = ["QA-B", "QA-A"] };
        Assert.Equal(new[] { "QA-A", "QA-B" }, await Resolve(source));
        Assert.DoesNotContain(source.Commands, command => command.Sql == SqlLegacyBranchScope.RestrictedText);
        Assert.All(source.Commands, command => Assert.DoesNotContain("isDefault=", command.Sql, StringComparison.OrdinalIgnoreCase));
    }

    [Theory]
    [InlineData(null)] [InlineData("")] [InlineData(" ")] [InlineData("QA-A ")] [InlineData(" QA-A")] [InlineData("QA\nA")]
    public async Task Invalid_catalog_ids_fail_closed(string? invalid)
    {
        var source = new PurchaseQuerySource { NativeBranch = null, CatalogBranches = ["QA-A", invalid] };
        await Assert.ThrowsAsync<InvalidOperationException>(() => Resolve(source));
    }

    [Fact]
    public async Task Duplicate_alias_overflow_and_missing_catalog_fail_closed()
    {
        foreach (var source in new[] {
            new PurchaseQuerySource { NativeBranch = "", CatalogBranches = ["QA-A", "QA-A"] },
            new PurchaseQuerySource { NativeBranch = "", CatalogBranches = ["QA-A", "qa-a"], CatalogAlias = true },
            new PurchaseQuerySource { NativeBranch = "", CatalogBranches = Enumerable.Range(0, 201).Select(i => $"QA-{i}").ToArray() },
            new PurchaseQuerySource { NativeBranch = "", CatalogUnavailable = true },
            new PurchaseQuerySource { NativeBranch = "", CatalogShapeOk = false } })
            await Assert.ThrowsAsync<InvalidOperationException>(() => Resolve(source));
    }

    [Fact]
    public async Task Exact_bound_is_accepted_and_empty_catalog_is_never_a_wildcard()
    {
        var source = new PurchaseQuerySource { NativeBranch = null, CatalogBranches = Enumerable.Range(0, 200).Select(i => $"QA-{i}").ToArray() };
        Assert.Equal(200, (await Resolve(source)).Length);
        source.CatalogBranches = [];
        Assert.Empty(await Resolve(source));
    }

    [Fact]
    public async Task Restricted_assignments_do_not_require_or_expand_from_catalog()
    {
        var source = new PurchaseQuerySource { NativeBranches = ["QA-A", "QA-A", "QA-B"], CatalogShapeOk = false };
        Assert.Equal(new[] { "QA-A", "QA-B" }, await Resolve(source));
        Assert.DoesNotContain(source.Commands, command => command.Sql == SqlLegacyBranchScope.CatalogShapeText);
        source.NativeBranches = [];
        Assert.Empty(await Resolve(source));
    }

    [Fact]
    public async Task Failed_or_ambiguous_lookup_cannot_be_interpreted_as_native_null()
    {
        foreach (var source in new[] {
            new PurchaseQuerySource { NativeBranch = null, NativeMissing = true },
            new PurchaseQuerySource { NativeBranch = null, NativeUnavailable = true },
            new PurchaseQuerySource { NativeBranch = null, NativeDuplicate = true },
            new PurchaseQuerySource { NativeBranch = " " },
            new PurchaseQuerySource { NativeBranch = null, Username = "QA-USER" },
            new PurchaseQuerySource { NativeBranch = null, Disabled = true } })
        {
            await Assert.ThrowsAsync<InvalidOperationException>(() => Resolve(source));
            Assert.DoesNotContain(source.Commands, command => command.Sql == SqlLegacyBranchScope.CatalogText);
        }
    }

    [Theory]
    [InlineData("QA-USER")] [InlineData("qa-user ")] [InlineData("qá-user")]
    public async Task Supplemental_scope_is_bound_to_exact_physical_actor(string alias)
    {
        var source = new PurchaseQuerySource {
            NativeAssignments = [("qa-user", "QA-A"), (alias, "QA-HIDDEN")] };
        Assert.Equal(new[] { "QA-A" }, await Resolve(source));
        var command = Assert.Single(source.Commands, row => row.Sql == SqlLegacyBranchScope.RestrictedText);
        Assert.Equal("qa-user", command.Parameters["@actor"]);
        Assert.Contains("DATALENGTH(@actor)", command.Sql);
    }

    [Theory]
    [InlineData("QA-GROUP")] [InlineData("qa-group ")] [InlineData("qá-group")]
    public async Task Aliased_group_row_cannot_authorize_native_blank(string alias)
    {
        var source = new PurchaseQuerySource { NativeBranch = null, NativeGroupRowId = alias };
        await Assert.ThrowsAsync<InvalidOperationException>(() => Resolve(source));
        Assert.DoesNotContain(source.Commands, command => command.Sql == SqlLegacyBranchScope.CatalogText);
    }

    [Theory]
    [InlineData("native", false)] [InlineData("native", true)]
    [InlineData("restricted", false)] [InlineData("restricted", true)]
    [InlineData("shape", false)] [InlineData("shape", true)]
    [InlineData("catalog", false)] [InlineData("catalog", true)]
    public async Task Malformed_projection_or_extra_results_never_return_scope(string projection, bool extra)
    {
        var source = new PurchaseQuerySource { NativeBranch = projection == "restricted" ? "QA-A" : null };
        if (extra) source.ExtraScopeResult = projection;
        else source.MalformedScopeProjection = projection;
        await Assert.ThrowsAsync<InvalidOperationException>(() => Resolve(source));
    }

    [Theory]
    [InlineData("native")] [InlineData("restricted")] [InlineData("shape")] [InlineData("catalog")]
    public async Task Unexpected_column_count_never_returns_scope(string projection)
    {
        var source = new PurchaseQuerySource { NativeBranch = projection == "restricted" ? "QA-A" : null,
            ExtraScopeColumn = projection };
        await Assert.ThrowsAsync<InvalidOperationException>(() => Resolve(source));
    }

    [Theory]
    [InlineData("restricted")] [InlineData("catalog")]
    public async Task Empty_result_sets_still_require_exact_projection_schema(string projection)
    {
        var source = new PurchaseQuerySource { NativeBranch = projection == "restricted" ? "QA-A" : null,
            NativeBranches = [], CatalogBranches = [], MalformedScopeProjection = projection };
        await Assert.ThrowsAsync<InvalidOperationException>(() => Resolve(source));
    }

    [Fact]
    public void Catalog_query_guards_shape_extensions_native_aliases_and_truncation()
    {
        Assert.Contains("=17", SqlLegacyBranchScope.CatalogShapeText);
        Assert.Contains("T.user_type_id IS NULL", SqlLegacyBranchScope.CatalogShapeText);
        Assert.Contains("('BranchID','varchar',50,0)", SqlLegacyBranchScope.CatalogShapeText);
        Assert.Contains("('isDefault','bit',1,0)", SqlLegacyBranchScope.CatalogShapeText);
        Assert.Contains("TOP (201)", SqlLegacyBranchScope.CatalogText);
        Assert.Contains("COUNT_BIG(*)", SqlLegacyBranchScope.CatalogText);
        Assert.Contains("A.BranchID=C.BranchID", SqlLegacyBranchScope.CatalogText);
        Assert.DoesNotContain("DISTINCT", SqlLegacyBranchScope.CatalogText);
    }

    [Theory]
    [InlineData(null)] [InlineData("")]
    public async Task Successful_native_blank_exposes_all_only_with_validated_nonempty_catalog(string? native)
    {
        var source = new PurchaseQuerySource { NativeBranch = native, NativeBranches = ["SUPPLEMENTAL"],
            CatalogBranches = ["QA-B", "QA-A"] };
        var result = await ResolveMetadata(source);
        Assert.Equal(new BranchSelection("all", null, false), result.BranchSelection);
        Assert.Equal(new[] { "QA-A", "QA-B" }, result.BranchIds);
        source.CatalogBranches = [];
        var empty = await ResolveMetadata(source);
        Assert.Empty(empty.BranchIds); Assert.Null(empty.BranchSelection);
    }

    [Theory]
    [InlineData("QA-A")] [InlineData("QA-A;QA-B|QA-C,QA-D")] [InlineData("QA A")]
    public async Task Assigned_metadata_uses_single_native_literal_preserving_supplemental_grants(string native)
    {
        var source = new PurchaseQuerySource { NativeBranch = native, NativeBranches = [native, "SUPPLEMENTAL", native],
            CatalogShapeOk = false };
        var result = await ResolveMetadata(source);
        Assert.Equal(new BranchSelection("assigned", native, true), result.BranchSelection);
        Assert.Equal(new[] { native, "SUPPLEMENTAL" }.Order(StringComparer.Ordinal), result.BranchIds);
        Assert.DoesNotContain(source.Commands, row => row.Sql == SqlLegacyBranchScope.CatalogText);
        // Missing native literal in derived data is unavailable; never substitute a supplemental grant.
        source.NativeBranches = ["SUPPLEMENTAL"];
        var incomplete = await ResolveMetadata(source);
        Assert.Equal(new[] { "SUPPLEMENTAL" }, incomplete.BranchIds); Assert.Null(incomplete.BranchSelection);
        source.NativeBranches = [];
        var empty = await ResolveMetadata(source);
        Assert.Empty(empty.BranchIds); Assert.Null(empty.BranchSelection);
    }

    [Theory]
    [InlineData(" ")] [InlineData("\t")] [InlineData(" QA-A")] [InlineData("QA-A ")]
    [InlineData("QA\nA")] [InlineData("QA\0A")]
    public async Task Malformed_native_assignment_never_creates_selection_metadata(string native)
    {
        var source = new PurchaseQuerySource { NativeBranch = native };
        await Assert.ThrowsAsync<InvalidOperationException>(() => ResolveMetadata(source));
        Assert.DoesNotContain(source.Commands, row => row.Sql == SqlLegacyBranchScope.RestrictedText
            || row.Sql == SqlLegacyBranchScope.CatalogText);
    }

    [Fact]
    public async Task Legacy_branch_only_entrypoint_preserves_the_exact_derived_grants()
    {
        var source = new PurchaseQuerySource { NativeBranch = "QA-A", NativeBranches = ["QA-A", "SUPPLEMENTAL"] };
        await using var connection = new QueryConnection(source);
        await connection.OpenAsync();
        await using var transaction = await connection.BeginTransactionAsync(IsolationLevel.Serializable);
        Assert.Equal(new[] { "QA-A", "SUPPLEMENTAL" }, await SqlLegacyBranchScope.ReadAsync(transaction, User, default));
    }
}
