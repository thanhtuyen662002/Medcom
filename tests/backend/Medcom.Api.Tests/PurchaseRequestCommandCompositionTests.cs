using System.Collections.Concurrent;
using System.Data.Common;
using System.Globalization;
using System.Security.Claims;
using System.Text.Json;
using Medcom.Application;
using Medcom.Application.PurchaseRequests;
using Medcom.Contracts;
using Medcom.Infrastructure;
using Medcom.Infrastructure.PurchaseRequests;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class PurchaseRequestCommandCompositionTests
{
    [Fact]
    public async Task Default_registration_resolves_scoped_unavailable_services_without_context_sessions_or_SQL()
    {
        var services = new ServiceCollection();
        services.AddDormantPurchaseRequestCommands();
        Assert.Equal(ServiceLifetime.Scoped, Assert.Single(services, x => x.ServiceType == typeof(IPurchaseRequestCommands)).Lifetime);
        Assert.Equal(ServiceLifetime.Scoped, Assert.Single(services, x => x.ServiceType == typeof(IPurchaseRequestCommandAccess)).Lifetime);
        using var provider = services.BuildServiceProvider(new ServiceProviderOptions { ValidateScopes = true, ValidateOnBuild = true });
        using var scope = provider.CreateScope();
        var commands = scope.ServiceProvider.GetRequiredService<IPurchaseRequestCommands>();
        var access = scope.ServiceProvider.GetRequiredService<IPurchaseRequestCommandAccess>();
        var state = await access.ResolveAsync(Session(TokenA), PurchaseFixtures.DocumentId, "B1", CancellationToken.None);
        AssertUnavailable(state);
        var original = Save(PurchaseFixtures.Aggregate());
        Assert.Equal(PurchaseRequestCommandOutcome.Unavailable, (await commands.CreateAsync(PurchaseFixtures.Create)).Outcome);
        Assert.Equal(PurchaseRequestCommandOutcome.Unavailable, (await commands.SaveAsync(original)).Outcome);
        Assert.Equal(PurchaseRequestCommandOutcome.Unavailable, (await commands.SubmitAsync(Submit(original))).Outcome);
        Assert.Equal(PurchaseRequestLookupOutcome.Unavailable, (await commands.LookupAsync(original)).Outcome);
        Assert.Equal(PurchaseRequestLookupOutcome.Unavailable, (await commands.LookupAsync(Submit(original))).Outcome);
        Assert.Equal(PurchaseRequestLookupOutcome.Unavailable, (await commands.LookupAsync(PurchaseFixtures.Create)).Outcome);
    }

    [Fact]
    public async Task Supplied_factory_without_runtime_acceptance_is_still_off_before_session_revalidation()
    {
        var db = new I22AdmissionModel();
        var factory = new PurchaseRequestCommandFactory(PurchaseFixtures.Binding, PurchaseFixtures.Company, (Func<DbConnection>)db.NewConnection);
        var sessions = new FakeSessions();
        using var host = new Harness(factory, sessions);
        using var request = host.Request(Session(TokenA));
        AssertUnavailable(await request.Access.ResolveAsync(request.Session, PurchaseFixtures.DocumentId, "B1", CancellationToken.None));
        Assert.Equal(PurchaseRequestCommandOutcome.Unavailable, (await request.Commands.SaveAsync(Save(db.Document))).Outcome);
        Assert.Equal(0, sessions.Calls); Assert.Equal(0, db.FactoryCalls); Assert.Equal(0, db.Opens);
    }

    [Fact]
    public async Task Different_request_scopes_capture_separate_server_tokens_and_never_follow_accessor_swaps()
    {
        var db = new I22AdmissionModel();
        var issued = new List<DbConnection>();
        var factory = new PurchaseRequestCommandFactory(PurchaseFixtures.Binding, PurchaseFixtures.Company,
            (Func<DbConnection>)(() => { var c = db.NewConnection(); issued.Add(c); return c; }), I22AdmissionModel.SyntheticAcceptance());
        var sessions = new FakeSessions();
        using var host = new Harness(factory, sessions);
        using var a = host.Request(Session(TokenA));
        using var b = host.Request(Session(TokenB));
        Assert.NotSame(a.Commands, b.Commands); Assert.NotSame(a.Access, b.Access);
        Assert.Same(a.Commands, a.Scope.ServiceProvider.GetRequiredService<IPurchaseRequestCommands>());
        AssertAdmitted(await a.Access.ResolveAsync(a.Session, PurchaseFixtures.DocumentId, "B1", CancellationToken.None));
        Assert.All(sessions.Observations, x => Assert.Equal(TokenA, x));
        sessions.Observations.Clear();
        AssertAdmitted(await b.Access.ResolveAsync(b.Session, PurchaseFixtures.DocumentId, "B1", CancellationToken.None));
        Assert.All(sessions.Observations, x => Assert.Equal(TokenB, x));
        var calls = sessions.Calls; var opens = db.Opens;
        AssertDenied(await a.Access.ResolveAsync(b.Session, PurchaseFixtures.DocumentId, "B1", CancellationToken.None));
        Assert.Equal(calls, sessions.Calls); Assert.Equal(opens, db.Opens);
        Assert.Equal(2, issued.Count); Assert.NotSame(issued[0], issued[1]); db.AssertReadOnly();
    }

    [Theory]
    [InlineData("missing-server-item")] [InlineData("unauthenticated")]
    [InlineData("claim-mismatch")] [InlineData("duplicate-claim")]
    public async Task Client_headers_claim_aliases_or_supplied_sessions_cannot_replace_server_request_anchor(string fault)
    {
        var db = new I22AdmissionModel(); var sessions = new FakeSessions();
        using var host = new Harness(db.Factory(), sessions);
        using var request = host.Request(Session(TokenA), alter: context =>
        {
            context.Request.Headers["X-Session-Token"] = TokenA;
            context.Request.QueryString = new QueryString("?session=" + TokenA);
            if (fault == "missing-server-item") context.Items.Remove(AuthEndpoints.ResolvedKey);
            if (fault == "unauthenticated") context.User = new ClaimsPrincipal(new ClaimsIdentity());
            if (fault == "claim-mismatch") context.User = AuthEndpoints.Principal(Session(TokenB));
            if (fault == "duplicate-claim") ((ClaimsIdentity)context.User.Identity!).AddClaim(new Claim(AuthEndpoints.SessionClaim, TokenA));
        });
        AssertDenied(await request.Access.ResolveAsync(request.Session, PurchaseFixtures.DocumentId, "B1", CancellationToken.None));
        Assert.Equal(PurchaseRequestCommandOutcome.Denied, (await request.Commands.SaveAsync(Save(db.Document))).Outcome);
        Assert.Equal(0, sessions.Calls); Assert.Equal(0, db.Opens);
    }

    [Theory]
    [InlineData("token")] [InlineData("actor")] [InlineData("tenant")] [InlineData("company")]
    [InlineData("branch")] [InlineData("stamp")] [InlineData("capabilities")]
    public async Task Re_resolved_session_changes_are_not_pinned_or_borrowed_from_request_snapshot(string change)
    {
        var db = new I22AdmissionModel(); var sessions = new FakeSessions();
        sessions.OnResolve = (_, _, _) =>
        {
            var initial = Session(TokenA);
            var id = initial.Identity;
            id = change switch {
                "actor" => id with { PrincipalId = "other" }, "tenant" => id with { TenantId = "other" },
                "company" => id with { CompanyId = "other" }, "branch" => id with { BranchIds = ["B2"] },
                "stamp" => id with { CredentialStamp = "changed" },
                "capabilities" => id with { Capabilities = ["purchase-requests.read"] }, _ => id };
            return Task.FromResult<ResolvedSession?>(initial with { Identity = id, Token = change == "token" ? TokenB : TokenA });
        };
        using var host = new Harness(db.Factory(), sessions);
        using var request = host.Request(Session(TokenA));
        AssertDenied(await request.Access.ResolveAsync(request.Session, PurchaseFixtures.DocumentId, "B1", CancellationToken.None));
        Assert.Equal(PurchaseRequestCommandOutcome.Denied, (await request.Commands.SaveAsync(Save(db.Document))).Outcome);
        Assert.Equal(0, db.Opens); Assert.True(sessions.Calls >= 2);
    }

    [Theory]
    [InlineData("header")] [InlineData("update")] [InlineData("remove")] [InlineData("submit")]
    public async Task Composed_no_Add_writer_commits_without_allocator_and_lookup_keeps_original_receipt(string operation)
    {
        var db = new PurchaseRecordingModel(); db.Seed(2);
        var sessions = new FakeSessions();
        using var host = new Harness(Factory(db), sessions);
        using var request = host.Request(Session(TokenA));
        var original = Save(db.Documents[PurchaseFixtures.DocumentId]);
        original = original with { LineChanges = operation switch {
            "update" => [new(PurchaseRequestLineChangeKind.Update, "line-1", null, PurchaseFixtures.Values with { Quantity = "7" })],
            "remove" => [new(PurchaseRequestLineChangeKind.Remove, "line-1", null, null)], _ => [] } };
        var submitted = Submit(original);
        AssertAdmitted(await request.Access.ResolveAsync(request.Session, PurchaseFixtures.DocumentId, "B1", CancellationToken.None));
        var result = operation == "submit" ? await request.Commands.SubmitAsync(submitted) : await request.Commands.SaveAsync(original);
        Assert.Equal(PurchaseRequestCommandOutcome.Committed, result.Outcome);
        Assert.Empty(result.Receipt!.AllocatedLines); Assert.Equal(0, db.AllocatorCalls);
        // The factory's actual allocator throws in BOTH methods. Committed cannot be
        // obtained if no-Add Save/Submit consults it, not merely if it allocates zero IDs.
        Assert.Equal(2, db.Commits); Assert.Single(db.Journal);
        Assert.Equal(operation == "remove" ? 1 : 2, result.Receipt.Document.Lines.Count);
        if (operation == "submit") { Assert.Equal(2, result.Receipt.Document.StatusId); Assert.True(result.Receipt.Document.IsLocked); }
        // This models a post-dispatch authority check; it must NOT require still-draft.
        AssertAdmitted(await request.Access.ResolveAsync(request.Session, PurchaseFixtures.DocumentId, "B1", CancellationToken.None));
        var expected = JsonSerializer.Serialize(result.Receipt, PurchaseRequestCommandRules.Json);
        var before = Snapshot(db); var commits = db.Commits;
        db.Commands.Clear(); db.Events.Clear();
        var lookup = operation == "submit" ? await request.Commands.LookupAsync(submitted) : await request.Commands.LookupAsync(original);
        Assert.Equal(PurchaseRequestLookupOutcome.Committed, lookup.Outcome);
        Assert.Equal(expected, JsonSerializer.Serialize(lookup.Receipt, PurchaseRequestCommandRules.Json));
        Assert.Equal(before, Snapshot(db)); Assert.Equal(commits, db.Commits); AssertLookupOnly(db);
        Assert.True(sessions.Calls > 3);
    }

    [Fact]
    public async Task Post_Submit_revoke_or_native_Update_loss_blocks_receipt_but_state_change_alone_does_not()
    {
        foreach (var revoke in new[] { false, true })
        {
            var db = new PurchaseRecordingModel(); db.Seed(); var sessions = new FakeSessions();
            using var host = new Harness(Factory(db), sessions);
            using var request = host.Request(Session(TokenA));
            var original = Submit(Save(db.Documents[PurchaseFixtures.DocumentId]));
            Assert.Equal(PurchaseRequestCommandOutcome.Committed, (await request.Commands.SubmitAsync(original)).Outcome);
            AssertAdmitted(await request.Access.ResolveAsync(request.Session, PurchaseFixtures.DocumentId, "B1", CancellationToken.None));
            if (revoke) sessions.Revoke(TokenA); else db.Denial = "update";
            var lookup = await request.Commands.LookupAsync(original);
            Assert.Equal(PurchaseRequestLookupOutcome.Denied, lookup.Outcome); Assert.Null(lookup.Receipt);
            AssertDenied(await request.Access.ResolveAsync(request.Session, PurchaseFixtures.DocumentId, "B1", CancellationToken.None));
            Assert.Equal(2, db.Commits); Assert.Equal(1, db.SubmitEffects); Assert.Equal(0, db.AllocatorCalls);
        }
    }

    [Fact]
    public async Task Create_and_Add_dispatch_are_denied_before_SQL_or_allocator_and_do_not_reserve()
    {
        var db = new PurchaseRecordingModel(); db.Seed(); var sessions = new FakeSessions();
        using var host = new Harness(Factory(db), sessions);
        using var request = host.Request(Session(TokenA));
        var original = Save(db.Documents[PurchaseFixtures.DocumentId]) with {
            LineChanges = [new(PurchaseRequestLineChangeKind.Add, null, "new", PurchaseFixtures.Values)] };
        Assert.Equal(PurchaseRequestCommandOutcome.Denied, (await request.Commands.CreateAsync(PurchaseFixtures.Create)).Outcome);
        Assert.Equal(PurchaseRequestCommandOutcome.Denied, (await request.Commands.SaveAsync(original)).Outcome);
        Assert.Equal(PurchaseRequestLookupOutcome.Denied, (await request.Commands.LookupAsync(PurchaseFixtures.Create)).Outcome);
        Assert.Equal(0, sessions.Calls); Assert.Equal(0, db.Connections); Assert.Equal(0, db.AllocatorCalls); Assert.Empty(db.Journal);
    }

    [Fact]
    public async Task Historical_Save_lookup_keeps_original_Add_intent_and_never_dispatches_that_Add_again()
    {
        var db = new PurchaseRecordingModel(); db.Seed();
        var original = Save(db.Documents[PurchaseFixtures.DocumentId]) with {
            LineChanges = [new(PurchaseRequestLineChangeKind.Add, null, "older-client-line", PurchaseFixtures.Values)] };
        // Existing I14 writer + its existing synthetic allocator creates history;
        // this is outside I22 dispatch and is not evidence about a real allocator.
        var committed = await db.Service().SaveAsync(original);
        Assert.Equal(PurchaseRequestCommandOutcome.Committed, committed.Outcome);
        var sessions = new FakeSessions(); using var host = new Harness(Factory(db), sessions);
        using var request = host.Request(Session(TokenA));
        var before = Snapshot(db); var allocations = db.AllocatorCalls;
        db.Commands.Clear(); db.Events.Clear();
        var lookup = await request.Commands.LookupAsync(original);
        Assert.Equal(PurchaseRequestLookupOutcome.Committed, lookup.Outcome);
        Assert.Equal(JsonSerializer.Serialize(committed.Receipt, PurchaseRequestCommandRules.Json), JsonSerializer.Serialize(lookup.Receipt, PurchaseRequestCommandRules.Json));
        Assert.Equal(before, Snapshot(db)); Assert.Equal(allocations, db.AllocatorCalls); AssertLookupOnly(db, allocations);
    }

    [Fact]
    public async Task No_Add_check_freezes_before_await_and_cannot_be_raced_by_mutating_input_collection()
    {
        var db = new PurchaseRecordingModel(); db.Seed(); var sessions = new FakeSessions();
        var gate = new TaskCompletionSource<ResolvedSession?>(TaskCreationOptions.RunContinuationsAsynchronously);
        sessions.OnResolve = (key, call, _) => call == 1 ? gate.Task : Task.FromResult<ResolvedSession?>(Session(key));
        using var host = new Harness(Factory(db), sessions);
        using var request = host.Request(Session(TokenA));
        var changes = new List<PurchaseRequestLineChange>();
        var original = Save(db.Documents[PurchaseFixtures.DocumentId]) with { LineChanges = changes };
        var running = request.Commands.SaveAsync(original);
        changes.Add(new(PurchaseRequestLineChangeKind.Add, null, "late-add", PurchaseFixtures.Values));
        gate.SetResult(Session(TokenA));
        var result = await running;
        Assert.Equal(PurchaseRequestCommandOutcome.Committed, result.Outcome); Assert.Single(result.Receipt!.Document.Lines);
        Assert.Empty(result.Receipt.AllocatedLines); Assert.Equal(0, db.AllocatorCalls);
    }

    [Fact]
    public async Task Actual_database_binding_mismatch_denies_access_and_writer_never_reserves()
    {
        var db = new PurchaseRecordingModel(); db.Seed(); var sessions = new FakeSessions();
        var binding = Guid.NewGuid();
        var factory = new PurchaseRequestCommandFactory(binding, PurchaseFixtures.Company,
            (Func<DbConnection>)(() => new PurchaseRecordingConnection(db, db.Connections++)),
            I22AdmissionModel.SyntheticAcceptance() with { DatabaseBindingId = binding });
        using var host = new Harness(factory, sessions); using var request = host.Request(Session(TokenA));
        AssertUnavailable(await request.Access.ResolveAsync(request.Session, PurchaseFixtures.DocumentId, "B1", CancellationToken.None));
        var result = await request.Commands.SaveAsync(Save(db.Documents[PurchaseFixtures.DocumentId]));
        Assert.Equal(PurchaseRequestCommandOutcome.QualificationRequired, result.Outcome);
        Assert.Empty(db.Journal); Assert.Equal(0, db.Commits); Assert.Equal(0, db.AllocatorCalls);
    }

    [Fact]
    public async Task Request_abort_is_linked_to_access_writer_and_lookup_even_without_explicit_method_token()
    {
        var db = new PurchaseRecordingModel(); db.Seed(); var sessions = new FakeSessions();
        using var aborted = new CancellationTokenSource();
        using var host = new Harness(Factory(db), sessions);
        using var request = host.Request(Session(TokenA), aborted.Token);
        aborted.Cancel();
        var original = Save(db.Documents[PurchaseFixtures.DocumentId]);
        var access = await request.Access.ResolveAsync(request.Session, PurchaseFixtures.DocumentId, "B1", CancellationToken.None);
        Assert.False(access.CanLookup); Assert.Equal("command_access_cancelled", access.Reason);
        Assert.Equal(PurchaseRequestCommandOutcome.Cancelled, (await request.Commands.SaveAsync(original)).Outcome);
        Assert.Equal(PurchaseRequestCommandOutcome.Cancelled, (await request.Commands.SubmitAsync(Submit(original))).Outcome);
        Assert.Equal(PurchaseRequestLookupOutcome.Cancelled, (await request.Commands.LookupAsync(original)).Outcome);
        Assert.Equal(0, sessions.Calls); Assert.Equal(0, db.Connections); Assert.Empty(db.Journal);
    }

    [Fact]
    public async Task Advancing_authority_versions_with_unchanged_scope_are_accepted_without_pinning()
    {
        var db = new PurchaseRecordingModel(); db.Seed(); var sessions = new FakeSessions();
        sessions.OnResolve = (key, call, _) => Task.FromResult<ResolvedSession?>(Session(key) with {
            Identity = PurchaseFixtures.Identity(call + 1) });
        using var host = new Harness(Factory(db), sessions); using var request = host.Request(Session(TokenA));
        AssertAdmitted(await request.Access.ResolveAsync(request.Session, PurchaseFixtures.DocumentId, "B1", CancellationToken.None));
        var original=Submit(Save(db.Documents[PurchaseFixtures.DocumentId]));
        var committed=await request.Commands.SubmitAsync(original);
        Assert.Equal(PurchaseRequestCommandOutcome.Committed, committed.Outcome);
        db.Commands.Clear(); db.Events.Clear(); var before=Snapshot(db); var commits=db.Commits;
        var lookup=await request.Commands.LookupAsync(original);
        Assert.Equal(PurchaseRequestLookupOutcome.Committed, lookup.Outcome);
        Assert.Equal(before, Snapshot(db)); Assert.Equal(commits, db.Commits); Assert.Equal(0, db.AllocatorCalls);
        AssertLookupOnly(db); Assert.True(sessions.Calls>=7);
    }

    [Fact]
    public async Task Request_scope_rejects_1_1_2_1_observation_regression_instead_of_treating_the_jump_as_revocation()
    {
        var db = new PurchaseRecordingModel(); db.Seed(); var sessions = new FakeSessions();
        sessions.OnResolve = (key, call, _) =>
        {
            var version = call switch { 1 => 1L, 2 => 2L, _ => 1L };
            return Task.FromResult<ResolvedSession?>(Session(key) with { Identity = PurchaseFixtures.Identity(version) });
        };
        using var host = new Harness(Factory(db), sessions); using var request = host.Request(Session(TokenA));
        AssertDenied(await request.Access.ResolveAsync(request.Session, PurchaseFixtures.DocumentId, "B1", CancellationToken.None));
        Assert.Empty(db.Journal); Assert.Equal(0, db.Commits); Assert.Equal(0, db.AllocatorCalls);
    }

    [Theory]
    [InlineData(0L)] [InlineData(-1L)]
    public async Task Request_scope_rejects_nonpositive_live_observation_versions_before_SQL(long version)
    {
        var db = new I22AdmissionModel(); var sessions = new FakeSessions();
        sessions.OnResolve = (key, _, _) => Task.FromResult<ResolvedSession?>(Session(key) with
        { Identity = PurchaseFixtures.Identity(version) });
        using var host = new Harness(db.Factory(), sessions); using var request = host.Request(Session(TokenA));
        AssertDenied(await request.Access.ResolveAsync(request.Session, PurchaseFixtures.DocumentId, "B1", CancellationToken.None));
        Assert.Equal(0, db.Opens);
    }

    [Fact]
    public async Task Real_legacy_session_monotone_observations_allow_noAdd_Save_Submit_and_postSubmit_Lookup()
    {
        var db = new PurchaseRecordingModel(); db.Seed(2);
        var real = await RealSession();
        using var host = new Harness(Factory(db), real.Sessions); using var request = host.Request(real.Session);
        AssertAdmitted(await request.Access.ResolveAsync(request.Session, PurchaseFixtures.DocumentId, "B1", CancellationToken.None));
        var afterAccess = await real.Sessions.ResolveAsync(real.Session.Token, false, default);
        Assert.NotNull(afterAccess); Assert.True(afterAccess!.Identity.AuthorityVersion > real.Session.Identity.AuthorityVersion);

        var save = Save(db.Documents[PurchaseFixtures.DocumentId]);
        var saved = await request.Commands.SaveAsync(save);
        Assert.Equal(PurchaseRequestCommandOutcome.Committed, saved.Outcome); Assert.NotNull(saved.Receipt);
        Assert.Equal(0, db.AllocatorCalls);

        // Ordinary polling is another real authority observation. The next invocation may
        // skip versions but must still accept a positive nondecreasing observation.
        var poll = await real.Sessions.ResolveAsync(real.Session.Token, false, default);
        Assert.NotNull(poll); Assert.True(poll!.Identity.AuthorityVersion > afterAccess.Identity.AuthorityVersion);

        var submit = new SubmitPurchaseRequest("i22-real-submit", "B1", PurchaseFixtures.DocumentId, saved.Receipt!.StateToken);
        var submitted = await request.Commands.SubmitAsync(submit);
        Assert.Equal(PurchaseRequestCommandOutcome.Committed, submitted.Outcome); Assert.NotNull(submitted.Receipt);
        Assert.True(submitted.Receipt!.Document.IsLocked); Assert.Equal(0, db.AllocatorCalls);

        db.Commands.Clear(); db.Events.Clear(); var before = Snapshot(db); var commits = db.Commits;
        var observed = await request.Commands.LookupAsync(submit);
        Assert.Equal(PurchaseRequestLookupOutcome.Committed, observed.Outcome);
        Assert.Equal(JsonSerializer.Serialize(submitted.Receipt, PurchaseRequestCommandRules.Json),
            JsonSerializer.Serialize(observed.Receipt, PurchaseRequestCommandRules.Json));
        Assert.Equal(before, Snapshot(db)); Assert.Equal(commits, db.Commits); Assert.Equal(0, db.AllocatorCalls);
        AssertLookupOnly(db);
    }

    [Theory]
    [InlineData("logout")] [InlineData("expiry")] [InlineData("branch")] [InlineData("capability")]
    [InlineData("credential")] [InlineData("native-update")]
    public async Task Real_legacy_session_logout_expiry_scope_or_native_EDIT_changes_block_existing_document_commands(string change)
    {
        var db = new PurchaseRecordingModel(); db.Seed();
        var real = await RealSession();
        using var host = new Harness(Factory(db), real.Sessions); using var request = host.Request(real.Session);
        var save = Save(db.Documents[PurchaseFixtures.DocumentId]);
        AssertAdmitted(await request.Access.ResolveAsync(request.Session, PurchaseFixtures.DocumentId, "B1", CancellationToken.None));
        db.Commands.Clear(); db.Events.Clear(); var connections = db.Connections;

        switch (change)
        {
            case "logout": real.Sessions.Revoke(real.Session.Token); break;
            case "expiry": real.Clock.Advance(TimeSpan.FromMinutes(11)); break;
            case "branch": real.Users.Branches = ["B2"]; break;
            case "capability": real.Users.Capabilities = []; break;
            case "credential": real.Users.StoredHash = "changed-synthetic-stored-hash"; break;
            case "native-update": db.Denial = "update"; break;
        }

        var result = await request.Commands.SaveAsync(save);
        Assert.Equal(PurchaseRequestCommandOutcome.Denied, result.Outcome); Assert.Null(result.Receipt);
        Assert.Empty(db.Journal); Assert.Equal(0, db.Commits); Assert.Equal(0, db.AllocatorCalls);
        if (change != "native-update") Assert.Equal(connections, db.Connections);
        else Assert.True(db.Connections > connections);
    }

    [Fact]
    public async Task Real_session_concurrent_purchase_invocations_keep_independent_high_water_trackers()
    {
        var real = await RealSession();
        var firstDb = new PurchaseRecordingModel(); firstDb.Seed();
        var secondDb = new PurchaseRecordingModel(); secondDb.Seed();
        using var firstHost = new Harness(Factory(firstDb), real.Sessions);
        using var secondHost = new Harness(Factory(secondDb), real.Sessions);
        using var first = firstHost.Request(real.Session); using var second = secondHost.Request(real.Session);

        var firstSave = Save(firstDb.Documents[PurchaseFixtures.DocumentId]) with { IdempotencyKey = "i22-concurrent-a" };
        var secondSave = Save(secondDb.Documents[PurchaseFixtures.DocumentId]) with { IdempotencyKey = "i22-concurrent-b" };
        var results = await Task.WhenAll(first.Commands.SaveAsync(firstSave), second.Commands.SaveAsync(secondSave));
        Assert.All(results, result => Assert.Equal(PurchaseRequestCommandOutcome.Committed, result.Outcome));
        Assert.Equal(0, firstDb.AllocatorCalls); Assert.Equal(0, secondDb.AllocatorCalls);
        Assert.Single(firstDb.Journal); Assert.Single(secondDb.Journal);
        var latest = await real.Sessions.ResolveAsync(real.Session.Token, false, default);
        Assert.NotNull(latest); Assert.True(latest!.Identity.AuthorityVersion > real.Session.Identity.AuthorityVersion);
    }

    [Fact]
    public async Task Same_request_wrapper_overlapping_real_session_lookups_keep_invocation_local_high_water()
    {
        var real = await RealSession();
        var sessions = new GatedSnapshotSessions(real.Sessions);
        var db = new PurchaseRecordingModel(); db.Seed();
        using var host = new Harness(Factory(db), sessions);
        using var request = host.Request(real.Session);
        var commands = request.Commands;
        Assert.Same(commands, request.Scope.ServiceProvider.GetRequiredService<IPurchaseRequestCommands>());
        var original = Save(db.Documents[PurchaseFixtures.DocumentId]);
        var before = Snapshot(db);
        var timeout = TimeSpan.FromSeconds(10);
        using var cancellation = new CancellationTokenSource(timeout);
        Task<PurchaseRequestLookupResult>? first = null, second = null;
        try
        {
            first = Task.Run(() => commands.LookupAsync(original with { IdempotencyKey = "i22-overlap-a" }, cancellation.Token));
            var firstSnapshot = Assert.IsType<ResolvedSession>(await sessions.FirstCaptured.WaitAsync(cancellation.Token));
            Assert.False(first.IsCompleted);
            second = Task.Run(() => commands.LookupAsync(original with { IdempotencyKey = "i22-overlap-b" }, cancellation.Token));
            var secondSnapshot = Assert.IsType<ResolvedSession>(await sessions.SecondCaptured.WaitAsync(cancellation.Token));
            // Both calls must reach their own first fresh snapshot while the same
            // wrapper is in use. A wrapper that serializes calls times out above.
            Assert.False(first.IsCompleted); Assert.False(second.IsCompleted);
            Assert.Empty(sessions.Delivered); Assert.Equal(0, db.Connections); Assert.Empty(db.Commands);
            Assert.True(firstSnapshot.Identity.AuthorityVersion > real.Session.Identity.AuthorityVersion);
            Assert.True(secondSnapshot.Identity.AuthorityVersion > firstSnapshot.Identity.AuthorityVersion);

            var poll = Assert.IsType<ResolvedSession>(await real.Sessions.ResolveAsync(real.Session.Token, false,
                cancellation.Token).WaitAsync(cancellation.Token));
            Assert.Equal(real.Session.Token, poll.Token);
            Assert.True(poll.Identity.AuthorityVersion > secondSnapshot.Identity.AuthorityVersion);
            sessions.ReleaseSecond();
            var secondResult = await second.WaitAsync(cancellation.Token);
            Assert.Equal(PurchaseRequestLookupOutcome.Absent, secondResult.Outcome); Assert.Null(secondResult.Receipt);
            Assert.False(first.IsCompleted);
            var secondObservations = sessions.Delivered;
            Assert.Equal(3, secondObservations.Length);
            Assert.Same(secondSnapshot, secondObservations[0].Session);
            Assert.True(secondObservations[1].Session!.Identity.AuthorityVersion > poll.Identity.AuthorityVersion);
            Assert.True(secondObservations[^1].Session!.Identity.AuthorityVersion > firstSnapshot.Identity.AuthorityVersion);
            Assert.Equal(1, db.Connections);

            // The delayed first snapshot is now lower than the second call's last
            // accepted observation. A wrapper-wide fence would incorrectly deny it.
            // Only now may the first call enter SQL: the recording provider's mutable
            // lists/dictionaries are never accessed by two invocations concurrently.
            sessions.ReleaseFirst();
            var firstResult = await first.WaitAsync(cancellation.Token);
            Assert.Equal(PurchaseRequestLookupOutcome.Absent, firstResult.Outcome); Assert.Null(firstResult.Receipt);
            var firstObservations = sessions.Delivered.Skip(secondObservations.Length).ToArray();
            Assert.Same(firstSnapshot, firstObservations[0].Session);
            foreach (var observations in new[] { firstObservations, secondObservations })
            {
                Assert.Equal(3, observations.Length);
                var previous = real.Session.Identity.AuthorityVersion;
                foreach (var observation in observations)
                {
                    Assert.Equal(real.Session.Token, observation.Token); Assert.False(observation.UserInteraction);
                    var live = Assert.IsType<ResolvedSession>(observation.Session);
                    Assert.Equal(real.Session.Token, live.Token);
                    Assert.True(live.Identity.AuthorityVersion > previous);
                    previous = live.Identity.AuthorityVersion;
                }
            }
            Assert.Equal(2, db.Connections); Assert.Equal(before, Snapshot(db)); Assert.Empty(db.Journal);
            Assert.Equal(0, db.Commits); Assert.Equal(0, db.AllocatorCalls); AssertLookupOnly(db);
        }
        finally
        {
            // Cancel before releasing either gate, including failed assertions/timeouts,
            // so a held invocation cannot enter the recording provider during cleanup.
            cancellation.Cancel(); sessions.ReleaseSecond(); sessions.ReleaseFirst();
            var pending = new[] { first, second }.OfType<Task<PurchaseRequestLookupResult>>();
            try { await Task.WhenAll(pending).WaitAsync(timeout); }
            catch (OperationCanceledException) { }
        }
    }

    [Fact]
    public async Task Invalid_state_is_left_to_existing_writer_not_confused_with_missing_EDIT_authority()
    {
        var db = new PurchaseRecordingModel(); db.Seed();
        db.Documents[PurchaseFixtures.DocumentId] = db.Documents[PurchaseFixtures.DocumentId] with { StatusId = 2, IsLocked = true };
        var sessions = new FakeSessions(); using var host = new Harness(Factory(db), sessions);
        using var request = host.Request(Session(TokenA));
        AssertAdmitted(await request.Access.ResolveAsync(request.Session, PurchaseFixtures.DocumentId, "B1", CancellationToken.None));
        var result = await request.Commands.SubmitAsync(Submit(Save(db.Documents[PurchaseFixtures.DocumentId])));
        Assert.Equal(PurchaseRequestCommandOutcome.Conflict, result.Outcome); Assert.Null(result.Receipt);
        Assert.Empty(db.Journal); Assert.Equal(0, db.Commits);
    }

    private static readonly string TokenA = new('A', 64), TokenB = new('B', 64);
    private static ResolvedSession Session(string token)
    {
        var id = PurchaseFixtures.Identity();
        return new(token, id, new(id.DisplayName, id.TenantId, id.CompanyId, id.CompanyName, id.AuthorityVersion,
            DateTimeOffset.Parse("2026-10-07T00:00:00Z", CultureInfo.InvariantCulture), DateTimeOffset.Parse("2026-10-08T00:00:00Z", CultureInfo.InvariantCulture), id.Capabilities));
    }
    private static SavePurchaseRequestDraft Save(PurchaseRequestAggregate document) => new("i22-save", document.BranchId,
        document.PurchaseRequestId, PurchaseRequestCommandRules.EqualityToken(document),
        document.Header with { Notes = "synthetic I22 update" }, []);
    private static SubmitPurchaseRequest Submit(SavePurchaseRequestDraft original) => new("i22-submit", original.BranchId,
        original.PurchaseRequestId, original.ExpectedStateToken);
    private static PurchaseRequestCommandFactory Factory(PurchaseRecordingModel db) => new(PurchaseFixtures.Binding,
        PurchaseFixtures.Company, (Func<DbConnection>)(() => new PurchaseRecordingConnection(db, db.Connections++)), I22AdmissionModel.SyntheticAcceptance());
    private static string Snapshot(PurchaseRecordingModel db) => JsonSerializer.Serialize(new { db.Documents, db.Journal }, PurchaseRequestCommandRules.Json);
    private static void AssertUnavailable(PurchaseRequestCommandAccessState state)
    { Assert.False(state.CanSave); Assert.False(state.CanSubmit); Assert.False(state.CanLookup); Assert.False(state.CanAddLines); Assert.Equal("command_access_provider_unavailable", state.Reason); }
    private static void AssertDenied(PurchaseRequestCommandAccessState state)
    { Assert.False(state.CanSave); Assert.False(state.CanSubmit); Assert.False(state.CanLookup); Assert.False(state.CanAddLines); Assert.Equal("native_edit_denied", state.Reason); }
    private static void AssertAdmitted(PurchaseRequestCommandAccessState state)
    { Assert.True(state.CanSave); Assert.True(state.CanSubmit); Assert.True(state.CanLookup); Assert.False(state.CanAddLines); }
    private static void AssertLookupOnly(PurchaseRecordingModel db, int previousAllocations = 0)
    {
        var allowed = new[] { PurchaseRequestSql.ProbeText, PurchaseRequestSql.TransactionText, PurchaseRequestSql.CredentialText,
            PurchaseRequestSql.GrantsText, PurchaseRequestSql.BranchesText, PurchaseRequestSql.HeadText, PurchaseRequestSql.DetailsText, PurchaseRequestSql.LookupText };
        Assert.All(db.Commands, c => Assert.Contains(c.CommandText, allowed));
        foreach (var suffix in new[] { ":reserve", ":complete", ":insert-head", ":insert-line", ":update-head", ":update-line", ":delete-line", ":submit", ":allocate", ":commit-before", ":commit-ack" })
            Assert.DoesNotContain(db.Events, x => x.EndsWith(suffix, StringComparison.Ordinal));
        Assert.Equal(previousAllocations, db.AllocatorCalls);
    }

    private static async Task<RealPurchaseSession> RealSession()
    {
        var users = new MutablePurchaseUsers();
        var authority = new LegacyIdentityAuthority(users, new AcceptedPassword(), PurchaseFixtures.Company);
        var login = await authority.AuthenticateAsync(PurchaseFixtures.Actor, "synthetic-password", default);
        Assert.Equal(IdentityOutcome.Success, login.Outcome); Assert.NotNull(login.Identity);
        var clock = new ManualClock();
        var sessions = new LocalWebSessions(authority, clock,
            new WebSessionPolicy(TimeSpan.FromMinutes(10), TimeSpan.FromMinutes(30), 20));
        var created = sessions.Create(login.Identity!);
        Assert.NotNull(created);
        // Match the authenticated request path: middleware has already revalidated the
        // server token once before placing the resolved session in HttpContext.Items.
        var session = await sessions.ResolveAsync(created!.Token, false, default);
        Assert.NotNull(session);
        return new(users, sessions, session!, clock);
    }

    private sealed record RealPurchaseSession(MutablePurchaseUsers Users, LocalWebSessions Sessions,
        ResolvedSession Session, ManualClock Clock);

    private sealed class AcceptedPassword : ILegacyPasswordVerifier
    {
        public Task<PasswordOutcome> VerifyAsync(string username, string password, string storedHash,
            CancellationToken cancellationToken) => Task.FromResult(password == "synthetic-password"
                ? PasswordOutcome.Accepted : PasswordOutcome.Rejected);
    }

    private sealed class MutablePurchaseUsers : ILegacyUserStore
    {
        internal string StoredHash = PurchaseFixtures.Stored;
        internal IReadOnlyList<string> Capabilities = ["purchase-requests.read"];
        internal IReadOnlyList<string> Branches = ["B1", "B2"];
        public Task<LegacyUser?> FindAsync(string username, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            return Task.FromResult<LegacyUser?>(new(PurchaseFixtures.Actor, "Synthetic actor", StoredHash,
                false, PurchaseFixtures.Group, true, Capabilities, Branches));
        }
    }

    private sealed class GatedSnapshotSessions(IWebSessions inner) : IWebSessions
    {
        private readonly TaskCompletionSource<ResolvedSession?> firstCaptured = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly TaskCompletionSource<ResolvedSession?> secondCaptured = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly TaskCompletionSource firstRelease = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly TaskCompletionSource secondRelease = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly ConcurrentQueue<SessionObservation> delivered = new();
        private int calls;
        internal Task<ResolvedSession?> FirstCaptured => firstCaptured.Task;
        internal Task<ResolvedSession?> SecondCaptured => secondCaptured.Task;
        internal SessionObservation[] Delivered => delivered.ToArray();
        internal void ReleaseFirst() => firstRelease.TrySetResult();
        internal void ReleaseSecond() => secondRelease.TrySetResult();
        public ResolvedSession? Create(AuthoritativeIdentity identity) => inner.Create(identity);
        public void Revoke(string token) => inner.Revoke(token);
        public async Task<ResolvedSession?> ResolveAsync(string token, bool userInteraction, CancellationToken cancellationToken)
        {
            var call = Interlocked.Increment(ref calls);
            // Obtain a genuine immutable snapshot and let LocalWebSessions release
            // its revalidation gate before holding delivery to the purchase fence.
            var live = await inner.ResolveAsync(token, userInteraction, cancellationToken);
            if (call == 1)
            {
                firstCaptured.TrySetResult(live);
                await firstRelease.Task.WaitAsync(cancellationToken);
            }
            else if (call == 2)
            {
                secondCaptured.TrySetResult(live);
                await secondRelease.Task.WaitAsync(cancellationToken);
            }
            delivered.Enqueue(new(token, userInteraction, live));
            return live;
        }
    }

    private sealed record SessionObservation(string Token, bool UserInteraction, ResolvedSession? Session);

    private sealed class FakeSessions : IWebSessions
    {
        private readonly HashSet<string> revoked = new(StringComparer.Ordinal);
        internal readonly List<string> Observations = [];
        internal int Calls;
        internal Func<string, int, CancellationToken, Task<ResolvedSession?>>? OnResolve;
        public ResolvedSession? Create(AuthoritativeIdentity identity) => throw new NotSupportedException();
        public Task<ResolvedSession?> ResolveAsync(string token, bool userInteraction, CancellationToken cancellationToken)
        {
            Assert.False(userInteraction); cancellationToken.ThrowIfCancellationRequested();
            Calls++; Observations.Add(token);
            if (revoked.Contains(token)) return Task.FromResult<ResolvedSession?>(null);
            return OnResolve?.Invoke(token, Calls, cancellationToken) ?? Task.FromResult<ResolvedSession?>(Session(token));
        }
        public void Revoke(string token) => revoked.Add(token);
    }
    private sealed class Harness : IDisposable
    {
        private readonly ServiceProvider provider;
        internal Harness(PurchaseRequestCommandFactory? factory, IWebSessions sessions)
        {
            var services = new ServiceCollection(); services.AddSingleton(sessions); services.AddDormantPurchaseRequestCommands(factory);
            provider = services.BuildServiceProvider(new ServiceProviderOptions { ValidateScopes = true, ValidateOnBuild = true });
        }
        internal RequestServices Request(ResolvedSession session, CancellationToken aborted = default, Action<HttpContext>? alter = null)
        {
            var scope = provider.CreateScope();
            var context = new DefaultHttpContext { RequestServices = scope.ServiceProvider, User = AuthEndpoints.Principal(session), RequestAborted = aborted };
            context.Items[AuthEndpoints.ResolvedKey] = session; alter?.Invoke(context);
            provider.GetRequiredService<IHttpContextAccessor>().HttpContext = context;
            return new(scope, session, scope.ServiceProvider.GetRequiredService<IPurchaseRequestCommands>(),
                scope.ServiceProvider.GetRequiredService<IPurchaseRequestCommandAccess>());
        }
        public void Dispose()
        { provider.GetRequiredService<IHttpContextAccessor>().HttpContext = null; provider.Dispose(); }
    }
    private sealed record RequestServices(IServiceScope Scope, ResolvedSession Session,
        IPurchaseRequestCommands Commands, IPurchaseRequestCommandAccess Access) : IDisposable
    { public void Dispose() => Scope.Dispose(); }
}
