using Medcom.Contracts;
using Medcom.Infrastructure.Erp;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class ErpLookupDiagnosticsTests
{
    private static ErpLookupDiagnostics.LiveRow Live(ErpScreenDescription screen, ErpLookupDefinition lookup, string? linked) =>
        new(screen.FormId, lookup.Grid, lookup.Field, lookup.ValueField, lookup.DisplayField, lookup.Parameters, lookup.RequiredParameters,
            lookup.Disabled, lookup.MultiSelect, linked, lookup.AllowUnlisted, lookup.SourceHash);

    [Fact]
    public void A_dropped_link_is_named_with_expected_and_live_values()
    {
        // ERP 29/10 emptied the request's currency link (it no longer fills RateExchange); the catalog follows.
        var screen = ErpScreenCatalog.Get("purchase-requests")!;
        var currency = screen.Lookups.Single(lookup => lookup.Id == "header.CurrencyID");
        Assert.Equal("", currency.LinkedFields);
        var item = ErpLookupDiagnostics.Compare(screen, currency, [Live(screen, currency, "RateExchange")]);
        Assert.Equal("changed", item.Status);
        Assert.Equal(new ErpLookupMismatch("LinkColumn", "", "RateExchange"), Assert.Single(item.Mismatches));
        Assert.Equal("ok", ErpLookupDiagnostics.Compare(screen, currency, [Live(screen, currency, currency.LinkedFields)]).Status);
    }

    [Fact]
    public void Missing_and_duplicate_rows_are_reported()
    {
        var screen = ErpScreenCatalog.Get("purchase-requests")!;
        var lookup = screen.Lookups[0];
        Assert.Equal("missing", ErpLookupDiagnostics.Compare(screen, lookup, []).Status);
        var row = Live(screen, lookup, lookup.LinkedFields);
        Assert.Equal("duplicate", ErpLookupDiagnostics.Compare(screen, lookup, [row, row]).Status);
    }

    [Fact]
    public void A_missing_row_names_where_it_may_have_gone()
    {
        var screen = ErpScreenCatalog.Get("inbound-costs")!;
        var lookup = screen.Lookups.Single(item => item.Id == "costs.ObjectID");
        var moved = Live(screen, lookup, lookup.LinkedFields) with { Grid = "grdChitiet3" };
        Assert.Equal(new ErpLookupMismatch("GridName", "grdChitiet2", "grdChitiet3"), Assert.Single(ErpLookupDiagnostics.Compare(screen, lookup, [moved]).Mismatches));
        var other = moved with { Grid = "grdChitiet", Column = "ItemID" };
        Assert.Equal(new ErpLookupMismatch("FormGrids", "grdChitiet2", "grdChitiet"), Assert.Single(ErpLookupDiagnostics.Compare(screen, lookup, [other]).Mismatches));
        Assert.Equal(new ErpLookupMismatch("FormGrids", "grdChitiet2", ""), Assert.Single(ErpLookupDiagnostics.Compare(screen, lookup, []).Mismatches));
    }
}
