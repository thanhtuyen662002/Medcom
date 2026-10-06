using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Medcom.Api;
using Medcom.Application;
using Medcom.Application.PurchaseRequests;
using Medcom.Contracts;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Medcom.Api.Tests;

// Real Kestrel/ASP.NET cookie + antiforgery middleware, with synthetic identity,
// recording read source and command/admission doubles. Never actual SQL/DLL.
public sealed class PurchaseRequestCommandEndpointTests
{
    [Fact]
    public async Task Read_permission_and_registered_writer_do_not_enable_default_command_admission()
    {
        var commands = new CommandDouble();
        await using var fixture = await PurchaseHttpFixture.Start(s => s.AddSingleton<IPurchaseRequestCommands>(commands));
        fixture.Source.Seed(); await fixture.Login();
        using var response = await Send(fixture, "save", Save(fixture));
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode); Assert.Equal(0, commands.SaveCalls);
        var detail = await fixture.Json("/api/purchase-requests/detail?documentId=QA-DOC");
        var access = detail.GetProperty("data").GetProperty("commandAccess");
        Assert.False(access.GetProperty("canSave").GetBoolean()); Assert.False(access.GetProperty("canAddLines").GetBoolean());
    }
    [Theory]
    [InlineData("save")]
    [InlineData("submit")]
    [InlineData("save/lookup")]
    [InlineData("submit/lookup")]
    public async Task All_four_routes_require_authentication_CSRF_origin_and_session_scope(string route)
    {
        var commands = new CommandDouble(); var grant = new AccessDouble();
        await using var fixture = await Start(commands, grant); fixture.Source.Seed();
        using (var anonymous = await fixture.Client.PostAsync("/api/purchase-requests/" + route, new StringContent("{}")))
            Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
        await fixture.Login();
        var body = route.StartsWith("save", StringComparison.Ordinal) ? (object)Save(fixture) : Submit(fixture);
        using (var csrf = await Send(fixture, route, body, csrf: false)) Assert.Equal(HttpStatusCode.Forbidden, csrf.StatusCode);
        using (var origin = await Send(fixture, route, body, origin: "https://other.invalid")) Assert.Equal(HttpStatusCode.Forbidden, origin.StatusCode);
        using (var scope = await Send(fixture, route, body, scope: new string('b', 64))) Assert.Equal(HttpStatusCode.Conflict, scope.StatusCode);
        Assert.Equal(0, commands.SaveCalls + commands.SubmitCalls + commands.LookupCalls + commands.CreateCalls);
    }
    [Fact]
    public async Task Actual_serializer_preserves_original_Save_DTO_and_separate_Submit_uses_new_token()
    {
        var commands = new CommandDouble();
        await using var fixture = await Start(commands, new()); fixture.Source.Seed(101); commands.Current = fixture.Source.Documents[0]; await fixture.Login();
        var save = Save(fixture);
        using var response = await Send(fixture, "save", save); Assert.Equal(HttpStatusCode.OK, response.StatusCode); Assert.True(response.Headers.CacheControl?.NoStore);
        using var parsed = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var result = parsed.RootElement.GetProperty("data"); Assert.Equal(JsonValueKind.Number, result.GetProperty("outcome").ValueKind); Assert.Equal(0, result.GetProperty("outcome").GetInt32());
        Assert.Equal(JsonSerializer.Serialize(save, PurchaseRequestCommandRules.Json), JsonSerializer.Serialize(commands.LastSave, PurchaseRequestCommandRules.Json));
        var receipt = result.GetProperty("receipt"); Assert.Equal(101, receipt.GetProperty("document").GetProperty("lines").GetArrayLength());
        var header = receipt.GetProperty("document").GetProperty("header"); Assert.Equal("15.25", header.GetProperty("price").GetString());
        Assert.Equal("2026-10-06T13:14:15.000", header.GetProperty("purchaseDate").GetString()); Assert.Equal(1.25, header.GetProperty("rateExchange").GetDouble());
        Assert.Equal(JsonValueKind.Null, header.GetProperty("purposeDescOrClient").ValueKind);
        var nextToken = receipt.GetProperty("stateToken").GetString()!; Assert.NotEqual(save.ExpectedStateToken, nextToken); Assert.Equal(0, commands.SubmitCalls);
        var submit = new SubmitPurchaseRequest("qa-submit", save.BranchId, save.PurchaseRequestId, nextToken);
        using var submitted = await Send(fixture, "submit", submit); Assert.Equal(HttpStatusCode.OK, submitted.StatusCode); Assert.Equal(1, commands.SubmitCalls); Assert.Equal(nextToken, commands.LastSubmit!.ExpectedStateToken);
        using var submittedJson = JsonDocument.Parse(await submitted.Content.ReadAsStringAsync());
        Assert.Equal(2, submittedJson.RootElement.GetProperty("data").GetProperty("receipt").GetProperty("document").GetProperty("statusId").GetInt32());
        using var submitLookup = await Send(fixture, "submit/lookup", submit);
        Assert.Equal(HttpStatusCode.OK, submitLookup.StatusCode);
        using var lookupJson = JsonDocument.Parse(await submitLookup.Content.ReadAsStringAsync());
        Assert.Equal(0, lookupJson.RootElement.GetProperty("data").GetProperty("outcome").GetInt32());
        Assert.IsType<SubmitPurchaseRequest>(commands.LastLookup);
        Assert.Equal(JsonSerializer.Serialize(submit, PurchaseRequestCommandRules.Json), JsonSerializer.Serialize(commands.LastLookup, PurchaseRequestCommandRules.Json));
        Assert.Equal(1, commands.SaveCalls); Assert.Equal(1, commands.SubmitCalls); Assert.Equal(1, commands.LookupCalls);
        Assert.Equal(0, commands.CreateCalls);
    }
    [Fact]
    public async Task Update_kind_is_a_string_and_decimal_strings_survive_actual_JSON_binding()
    {
        var commands = new CommandDouble();
        await using var fixture = await Start(commands, new()); fixture.Source.Seed(); commands.Current = fixture.Source.Documents[0]; await fixture.Login();
        var line = fixture.Source.Documents[0].Lines[0];
        var request = Save(fixture) with { LineChanges = [new(PurchaseRequestLineChangeKind.Update, line.LineId, null,
            line.Values with { Quantity = "9007199254740993" })] };
        Assert.Contains("\"kind\":\"Update\"", JsonSerializer.Serialize(request, PurchaseRequestCommandRules.Json));
        using var response = await Send(fixture, "save", request); Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(0, json.RootElement.GetProperty("data").GetProperty("outcome").GetInt32());
        Assert.Equal("9007199254740993", commands.LastSave!.LineChanges[0].Values!.Quantity);
        Assert.Equal(line.Values.TotalPrice, commands.Current!.Lines[0].Values.TotalPrice);
    }

    [Fact]
    public async Task Lost_ack_reconciles_only_original_lookup_and_never_redispatches_the_writer()
    {
        var commands = new CommandDouble { LoseAck = true };
        await using var fixture = await Start(commands, new()); fixture.Source.Seed(); commands.Current = fixture.Source.Documents[0]; await fixture.Login();
        var original = Save(fixture); using var lost = await Send(fixture, "save", original); Assert.Equal(HttpStatusCode.InternalServerError, lost.StatusCode);
        using var lookup = await Send(fixture, "save/lookup", original); Assert.Equal(HttpStatusCode.OK, lookup.StatusCode);
        using var body = JsonDocument.Parse(await lookup.Content.ReadAsStringAsync()); Assert.Equal(0, body.RootElement.GetProperty("data").GetProperty("outcome").GetInt32());
        Assert.Equal(JsonSerializer.Serialize(original, PurchaseRequestCommandRules.Json), JsonSerializer.Serialize(commands.LastLookup, PurchaseRequestCommandRules.Json));
        Assert.Equal(1, commands.SaveCalls); Assert.Equal(1, commands.LookupCalls); Assert.Equal(0, commands.SubmitCalls + commands.CreateCalls);
    }
    [Theory]
    [InlineData(PurchaseRequestLookupOutcome.Pending)]
    [InlineData(PurchaseRequestLookupOutcome.Absent)]
    [InlineData(PurchaseRequestLookupOutcome.InvalidInput)]
    [InlineData(PurchaseRequestLookupOutcome.Denied)]
    [InlineData(PurchaseRequestLookupOutcome.Conflict)]
    [InlineData(PurchaseRequestLookupOutcome.QualificationRequired)]
    [InlineData(PurchaseRequestLookupOutcome.Unavailable)]
    [InlineData(PurchaseRequestLookupOutcome.Cancelled)]
    public async Task Every_nonCommitted_lookup_has_its_actual_numeric_outcome_and_no_receipt(PurchaseRequestLookupOutcome outcome)
    {
        var commands = new CommandDouble { Observation = outcome };
        await using var fixture = await Start(commands, new()); fixture.Source.Seed(); await fixture.Login();
        using var response = await Send(fixture, "save/lookup", Save(fixture)); Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());var data = json.RootElement.GetProperty("data");
        Assert.Equal((int)outcome, data.GetProperty("outcome").GetInt32()); Assert.Equal(JsonValueKind.Null, data.GetProperty("receipt").ValueKind);
        Assert.Equal(1, commands.LookupCalls); Assert.Equal(0, commands.SaveCalls + commands.SubmitCalls + commands.CreateCalls);
    }
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Fixed_and_chunked_bodies_are_bounded_at_one_MiB(bool chunked)
    {
        var commands = new CommandDouble();
        await using var fixture = await Start(commands, new()); fixture.Source.Seed(); commands.Current = fixture.Source.Documents[0]; await fixture.Login();
        var json = JsonSerializer.Serialize(Save(fixture), PurchaseRequestCommandRules.Json);
        var exact = Encoding.UTF8.GetBytes(json + new string(' ', 1_048_576 - Encoding.UTF8.GetByteCount(json)));
        using var accepted = await SendBytes(fixture, "save", exact, chunked); Assert.Equal(HttpStatusCode.OK, accepted.StatusCode); Assert.Equal(1, commands.SaveCalls);
        using var oversized = await SendBytes(fixture, "save", [..exact, (byte)' '], chunked); Assert.Equal(HttpStatusCode.RequestEntityTooLarge, oversized.StatusCode); Assert.Equal(1, commands.SaveCalls);
    }
    [Fact]
    public async Task Malformed_JSON_UTF8_duplicate_missing_case_alias_numeric_enum_and_Add_are_rejected_before_dispatch()
    {
        var commands = new CommandDouble();
        await using var fixture = await Start(commands, new()); fixture.Source.Seed(); await fixture.Login();
        var save = Save(fixture); var json = JsonSerializer.Serialize(save, PurchaseRequestCommandRules.Json);
        var samples = new[] { "{", "null", json.Replace("\"idempotencyKey\":", "\"IdempotencyKey\":", StringComparison.Ordinal),
            "{\"idempotencyKey\":\"duplicate\"," + json[1..], json.Replace("\"header\":", "\"extra\":", StringComparison.Ordinal),
            JsonSerializer.Serialize(save with { LineChanges = [new(PurchaseRequestLineChangeKind.Add, null, "new", fixture.Source.Documents[0].Lines[0].Values)] }, PurchaseRequestCommandRules.Json),
            JsonSerializer.Serialize(save with { LineChanges = [new(PurchaseRequestLineChangeKind.Update, fixture.Source.Documents[0].Lines[0].LineId, null, fixture.Source.Documents[0].Lines[0].Values)] }, PurchaseRequestCommandRules.Json).Replace("\"Update\"", "1", StringComparison.Ordinal) };
        foreach (var sample in samples) { using var rejected = await SendBytes(fixture, "save", Encoding.UTF8.GetBytes(sample), false); Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode); }
        using var invalidUtf8 = await SendBytes(fixture, "save", [123, 34, 120, 34, 58, 34, 195, 40, 34, 125], true); Assert.Equal(HttpStatusCode.BadRequest, invalidUtf8.StatusCode);
        Assert.Equal(0, commands.SaveCalls + commands.LookupCalls);
    }
    [Fact]
    public async Task Branch_and_post_dispatch_session_revocation_prevent_receipt_release()
    {
        var commands = new CommandDouble();
        await using var fixture = await Start(commands, new()); fixture.Source.Seed(); commands.Current = fixture.Source.Documents[0]; await fixture.Login();
        using var branch = await Send(fixture, "save", Save(fixture) with { BranchId = "other" }); Assert.Equal(HttpStatusCode.Forbidden, branch.StatusCode); Assert.Equal(0, commands.SaveCalls);
        commands.After = () => fixture.Authority.Rejected = true;
        using var late = await Send(fixture, "save", Save(fixture)); Assert.Equal(HttpStatusCode.Forbidden, late.StatusCode);
        Assert.DoesNotContain("qa-save", await late.Content.ReadAsStringAsync()); Assert.Equal(1, commands.SaveCalls);
    }
    [Fact]
    public async Task Mismatched_receipt_is_OutcomeUnknown_not_HTTP200_commit()
    {
        var commands = new CommandDouble { CorruptReceipt = true };
        await using var fixture = await Start(commands, new()); fixture.Source.Seed(); commands.Current = fixture.Source.Documents[0]; await fixture.Login();
        using var response = await Send(fixture, "save", Save(fixture)); Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());var data = body.RootElement.GetProperty("data");
        Assert.Equal((int)PurchaseRequestCommandOutcome.OutcomeUnknown, data.GetProperty("outcome").GetInt32()); Assert.Equal(JsonValueKind.Null, data.GetProperty("receipt").ValueKind);
    }
    private static Task<PurchaseHttpFixture> Start(CommandDouble commands, AccessDouble access) => PurchaseHttpFixture.Start(s =>
    { s.AddSingleton<IPurchaseRequestCommands>(commands); s.AddSingleton<IPurchaseRequestCommandAccess>(access); });
    private static SavePurchaseRequestDraft Save(PurchaseHttpFixture f)
    { var d = f.Source.Documents[0]; return new("qa-save", d.BranchId, d.PurchaseRequestId, PurchaseRequestCommandRules.EqualityToken(d), d.Header with { Notes = "confirmed synthetic edit" }, []); }
    private static SubmitPurchaseRequest Submit(PurchaseHttpFixture f)
    { var d = f.Source.Documents[0]; return new("qa-submit", d.BranchId, d.PurchaseRequestId, PurchaseRequestCommandRules.EqualityToken(d)); }
    private static Task<HttpResponseMessage> Send(PurchaseHttpFixture f, string route, object body, bool csrf = true, string? origin = null, string? scope = null) =>
        SendBytes(f, route, JsonSerializer.SerializeToUtf8Bytes(body, PurchaseRequestCommandRules.Json), false, csrf, origin, scope);
    private static async Task<HttpResponseMessage> SendBytes(PurchaseHttpFixture f, string route, byte[] bytes, bool chunked,
        bool csrf = true, string? origin = null, string? scope = null)
    {
        var workspace = await f.Json("/api/purchase-requests/workspace");
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/purchase-requests/" + route);
        request.Content = chunked ? new ChunkedBody(bytes) : new ByteArrayContent(bytes);
        request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/json");
        request.Headers.Add("Origin", origin ?? f.Client.BaseAddress!.GetLeftPart(UriPartial.Authority));
        request.Headers.Add("X-Purchase-Scope", scope ?? workspace.GetProperty("scopeKey").GetString());
        if (csrf) request.Headers.Add("X-CSRF-TOKEN", (await f.Json("/api/auth/csrf")).GetProperty("token").GetString());
        return await f.Client.SendAsync(request);
    }
    private sealed class ChunkedBody(byte[] bytes) : HttpContent
    {
        protected override bool TryComputeLength(out long length) { length = 0; return false; }
        protected override async Task SerializeToStreamAsync(Stream stream, TransportContext? context)
        { for (var start = 0; start < bytes.Length; start += 8192) await stream.WriteAsync(bytes.AsMemory(start, Math.Min(8192, bytes.Length - start))); }
    }
    private sealed class AccessDouble : IPurchaseRequestCommandAccess
    {
        public Task<PurchaseRequestCommandAccessState> ResolveAsync(ResolvedSession session, string documentId, string branchId, CancellationToken token) =>
            Task.FromResult(new PurchaseRequestCommandAccessState(true, true, true, false, "synthetic_admission_only"));
    }
    private sealed class CommandDouble : IPurchaseRequestCommands
    {
        public int SaveCalls, SubmitCalls, LookupCalls, CreateCalls;
        public PurchaseRequestAggregate? Current;
        public SavePurchaseRequestDraft? LastSave; public SubmitPurchaseRequest? LastSubmit; public object? LastLookup;
        public PurchaseRequestCommandReceipt? Receipt;
        public bool LoseAck, CorruptReceipt; public Action? After;
        public PurchaseRequestLookupOutcome Observation = PurchaseRequestLookupOutcome.Committed;
        public Task<PurchaseRequestCommandResult> CreateAsync(CreatePurchaseRequestDraft request, CancellationToken token = default)
        { CreateCalls++; throw new InvalidOperationException("No Create dispatch"); }
        public Task<PurchaseRequestCommandResult> SaveAsync(SavePurchaseRequestDraft request, CancellationToken token = default)
        {
            SaveCalls++; LastSave = request; var normalized = PurchaseRequestCommandRules.Freeze(request);
            var lines = Current!.Lines.ToList();
            foreach (var change in normalized.LineChanges)
            {
                var index = lines.FindIndex(line => line.LineId == change.LineId);
                if (index < 0 || change.Kind == PurchaseRequestLineChangeKind.Add) throw new InvalidOperationException("Invalid synthetic change");
                if (change.Kind == PurchaseRequestLineChangeKind.Remove) lines.RemoveAt(index);
                else lines[index] = lines[index] with { Values = change.Values! };
            }
            Current = PurchaseRequestCommandRules.Normalize(Current with { Header = normalized.Header, Lines = lines });
            Receipt = new(PurchaseRequestCommandRules.SaveAction, request.IdempotencyKey, Current, PurchaseRequestCommandRules.EqualityToken(Current), []);
            After?.Invoke(); if (LoseAck) throw new IOException("Synthetic ACK loss after recorded effect");
            return Task.FromResult(new PurchaseRequestCommandResult(PurchaseRequestCommandOutcome.Committed, CorruptReceipt ? Receipt with { IdempotencyKey = "other" } : Receipt));
        }
        public Task<PurchaseRequestCommandResult> SubmitAsync(SubmitPurchaseRequest request, CancellationToken token = default)
        {
            SubmitCalls++; LastSubmit = request; Current = Current! with { StatusId = 2, IsLocked = true };
            Receipt = new(PurchaseRequestCommandRules.SubmitAction, request.IdempotencyKey, Current, PurchaseRequestCommandRules.EqualityToken(Current), []);
            return Task.FromResult(new PurchaseRequestCommandResult(PurchaseRequestCommandOutcome.Committed, Receipt));
        }
        private Task<PurchaseRequestLookupResult> Lookup(object original)
        { LookupCalls++; LastLookup = original; return Task.FromResult(new PurchaseRequestLookupResult(Observation, Observation == PurchaseRequestLookupOutcome.Committed ? Receipt : null)); }
        public Task<PurchaseRequestLookupResult> LookupAsync(CreatePurchaseRequestDraft original, CancellationToken token = default) => throw new InvalidOperationException("No Create lookup route");
        public Task<PurchaseRequestLookupResult> LookupAsync(SavePurchaseRequestDraft original, CancellationToken token = default) => Lookup(original);
        public Task<PurchaseRequestLookupResult> LookupAsync(SubmitPurchaseRequest original, CancellationToken token = default) => Lookup(original);
    }
}
