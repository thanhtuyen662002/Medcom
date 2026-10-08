using System.Text.Json;
using Medcom.Application.WarehouseQr;
using Medcom.Contracts;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class WarehouseQrParserTests
{
    // Same source-controlled fixtures as Node. No csproj copy/registration change is needed.
    private static JsonDocument ReadFixtures()
    {
        foreach (var start in new[] { Directory.GetCurrentDirectory(), AppContext.BaseDirectory })
        {
            for (var directory = new DirectoryInfo(start); directory is not null; directory = directory.Parent)
            {
                var file = Path.Combine(directory.FullName, "docs", "erp", "WAREHOUSE_QR_WORKFLOW_EVIDENCE.json");
                if (File.Exists(file)) return JsonDocument.Parse(File.ReadAllText(file));
            }
        }
        throw new FileNotFoundException("Run within the repository containing the shared I52 parity fixtures.");
    }

    private static string? Text(JsonElement units) => units.ValueKind == JsonValueKind.Null ? null
        : new string(units.EnumerateArray().Select(v => (char)v.GetInt32()).ToArray());
    private static string[] Issues(JsonElement fixture) => fixture.GetProperty("profileIssues")
        .EnumerateArray().Select(v => v.GetString()!).ToArray();

    [Fact]
    public void ActualParserAndProfileMatchEverySharedFixture()
    {
        using var document = ReadFixtures();
        foreach (var fixture in document.RootElement.GetProperty("implementation").GetProperty("parityFixtures").EnumerateArray())
        {
            var raw = Text(fixture.GetProperty("inputUtf16Units"));
            var expected = fixture.GetProperty("expected");
            var actual = WarehouseQrParser.Parse(raw);
            Assert.Equal(expected.GetProperty("status").GetString(), actual.Status);
            Assert.Equal(expected.GetProperty("reason").GetString(), actual.Reason);
            Assert.Equal(Text(expected.GetProperty("normalizedUtf16Units")), actual.NormalizedBarcode);
            Assert.Equal("UNKNOWN", actual.RuntimeEquivalence);
            var candidate = expected.GetProperty("candidate");
            if (candidate.ValueKind == JsonValueKind.Null) Assert.Null(actual.Candidate);
            else if (candidate.GetProperty("kind").GetString() == "ordinary")
            {
                var ordinary = Assert.IsType<OrdinaryWarehouseQrCandidate>(actual.Candidate);
                Assert.Equal("ordinary", ordinary.Kind);
                Assert.Equal(Text(candidate.GetProperty("itemIdUtf16Units")), ordinary.ItemId);
                Assert.Equal(Text(candidate.GetProperty("itemCodeUtf16Units")), ordinary.ItemCode);
                Assert.Equal(Text(candidate.GetProperty("lotUtf16Units")), ordinary.Lot);
                Assert.Equal(candidate.GetProperty("unitQuantity").GetInt32(), ordinary.UnitQuantity);
            }
            else
            {
                var package = Assert.IsType<PackageWarehouseQrCandidate>(actual.Candidate);
                Assert.Equal("package", package.Kind);
                Assert.Equal(candidate.GetProperty("packageId").GetString(), package.PackageId);
                Assert.True(package.NeedsLookup);
            }
            var profile = WarehouseQrParser.ValidateAsciiNoTruncation(raw);
            Assert.Equal(WarehouseQrParser.ProfileId, profile.ProfileId);
            Assert.Equal(Issues(fixture), profile.Issues.ToArray());
            Assert.Equal(Issues(fixture).Length == 0, profile.Supported);
        }
    }

    [Fact]
    public void ActualDocumentHelperMatchesSharedFixturesWithoutRemovingCrLf()
    {
        using var document = ReadFixtures();
        foreach (var fixture in document.RootElement.GetProperty("implementation").GetProperty("documentFixtures").EnumerateArray())
        {
            var actual = WarehouseQrParser.ValidateDocumentAsciiNoTruncation(Text(fixture.GetProperty("inputUtf16Units")));
            Assert.Equal(Text(fixture.GetProperty("normalizedUtf16Units")), actual.NormalizedDocumentId);
            Assert.Equal(WarehouseQrParser.ProfileId, actual.Profile.ProfileId);
            Assert.Equal(Issues(fixture), actual.Profile.Issues.ToArray());
            Assert.Equal(Issues(fixture).Length == 0, actual.Profile.Supported);
        }
    }

    [Fact]
    public void ProposedGuardrailIsNarrowerAndNeverTruncates()
    {
        Assert.Equal("\t\u00a0", WarehouseQrParser.TrimAsciiSpace(" \t\u00a0 "));
        foreach (var raw in new[] { "\t;;L", "\u00a0;;L", new string('A', 51) + ";;L" })
        {
            Assert.Equal("candidate", WarehouseQrParser.Parse(raw).Status);
            Assert.Equal(raw, WarehouseQrParser.Parse(raw).NormalizedBarcode);
            Assert.False(WarehouseQrParser.ValidateAsciiNoTruncation(raw).Supported);
        }
    }

    [Fact]
    public void SyntaxCandidateCannotProvidePackageContentAuthorityOrDurableReceipt()
    {
        var parsed = WarehouseQrParser.Parse("PKG1;00000000-0000-0000-0000-000000000000");
        var package = Assert.IsType<PackageWarehouseQrCandidate>(parsed.Candidate);
        Assert.Equal(new[] { "Kind", "NeedsLookup", "PackageId" }, typeof(PackageWarehouseQrCandidate)
            .GetProperties().Select(p => p.Name).Order().ToArray());
        Assert.True(package.NeedsLookup);
        Assert.Equal("UNKNOWN", parsed.RuntimeEquivalence);
        Assert.Equal(new[] { "Candidate", "NormalizedBarcode", "Reason", "RuntimeEquivalence", "Status" },
            typeof(WarehouseQrParseResult).GetProperties().Select(p => p.Name).Order().ToArray());
        var raw = "IV_OUTPUT;DELETE;L";
        var ordinary = Assert.IsType<OrdinaryWarehouseQrCandidate>(WarehouseQrParser.Parse(raw).Candidate);
        Assert.Equal("IV_OUTPUT", ordinary.ItemId);
        Assert.Equal(new[] { "ItemCode", "ItemId", "Kind", "Lot", "UnitQuantity" }, typeof(OrdinaryWarehouseQrCandidate)
            .GetProperties().Select(p => p.Name).Order().ToArray());
        Assert.Equal(WarehouseQrParser.Parse("A;;L"), WarehouseQrParser.Parse("A;;L"));
    }
}
