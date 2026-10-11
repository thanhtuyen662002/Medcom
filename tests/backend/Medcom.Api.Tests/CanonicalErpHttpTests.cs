using System.Text.Json;
using Medcom.Application;
using Medcom.Contracts;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class CanonicalErpHttpTests
{
    [Fact]
    public async Task Every_form_keeps_every_source_column_on_real_HTTP_pages_without_duplicate_wrappers()
    {
        var service = new SyntheticScreens();
        await using var fixture = await PurchaseHttpFixture.Start(services => services.AddSingleton<IErpScreenService>(service));
        fixture.Authority.Identity = fixture.Authority.Identity with { Capabilities = ErpScreenCatalog.ModuleIds.Select(id => id + ".read").ToArray() };
        await fixture.Login();
        var api = ApiContractCatalog.Build(); var columns = 0;
        foreach (var module in ErpScreenCatalog.ModuleIds)
        {
            var path = "/api/erp/" + module;
            var metadata = (await fixture.Json(path + "/screen")).GetProperty("data").GetProperty("fields");
            var list = await fixture.Json(path + "?branchId=QA-A&page=2&pageSize=1");
            var detail = await fixture.Json(path + "/detail?branchId=QA-A&documentId=SYNTHETIC-D&page=2&pageSize=1");
            foreach (var pair in new[] { (path, list), (path + "/detail", detail) })
                Assert.True(ApiContractCatalogTests.Matches(api, api["paths"]![pair.Item1]!["get"]!["responses"]!["200"]!["content"]!["application/json"]!["schema"]!, pair.Item2), module + " HTTP schema mismatch");
            var data = detail.GetProperty("data"); var header = data.GetProperty("header");
            Assert.False(data.TryGetProperty("documentId", out _)); Assert.False(data.TryGetProperty("branchId", out _));
            Assert.Equal("SYNTHETIC-D", header.GetProperty("documentId").GetString());
            var page = list.GetProperty("data");
            Assert.Equal(2, page.GetProperty("page").GetInt32()); Assert.Equal(1, page.GetProperty("pageSize").GetInt32()); Assert.True(page.GetProperty("hasMore").GetBoolean());
            var listed = page.GetProperty("rows")[0]; Assert.False(listed.TryGetProperty("header", out _));
            foreach (var section in ErpScreenCatalog.Get(module)!.Fields)
            {
                var rows = section.Key == "header" ? new[] { header, listed }
                    : new[] { (section.Key is "lines" or "history" or "comparison" ? data : data.GetProperty("sections")).GetProperty(section.Key).GetProperty("rows")[0] };
                var original = SyntheticScreens.Fields(module, section.Key);
                var expected = CanonicalResponseProjection.Normalize(JsonSerializer.SerializeToNode(original)!, path + "/detail").AsObject();
                foreach (var definition in metadata.GetProperty(section.Key).EnumerateArray())
                    Assert.True(rows[0].TryGetProperty(definition.GetProperty("name").GetString()!, out _), module + " metadata/read key mismatch");
                foreach (var row in rows)
                {
                    Assert.False(row.TryGetProperty("fields", out _)); Assert.False(row.TryGetProperty("userAutoId", out _));
                    foreach (var column in expected)
                    {
                        Assert.True(row.TryGetProperty(column.Key, out var value), module + "/" + section.Key + "/" + column.Key);
                        Assert.Equal(column.Value?.ToJsonString() ?? "null", value.GetRawText());
                    }
                }
                columns += section.Value.Count;
            }
            var token = data.GetProperty("stateToken").GetString(); Assert.Equal(new string('a', 64), token);
            using var response = await fixture.Client.GetAsync(path + "?branchId=QA-A");
            Assert.Equal("3", Assert.Single(response.Headers.GetValues("X-Medcom-Response-Contract")));
        }
        Assert.Equal(1516, columns); Assert.Equal(0, fixture.Source.Commits);
    }

    private sealed class SyntheticScreens : IErpScreenService
    {
        internal static Dictionary<string, object?> Fields(string module, string section) => ErpScreenCatalog.Get(module)!.Fields[section].ToDictionary(f => f.Name, f => Value(f, section));
        private static object? Value(ErpFieldDefinition field, string section)
        {
            if (field.Name == "userAutoId") return "SYNTHETIC-L";
            if (field.Name is "documentId" or "purchaseRequestId") return section == "history" ? "SYNTHETIC-HISTORY" : "SYNTHETIC-D";
            if (field.Name == "batchId") return "SYNTHETIC-D";
            if (field.Name == "branchId") return "QA-A";
            if (field.Nullable) return null;
            return field.SqlType switch
            { "bit" => false, "int" or "smallint" or "tinyint" or "bigint" => 0, "float" or "real" => 1.0,
                "datetime" or "smalldatetime" or "date" or "datetime2" => "2026-10-11T00:00:00.000", _ => "SYNTHETIC" };
        }
        private static Task<ErpReadResult<T>> Success<T>(T value) => Task.FromResult(new ErpReadResult<T>(ErpReadOutcome.Success, value));
        private static Task<ErpReadResult<T>> Missing<T>() => Task.FromResult(new ErpReadResult<T>(ErpReadOutcome.Unavailable));
        private static Task<ErpCommandResult> MissingWrite() => Task.FromResult(new ErpCommandResult(ErpCommandOutcome.Unavailable));
        public Task<ErpReadResult<ErpDocumentPage>> ListAsync(string module, ErpPageQuery query, CancellationToken token)
            => Success(new ErpDocumentPage([new("SYNTHETIC-D", Fields(module, "header"))], query.Page, query.PageSize, true));
        public Task<ErpReadResult<ErpDocumentDetail>> DetailAsync(string module, string branch, string document, int page, int size, CancellationToken token)
        {
            ErpLinePage Section(string section) => new([new("SYNTHETIC-L", Fields(module, section))], page, size, true);
            var fields = ErpScreenCatalog.Get(module)!.Fields;
            return Success(new ErpDocumentDetail(document, branch, new string('a', 64), Fields(module, "header"), Section("lines"),
                fields.ContainsKey("history") ? Section("history") : null, fields.ContainsKey("comparison") ? Section("comparison") : null, [],
                fields.Where(s => s.Key is not ("header" or "lines" or "history" or "comparison")).ToDictionary(s => s.Key, s => Section(s.Key))));
        }
        public Task<ErpReadResult<IReadOnlyList<ErpActionState>>> ActionsAsync(string module, string branch, string? document, CancellationToken token) => Missing<IReadOnlyList<ErpActionState>>();
        public Task<ErpReadResult<ErpContractInfo>> ContractAsync(string module, string branch, string document, CancellationToken token) => Missing<ErpContractInfo>();
        public Task<ErpReadResult<ErpChoicePage>> OptionsAsync(string module, ErpLookupQuery query, CancellationToken token) => Missing<ErpChoicePage>();
        public Task<ErpReadResult<ErpChoicePage>> PmOptionsAsync(string module, ErpPmLookupQuery query, CancellationToken token) => Missing<ErpChoicePage>();
        public Task<ErpReadResult<ErpDraftSelection>> SelectionAsync(string module, ErpSelectionRequest request, CancellationToken token) => Missing<ErpDraftSelection>();
        public Task<ErpReadResult<ErpDraftSelection>> PasteAsync(string module, ErpPasteRequest request, CancellationToken token) => Missing<ErpDraftSelection>();
        public Task<ErpCommandResult> CreateAsync(string module, ErpCreateRequest request, CancellationToken token) => MissingWrite();
        public Task<ErpCommandResult> SaveAsync(string module, ErpSaveRequest request, CancellationToken token) => MissingWrite();
        public Task<ErpCommandResult> DeleteAsync(string module, ErpDeleteRequest request, CancellationToken token) => MissingWrite();
        public Task<ErpCommandResult> ActionAsync(string module, string action, ErpActionRequest request, CancellationToken token) => MissingWrite();
        public Task<ErpCommandResult> ScanAsync(string module, string action, ErpScanRequest request, CancellationToken token) => MissingWrite();
        public Task<ErpReadResult<ErpCommandObservation>> ObserveAsync(string module, ErpCommandLookupRequest request, CancellationToken token) => Missing<ErpCommandObservation>();
    }
}
