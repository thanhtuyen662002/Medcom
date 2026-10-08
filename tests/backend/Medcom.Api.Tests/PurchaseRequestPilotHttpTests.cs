using System.Data;
using System.Data.Common;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using Medcom.Api;
using Medcom.Application;
using Medcom.Application.PurchaseRequests;
using Medcom.Contracts;
using Medcom.Infrastructure;
using Medcom.Infrastructure.PurchaseRequests;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace Medcom.Api.Tests;

// This is an offline composition proof, not target runtime acceptance. Real HTTPS,
// authentication, CSRF, LocalWebSessions, admission, factory and SQL writer run here.
// Only identity observations and DbConnections are synthetic. GET uses the actual
// SQL reader and a fresh read projection of the SAME recorded document state.
public sealed class PurchaseRequestPilotHttpTests
{
    [Fact]
    public async Task Https_Save_readback_separate_Submit_and_locked_original_lookup_use_the_real_pilot_composition()
    {
        await using var host = await PilotHost.Start();
        Assert.IsType<LocalWebSessions>(host.Sessions);
        Assert.False(host.Factory.RuntimeAccepted);
        await host.Login();
        var initial = await host.Detail();
        Assert.True(initial.CommandAccess!.CanSave);
        Assert.True(initial.CommandAccess.CanSubmit);
        Assert.True(initial.CommandAccess.CanLookup);
        Assert.False(initial.CommandAccess.CanAddLines);
        Assert.Equal(PurchaseRequestCommandRules.EqualityToken(host.Document), initial.StateToken);

        var original = host.Save("http-save") with
        {
            Header = host.Document.Header with { Notes = "Synthetic HTTPS header edit", Price = "15.25" },
            LineChanges = [new(PurchaseRequestLineChangeKind.Update, "line-1", null,
                PurchaseFixtures.Values with { Quantity = "9007199254740993" })]
        };
        var saved = await host.Command("save", original);
        Assert.Equal(PurchaseRequestCommandOutcome.Committed, saved.Outcome);
        Assert.NotNull(saved.Receipt);
        Assert.Empty(saved.Receipt!.AllocatedLines);
        Assert.Equal("9007199254740993", saved.Receipt.Document.Lines[0].Values.Quantity);
        Assert.Equal("13", saved.Receipt.Document.Lines[0].Values.TotalPrice);
        Assert.Equal("15.25", saved.Receipt.Document.Header.Price);
        Assert.NotEqual(original.ExpectedStateToken, saved.Receipt.StateToken);
        Assert.Equal(0, host.Model.SubmitEffects);
        Assert.Equal(2, host.Model.Commits);
        Assert.Equal(1, Count(host.Model, PurchaseRequestSql.UpdateHeadText));
        Assert.Equal(1, Count(host.Model, PurchaseRequestSql.UpdateLineText));

        var readback = await host.Detail();
        Assert.Equal(Json(saved.Receipt.Document), Json(readback.Document));
        Assert.Equal(saved.Receipt.StateToken, readback.StateToken);
        var staleSubmit = new SubmitPurchaseRequest("http-stale-submit", "B1", PurchaseFixtures.DocumentId, original.ExpectedStateToken);
        Assert.Equal(PurchaseRequestCommandOutcome.Conflict, (await host.Command("submit", staleSubmit)).Outcome);
        Assert.Single(host.Model.Journal);
        Assert.Equal(0, host.Model.SubmitEffects);

        var submit = staleSubmit with { IdempotencyKey = "http-submit", ExpectedStateToken = saved.Receipt.StateToken };
        var submitted = await host.Command("submit", submit);
        Assert.Equal(PurchaseRequestCommandOutcome.Committed, submitted.Outcome);
        Assert.Equal(2, submitted.Receipt!.Document.StatusId);
        Assert.True(submitted.Receipt.Document.IsLocked);
        Assert.Equal(1, host.Model.SubmitEffects);
        Assert.Equal(4, host.Model.Commits);
        Assert.Equal(2, host.Model.Journal.Count);
        var locked = await host.Detail();
        Assert.Equal(Json(submitted.Receipt.Document), Json(locked.Document));
        Assert.False(locked.CommandAccess!.CanSave);
        Assert.False(locked.CommandAccess.CanSubmit);
        Assert.True(locked.CommandAccess.CanLookup);

        var state = Snapshot(host.Model);
        var commits = host.Model.Commits;
        host.Model.Commands.Clear();
        var oldSave = await host.Lookup("save/lookup", original);
        var oldSubmit = await host.Lookup("submit/lookup", submit);
        Assert.Equal(PurchaseRequestLookupOutcome.Committed, oldSave.Outcome);
        Assert.Equal(PurchaseRequestLookupOutcome.Committed, oldSubmit.Outcome);
        Assert.Equal(Json(saved.Receipt), Json(oldSave.Receipt));
        Assert.Equal(Json(submitted.Receipt), Json(oldSubmit.Receipt));
        Assert.Equal(state, Snapshot(host.Model));
        Assert.Equal(commits, host.Model.Commits);
        AssertLookupOnly(host.Model);
        Assert.True(host.Authority.LastVersion > 20);
        Assert.Equal(0, host.ReadSource.Commits);
        Assert.Contains(host.ReadSource.Commands, c => c.Sql == SqlPurchaseRequestQueries.HeadText);
        Assert.Contains(host.Model.Commands, c => c.CommandText == PurchaseRequestSql.ProbeText);
        Assert.All(host.Model.Commands, c => Assert.NotNull(c.Transaction));
        AssertNoAllocationOrStructuralWrites(host.Model);
    }

    [Theory]
    [InlineData("save")]
    [InlineData("submit")]
    [InlineData("save/lookup")]
    [InlineData("submit/lookup")]
    public async Task All_real_pilot_routes_require_cookie_CSRF_exact_origin_and_current_scope_before_SQL(string route)
    {
        await using var host = await PilotHost.Start();
        using (var anonymous = await host.Client.PostAsync("/api/purchase-requests/" + route, new StringContent("{}")))
            Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
        await host.Login();
        var original = route.StartsWith("save", StringComparison.Ordinal) ? (object)host.Save("http-controls") : host.Submit("http-controls");
        using (var csrf = await host.Send(route, original, csrf: false)) Assert.Equal(HttpStatusCode.Forbidden, csrf.StatusCode);
        using (var origin = await host.Send(route, original, origin: "https://foreign.invalid")) Assert.Equal(HttpStatusCode.Forbidden, origin.StatusCode);
        using (var scope = await host.Send(route, original, scope: new string('b', 64))) Assert.Equal(HttpStatusCode.Conflict, scope.StatusCode);
        Assert.Empty(host.Model.Commands);
        Assert.Empty(host.Model.Journal);
        Assert.Equal(0, host.Model.Connections);
    }

    [Theory]
    [InlineData("actor")]
    [InlineData("document")]
    [InlineData("branch")]
    public async Task Pilot_exact_actor_document_and_branch_cannot_be_selected_by_the_HTTP_client(string mismatch)
    {
        await using var host = await PilotHost.Start(permitActor: mismatch == "actor" ? "other.synthetic.actor" : PurchaseFixtures.Actor);
        await host.Login();
        var original = host.Save("http-wrong-scope");
        if (mismatch == "document") original = original with { PurchaseRequestId = "other-synthetic-document" };
        if (mismatch == "branch") original = original with { BranchId = "B2" };
        using var response = await host.Send("save", original);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Empty(host.Model.Journal);
        Assert.Equal(0, host.Model.Commits);
        Assert.Equal(0, host.Model.Connections);
        Assert.Equal(Json(PurchaseFixtures.Aggregate(2)), Json(host.Document));
    }

    [Theory]
    [InlineData("server")]
    [InlineData("database")]
    [InlineData("binding")]
    public async Task Wrong_owner_target_or_database_binding_never_reaches_document_or_business_SQL(string mismatch)
    {
        await using var host = await PilotHost.Start(startupPath: false, permitServer: mismatch == "server" ? "OtherSynthetic" : "Synthetic",
            permitDatabase: mismatch == "database" ? "OtherSynthetic" : "Synthetic",
            permitBinding: mismatch == "binding" ? new Guid("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa") : PurchaseFixtures.Binding);
        await host.Login();
        using var denied = await host.Send("save", host.Save("http-wrong-target"));
        Assert.Equal(HttpStatusCode.ServiceUnavailable, denied.StatusCode);
        Assert.Empty(host.Model.Journal);
        Assert.Equal(0, host.Model.Commits);
        Assert.DoesNotContain(host.Model.Commands, c => c.CommandText == PurchaseRequestSql.HeadText
            || c.CommandText == PurchaseRequestSql.CredentialText || c.CommandText == PurchaseRequestSql.ReserveText);
        AssertNoAllocationOrStructuralWrites(host.Model);
        if (mismatch == "binding") Assert.Contains(host.Model.Commands, c => c.CommandText == PurchaseRequestSql.ProbeText);
        else Assert.Empty(host.Model.Commands);
    }

    [Fact]
    public async Task Add_Remove_and_Create_cannot_reach_business_SQL_or_reserve_intent()
    {
        await using var host = await PilotHost.Start();
        await host.Login();
        var original = host.Save("http-structural-denied");
        using (var add = await host.Send("save", original with
        { LineChanges = [new(PurchaseRequestLineChangeKind.Add, null, "new-client-line", PurchaseFixtures.Values)] }))
            Assert.Equal(HttpStatusCode.BadRequest, add.StatusCode);
        Assert.Empty(host.Model.Commands);
        var remove = await host.Command("save", original with
        { LineChanges = [new(PurchaseRequestLineChangeKind.Remove, "line-1", null, null)] });
        Assert.Equal(PurchaseRequestCommandOutcome.Denied, remove.Outcome);
        Assert.Null(remove.Receipt);
        using (var create = await host.Send("", PurchaseFixtures.Create))
            Assert.Equal(HttpStatusCode.MethodNotAllowed, create.StatusCode);
        Assert.Empty(host.Model.Journal);
        Assert.Equal(0, host.Model.Commits);
        AssertNoAllocationOrStructuralWrites(host.Model);
        Assert.DoesNotContain(host.Model.Commands, c => c.CommandText == PurchaseRequestSql.ReserveText);
        Assert.Equal(Json(PurchaseFixtures.Aggregate(2)), Json(host.Document));
    }

    [Fact]
    public async Task Lost_business_commit_ACK_is_reconciled_from_original_intent_without_any_lookup_write()
    {
        await using var host = await PilotHost.Start();
        await host.Login();
        var original = host.Save("http-lost-ack");
        // Admission has its own connections. Locate business custody by the actual
        // completion statement, never by a hard-coded connection/phase index.
        host.Model.OnStep = (phase, step) => { if (step == "complete") host.Model.Fault = phase + ":commit-ack"; };
        var lost = await host.Command("save", original);
        Assert.Equal(PurchaseRequestCommandOutcome.OutcomeUnknown, lost.Outcome);
        Assert.Null(lost.Receipt);
        Assert.Equal((byte)1, Assert.Single(host.Model.Journal.Values).State);
        Assert.Equal(original.Header.Notes, host.Document.Header.Notes);
        Assert.Equal(2, host.Model.Commits);
        host.Model.OnStep = null;
        host.Model.Fault = null;
        var state = Snapshot(host.Model);
        host.Model.Commands.Clear();
        var observed = await host.Lookup("save/lookup", original);
        Assert.Equal(PurchaseRequestLookupOutcome.Committed, observed.Outcome);
        Assert.Equal(original.IdempotencyKey, observed.Receipt!.IdempotencyKey);
        Assert.Equal(state, Snapshot(host.Model));
        Assert.Equal(2, host.Model.Commits);
        AssertLookupOnly(host.Model);

        host.Model.Commands.Clear();
        var changed = await host.Lookup("save/lookup", original with { Header = original.Header with { Notes = "different intent" } });
        Assert.Equal(PurchaseRequestLookupOutcome.Conflict, changed.Outcome);
        Assert.Null(changed.Receipt);
        Assert.Equal(state, Snapshot(host.Model));
        AssertLookupOnly(host.Model);
    }

    [Fact]
    public async Task Lost_reservation_ACK_keeps_pending_original_and_duplicate_never_takes_over_custody()
    {
        await using var host = await PilotHost.Start();
        await host.Login();
        var original = host.Save("http-pending");
        host.Model.OnStep = (phase, step) => { if (step == "reserve") host.Model.Fault = phase + ":commit-ack"; };
        Assert.Equal(PurchaseRequestCommandOutcome.OutcomeUnknown, (await host.Command("save", original)).Outcome);
        var retained = Assert.Single(host.Model.Journal.Values);
        Assert.Equal((byte)0, retained.State);
        Assert.Equal(1, host.Model.Commits);
        Assert.Equal(Json(PurchaseFixtures.Aggregate(2)), Json(host.Document));
        host.Model.OnStep = null;
        host.Model.Fault = null;
        host.Model.Commands.Clear();
        Assert.Equal(PurchaseRequestCommandOutcome.OutcomeUnknown, (await host.Command("save", original)).Outcome);
        Assert.Equal(PurchaseRequestLookupOutcome.Pending, (await host.Lookup("save/lookup", original)).Outcome);
        Assert.Same(retained, Assert.Single(host.Model.Journal.Values));
        Assert.Equal(1, host.Model.Commits);
        AssertLookupOnly(host.Model);
    }

    [Fact]
    public async Task Concurrent_duplicate_observes_pending_and_only_the_original_owner_finishes_the_business_phase()
    {
        await using var host = await PilotHost.Start();
        await host.Login();
        var original = host.Save("http-concurrent");
        using var release = new ManualResetEventSlim();
        var reserved = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var paused = 0;
        host.Model.OnStep = (_, step) =>
        {
            if (step == "commit-ack" && Interlocked.Exchange(ref paused, 1) == 0)
            {
                reserved.TrySetResult();
                if (!release.Wait(TimeSpan.FromSeconds(20))) throw new TimeoutException("Synthetic custody gate timed out.");
            }
        };
        var first = host.Command("save", original);
        try
        {
            await reserved.Task.WaitAsync(TimeSpan.FromSeconds(10));
            Assert.Equal((byte)0, Assert.Single(host.Model.Journal.Values).State);
            var duplicate = await host.Command("save", original);
            Assert.Equal(PurchaseRequestCommandOutcome.OutcomeUnknown, duplicate.Outcome);
            Assert.Equal(PurchaseRequestLookupOutcome.Pending, (await host.Lookup("save/lookup", original)).Outcome);
            Assert.Equal(0, Count(host.Model, PurchaseRequestSql.UpdateHeadText));
        }
        finally { release.Set(); }
        var completed = await first;
        Assert.Equal(PurchaseRequestCommandOutcome.Committed, completed.Outcome);
        Assert.Equal(1, Count(host.Model, PurchaseRequestSql.ReserveText));
        Assert.Equal(1, Count(host.Model, PurchaseRequestSql.UpdateHeadText));
        Assert.Equal(1, Count(host.Model, PurchaseRequestSql.CompleteText));
        Assert.Equal(2, host.Model.Commits);
        var replay = await host.Command("save", original);
        Assert.Equal(PurchaseRequestCommandOutcome.Replayed, replay.Outcome);
        Assert.Equal(Json(completed.Receipt), Json(replay.Receipt));
        Assert.Single(host.Model.Journal);
        Assert.Equal(1, Count(host.Model, PurchaseRequestSql.UpdateHeadText));
        AssertNoAllocationOrStructuralWrites(host.Model);
    }

    [Fact]
    public async Task Absent_lookup_is_read_only_and_does_not_create_a_replacement_intent()
    {
        await using var host = await PilotHost.Start();
        await host.Login();
        var observed = await host.Lookup("save/lookup", host.Save("http-absent"));
        Assert.Equal(PurchaseRequestLookupOutcome.Absent, observed.Outcome);
        Assert.Null(observed.Receipt);
        Assert.Empty(host.Model.Journal);
        Assert.Equal(0, host.Model.Commits);
        AssertLookupOnly(host.Model);
    }

    [Theory]
    [InlineData("update")]
    [InlineData("credential")]
    [InlineData("branch")]
    [InlineData("menu")]
    [InlineData("parent")]
    public async Task Native_authority_loss_blocks_admission_before_reservation_and_hides_existing_receipts(string denial)
    {
        await using var host = await PilotHost.Start();
        await host.Login();
        var original = host.Save("http-native-grant");
        host.Model.Denial = denial;
        using (var denied = await host.Send("save", original)) Assert.Equal(HttpStatusCode.ServiceUnavailable, denied.StatusCode);
        Assert.Empty(host.Model.Journal);
        Assert.Equal(0, host.Model.Commits);
        host.Model.Denial = "add"; // Run+Update authorizes this pilot even without Add.
        Assert.Equal(PurchaseRequestCommandOutcome.Committed, (await host.Command("save", original)).Outcome);
        host.Model.Denial = denial;
        var state = Snapshot(host.Model);
        host.Model.Commands.Clear();
        using var hidden = await host.Send("save/lookup", original);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, hidden.StatusCode);
        Assert.DoesNotContain(original.IdempotencyKey, await hidden.Content.ReadAsStringAsync());
        Assert.Equal(state, Snapshot(host.Model));
        Assert.Equal(2, host.Model.Commits);
        AssertLookupOnly(host.Model);
    }

    [Fact]
    public async Task Expired_write_window_blocks_new_Save_but_preserves_original_receipt_lookup()
    {
        await using var host = await PilotHost.Start();
        await host.Login();
        var original = host.Save("http-before-expiry");
        var committed = await host.Command("save", original);
        Assert.Equal(PurchaseRequestCommandOutcome.Committed, committed.Outcome);
        var submit = new SubmitPurchaseRequest("http-submit-before-expiry", "B1", PurchaseFixtures.DocumentId,
            committed.Receipt!.StateToken);
        var submitted = await host.Command("submit", submit);
        Assert.Equal(PurchaseRequestCommandOutcome.Committed, submitted.Outcome);
        Assert.True(host.Document.IsLocked);
        host.Clock.Now += TimeSpan.FromMinutes(4); // Pilot is 3 minutes; local idle timeout is 5.
        var state = Snapshot(host.Model);
        host.Model.Commands.Clear();
        using (var expired = await host.Send("save", host.Save("http-after-expiry")))
            Assert.Equal(HttpStatusCode.ServiceUnavailable, expired.StatusCode);
        using (var expired = await host.Send("submit", host.Submit("http-submit-after-expiry")))
            Assert.Equal(HttpStatusCode.ServiceUnavailable, expired.StatusCode);
        var observed = await host.Lookup("save/lookup", original);
        Assert.Equal(PurchaseRequestLookupOutcome.Committed, observed.Outcome);
        Assert.Equal(Json(committed.Receipt), Json(observed.Receipt));
        var observedSubmit = await host.Lookup("submit/lookup", submit);
        Assert.Equal(PurchaseRequestLookupOutcome.Committed, observedSubmit.Outcome);
        Assert.Equal(Json(submitted.Receipt), Json(observedSubmit.Receipt));
        Assert.Equal(state, Snapshot(host.Model));
        Assert.Equal(4, host.Model.Commits);
        AssertLookupOnly(host.Model);
    }

    [Theory]
    [InlineData("revoke")]
    [InlineData("idle-expiry")]
    [InlineData("authority-regression")]
    [InlineData("credential-change")]
    public async Task Server_session_revocation_expiry_and_regression_fail_before_command_SQL(string change)
    {
        await using var host = await PilotHost.Start();
        await host.Login();
        if (change == "revoke") host.Sessions.Revoke(host.SessionToken!);
        if (change == "idle-expiry") host.Clock.Now += TimeSpan.FromMinutes(6);
        if (change == "authority-regression") host.Authority.OverrideVersion = 1;
        if (change == "credential-change") host.Authority.Identity = host.Authority.Identity with { CredentialStamp = "synthetic-changed-stamp" };
        using var denied = await host.Send("save", host.Save("http-dead-session"));
        Assert.Equal(HttpStatusCode.Unauthorized, denied.StatusCode);
        Assert.Empty(host.Model.Commands);
        Assert.Empty(host.Model.Journal);
    }

    [Theory]
    [InlineData("update-head")]
    [InlineData("commit-ack")]
    public async Task Revocation_at_business_or_committed_receipt_checkpoint_prevents_stale_receipt_release(string checkpoint)
    {
        await using var host = await PilotHost.Start();
        await host.Login();
        var original = host.Save("http-late-revoke");
        host.Model.OnStep = (_, step) =>
        {
            if (step == checkpoint && (checkpoint != "commit-ack" || host.Model.Commits == 2))
                host.Sessions.Revoke(host.SessionToken!);
        };
        using var denied = await host.Send("save", original);
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        Assert.DoesNotContain(original.IdempotencyKey, await denied.Content.ReadAsStringAsync());
        Assert.Equal(checkpoint == "commit-ack" ? 2 : 1, host.Model.Commits);
        Assert.Equal(checkpoint == "commit-ack" ? (byte)1 : (byte)0, Assert.Single(host.Model.Journal.Values).State);
        if (checkpoint == "update-head") Assert.Equal(Json(PurchaseFixtures.Aggregate(2)), Json(host.Document));
        AssertNoAllocationOrStructuralWrites(host.Model);
    }

    [Theory]
    [InlineData("update-head")]
    [InlineData("complete")]
    public async Task Business_statement_failure_rolls_back_document_and_retains_pending_custody(string checkpoint)
    {
        await using var host = await PilotHost.Start();
        await host.Login();
        var original = host.Save("http-business-failure");
        host.Model.OnStep = (phase, step) => { if (step == checkpoint) host.Model.Fault = phase + ":" + checkpoint; };
        var result = await host.Command("save", original);
        Assert.Equal(PurchaseRequestCommandOutcome.Unavailable, result.Outcome);
        Assert.Null(result.Receipt);
        Assert.Equal(1, host.Model.Commits);
        Assert.Equal((byte)0, Assert.Single(host.Model.Journal.Values).State);
        Assert.Equal(Json(PurchaseFixtures.Aggregate(2)), Json(host.Document));
        host.Model.Fault = null;
        host.Model.OnStep = null;
        host.Model.Commands.Clear();
        Assert.Equal(PurchaseRequestLookupOutcome.Pending, (await host.Lookup("save/lookup", original)).Outcome);
        AssertLookupOnly(host.Model);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Default_ApiHost_and_dormant_registration_do_not_treat_pilot_as_runtime_acceptance(bool dormantRegistration)
    {
        await using var host = await PilotHost.Start(registerPilot: false, dormantRegistration: dormantRegistration);
        Assert.False(host.Factory.RuntimeAccepted);
        await host.Login();
        var detail = await host.Detail();
        Assert.False(detail.CommandAccess!.CanSave);
        Assert.False(detail.CommandAccess.CanSubmit);
        Assert.False(detail.CommandAccess.CanLookup);
        using var denied = await host.Send("save", host.Save("http-production-still-off"));
        Assert.Equal(HttpStatusCode.ServiceUnavailable, denied.StatusCode);
        Assert.Empty(host.Model.Commands);
        Assert.Empty(host.Model.Journal);
        Assert.Equal(0, host.Model.Connections);
    }

    private static int Count(PurchaseRecordingModel model, string sql) => model.Commands.Count(command => command.CommandText == sql);
    private static string Json<T>(T value) => JsonSerializer.Serialize(value, PurchaseRequestCommandRules.Json);
    private static string Snapshot(PurchaseRecordingModel model) => Json(new { model.Documents, model.Journal });
    private static void AssertNoAllocationOrStructuralWrites(PurchaseRecordingModel model)
    {
        Assert.Equal(0, model.AllocatorCalls);
        Assert.DoesNotContain(model.Commands, c => c.CommandText == PurchaseRequestSql.InsertHeadText
            || c.CommandText == PurchaseRequestSql.InsertLineText || c.CommandText == PurchaseRequestSql.DeleteLineText);
    }
    private static void AssertLookupOnly(PurchaseRecordingModel model)
    {
        Assert.NotEmpty(model.Commands);
        Assert.All(model.Commands, command =>
        {
            Assert.Equal(CommandType.Text, command.CommandType);
            Assert.Contains(command.CommandText, new[]
            {
                PurchaseRequestSql.CredentialText, PurchaseRequestSql.GrantsText,
                SqlLegacyBranchScope.NativeUserText, SqlLegacyBranchScope.RestrictedText,
                SqlLegacyBranchScope.CatalogShapeText, SqlLegacyBranchScope.CatalogText,
                PurchaseRequestSql.ProbeText, PurchaseRequestSql.TransactionText,
                PurchaseRequestSql.HeadText, PurchaseRequestSql.DetailsText, PurchaseRequestSql.LookupText
            });
            Assert.NotNull(command.Transaction);
        });
        AssertNoAllocationOrStructuralWrites(model);
    }

    private sealed class PilotHost : IAsyncDisposable
    {
        private readonly WebApplication app;
        private readonly X509Certificate2 certificate;
        private readonly string configPath;
        internal readonly PurchaseRecordingModel Model = new();
        internal readonly PurchaseQuerySource ReadSource = new()
        {
            Username = PurchaseFixtures.Actor, StoredHash = PurchaseFixtures.Stored,
            Group = PurchaseFixtures.Group, NativeGroupRowId = PurchaseFixtures.Group,
            NativeBranch = "B1", NativeBranches = ["B1"], CatalogBranches = ["B1"]
        };
        internal readonly PilotAuthority Authority = new();
        internal readonly PurchaseClock Clock = new();
        internal PurchaseRequestCommandFactory Factory { get; private set; }
        internal HttpClient Client { get; private set; } = null!;
        internal IWebSessions Sessions => app.Services.GetRequiredService<IWebSessions>();
        internal PurchaseRequestAggregate Document => Model.Documents[PurchaseFixtures.DocumentId];
        internal string? SessionToken;
        private string? csrfToken, scope;

        private PilotHost(X509Certificate2 certificate, string configPath, bool registerPilot, bool dormantRegistration,
            string permitActor, string permitServer, string permitDatabase, Guid permitBinding, bool startupPath)
        {
            this.certificate = certificate;
            this.configPath = configPath;
            Model.Seed(2);
            var authorization = new PurchaseRequestPilotAuthorization(permitServer, permitDatabase, permitBinding,
                PurchaseFixtures.Company.TenantId, PurchaseFixtures.Company.CompanyId, permitActor, "B1",
                PurchaseFixtures.DocumentId, "I57-offline-recording-only", Clock.Now.AddMinutes(-1), Clock.Now.AddMinutes(3));
            Factory = PurchaseRequestCommandFactory.ForOwnerAuthorizedPilot(authorization, PurchaseFixtures.Company,
                (Func<DbConnection>)(() => new PurchaseRecordingConnection(Model, Model.Connections++)), Clock);
            var settings = PurchaseRequestPilotStartupTests.SyntheticSettings(Clock.Now);
            settings[PurchaseRequestPilotStartupTests.Key("ActorId")] = permitActor;
            settings[PurchaseRequestPilotStartupTests.Key("Server")] = permitServer;
            settings[PurchaseRequestPilotStartupTests.Key("Database")] = permitDatabase;
            settings[PurchaseRequestPilotStartupTests.Key("DatabaseBindingId")] = permitBinding.ToString("D");
            File.WriteAllText(configPath, JsonSerializer.Serialize(settings));
            var useStartup = startupPath && registerPilot;
            string[] args = ["--environment", "Production", "--Legacy:Enabled", useStartup ? "true" : "false",
                "--Medcom:PrivateConfigPath", configPath, "--Session:IdleMinutes", "5", "--Session:AbsoluteMinutes", "10"];
            void ConfigureRecording(WebApplicationBuilder builder)
            {
                // Never start the ordinary live dependency monitor in an offline test.
                foreach (var service in builder.Services.Where(service => service.ServiceType == typeof(IHostedService)
                    && service.ImplementationType == typeof(LegacyHealthMonitor)).ToArray()) builder.Services.Remove(service);
                builder.Logging.ClearProviders();
                builder.WebHost.ConfigureKestrel(options => options.Listen(IPAddress.Loopback, 0, listen => listen.UseHttps(certificate)));
                builder.Services.AddSingleton<IIdentityAuthority>(Authority);
                builder.Services.AddSingleton<TimeProvider>(Clock);
                builder.Services.AddScoped<IPurchaseRequestQueries>(provider =>
                {
                    var context = provider.GetRequiredService<IHttpContextAccessor>().HttpContext!;
                    var token = AuthEndpoints.Current(context).Token;
                    var sessions = provider.GetRequiredService<IWebSessions>();
                    return new SqlPurchaseRequestQueries(PurchaseFixtures.Company, () =>
                    {
                        // A GET snapshots current committed writer state, including
                        // its precise normalized decimal strings and Submit lock.
                        ReadSource.Documents.Clear();
                        ReadSource.Documents.AddRange(Model.Documents.Values);
                        ReadSource.NativeBranch = Model.NativeBranch;
                        ReadSource.NativeBranches = Model.NativeBranches;
                        ReadSource.CatalogBranches = Model.CatalogBranches;
                        return new QueryConnection(ReadSource);
                    }, async cancellation => (await sessions.ResolveAsync(token, false, cancellation))?.Identity,
                        async cancellation => (await sessions.InspectAsync(token, cancellation))?.Identity);
                });
                if (registerPilot && !useStartup) builder.Services.AddOwnerAuthorizedPurchaseRequestPilotCommands(Factory);
                else if (dormantRegistration) builder.Services.AddDormantPurchaseRequestCommands(Factory);
            }
            app = useStartup
                ? PurchaseRequestPilotStartup.BuildForRecording([PurchaseRequestPilotStartup.Switch, .. args], ConfigureRecording,
                    (permit, company) => Factory = PurchaseRequestCommandFactory.ForOwnerAuthorizedPilot(permit, company,
                        (Func<DbConnection>)(() => new PurchaseRecordingConnection(Model, Model.Connections++)), Clock))
                : ApiHost.Build(args, ConfigureRecording);
            Assert.Equal(0, Model.Connections);
            Assert.Empty(Model.Commands);
            app.Use(async (context, next) =>
            {
                if (context.Items[AuthEndpoints.ResolvedKey] is ResolvedSession current) SessionToken = current.Token;
                await next(context);
            });
        }

        internal static async Task<PilotHost> Start(bool registerPilot = true, bool dormantRegistration = false,
            string permitActor = PurchaseFixtures.Actor, string permitServer = "Synthetic", string permitDatabase = "Synthetic", Guid? permitBinding = null,
            bool startupPath = true)
        {
            using var key = RSA.Create(2048);
            var request = new CertificateRequest("CN=localhost", key, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
            using var generated = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddHours(1));
            var bytes = generated.Export(X509ContentType.Pfx);
            X509Certificate2 certificate;
            try { certificate = X509CertificateLoader.LoadPkcs12(bytes, null); }
            finally { CryptographicOperations.ZeroMemory(bytes); }
            var path = Path.Combine(Path.GetTempPath(), "medcom-i57-synthetic-" + Guid.NewGuid().ToString("N") + ".json");
            await File.WriteAllTextAsync(path, "{}");
            var host = new PilotHost(certificate, path, registerPilot, dormantRegistration, permitActor,
                permitServer, permitDatabase, permitBinding ?? PurchaseFixtures.Binding, startupPath);
            await host.app.StartAsync();
            var address = host.app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single();
            host.Client = new HttpClient(new HttpClientHandler
            {
                AllowAutoRedirect = false, CookieContainer = new CookieContainer(),
                ServerCertificateCustomValidationCallback = (_, cert, _, _) => cert?.Thumbprint == certificate.Thumbprint
            }) { BaseAddress = new Uri(address), Timeout = TimeSpan.FromSeconds(30) };
            return host;
        }

        internal SavePurchaseRequestDraft Save(string key) => new(key, "B1", PurchaseFixtures.DocumentId,
            PurchaseRequestCommandRules.EqualityToken(Document), Document.Header with { Notes = "Synthetic pilot update" }, []);
        internal SubmitPurchaseRequest Submit(string key) => new(key, "B1", PurchaseFixtures.DocumentId,
            PurchaseRequestCommandRules.EqualityToken(Document));
        internal async Task Login()
        {
            var csrf = await GetJson("/api/auth/csrf");
            using var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/login")
            { Content = JsonContent.Create(new { username = "synthetic-pilot-user", password = "synthetic-pilot-password" }) };
            request.Headers.Add("X-CSRF-TOKEN", csrf.GetProperty("token").GetString());
            using var response = await Client.SendAsync(request);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var cookie = Assert.Single(response.Headers.GetValues("Set-Cookie"), value => value.StartsWith("__Host-Medcom.Session=", StringComparison.Ordinal));
            Assert.Contains("secure", cookie, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
            csrfToken = (await GetJson("/api/auth/csrf")).GetProperty("token").GetString();
            scope = (await GetJson("/api/purchase-requests/workspace")).GetProperty("scopeKey").GetString();
            Assert.Matches("^[a-f0-9]{64}$", scope!);
            Assert.NotNull(SessionToken);
        }
        internal async Task<HttpResponseMessage> Send(string route, object body, bool csrf = true, string? origin = null, string? scope = null)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, "/api/purchase-requests/" + route)
            { Content = new ByteArrayContent(JsonSerializer.SerializeToUtf8Bytes(body, PurchaseRequestCommandRules.Json)) };
            request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/json");
            request.Headers.Add("Origin", origin ?? Client.BaseAddress!.GetLeftPart(UriPartial.Authority));
            request.Headers.Add("X-Purchase-Scope", scope ?? this.scope);
            if (csrf) request.Headers.Add("X-CSRF-TOKEN", csrfToken);
            return await Client.SendAsync(request);
        }
        internal async Task<PurchaseRequestCommandResult> Command(string route, object body)
        {
            using var response = await Send(route, body);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.True(response.Headers.CacheControl?.NoStore);
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            Assert.Equal(scope, json.RootElement.GetProperty("scopeKey").GetString());
            return json.RootElement.GetProperty("data").Deserialize<PurchaseRequestCommandResult>(PurchaseRequestCommandRules.Json)!;
        }
        internal async Task<PurchaseRequestLookupResult> Lookup(string route, object body)
        {
            using var response = await Send(route, body);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.True(response.Headers.CacheControl?.NoStore);
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            Assert.Equal(scope, json.RootElement.GetProperty("scopeKey").GetString());
            return json.RootElement.GetProperty("data").Deserialize<PurchaseRequestLookupResult>(PurchaseRequestCommandRules.Json)!;
        }
        internal async Task<PurchaseRequestReadback> Detail() => (await GetJson("/api/purchase-requests/detail?documentId=" + PurchaseFixtures.DocumentId))
            .GetProperty("data").Deserialize<PurchaseRequestReadback>(PurchaseRequestCommandRules.Json)!;
        private async Task<JsonElement> GetJson(string path)
        {
            using var response = await Client.GetAsync(path);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.True(response.Headers.CacheControl?.NoStore);
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            return json.RootElement.Clone();
        }
        public async ValueTask DisposeAsync()
        {
            Client.Dispose();
            await app.StopAsync();
            await app.DisposeAsync();
            certificate.Dispose();
            File.Delete(configPath);
        }
    }

    private sealed class PilotAuthority : IIdentityAuthority
    {
        internal AuthoritativeIdentity Identity = PurchaseFixtures.Identity() with { Capabilities = ["purchase-requests.read"] };
        private long version;
        internal long? OverrideVersion;
        internal long LastVersion => Interlocked.Read(ref version);
        private IdentityResult Observe() => new(IdentityOutcome.Success,
            Identity with { AuthorityVersion = OverrideVersion ?? Interlocked.Increment(ref version) });
        public Task<IdentityResult> AuthenticateAsync(string username, string password, CancellationToken token) =>
            Task.FromResult(username == "synthetic-pilot-user" && password == "synthetic-pilot-password"
                ? Observe() : new IdentityResult(IdentityOutcome.Rejected));
        public Task<IdentityResult> RevalidateAsync(AuthoritativeIdentity identity, CancellationToken token) => Task.FromResult(Observe());
    }
}
