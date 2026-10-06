using System.Collections;
using System.Data;
using System.Data.Common;
using System.Diagnostics.CodeAnalysis;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Medcom.Application;
using Medcom.Application.PurchaseRequests;
using Medcom.Contracts;
using Medcom.Infrastructure;
using Medcom.Infrastructure.PurchaseRequests;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class PurchaseRequestQueryTests
{
    [Fact]
    public async Task Complete_read_preserves_101_lines_hidden_values_and_exact_I14_token()
    {
        var source = new PurchaseQuerySource(); source.Seed(101);
        var result = await source.Service().OpenAsync("QA-DOC");
        Assert.Equal(PurchaseRequestQueryOutcome.Success, result.Outcome);
        Assert.Equal(101, result.Value!.Document.Lines.Count);
        Assert.Equal("999999999999999999", result.Value.Document.Lines[0].Values.Quantity);
        Assert.Equal("15.25", result.Value.Document.Header.Price); Assert.Equal(1.25, result.Value.Document.Header.RateExchange);
        Assert.Equal("2026-10-06T13:14:15.000", result.Value.Document.Header.PurchaseDate);
        Assert.Null(result.Value.Document.Header.Notes); Assert.Null(result.Value.Document.IsLocked);
        Assert.Equal(PurchaseRequestCommandRules.EqualityToken(source.Documents[0]), result.Value.StateToken);
        Assert.Equal(0, source.Commits); Assert.Equal(1, source.Rollbacks);
        Assert.All(source.Commands, command => Assert.True(command.Sql.TrimStart().StartsWith("SELECT", StringComparison.Ordinal)
            || command.Sql.TrimStart().StartsWith("WITH", StringComparison.Ordinal)));
    }
    [Fact]
    public async Task Incompatible_source_shape_fails_before_any_document_projection()
    {
        var source=new PurchaseQuerySource();source.Seed();source.ShapeOk=false;
        Assert.Equal(PurchaseRequestQueryOutcome.Unavailable,(await source.Service().OpenAsync("QA-DOC")).Outcome);
        Assert.DoesNotContain(source.Commands,command=>command.Sql.Contains("FROM dbo.AP_PurchaseRequestTbl",StringComparison.Ordinal));
        Assert.DoesNotContain(source.Commands,command=>command.Sql.Contains("MedcomPurchaseRequestCommandJournal",StringComparison.Ordinal));
    }
    [Theory]
    [InlineData("quantity")] [InlineData("price")] [InlineData("date")]
    public async Task Raw_nonrepresentable_values_are_rejected_before_formatting_can_round_them(string field)
    {
        var source=new PurchaseQuerySource();source.Seed();var document=source.Documents[0];
        source.Documents[0]=field switch {
            "quantity"=>document with {Lines=[document.Lines[0] with {Values=document.Lines[0].Values with {Quantity="0.5"}}]},
            "price"=>document with {Header=document.Header with {Price="15.251"}},
            _=>document with {Header=document.Header with {PurchaseDate="2026-10-06T13:14:15.001"}}};
        var result=await source.Service().OpenAsync("QA-DOC");Assert.Equal(PurchaseRequestQueryOutcome.Unavailable,result.Outcome);Assert.Null(result.Value);
    }
    [Theory]
    [InlineData("qa-doc")] [InlineData("QA-DOC ")] [InlineData("QA-DÓC")]
    public async Task Native_SQL_equal_hidden_children_are_fetched_then_rejected(string foreignKey)
    {
        var source = new PurchaseQuerySource(); source.Seed(); source.ExtraChildren.Add((foreignKey, source.Documents[0].Lines[0] with { LineId = "QA-HIDDEN" }));
        var result = await source.Service().OpenAsync("QA-DOC");
        Assert.Equal(PurchaseRequestQueryOutcome.Unavailable, result.Outcome); Assert.Null(result.Value);
    }
    [Theory]
    [InlineData("qa-doc")] [InlineData("QA-DOC ")]
    public async Task Native_equal_master_alias_never_selects_one_arbitrary_document(string documentId)
    {
        var source = new PurchaseQuerySource(); source.Seed();
        source.Documents.Add(source.Documents[0] with { PurchaseRequestId = documentId, BranchId = "QA-B" });
        Assert.Equal(PurchaseRequestQueryOutcome.NotFound, (await source.Service().OpenAsync("QA-DOC")).Outcome);
        Assert.Equal(PurchaseRequestQueryOutcome.Unavailable, (await source.Service().ListAsync(new())).Outcome);
    }
    [Fact]
    public async Task Native_equal_line_identity_in_another_parent_is_rejected()
    {
        var source = new PurchaseQuerySource(); source.Seed();
        source.ExtraChildren.Add(("QA-OTHER", source.Documents[0].Lines[0] with { LineId = source.Documents[0].Lines[0].LineId.ToLowerInvariant() }));
        Assert.Equal(PurchaseRequestQueryOutcome.Unavailable, (await source.Service().OpenAsync("QA-DOC")).Outcome);
    }
    [Fact]
    public async Task Byte_identical_master_duplicate_in_an_unlisted_branch_is_ambiguous()
    {
        var source = new PurchaseQuerySource(); source.Seed();
        source.Documents.Add(source.Documents[0] with { BranchId = "QA-HIDDEN" });
        var result = await source.Service().ListAsync(new(BranchId: "QA-A"));
        Assert.Equal(PurchaseRequestQueryOutcome.Unavailable, result.Outcome);
        Assert.Null(result.Value);
    }
    [Fact]
    public async Task Byte_identical_line_identity_in_another_parent_is_ambiguous()
    {
        var source = new PurchaseQuerySource(); source.Seed();
        source.ExtraChildren.Add(("QA-OTHER", source.Documents[0].Lines[0]));
        var result = await source.Service().OpenAsync("QA-DOC");
        Assert.Equal(PurchaseRequestQueryOutcome.Unavailable, result.Outcome);
        Assert.Null(result.Value);
    }
    [Fact]
    public async Task Physical_branch_filter_excludes_collation_aliases_and_new_native_revocation()
    {
        var source = new PurchaseQuerySource(); source.Seed();
        source.Documents.Add(source.Documents[0] with { PurchaseRequestId = "QA-ALIAS-BRANCH", BranchId = "qa-a" });
        var list = await source.Service().ListAsync(new(BranchId: "QA-A"));
        Assert.Equal("QA-DOC", Assert.Single(list.Value!.Rows).DocumentId);
        source.NativeBranches = ["QA-B"];
        Assert.Equal(PurchaseRequestQueryOutcome.Denied, (await source.Service().ListAsync(new(BranchId: "QA-A"))).Outcome);
        Assert.Equal(PurchaseRequestQueryOutcome.NotFound, (await source.Service().OpenAsync("QA-DOC")).Outcome);
    }
    [Theory]
    [InlineData("principal")] [InlineData("group")] [InlineData("disabled")] [InlineData("stamp")]
    public async Task Current_credential_and_group_are_checked_inside_the_read_transaction(string mutation)
    {
        var source = new PurchaseQuerySource(); source.Seed();
        switch (mutation) { case "principal": source.Username="QA-USER"; break; case "group": source.Group="qa-alias-group"; break; case "disabled": source.Disabled=true; break; case "stamp": source.StoredHash="changed-synthetic-value"; break; }
        Assert.Equal(PurchaseRequestQueryOutcome.Denied, (await source.Service().OpenAsync("QA-DOC")).Outcome);
        Assert.DoesNotContain(source.Commands, command => command.Sql.Contains("AP_PurchaseRequestTbl", StringComparison.Ordinal));
    }
    [Theory]
    [InlineData("run")] [InlineData("menu")] [InlineData("form")] [InlineData("parameter")] [InlineData("parent")]
    public async Task Exact_native_Run_menu_form_parameter_and_parent_are_required(string mutation)
    {
        var source = new PurchaseQuerySource(); source.Seed();
        switch (mutation) { case "run": source.CanRun=false; break; case "menu": source.Menu="050129"; break; case "form": source.Form="AP_OrderFrm"; break; case "parameter": source.Parameter="unexpected"; break; case "parent": source.Parent="05 "; break; }
        Assert.Equal(PurchaseRequestQueryOutcome.Denied, (await source.Service().OpenAsync("QA-DOC")).Outcome);
    }
    [Theory]
    [InlineData("logout")] [InlineData("branch")] [InlineData("capability")] [InlineData("company")]
    public async Task Revocation_during_a_read_suppresses_the_entire_result(string mutation)
    {
        var source = new PurchaseQuerySource(); source.Seed();
        source.AfterData = () => source.Identity = mutation switch {
            "logout" => null, "branch" => source.Identity! with { BranchIds=["QA-B"] },
            "capability" => source.Identity! with { Capabilities=[] }, _ => source.Identity! with { CompanyId="other" } };
        var result = await source.Service().OpenAsync("QA-DOC");
        Assert.Equal(PurchaseRequestQueryOutcome.Denied, result.Outcome); Assert.Null(result.Value);
    }
    [Fact]
    public async Task Invalid_queries_and_ineligible_sessions_never_open_a_connection()
    {
        var source = new PurchaseQuerySource();
        foreach (var query in new[] { new PurchaseRequestListQuery(0), new(1001), new(PageSize:51), new(Search:new string('x',101)), new(BranchId:"QA-A ") })
            Assert.Equal(PurchaseRequestQueryOutcome.Invalid, (await source.Service().ListAsync(query)).Outcome);
        Assert.Equal(PurchaseRequestQueryOutcome.Invalid, (await source.Service().OpenAsync("QA-DOC ")).Outcome);
        Assert.Equal(PurchaseRequestQueryOutcome.Invalid, (await source.Service().LookupAsync("dbo.SY_User", "", 1)).Outcome);
        Assert.Equal(PurchaseRequestQueryOutcome.Invalid, (await source.Service().LookupAsync("purposes", new string('x', 101), 1)).Outcome);
        Assert.Equal(PurchaseRequestQueryOutcome.Invalid, (await source.Service().LookupAsync("currencies", "", 1001)).Outcome);
        source.Identity=source.Identity! with { TenantId="other" };
        Assert.Equal(PurchaseRequestQueryOutcome.Denied, (await source.Service().WorkspaceAsync()).Outcome); Assert.Equal(0,source.Opens);
    }
    [Fact]
    public async Task Parameterized_paging_search_and_lookup_qualification_have_real_results()
    {
        var source=new PurchaseQuerySource(); source.Seed();
        for(var i=0;i<21;i++)source.Documents.Add(source.Documents[0] with { PurchaseRequestId=$"QA-{i:000}" });
        var page=await source.Service().ListAsync(new(PageSize:20));
        Assert.Equal(20,page.Value!.Rows.Count); Assert.True(page.Value.HasMore);
        var second=await source.Service().ListAsync(new(Page:2,PageSize:20)); Assert.Equal(2,second.Value!.Rows.Count); Assert.False(second.Value.HasMore);
        await source.Service().ListAsync(new(Search:"%'_[]~"));
        var command=source.Commands.Last(c=>c.Sql.Contains("OFFSET @skip",StringComparison.Ordinal));
        Assert.Equal("%~%'~_~[]~~%",command.Parameters["@search"]);
        Assert.DoesNotContain("%'_[]~",command.Sql,StringComparison.Ordinal);
        var bootstrap=await source.Service().WorkspaceAsync(); Assert.False(bootstrap.Value!.WriteAvailable);
        var items=await source.Service().LookupAsync("items","",1); Assert.False(items.Value!.Available); Assert.Empty(items.Value.Items);
        var branches=await source.Service().LookupAsync("branches","QA-A",1); Assert.Equal(new PurchaseRequestChoice("QA-A","QA-A"),Assert.Single(branches.Value!.Items));
        Assert.DoesNotContain(source.Commands,c=>c.Sql.Contains("CF_ItemTbl",StringComparison.Ordinal));
    }
    [Theory]
    [InlineData(null)] [InlineData("")]
    public async Task Native_blank_catalog_scope_is_applied_to_actual_query_parameters(string? native)
    {
        var source = new PurchaseQuerySource { NativeBranch = native, NativeBranches = [] };
        source.Seed();
        source.Documents.Add(source.Documents[0] with { PurchaseRequestId = "QA-B-DOC", BranchId = "QA-B" });
        source.Documents.Add(source.Documents[0] with { PurchaseRequestId = "QA-HIDDEN", BranchId = "QA-C" });
        var page = await source.Service().ListAsync(new());
        Assert.Equal(PurchaseRequestQueryOutcome.Success, page.Outcome);
        Assert.Equal(2, page.Value!.Rows.Count);
        var command = source.Commands.Single(c => c.Sql.Contains("OFFSET @skip", StringComparison.Ordinal));
        Assert.Equal("QA-A", command.Parameters["@branch0"]);
        Assert.Equal("QA-B", command.Parameters["@branch1"]);
        Assert.Contains("DATALENGTH(@branch0)", command.Sql);
        Assert.DoesNotContain(source.Commands, c => c.Sql == SqlPurchaseRequestQueries.BranchesText);
    }
    [Theory]
    [InlineData("missing")] [InlineData("duplicate")] [InlineData("whitespace")]
    [InlineData("shape")] [InlineData("alias")] [InlineData("overflow")] [InlineData("empty")]
    public async Task Invalid_native_or_catalog_scope_never_reads_documents(string failure)
    {
        var source = new PurchaseQuerySource { NativeBranch = null }; source.Seed();
        switch (failure)
        {
            case "missing": source.NativeMissing = true; break;
            case "duplicate": source.NativeDuplicate = true; break;
            case "whitespace": source.NativeBranch = " "; break;
            case "shape": source.CatalogShapeOk = false; break;
            case "alias": source.CatalogAlias = true; break;
            case "overflow": source.CatalogBranches = Enumerable.Range(0, 201).Select(i => $"B{i}").ToArray(); break;
            case "empty": source.CatalogBranches = []; break;
        }
        var result = await source.Service().ListAsync(new());
        Assert.Contains(result.Outcome, new[] { PurchaseRequestQueryOutcome.Unavailable, PurchaseRequestQueryOutcome.Denied });
        Assert.Null(result.Value);
        Assert.DoesNotContain(source.Commands, c => c.Sql.Contains("FROM dbo.AP_PurchaseRequestTbl", StringComparison.Ordinal));
    }
    [Fact]
    public async Task Catalog_changes_and_native_restriction_replace_scope_at_each_read()
    {
        var source = new PurchaseQuerySource { NativeBranch = "" }; source.Seed();
        Assert.Equal(2, (await source.Service().WorkspaceAsync()).Value!.BranchIds.Count);
        source.CatalogBranches = ["QA-B"];
        Assert.Equal(PurchaseRequestQueryOutcome.NotFound, (await source.Service().OpenAsync("QA-DOC")).Outcome);
        source.NativeBranch = "QA-A"; source.NativeBranches = ["QA-A"];
        Assert.Equal(PurchaseRequestQueryOutcome.Success, (await source.Service().OpenAsync("QA-DOC")).Outcome);
        source.NativeBranch = null; source.CatalogBranches = ["QA-B"];
        Assert.Equal(PurchaseRequestQueryOutcome.NotFound, (await source.Service().OpenAsync("QA-DOC")).Outcome);
    }
    [Theory]
    [InlineData("run")] [InlineData("credential")] [InlineData("group")]
    public async Task Native_all_never_bypasses_native_rights_or_identity(string failure)
    {
        var source = new PurchaseQuerySource { NativeBranch = null }; source.Seed();
        if (failure == "run") source.CanRun = false;
        else if (failure == "credential") source.StoredHash = "revoked";
        else source.Group = "other-group";
        Assert.Equal(PurchaseRequestQueryOutcome.Denied, (await source.Service().ListAsync(new())).Outcome);
        Assert.DoesNotContain(source.Commands, c => c.Sql == SqlLegacyBranchScope.CatalogText);
    }

    [Fact]
    public async Task Source_pinned_reference_reads_preserve_null_names_and_all_finite_rates_without_writes()
    {
        var source = new PurchaseQuerySource { LookupShapeOk = true };
        source.Purposes.AddRange([(-7, null), (1, ""), (2, "  Synthetic purpose  ")]);
        source.Currencies.AddRange([("NEG", "A synthetic", -2.5), ("ZER", "B synthetic", 0), ("POS", "C synthetic", double.Epsilon)]);
        var purposes = await source.Service().LookupAsync("purposes", null, 1);
        Assert.Equal(PurchaseRequestQueryOutcome.Success, purposes.Outcome);
        Assert.True(purposes.Value!.Available); Assert.Null(purposes.Value.Items[0].Label);
        Assert.Equal("-7", purposes.Value.Items[0].Id); Assert.Equal("", purposes.Value.Items[1].Label);
        Assert.Equal("  Synthetic purpose  ", purposes.Value.Items[2].Label);
        var currencies = await source.Service().LookupAsync("currencies", "", 1);
        Assert.Equal(PurchaseRequestQueryOutcome.Success, currencies.Outcome);
        Assert.Equal(new double?[] { -2.5, 0, double.Epsilon }, currencies.Value!.Items.Select(item => item.RateExchange));
        Assert.All(currencies.Value.Items, item => Assert.Equal(item.Id, item.Label));
        Assert.Equal("A synthetic", currencies.Value.Items[0].CurrencyName);
        var workspace = (await source.Service().WorkspaceAsync()).Value!;
        Assert.True(workspace.Lookups.Single(item => item.Kind == "purposes").Available);
        Assert.True(workspace.Lookups.Single(item => item.Kind == "currencies").Available);
        Assert.False(workspace.WriteAvailable); Assert.False(workspace.Lookups.Single(item => item.Kind == "items").Available);
        Assert.Equal(0, source.Commits); Assert.Equal(3, source.Rollbacks);
        Assert.All(source.Commands, command => Assert.StartsWith("SELECT", command.Sql.TrimStart(), StringComparison.Ordinal));
        Assert.DoesNotContain(source.Commands, command => command.Sql.Contains("MedcomPurchaseRequestCommandJournal", StringComparison.Ordinal));
        Assert.Equal(source.Opens, source.ConnectionDisposals); Assert.Equal(source.Opens, source.TransactionDisposals);
        Assert.Equal(source.Commands.Count, source.ReaderDisposals); Assert.Equal(source.Commands.Count, source.CommandDisposals);
    }
    [Theory]
    [InlineData("purposes")] [InlineData("currencies")]
    public async Task Every_binding_value_and_SQL_null_distinction_is_required(string kind)
    {
        // Independent synthetic metadata fixture: Source never enters product code or public tests.
        var baseline = PurchaseQuerySource.Binding(kind == "purposes");
        foreach (var column in baseline.Where(column => column.Name != "UserAutoID"))
        {
            var source = new PurchaseQuerySource { LookupShapeOk = true };
            source.BindingOverrides[column.Name] = column.Value is null ? "" : column.Value switch
            { bool value => !value, byte[] => new byte[32], int => 1, _ => "drift" };
            var result = await source.Service().LookupAsync(kind, "", 1);
            Assert.True(result.Outcome == PurchaseRequestQueryOutcome.Unavailable
                || result.Outcome == PurchaseRequestQueryOutcome.Success && result.Value is { Available: false });
            Assert.DoesNotContain(source.Commands, command => command.Sql == PurchaseRequestLookupSql.PurposeText || command.Sql == PurchaseRequestLookupSql.CurrencyText);
        }
    }
    [Theory]
    [InlineData("missing")] [InlineData("duplicate")] [InlineData("form-alias")] [InlineData("column-alias")]
    [InlineData("empty-grid")] [InlineData("padded-grid")] [InlineData("identity-alias")] [InlineData("null-source")]
    public async Task Ambiguous_or_drifted_header_binding_never_reads_catalog(string failure)
    {
        var source = new PurchaseQuerySource { LookupShapeOk = true, BindingMissing = failure == "missing", BindingDuplicate = failure == "duplicate" };
        switch (failure)
        {
            case "form-alias": source.BindingOverrides["FormID"] = "ap_purposerequestlistfrm"; break;
            case "column-alias": source.BindingOverrides["ColumnID"] = "PurposeID "; break;
            case "empty-grid": source.BindingOverrides["GridName"] = ""; break;
            case "padded-grid": source.BindingOverrides["GridName"] = " "; break;
            case "identity-alias": source.BindingOverrides["IdentityAlias"] = 1; break;
            case "null-source": source.BindingOverrides["SourceHash"] = null; break;
        }
        var result = await source.Service().LookupAsync("purposes", "", 1);
        Assert.Equal(PurchaseRequestQueryOutcome.Success, result.Outcome); Assert.False(result.Value!.Available);
        Assert.DoesNotContain(source.Commands, command => command.Sql == PurchaseRequestLookupSql.PurposeText);
    }
    [Theory]
    [InlineData("binding-shape")] [InlineData("purpose-shape")] [InlineData("currency-shape")]
    public async Task Complete_lookup_schema_drift_fails_closed_before_catalog_reads(string projection)
    {
        var source = new PurchaseQuerySource { LookupShapeOk = true, FailedLookupShape = projection };
        var kind = projection == "currency-shape" ? "currencies" : "purposes";
        var result = await source.Service().LookupAsync(kind, "", 1);
        Assert.Equal(PurchaseRequestQueryOutcome.Success, result.Outcome); Assert.False(result.Value!.Available);
        Assert.DoesNotContain(source.Commands, command => command.Sql == PurchaseRequestLookupSql.PurposeText || command.Sql == PurchaseRequestLookupSql.CurrencyText);
    }
    [Theory]
    [InlineData("binding-shape")] [InlineData("purpose-shape")] [InlineData("currency-shape")]
    [InlineData("binding")] [InlineData("purposes")] [InlineData("currencies")]
    public async Task Unexpected_lookup_result_columns_names_types_and_extra_sets_are_rejected(string projection)
    {
        foreach (var failure in new[] { "type", "name", "extra-column", "extra-result" })
        {
            var source = new PurchaseQuerySource { LookupShapeOk = true, BadLookupProjection = projection, BadLookupShape = failure };
            var kind = projection.StartsWith("currenc", StringComparison.Ordinal) ? "currencies" : "purposes";
            var result = await source.Service().LookupAsync(kind, "", 1);
            Assert.Equal(PurchaseRequestQueryOutcome.Unavailable, result.Outcome); Assert.Null(result.Value);
            Assert.Equal(source.Opens, source.ConnectionDisposals); Assert.Equal(source.Opens, source.TransactionDisposals);
            Assert.Equal(source.Commands.Count, source.ReaderDisposals);
        }
    }
    [Theory]
    [InlineData("duplicate")] [InlineData("alias")] [InlineData("too-long")] [InlineData("null-name")]
    [InlineData("null-rate")] [InlineData("nan")] [InlineData("infinity")] [InlineData("overflow")]
    public async Task Invalid_currency_catalog_projection_never_releases_partial_rows(string failure)
    {
        var source = new PurchaseQuerySource { LookupShapeOk = true };
        source.Currencies.Add(("AAA", "Synthetic", 1));
        switch (failure)
        {
            case "duplicate": source.Currencies.Add(("AAA", "Duplicate", 2)); break;
            case "alias": source.Currencies.Add(("aaa", "Alias", 2)); break;
            case "too-long": source.Currencies[0] = ("LONG", "Synthetic", 1); break;
            case "null-name": source.Currencies[0] = ("AAA", null, 1); break;
            case "null-rate": source.Currencies[0] = ("AAA", "Synthetic", null); break;
            case "nan": source.Currencies[0] = ("AAA", "Synthetic", double.NaN); break;
            case "infinity": source.Currencies[0] = ("AAA", "Synthetic", double.PositiveInfinity); break;
            case "overflow": source.LookupIgnorePaging = true; source.Currencies.AddRange(Enumerable.Range(0, 21).Select(i => ($"{i:000}", (string?)"Synthetic", (double?)1))); break;
        }
        var result = await source.Service().LookupAsync("currencies", "", 1);
        Assert.Equal(PurchaseRequestQueryOutcome.Unavailable, result.Outcome); Assert.Null(result.Value);
    }
    [Theory]
    [InlineData("duplicate")] [InlineData("long-name")]
    public async Task Invalid_purpose_projection_is_not_silently_truncated(string failure)
    {
        var source = new PurchaseQuerySource { LookupShapeOk = true };
        source.Purposes.Add((1, failure == "long-name" ? new string('x', 51) : "Synthetic"));
        if (failure == "duplicate") source.Purposes.Add((1, "Duplicate"));
        Assert.Equal(PurchaseRequestQueryOutcome.Unavailable, (await source.Service().LookupAsync("purposes", "", 1)).Outcome);
    }
    [Fact]
    public async Task Lookup_search_is_parameterized_and_paging_is_bounded_with_deterministic_order()
    {
        var source = new PurchaseQuerySource { LookupShapeOk = true };
        source.Purposes.AddRange(Enumerable.Range(1, 22).Select(i => (i, (string?)$"Synthetic {i}")));
        var first = (await source.Service().LookupAsync("purposes", "", 1)).Value!;
        Assert.Equal(20, first.Items.Count); Assert.True(first.HasMore);
        var second = (await source.Service().LookupAsync("purposes", "", 2)).Value!;
        Assert.Equal(2, second.Items.Count); Assert.False(second.HasMore); Assert.Equal("21", second.Items[0].Id);
        await source.Service().LookupAsync("currencies", "%'_[]~", 1000);
        var command = source.Commands.Last();
        Assert.Equal("%~%'~_~[]~~%", command.Parameters["@search"]);
        Assert.Equal(19980, command.Parameters["@skip"]); Assert.Equal(21, command.Parameters["@take"]);
        Assert.DoesNotContain("%'_[]~", command.Sql, StringComparison.Ordinal);
        Assert.Contains("ORDER BY C.CurrencyName ASC,CONVERT(varbinary(max),C.CurrencyID) ASC", command.Sql);
        Assert.DoesNotContain("isDisable", PurchaseRequestLookupSql.PurposeText, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("CF_CurrencyRateTbl", PurchaseRequestLookupSql.CurrencyText, StringComparison.Ordinal);
        Assert.Contains("HASHBYTES('SHA2_256',CONVERT(varbinary(max),D.[Source]))", PurchaseRequestLookupSql.BindingText);
        Assert.Contains("D.GridName IS NULL OR D.GridName=''", PurchaseRequestLookupSql.BindingText);
    }
    [Theory]
    [InlineData("logout")] [InlineData("branch")] [InlineData("stamp")] [InlineData("capability")]
    public async Task Late_lookup_revocation_suppresses_reference_data_and_releases_resources(string failure)
    {
        var source = new PurchaseQuerySource { LookupShapeOk = true };
        source.Purposes.Add((1, "Synthetic secret reference"));
        source.AfterLookupData = () => source.Identity = failure switch {
            "logout" => null, "branch" => source.Identity! with { BranchIds = ["QA-B"] },
            "stamp" => source.Identity! with { CredentialStamp = "changed" }, _ => source.Identity! with { Capabilities = [] } };
        var result = await source.Service().LookupAsync("purposes", "", 1);
        Assert.Equal(PurchaseRequestQueryOutcome.Denied, result.Outcome); Assert.Null(result.Value);
        Assert.Equal(1, source.ConnectionDisposals); Assert.Equal(1, source.TransactionDisposals);
        Assert.Equal(source.Commands.Count, source.ReaderDisposals);
    }
    [Theory]
    [InlineData(false)] [InlineData(true)]
    public async Task Lookup_cleanup_cannot_release_a_late_revoked_or_canceled_response(bool cancel)
    {
        using var cancellation = new CancellationTokenSource();
        var source = new PurchaseQuerySource { LookupShapeOk = true };
        source.Purposes.Add((1, "Synthetic"));
        source.AfterCleanup = () => { if (cancel) cancellation.Cancel(); else source.Identity = null; };
        if (cancel) await Assert.ThrowsAnyAsync<OperationCanceledException>(() => source.Service().LookupAsync("purposes", "", 1, cancellation.Token));
        else Assert.Equal(PurchaseRequestQueryOutcome.Denied, (await source.Service().LookupAsync("purposes", "", 1)).Outcome);
        Assert.Equal(1, source.ConnectionDisposals); Assert.Equal(1, source.TransactionDisposals);
        Assert.Equal(source.Commands.Count, source.ReaderDisposals); Assert.Equal(0, source.Commits);
    }
    [Fact]
    public async Task Cancellation_during_lookup_propagates_and_disposes_all_owned_resources()
    {
        using var cancellation = new CancellationTokenSource();
        var source = new PurchaseQuerySource { LookupShapeOk = true, AfterLookupData = cancellation.Cancel };
        source.Purposes.Add((1, "Synthetic"));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => source.Service().LookupAsync("purposes", "", 1, cancellation.Token));
        Assert.Equal(1, source.ConnectionDisposals); Assert.Equal(1, source.TransactionDisposals);
        Assert.Equal(source.Commands.Count, source.ReaderDisposals); Assert.Equal(0, source.Commits);
    }

}

// Synthetic source rows only. Native-equality behavior deliberately includes case/accent/space aliases.
internal sealed class PurchaseQuerySource
{
    public static readonly LegacyCompany Company=new("qa-tenant","qa-company","Synthetic company");
    public AuthoritativeIdentity? Identity=NewIdentity();
    public string Username="qa-user",StoredHash="synthetic-stored-value",Group="qa-group",Menu="05011",Form="AP_PurposeRequestListFrm",Parent="05";
    public string? Parameter; public bool Disabled,CanRun=true,ShapeOk=true;
    public string[] NativeBranches=["QA-A","QA-B"];
    public string? NativeBranch = "QA-A";
    public string?[] CatalogBranches = ["QA-A", "QA-B"];
    public bool NativeMissing, NativeDuplicate, CatalogShapeOk = true, CatalogAlias, NativeUnavailable, CatalogUnavailable;
    public string NativeGroupRowId = "qa-group";
    public string? MalformedScopeProjection, ExtraScopeResult, ExtraScopeColumn;
    public List<(string Owner, string Branch)>? NativeAssignments;
    public readonly List<PurchaseRequestAggregate> Documents=[];
    public readonly List<(string ForeignKey,PurchaseRequestPersistedLine Line)> ExtraChildren=[];
    public readonly List<(string Sql,Dictionary<string,object?> Parameters)> Commands=[];
    public int Opens,Commits,Rollbacks,ConnectionDisposals,TransactionDisposals,CommandDisposals,ReaderDisposals;
    public Action? AfterData, AfterLookupData, AfterCleanup;
    public bool LookupShapeOk, BindingMissing, BindingDuplicate, LookupIgnorePaging;
    public string? FailedLookupShape, BadLookupProjection, BadLookupShape;
    public readonly Dictionary<string, object?> BindingOverrides = new(StringComparer.Ordinal);
    public readonly List<(int Id, string? Label)> Purposes = [];
    public readonly List<(string Id, string? Name, double? Rate)> Currencies = [];
    public static AuthoritativeIdentity NewIdentity()=>new("qa-user",Company.TenantId,Company.CompanyId,Company.CompanyName,"Synthetic user",1,
        ["platform.status","purchase-requests.read"],Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes("qa-user\0synthetic-stored-value\0qa-group"))),["QA-A","QA-B"]);
    public SqlPurchaseRequestQueries Service()=>new(Company,()=>new QueryConnection(this),_=>Task.FromResult(Identity));
    public void Seed(int count=1)=>Documents.Add(new("QA-DOC","QA-A",new("2026-10-06T13:14:15.000",1,"Synthetic requester","Synthetic department",null,"15.25",null,"VND","QA-OBJECT",1.25),1,null,
        Enumerable.Range(1,count).Select(i=>new PurchaseRequestPersistedLine($"QA-L{i:000}",new("QA-ITEM",null,"synthetic time","999999999999999999","2","7",null))).ToArray()));
    private static string Fold(string input)=>new string(input.TrimEnd().Normalize(NormalizationForm.FormD).Where(c=>CharUnicodeInfo.GetUnicodeCategory(c)!=UnicodeCategory.NonSpacingMark).ToArray()).ToUpperInvariant();
    public DbDataReader Read(QueryCommand command)
    {
        var parameters=command.Parameters.Cast<DbParameter>().ToDictionary(p=>p.ParameterName,p=>p.Value==DBNull.Value?null:p.Value,StringComparer.Ordinal);
        Commands.Add((command.CommandText,parameters));
        if(command.CommandText==SqlLegacyBranchScope.NativeUserText)
        {
            if (NativeUnavailable) throw new InvalidOperationException("Synthetic native lookup unavailable.");
            var rows = new List<object[]>();
            var exactGroup = command.CommandText.Contains("DATALENGTH(CONVERT(nvarchar(max),G.UserGroupID))=DATALENGTH(CONVERT(nvarchar(max),U.UserGroupID))", StringComparison.Ordinal)
                && command.CommandText.Contains("CONVERT(varbinary(max),CONVERT(nvarchar(max),G.UserGroupID))=CONVERT(varbinary(max),CONVERT(nvarchar(max),U.UserGroupID))", StringComparison.Ordinal);
            var groupMatched = exactGroup ? Group == NativeGroupRowId : Fold(Group) == Fold(NativeGroupRowId);
            if (!NativeMissing) rows.Add([Username,StoredHash,Disabled,Group,groupMatched ? (object)false : DBNull.Value,NativeBranch ?? (object)DBNull.Value]);
            if (NativeDuplicate) rows.Add(rows[0]);
            return ScopeRows("native", [typeof(string),typeof(string),typeof(bool),typeof(string),typeof(bool),typeof(string)], rows);
        }
        if(command.CommandText==SqlLegacyBranchScope.CatalogShapeText)return ScopeRows("shape", [typeof(int)], [[CatalogShapeOk?1:0]]);
        if(command.CommandText==SqlLegacyBranchScope.CatalogText)
        {
            if (CatalogUnavailable) throw new InvalidOperationException("Synthetic catalog unavailable.");
            return ScopeRows("catalog", [typeof(string),typeof(int)], CatalogBranches.Select(branch=>new object[]{branch ?? (object)DBNull.Value,CatalogAlias?1:0}));
        }
        if (command.CommandText == PurchaseRequestLookupSql.BindingShapeText) return LookupRows("binding-shape", [("ShapeOk", typeof(int))], [[LookupShapeOk && FailedLookupShape != "binding-shape" ? 1 : 0]]);
        if (command.CommandText == PurchaseRequestLookupSql.PurposeShapeText) return LookupRows("purpose-shape", [("ShapeOk", typeof(int))], [[LookupShapeOk && FailedLookupShape != "purpose-shape" ? 1 : 0]]);
        if (command.CommandText == PurchaseRequestLookupSql.CurrencyShapeText) return LookupRows("currency-shape", [("ShapeOk", typeof(int))], [[LookupShapeOk && FailedLookupShape != "currency-shape" ? 1 : 0]]);
        if (command.CommandText == PurchaseRequestLookupSql.BindingText)
        {
            Assert.Equal("AP_PurposeRequestListFrm", parameters["@form"]);
            Assert.Equal(DbType.AnsiString, command.Parameters["@form"].DbType);
            Assert.Equal(DbType.AnsiString, command.Parameters["@field"].DbType);
            var binding = Binding((string)parameters["@field"]! == "PurposeID");
            var values = binding.Select(column => (BindingOverrides.TryGetValue(column.Name, out var value) ? value : column.Value) ?? DBNull.Value).ToArray();
            return LookupRows("binding", binding.Select(column => (column.Name, column.Type)).ToArray(),
                BindingMissing ? [] : BindingDuplicate ? [values, values] : [values]);
        }
        if (command.CommandText == PurchaseRequestLookupSql.PurposeText || command.CommandText == PurchaseRequestLookupSql.CurrencyText)
        {
            Assert.Equal(DbType.String, command.Parameters["@search"].DbType); Assert.Equal(204, command.Parameters["@search"].Size);
            Assert.Equal(DbType.Int32, command.Parameters["@skip"].DbType); Assert.Equal(DbType.Int32, command.Parameters["@take"].DbType);
            var skip = LookupIgnorePaging ? 0 : (int)parameters["@skip"]!;
            var take = LookupIgnorePaging ? int.MaxValue : (int)parameters["@take"]!;
            DbDataReader lookupReader;
            if (command.CommandText == PurchaseRequestLookupSql.PurposeText)
                lookupReader = LookupRows("purposes", [("PurposeID", typeof(int)), ("PurposeName", typeof(string)), ("IdentityAlias", typeof(int))],
                    Purposes.OrderBy(row => row.Id).Skip(skip).Take(take).Select(row => new object[] { row.Id, row.Label ?? (object)DBNull.Value, Purposes.Count(other => other.Id == row.Id) > 1 ? 1 : 0 }));
            else
                lookupReader = LookupRows("currencies", [("CurrencyID", typeof(string)), ("CurrencyName", typeof(string)), ("RateExchange", typeof(double)), ("IdentityAlias", typeof(int))],
                    Currencies.OrderBy(row => row.Name, StringComparer.Ordinal).ThenBy(row => row.Id, StringComparer.Ordinal).Skip(skip).Take(take)
                        .Select(row => new object[] { row.Id, row.Name ?? (object)DBNull.Value, row.Rate.HasValue ? row.Rate.Value : DBNull.Value, Currencies.Count(other => Fold(other.Id) == Fold(row.Id)) > 1 ? 1 : 0 }));
            AfterLookupData?.Invoke(); return lookupReader;
        }
        if(command.CommandText==SqlPurchaseRequestQueries.ShapeText)return Rows(1,[[ShapeOk?1:0]]);
        if(command.CommandText==SqlPurchaseRequestQueries.CredentialText)
        {
            Assert.Contains("DATALENGTH(@actor)",command.CommandText);Assert.Equal(DbType.String,command.Parameters["@actor"].DbType);
            return Rows(5,[[Username,StoredHash,Disabled,Group,false]]);
        }
        if(command.CommandText==SqlPurchaseRequestQueries.GrantsText)
        {
            Assert.Contains("G.IsRun=1 THEN 1",command.CommandText);Assert.Contains("DATALENGTH(@username)",command.CommandText);
            return Rows(8,[[Menu,Form,Parameter??(object)DBNull.Value,false,Parent,false,CanRun?1:0,1]]);
        }
        if(command.CommandText==SqlPurchaseRequestQueries.BranchesText)
        {
            var actor = (string)parameters["@actor"]!;
            var supplemental = command.CommandText.Split("UNION ALL", StringSplitOptions.None)[1];
            var exact = supplemental.Contains("DATALENGTH(CONVERT(nvarchar(max),UserName))=DATALENGTH(@actor)", StringComparison.Ordinal)
                && supplemental.Contains("CONVERT(varbinary(max),CONVERT(nvarchar(max),UserName))=CONVERT(varbinary(max),@actor)", StringComparison.Ordinal);
            var branches = NativeAssignments is null ? NativeBranches : NativeAssignments
                .Where(row => exact ? row.Owner == actor : Fold(row.Owner) == Fold(actor)).Select(row => row.Branch).ToArray();
            return ScopeRows("restricted", [typeof(string)], branches.Select(branch=>new object[]{branch}));
        }
        var id=parameters.GetValueOrDefault("@document") as string;
        IEnumerable<object[]> result;
        if(command.CommandText.Contains("OFFSET @skip",StringComparison.Ordinal))
        {
            var branches=parameters.Where(p=>p.Key.StartsWith("@branch",StringComparison.Ordinal)).Select(p=>(string)p.Value!).ToArray();
            var exact=command.CommandText.Contains("DATALENGTH(@branch0)",StringComparison.Ordinal);
            result=Documents.Where(d=>branches.Any(branch=>exact?d.BranchId==branch:Fold(d.BranchId)==Fold(branch)))
                .OrderBy(d=>d.PurchaseRequestId,StringComparer.Ordinal).Skip((int)parameters["@skip"]!).Take((int)parameters["@take"]!)
                .Select(d=>new object[]{d.PurchaseRequestId,Date(d.Header.PurchaseDate),d.BranchId,d.Header.PersonSuggest,d.Header.Department,d.StatusId,d.IsLocked??(object)DBNull.Value,
                    command.CommandText.Contains("AS IdentityAlias",StringComparison.Ordinal)
                        &&(command.CommandText.Contains("SELECT COUNT_BIG(*)",StringComparison.Ordinal)
                            ? Documents.Count(a=>Fold(a.PurchaseRequestId)==Fold(d.PurchaseRequestId))>1
                            : Documents.Any(a=>Fold(a.PurchaseRequestId)==Fold(d.PurchaseRequestId)&&a.PurchaseRequestId!=d.PurchaseRequestId))?1:0});
            var reader=Rows(8,result);AfterData?.Invoke();return reader;
        }
        if(command.CommandText.Contains("FROM dbo.AP_PurchaseRequestTbl",StringComparison.Ordinal))
        {
            var native=command.CommandText.Contains("WHERE PurchaseRequestID=@document",StringComparison.Ordinal);
            result=Documents.Where(d=>native?Fold(d.PurchaseRequestId)==Fold(id!):d.PurchaseRequestId==id).Take(2).Select(d=>new object[]{d.PurchaseRequestId,Date(d.Header.PurchaseDate),d.Header.PurposeId??(object)DBNull.Value,
                d.Header.PersonSuggest,d.Header.Department,d.Header.PurposeDescOrClient??(object)DBNull.Value,Number(d.Header.Price),d.Header.Notes??(object)DBNull.Value,d.StatusId,d.IsLocked??(object)DBNull.Value,
                d.Header.CurrencyId,d.Header.ObjectId,d.Header.RateExchange,d.BranchId});return Rows(14,result);
        }
        if(command.CommandText.Contains("FROM dbo.AP_PurchaseRequestDetailTbl C",StringComparison.Ordinal))
        {
            var all=Documents.SelectMany(d=>d.Lines.Select(line=>(ForeignKey:d.PurchaseRequestId,Line:line))).Concat(ExtraChildren).ToArray();
            var native=command.CommandText.Contains("WHERE C.PurchaseRequestID=@document",StringComparison.Ordinal);
            result=all.Where(row=>native?Fold(row.ForeignKey)==Fold(id!):row.ForeignKey==id).Take(501).Select(row=>new object[]{row.Line.LineId,row.Line.Values.ItemId,Number(row.Line.Values.Budget),row.Line.Values.TimeRequired??(object)DBNull.Value,
                Number(row.Line.Values.Quantity),Number(row.Line.Values.UnitPrice),Number(row.Line.Values.TotalPrice),row.Line.Values.Model??(object)DBNull.Value,row.ForeignKey,
                command.CommandText.Contains("AS IdentityAlias",StringComparison.Ordinal)
                    &&(command.CommandText.Contains("SELECT COUNT_BIG(*)",StringComparison.Ordinal)
                        ? all.Count(a=>Fold(a.Line.LineId)==Fold(row.Line.LineId))>1
                        : all.Any(a=>Fold(a.Line.LineId)==Fold(row.Line.LineId)&&a.Line.LineId!=row.Line.LineId))?1:0});
            var reader=Rows(10,result);AfterData?.Invoke();return reader;
        }
        throw new InvalidOperationException("Unrecognized synthetic query.");
    }
    internal static (string Name, Type Type, object? Value)[] Binding(bool purpose) => [
        ("UserAutoID", typeof(string), "synthetic-binding"),
        ("FormID", typeof(string), "AP_PurposeRequestListFrm"),
        ("GridName", typeof(string), null),
        ("ColumnID", typeof(string), purpose ? "PurposeID" : "CurrencyID"),
        ("ValueColumn", typeof(string), purpose ? "PurposeID" : "CurrencyID"),
        ("DisplayColumn", typeof(string), purpose ? "PurposeName" : "CurrencyID"),
        ("ColumnArr", typeof(string), purpose ? "PurposeID;PurposeName" : "CurrencyID;CurrencyName;RateExchange"),
        ("WidthArr", typeof(string), purpose ? null : "60;120;70"),
        ("LinkColumn", typeof(string), purpose ? "PurposeID;PurposeName" : "RateExchange"),
        ("DisableAddNew", typeof(bool), true),
        ("ParaArr", typeof(string), null), ("ParaRequireArr", typeof(string), null),
        ("Type", typeof(string), "Dropdown"), ("KeepValue", typeof(bool), false),
        ("SummaryFieldArr", typeof(string), null), ("IsMultiSelect", typeof(bool), false),
        ("IsNotInList", typeof(bool), false), ("IsDisable", typeof(bool), false),
        ("ColumnName_Filter", typeof(string), null), ("ColumnValue_Filter", typeof(string), null), ("OnlyValue_Filter", typeof(string), null),
        ("ManualSQLSearch", typeof(bool), false), ("ManualSQLOrderBy", typeof(string), null), ("DefaultValue", typeof(string), null),
        ("IsReload", typeof(bool), false), ("EditableColumns", typeof(string), null), ("Caption", typeof(string), null),
        ("isLock", typeof(bool), false), ("isInvisible", typeof(bool), false), ("isWordWrap", typeof(bool), false), ("isMultiValue", typeof(bool), false),
        ("GroupCaption", typeof(string), null), ("WordWrapArr", typeof(string), null), ("GroupColumnArr", typeof(string), null),
        ("DisplayMember2", typeof(string), null), ("TreeViewColumn", typeof(string), null), ("TreeViewColumnParent", typeof(string), null),
        ("ReloadType", typeof(int), null), ("EditType", typeof(int), null), ("DefaultValueSQL", typeof(string), null), ("TriggerOnOpenForm", typeof(bool), false),
        ("SourceHash", typeof(byte[]), Convert.FromHexString(purpose
            ? "83B4D2F350A6DC45B9840BC7AC4ED14AAE86106088210A6846FCE8ACE0003125"
            : "9401708F1504420CA7A3F16DFEE1A5E4DE8D80D038519F94B4B9645B6DDAF534")),
        ("IdentityAlias", typeof(int), 0)];
    private DbDataReader LookupRows(string projection, (string Name, Type Type)[] columns, IEnumerable<object[]> rows)
    {
        var table = new DataTable(); var bad = projection == BadLookupProjection;
        for (var index = 0; index < columns.Length; index++)
            table.Columns.Add(bad && BadLookupShape == "name" && index == 0 ? "Unexpected" : columns[index].Name,
                bad && BadLookupShape == "type" && index == 0 ? typeof(object) : columns[index].Type);
        if (bad && BadLookupShape == "extra-column") table.Columns.Add("Extra", typeof(string));
        foreach (var row in rows) table.Rows.Add(row);
        if (!bad || BadLookupShape != "extra-result") return table.CreateDataReader();
        var extra = new DataTable(); extra.Columns.Add("Extra", typeof(string)); extra.Rows.Add("Synthetic");
        return new DataTableReader([table, extra]);
    }
    private DbDataReader ScopeRows(string projection, Type[] types, IEnumerable<object[]> rows)
    {
        var table = new DataTable();
        for (var i = 0; i < types.Length; i++) table.Columns.Add($"c{i}",
            projection == MalformedScopeProjection && i == 0 ? typeof(object) : types[i]);
        if (projection == ExtraScopeColumn) table.Columns.Add("unexpected", typeof(string));
        foreach (var row in rows) table.Rows.Add(row);
        if (projection != ExtraScopeResult) return table.CreateDataReader();
        var extra = new DataTable(); extra.Columns.Add("unexpected", typeof(string)); extra.Rows.Add("synthetic");
        return new DataTableReader([table, extra]);
    }
    private static object Date(string? text)=>text is null?DBNull.Value:DateTime.ParseExact(text,"yyyy-MM-dd'T'HH:mm:ss.fff",CultureInfo.InvariantCulture);
    private static object Number(string? text)=>text is null?DBNull.Value:decimal.Parse(text,CultureInfo.InvariantCulture);
    private static DbDataReader Rows(int columns,IEnumerable<object[]> rows){var table=new DataTable();for(var i=0;i<columns;i++)table.Columns.Add($"c{i}",typeof(object));foreach(var row in rows)table.Rows.Add(row);return table.CreateDataReader();}
}

internal sealed class QueryConnection(PurchaseQuerySource source):DbConnection
{
    private ConnectionState state;
    [AllowNull] public override string ConnectionString{get;set;}="";public override string Database=>"synthetic";public override string DataSource=>"synthetic";public override string ServerVersion=>"synthetic";public override ConnectionState State=>state;
    public override void ChangeDatabase(string name)=>throw new NotSupportedException();public override void Close()=>state=ConnectionState.Closed;
    public override void Open(){source.Opens++;state=ConnectionState.Open;}
    protected override DbTransaction BeginDbTransaction(IsolationLevel level)=>new QueryTransaction(this,source,level);
    protected override DbCommand CreateDbCommand()=>new QueryCommand(this,source);
    protected override void Dispose(bool disposing){if(disposing){source.ConnectionDisposals++;source.AfterCleanup?.Invoke();}base.Dispose(disposing);}
}
internal sealed class QueryTransaction(QueryConnection connection,PurchaseQuerySource source,IsolationLevel level):DbTransaction
{public override IsolationLevel IsolationLevel=>level;protected override DbConnection DbConnection=>connection;public override void Commit(){source.Commits++;throw new InvalidOperationException("Read must not commit.");}public override void Rollback()=>source.Rollbacks++;protected override void Dispose(bool disposing){if(disposing)source.TransactionDisposals++;base.Dispose(disposing);}}
internal sealed class QueryCommand(QueryConnection connection,PurchaseQuerySource source):DbCommand
{
    private readonly QueryParameters parameters=new();[AllowNull] public override string CommandText{get;set;}="";public override int CommandTimeout{get;set;}public override CommandType CommandType{get;set;}public override bool DesignTimeVisible{get;set;}public override UpdateRowSource UpdatedRowSource{get;set;}
    protected override DbConnection? DbConnection{get;set;}=connection;protected override DbTransaction? DbTransaction{get;set;}protected override DbParameterCollection DbParameterCollection=>parameters;
    public override void Cancel(){}public override int ExecuteNonQuery()=>throw new InvalidOperationException("No DML allowed.");public override object? ExecuteScalar()=>throw new NotSupportedException();public override void Prepare(){}
    protected override DbParameter CreateDbParameter()=>new QueryParameter();protected override DbDataReader ExecuteDbDataReader(CommandBehavior behavior){Assert.NotNull(DbTransaction);Assert.Equal(IsolationLevel.Serializable,DbTransaction!.IsolationLevel);return new TrackingQueryReader(source.Read(this), source);}
    protected override void Dispose(bool disposing){if(disposing)source.CommandDisposals++;base.Dispose(disposing);}
}
internal sealed class QueryParameter:DbParameter
{public override DbType DbType{get;set;}public override ParameterDirection Direction{get;set;}=ParameterDirection.Input;public override bool IsNullable{get;set;}[AllowNull] public override string ParameterName{get;set;}="";[AllowNull] public override string SourceColumn{get;set;}="";public override object? Value{get;set;}public override bool SourceColumnNullMapping{get;set;}public override int Size{get;set;}public override void ResetDbType(){}}
internal sealed class QueryParameters:DbParameterCollection
{
 private readonly List<DbParameter> values=[];public override int Count=>values.Count;public override object SyncRoot=>this;public override int Add(object value){values.Add((DbParameter)value);return values.Count-1;}public override void AddRange(Array array){foreach(var value in array)Add(value!);}public override void Clear()=>values.Clear();public override bool Contains(object value)=>values.Contains((DbParameter)value);public override bool Contains(string name)=>IndexOf(name)>=0;public override void CopyTo(Array array,int index)=>((ICollection)values).CopyTo(array,index);public override IEnumerator GetEnumerator()=>values.GetEnumerator();public override int IndexOf(object value)=>values.IndexOf((DbParameter)value);public override int IndexOf(string name)=>values.FindIndex(value=>value.ParameterName==name);public override void Insert(int index,object value)=>values.Insert(index,(DbParameter)value);public override void Remove(object value)=>values.Remove((DbParameter)value);public override void RemoveAt(int index)=>values.RemoveAt(index);public override void RemoveAt(string name)=>RemoveAt(IndexOf(name));protected override DbParameter GetParameter(int index)=>values[index];protected override DbParameter GetParameter(string name)=>values[IndexOf(name)];protected override void SetParameter(int index,DbParameter value)=>values[index]=value;protected override void SetParameter(string name,DbParameter value){var index=IndexOf(name);if(index<0)values.Add(value);else values[index]=value;}
}

internal sealed class TrackingQueryReader(DbDataReader inner, PurchaseQuerySource source) : DbDataReader
{
    private bool disposed;
    public override object this[int ordinal] => inner[ordinal]; public override object this[string name] => inner[name];
    public override int Depth => inner.Depth; public override int FieldCount => inner.FieldCount;
    public override bool HasRows => inner.HasRows; public override bool IsClosed => inner.IsClosed; public override int RecordsAffected => inner.RecordsAffected;
    public override bool Read() => inner.Read(); public override bool NextResult() => inner.NextResult(); public override void Close() => inner.Close();
    public override string GetName(int ordinal) => inner.GetName(ordinal); public override string GetDataTypeName(int ordinal) => inner.GetDataTypeName(ordinal);
    public override Type GetFieldType(int ordinal) => inner.GetFieldType(ordinal); public override object GetValue(int ordinal) => inner.GetValue(ordinal);
    public override int GetValues(object[] values) => inner.GetValues(values); public override int GetOrdinal(string name) => inner.GetOrdinal(name);
    public override bool GetBoolean(int ordinal) => inner.GetBoolean(ordinal); public override byte GetByte(int ordinal) => inner.GetByte(ordinal);
    public override long GetBytes(int ordinal, long offset, byte[]? buffer, int bufferOffset, int length) => inner.GetBytes(ordinal, offset, buffer, bufferOffset, length);
    public override char GetChar(int ordinal) => inner.GetChar(ordinal);
    public override long GetChars(int ordinal, long offset, char[]? buffer, int bufferOffset, int length) => inner.GetChars(ordinal, offset, buffer, bufferOffset, length);
    public override Guid GetGuid(int ordinal) => inner.GetGuid(ordinal); public override short GetInt16(int ordinal) => inner.GetInt16(ordinal);
    public override int GetInt32(int ordinal) => inner.GetInt32(ordinal); public override long GetInt64(int ordinal) => inner.GetInt64(ordinal);
    public override float GetFloat(int ordinal) => inner.GetFloat(ordinal); public override double GetDouble(int ordinal) => inner.GetDouble(ordinal);
    public override string GetString(int ordinal) => inner.GetString(ordinal); public override decimal GetDecimal(int ordinal) => inner.GetDecimal(ordinal);
    public override DateTime GetDateTime(int ordinal) => inner.GetDateTime(ordinal); public override bool IsDBNull(int ordinal) => inner.IsDBNull(ordinal);
    public override IEnumerator GetEnumerator() => ((IEnumerable)inner).GetEnumerator();
    protected override void Dispose(bool disposing)
    { if (disposing && !disposed) { disposed = true; source.ReaderDisposals++; inner.Dispose(); } base.Dispose(disposing); }
}
