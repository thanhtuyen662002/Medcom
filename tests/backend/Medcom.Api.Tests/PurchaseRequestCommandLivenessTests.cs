using System.Data;
using System.Data.Common;
using System.Diagnostics.CodeAnalysis;
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

public sealed class PurchaseRequestCommandLivenessTests
{
    [Theory]
    [InlineData(false)] [InlineData(true)]
    public async Task Real_LocalWebSessions_Save_Submit_replay_and_receipt_lookup_never_revalidate_under_locks(bool submit)
    {
        var model = new LivenessModel();
        var clock = new ManualClock();
        var authority = new InstrumentedAuthority(model);
        var sessions = new LocalWebSessions(authority, clock, new(TimeSpan.FromMinutes(10), TimeSpan.FromMinutes(30), 10));
        var anchor = sessions.Create(PurchaseFixtures.Identity())!;
        using var host = new Composition(model, sessions, anchor);
        var input = Save(model);
        var json = JsonSerializer.Serialize(input, PurchaseRequestCommandRules.Json);
        var result = await Dispatch(host.Commands, input, submit);
        Assert.Equal(PurchaseRequestCommandOutcome.Committed, result.Outcome);
        Assert.Equal(2, model.Db.Commits); Assert.Equal(0, model.Db.AllocatorCalls);
        Assert.Equal(submit ? 2 : 1, result.Receipt!.Document.StatusId);
        Assert.Equal(submit, result.Receipt.Document.IsLocked);
        var row = Assert.Single(model.Db.Journal.Values);
        var intent = row.Intent.ToArray(); var key = row.Key.ToArray(); var receipt = row.Receipt;
        var dispatches = model.Db.Commands.Count(c => c.CommandText == PurchaseRequestSql.UpdateHeadText || c.CommandText == PurchaseRequestSql.SubmitText);
        Assert.Equal(1, dispatches);
        Assert.True((await host.Access.ResolveAsync(anchor, input.PurchaseRequestId, input.BranchId, default)).CanLookup);
        Assert.Equal(PurchaseRequestCommandOutcome.Replayed, (await Dispatch(host.Commands, input, submit)).Outcome);
        var lookup = await Lookup(host.Commands, input, submit);
        Assert.Equal(PurchaseRequestLookupOutcome.Committed, lookup.Outcome);
        Assert.Equal(receipt, JsonSerializer.Serialize(lookup.Receipt, PurchaseRequestCommandRules.Json));
        Assert.Equal(dispatches, model.Db.Commands.Count(c => c.CommandText == PurchaseRequestSql.UpdateHeadText || c.CommandText == PurchaseRequestSql.SubmitText));
        Assert.Equal(intent, Assert.Single(model.Db.Journal.Values).Intent);
        Assert.Equal(key, Assert.Single(model.Db.Journal.Values).Key);
        Assert.Equal(json, JsonSerializer.Serialize(input, PurchaseRequestCommandRules.Json));
        Assert.Equal(0, model.Db.AllocatorCalls); Assert.Equal(0, model.HeldConnections); Assert.Equal(0, model.HeldTransactions);
        Assert.True(authority.Calls >= 8); Assert.Equal(0, model.UnsafeResolutions);
        // Command checkpoints are passive; neither Inspect nor Resolve extends activity.
        clock.Advance(TimeSpan.FromMinutes(10));
        Assert.Null(await sessions.InspectAsync(anchor.Token, default));
    }

    public static IEnumerable<object[]> FenceCases()
    {
        foreach (var submit in new[] { false, true })
        foreach (var boundary in new[] { "pre", "0:begin", "0:commit-ack", "1:begin", "1:complete", "1:commit-ack", "1:transaction-dispose", "1:connection-dispose", "post" })
        foreach (var change in new[] { "logout", "cancel", "token", "principal", "tenant", "company", "credential", "branch", "capabilities", "version", "failure" })
            yield return [submit, boundary, change];
    }

    [Theory]
    [MemberData(nameof(FenceCases))]
    public async Task Session_changes_at_every_command_boundary_hide_receipts_and_preserve_original_intent(bool submit, string boundary, string change)
    {
        var model = new LivenessModel(); var sessions = new MemorySessions(model);
        using var stop = new CancellationTokenSource();
        using var host = new Composition(model, sessions, sessions.Anchor, stop.Token, explicitLocal: true);
        var input = Save(model); var fired = false;
        void Change()
        {
            if (fired) return;
            fired = true;
            if (change == "cancel") stop.Cancel();
            else sessions.Change(change);
        }
        if (boundary == "pre") Change();
        else if (boundary == "post") sessions.BeforeFull = n => { if (n == 4) Change(); };
        else model.At = stage => { if (stage == boundary) Change(); };
        var result = await Dispatch(host.Commands, input, submit);
        Assert.True(fired); Assert.Null(result.Receipt);
        var possible = boundary is not ("pre" or "0:begin");
        Assert.Equal(possible ? PurchaseRequestCommandOutcome.OutcomeUnknown
            : change == "cancel" ? PurchaseRequestCommandOutcome.Cancelled
            : change == "failure" ? PurchaseRequestCommandOutcome.Unavailable : PurchaseRequestCommandOutcome.Denied, result.Outcome);
        Assert.InRange(model.Db.Commands.Count(c => c.CommandText == PurchaseRequestSql.UpdateHeadText || c.CommandText == PurchaseRequestSql.SubmitText), 0, 1);
        Assert.Equal(0, model.Db.AllocatorCalls); Assert.Equal(0, model.UnsafeResolutions);
        if (model.Db.Journal.Count != 0)
        {
            var row = Assert.Single(model.Db.Journal.Values);
            var expected = submit ? PurchaseRequestCommandRules.IntentBytes(Submit(input)) : PurchaseRequestCommandRules.IntentBytes(PurchaseRequestCommandRules.Freeze(input));
            Assert.Equal(expected, row.Intent);
            var original = JsonSerializer.Serialize(row, PurchaseRequestCommandRules.Json);
            model.At = null; sessions.Reset(); sessions.BeforeFull = null;
            // No replacement dispatch: reconciliation uses the exact original intent.
            var observed = await Lookup(model.Factory().CreateCommands(sessions.ResolveIdentity, sessions.InspectIdentity), input, submit);
            Assert.Equal(row.State == 1 ? PurchaseRequestLookupOutcome.Committed : PurchaseRequestLookupOutcome.Pending, observed.Outcome);
            Assert.Equal(original, JsonSerializer.Serialize(Assert.Single(model.Db.Journal.Values), PurchaseRequestCommandRules.Json));
        }
    }

    [Theory]
    [InlineData("absent")] [InlineData("pending")] [InlineData("committed")] [InlineData("conflict")]
    public async Task Original_intent_observations_are_read_only_and_cleanup_fenced(string state)
    {
        var model = new LivenessModel(); var sessions = new MemorySessions(model);
        var commands = model.Factory().CreateCommands(sessions.ResolveIdentity, sessions.InspectIdentity);
        var input = Save(model);
        if (state != "absent")
        {
            if (state == "pending") model.Db.Fault = "0:commit-ack";
            await commands.SaveAsync(input); model.Db.Fault = null;
            if (state == "conflict") input = input with { Header = input.Header with { Notes = "different intent, same key" } };
        }
        var before = Snapshot(model); var writes = model.Db.Commands.Count;
        var result = await commands.LookupAsync(input);
        Assert.Equal(state switch { "absent" => PurchaseRequestLookupOutcome.Absent, "pending" => PurchaseRequestLookupOutcome.Pending,
            "committed" => PurchaseRequestLookupOutcome.Committed, _ => PurchaseRequestLookupOutcome.Conflict }, result.Outcome);
        Assert.Equal(before, Snapshot(model));
        var selects = new[] { PurchaseRequestSql.CredentialText, PurchaseRequestSql.GrantsText, SqlLegacyBranchScope.NativeUserText,
            SqlLegacyBranchScope.RestrictedText, PurchaseRequestSql.ProbeText, PurchaseRequestSql.TransactionText,
            PurchaseRequestSql.LookupText, PurchaseRequestSql.HeadText, PurchaseRequestSql.DetailsText };
        Assert.All(model.Db.Commands.Skip(writes), c => Assert.Contains(c.CommandText, selects));
        model.At = s => { if (s.EndsWith(":connection-dispose", StringComparison.Ordinal)) sessions.Change("logout"); };
        var hidden = await commands.LookupAsync(input);
        Assert.Equal(PurchaseRequestLookupOutcome.Denied, hidden.Outcome); Assert.Null(hidden.Receipt);
        Assert.Equal(before, Snapshot(model)); Assert.Equal(0, model.UnsafeResolutions);
    }

    [Theory]
    [InlineData("logout", "0:begin")] [InlineData("expiry", "0:begin")] [InlineData("cancel", "0:begin")]
    [InlineData("logout", "0:commit-ack")] [InlineData("expiry", "0:commit-ack")] [InlineData("cancel", "0:commit-ack")]
    [InlineData("logout", "1:commit-ack")] [InlineData("expiry", "1:commit-ack")] [InlineData("cancel", "1:commit-ack")]
    [InlineData("logout", "1:transaction-dispose")] [InlineData("expiry", "1:transaction-dispose")] [InlineData("cancel", "1:transaction-dispose")]
    [InlineData("logout", "1:connection-dispose")] [InlineData("expiry", "1:connection-dispose")] [InlineData("cancel", "1:connection-dispose")]
    public async Task Supported_LocalWebSessions_logout_expiry_and_request_abort_are_not_refreshed_or_resurrected(string change, string boundary)
    {
        var model = new LivenessModel(); var clock = new ManualClock(); var authority = new InstrumentedAuthority(model);
        var sessions = new LocalWebSessions(authority, clock, new(TimeSpan.FromMinutes(10), TimeSpan.FromMinutes(30), 10));
        var anchor = sessions.Create(PurchaseFixtures.Identity())!;
        using var stop = new CancellationTokenSource();
        using var host = new Composition(model, sessions, anchor, stop.Token);
        var fired = false;
        model.At = s =>
        {
            if (s != boundary) return;
            fired = true;
            if (change == "logout") sessions.Revoke(anchor.Token);
            if (change == "expiry") clock.Advance(TimeSpan.FromMinutes(10));
            if (change == "cancel") stop.Cancel();
        };
        var result = await host.Commands.SubmitAsync(Submit(Save(model)));
        Assert.True(fired); Assert.Null(result.Receipt);
        Assert.Equal(boundary == "0:begin" ? change == "cancel" ? PurchaseRequestCommandOutcome.Cancelled : PurchaseRequestCommandOutcome.Denied
            : PurchaseRequestCommandOutcome.OutcomeUnknown, result.Outcome);
        Assert.Equal(0, model.UnsafeResolutions); Assert.Equal(0, model.Db.AllocatorCalls);
        if (change != "cancel") Assert.Null(await sessions.InspectAsync(anchor.Token, default));
    }

    [Theory]
    [InlineData("0:transaction-dispose")] [InlineData("0:connection-dispose")]
    [InlineData("1:transaction-dispose")] [InlineData("1:connection-dispose")]
    public async Task Awaited_cleanup_failure_retains_uncertainty_without_full_revalidation_or_receipt(string boundary)
    {
        var model = new LivenessModel(); var sessions = new MemorySessions(model);
        var before = 0;
        model.At = s => { if (s == boundary) { before = sessions.FullCalls; throw new IOException("synthetic cleanup failure"); } };
        var result = await model.Factory().CreateCommands(sessions.ResolveIdentity, sessions.InspectIdentity).SaveAsync(Save(model));
        Assert.Equal(PurchaseRequestCommandOutcome.OutcomeUnknown, result.Outcome); Assert.Null(result.Receipt);
        Assert.Equal(before, sessions.FullCalls); Assert.Equal(0, model.Db.AllocatorCalls); Assert.Equal(0, model.UnsafeResolutions);
    }

    [Theory]
    [InlineData("transaction-dispose")] [InlineData("connection-dispose")]
    public async Task Async_cleanup_is_fully_awaited_before_receipt_disclosure(string boundary)
    {
        var model = new LivenessModel(); var sessions = new MemorySessions(model);
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        model.Cleanup = async stage => { if (stage == "1:" + boundary) { entered.SetResult(); await release.Task; } };
        var resultTask = model.Factory().CreateCommands(sessions.ResolveIdentity, sessions.InspectIdentity).SaveAsync(Save(model));
        try
        {
            await entered.Task.WaitAsync(TimeSpan.FromSeconds(10));
            Assert.False(resultTask.IsCompleted);
            Assert.Equal(3, sessions.FullCalls); Assert.Equal(0, model.UnsafeResolutions);
            sessions.Change("logout"); release.SetResult();
            var result = await resultTask.WaitAsync(TimeSpan.FromSeconds(10));
            Assert.Equal(PurchaseRequestCommandOutcome.OutcomeUnknown, result.Outcome); Assert.Null(result.Receipt);
        }
        finally { release.TrySetResult(); await resultTask; }
    }

    [Fact]
    public async Task Unknown_session_implementation_and_old_single_resolver_callers_fail_closed_before_work()
    {
        var model = new LivenessModel(); var sessions = new MemorySessions(model);
        using var host = new Composition(model, sessions, sessions.Anchor);
        Assert.Equal(PurchaseRequestCommandOutcome.Unavailable, (await host.Commands.SaveAsync(Save(model))).Outcome);
        Assert.False((await host.Access.ResolveAsync(sessions.Anchor, PurchaseFixtures.DocumentId, "B1", default)).CanSave);
        var factory = model.Factory();
        Assert.Equal(PurchaseRequestCommandOutcome.Unavailable, (await factory.CreateCommands(sessions.ResolveIdentity).SaveAsync(Save(model))).Outcome);
        Assert.Equal(PurchaseRequestCommandAuthorityOutcome.Unavailable, await factory.CreateAuthorityReader(sessions.ResolveIdentity).ReadAsync(PurchaseFixtures.DocumentId, "B1"));
        var legacy = new SqlPurchaseRequestCommands(PurchaseFixtures.Binding, PurchaseFixtures.Company, (Func<DbConnection>)model.Connection,
            sessions.ResolveIdentity, model.Db, true);
        Assert.Equal(PurchaseRequestLookupOutcome.Unavailable, (await legacy.LookupAsync(Save(model))).Outcome);
        Assert.Equal(0, sessions.FullCalls); Assert.Equal(0, sessions.Inspections); Assert.Equal(0, model.Db.Connections);
    }

    [Theory]
    [InlineData("")] [InlineData("x")] [InlineData("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAG")]
    public async Task Malformed_server_anchor_cannot_reach_session_or_SQL(string token)
    {
        var model = new LivenessModel(); var sessions = new MemorySessions(model);
        using var host = new Composition(model, sessions, sessions.Anchor with { Token = token }, explicitLocal: true);
        Assert.Equal(PurchaseRequestCommandOutcome.Denied, (await host.Commands.SaveAsync(Save(model))).Outcome);
        Assert.Equal(0, sessions.FullCalls); Assert.Equal(0, model.Db.Connections);
    }

    [Theory]
    [InlineData(false)] [InlineData(true)]
    public async Task Nondecreasing_local_and_full_versions_keep_the_original_key(bool advance)
    {
        var model = new LivenessModel(); var sessions = new MemorySessions(model);
        model.At = _ => { if (advance) sessions.Current = sessions.Current! with { Identity = sessions.Current!.Identity with { AuthorityVersion = sessions.Current.Identity.AuthorityVersion + 1 } }; };
        var commands = model.Factory().CreateCommands(sessions.ResolveIdentity, sessions.InspectIdentity);
        Assert.Equal(PurchaseRequestCommandOutcome.Committed, (await commands.SaveAsync(Save(model))).Outcome);
        Assert.Equal(0, model.UnsafeResolutions); Assert.Equal(0, model.Db.AllocatorCalls);
    }

    public static IEnumerable<object[]> ObservationFenceCases()
    {
        foreach (var operation in new[] { "admission", "absent", "pending", "committed", "conflict" })
        foreach (var boundary in new[] { "begin", "transaction-dispose", "connection-dispose" })
        foreach (var change in new[] { "logout", "cancel", "principal", "tenant", "company", "credential", "branch", "version", "failure" })
            yield return [operation, boundary, change];
    }

    [Theory]
    [MemberData(nameof(ObservationFenceCases))]
    public async Task Admission_and_all_original_intent_observations_fence_in_transaction_and_after_cleanup(string operation, string boundary, string change)
    {
        var model = new LivenessModel(); var sessions = new MemorySessions(model);
        using var stop = new CancellationTokenSource();
        using var host = new Composition(model, sessions, sessions.Anchor, stop.Token, explicitLocal: true);
        var input = Save(model);
        if (operation is "committed" or "conflict" or "pending")
        {
            if (operation == "pending") model.Db.Fault = "0:commit-ack";
            await host.Commands.SaveAsync(input); model.Db.Fault = null;
            if (operation == "conflict") input = input with { Header = input.Header with { Notes = "different retained intent" } };
        }
        var snapshot = Snapshot(model); var fired = false;
        model.At = stage =>
        {
            if (!stage.EndsWith(":" + boundary, StringComparison.Ordinal)) return;
            fired = true;
            if (change == "cancel") stop.Cancel(); else sessions.Change(change);
        };
        if (operation == "admission")
        {
            var result = await host.Access.ResolveAsync(sessions.Anchor, input.PurchaseRequestId, input.BranchId, default);
            Assert.False(result.CanLookup); Assert.False(result.CanSave); Assert.False(result.CanSubmit);
        }
        else
        {
            var result = await host.Commands.LookupAsync(input);
            Assert.Equal(change == "cancel" ? PurchaseRequestLookupOutcome.Cancelled
                : change == "failure" ? PurchaseRequestLookupOutcome.Unavailable : PurchaseRequestLookupOutcome.Denied, result.Outcome);
            Assert.Null(result.Receipt);
        }
        Assert.True(fired); Assert.Equal(snapshot, Snapshot(model)); Assert.Equal(0, model.UnsafeResolutions);
    }

    [Theory]
    [InlineData("admission")] [InlineData("save")] [InlineData("submit")] [InlineData("lookup")]
    public async Task Foreign_transaction_is_not_rolled_back_or_disposed_by_purchase_orchestration(string operation)
    {
        var model = new LivenessModel { ForeignTransaction = true }; var sessions = new MemorySessions(model);
        var commands = model.Factory().CreateCommands(sessions.ResolveIdentity, sessions.InspectIdentity);
        var input = Save(model);
        if (operation == "admission")
            Assert.Equal(PurchaseRequestCommandAuthorityOutcome.Unavailable,
                await model.Factory().CreateAuthorityReader(sessions.ResolveIdentity, sessions.InspectIdentity).ReadAsync(input.PurchaseRequestId, input.BranchId));
        else if (operation == "lookup") Assert.Equal(PurchaseRequestLookupOutcome.Unavailable, (await commands.LookupAsync(input)).Outcome);
        else Assert.Equal(PurchaseRequestCommandOutcome.Unavailable, (await Dispatch(commands, input, operation == "submit")).Outcome);
        Assert.Equal(0, model.TransactionDisposals); Assert.Equal(0, model.Rollbacks); Assert.Equal(1, model.ConnectionDisposals);
        Assert.Empty(model.Db.Commands); Assert.Empty(model.Db.Journal); Assert.Equal(0, model.UnsafeResolutions);
    }

    [Theory]
    [InlineData("missing")] [InlineData("binding")] [InlineData("tenant")] [InlineData("company")]
    public async Task Acceptance_is_checked_before_either_session_callback_or_connection_factory(string fault)
    {
        var model = new LivenessModel(); var sessions = new MemorySessions(model);
        var acceptance = I22AdmissionModel.SyntheticAcceptance();
        acceptance = fault switch { "missing" => null, "binding" => acceptance with { DatabaseBindingId = Guid.NewGuid() },
            "tenant" => acceptance with { TenantId = "other" }, _ => acceptance with { CompanyId = "other" } };
        var factory = new PurchaseRequestCommandFactory(PurchaseFixtures.Binding, PurchaseFixtures.Company, (Func<DbConnection>)model.Connection, acceptance);
        var commands = factory.CreateCommands(sessions.ResolveIdentity, sessions.InspectIdentity); var input = Save(model);
        Assert.Equal(PurchaseRequestCommandOutcome.Unavailable, (await commands.SaveAsync(input)).Outcome);
        Assert.Equal(PurchaseRequestCommandOutcome.Unavailable, (await commands.SubmitAsync(Submit(input))).Outcome);
        Assert.Equal(PurchaseRequestLookupOutcome.Unavailable, (await commands.LookupAsync(input)).Outcome);
        Assert.Equal(PurchaseRequestCommandAuthorityOutcome.Unavailable,
            await factory.CreateAuthorityReader(sessions.ResolveIdentity, sessions.InspectIdentity).ReadAsync(input.PurchaseRequestId, input.BranchId));
        Assert.Equal(0, sessions.FullCalls); Assert.Equal(0, sessions.Inspections); Assert.Equal(0, model.Db.Connections);
    }

    [Fact]
    public async Task Interface_default_Inspect_fallback_is_never_treated_as_local()
    {
        var model = new LivenessModel(); var memory = new MemorySessions(model);
        using var host = new Composition(model, new FallbackSessions(memory), memory.Anchor);
        Assert.Equal(PurchaseRequestCommandOutcome.Unavailable, (await host.Commands.SaveAsync(Save(model))).Outcome);
        Assert.Equal(PurchaseRequestLookupOutcome.Unavailable, (await host.Commands.LookupAsync(Save(model))).Outcome);
        Assert.Equal(0, memory.FullCalls); Assert.Equal(0, model.Db.Connections);
    }

    private sealed class FallbackSessions(IWebSessions inner) : IWebSessions
    {
        public ResolvedSession? Create(AuthoritativeIdentity identity) => inner.Create(identity);
        public void Revoke(string token) => inner.Revoke(token);
        public Task<ResolvedSession?> ResolveAsync(string token, bool userInteraction, CancellationToken cancellationToken) =>
            inner.ResolveAsync(token, userInteraction, cancellationToken);
    }

    [Theory]
    [InlineData(false, "commit-ack")] [InlineData(true, "commit-ack")]
    [InlineData(false, "transaction-dispose")] [InlineData(true, "transaction-dispose")]
    [InlineData(false, "connection-dispose")] [InlineData(true, "connection-dispose")]
    public async Task Replay_cleanup_loss_does_not_disclose_a_historical_receipt_or_redispatch(bool submit, string boundary)
    {
        var model = new LivenessModel(); var sessions = new MemorySessions(model);
        using var host = new Composition(model, sessions, sessions.Anchor, explicitLocal: true);
        var input = Save(model);
        Assert.Equal(PurchaseRequestCommandOutcome.Committed, (await Dispatch(host.Commands, input, submit)).Outcome);
        var row = JsonSerializer.Serialize(Assert.Single(model.Db.Journal.Values), PurchaseRequestCommandRules.Json);
        var writes = model.Db.Commands.Count(c => c.CommandText == PurchaseRequestSql.UpdateHeadText || c.CommandText == PurchaseRequestSql.SubmitText);
        model.At = stage => { if (stage.EndsWith(":" + boundary, StringComparison.Ordinal)) sessions.Change("logout"); };
        var replay = await Dispatch(host.Commands, input, submit);
        Assert.Equal(PurchaseRequestCommandOutcome.OutcomeUnknown, replay.Outcome); Assert.Null(replay.Receipt);
        Assert.Equal(row, JsonSerializer.Serialize(Assert.Single(model.Db.Journal.Values), PurchaseRequestCommandRules.Json));
        Assert.Equal(writes, model.Db.Commands.Count(c => c.CommandText == PurchaseRequestSql.UpdateHeadText || c.CommandText == PurchaseRequestSql.SubmitText));
        Assert.Equal(0, model.Db.AllocatorCalls); Assert.Equal(0, model.UnsafeResolutions);
    }

    [Fact]
    public async Task Recording_guard_detects_an_incorrect_full_resolver_supplied_as_local_inspector()
    {
        var model = new LivenessModel(); var sessions = new MemorySessions(model);
        var result = await model.Factory().CreateCommands(sessions.ResolveIdentity, sessions.ResolveIdentity).SaveAsync(Save(model));
        Assert.Equal(1, model.UnsafeResolutions); Assert.Null(result.Receipt);
        Assert.Equal(PurchaseRequestCommandOutcome.Unavailable, result.Outcome);
        Assert.Equal(0, model.Db.Commits); Assert.Empty(model.Db.Journal); Assert.Equal(0, model.Db.AllocatorCalls);
    }

    private static SavePurchaseRequestDraft Save(LivenessModel model) => new("i45-save", "B1", PurchaseFixtures.DocumentId,
        PurchaseRequestCommandRules.EqualityToken(model.Db.Documents[PurchaseFixtures.DocumentId]), PurchaseFixtures.Header with { Notes = "I45 synthetic" }, []);
    private static SubmitPurchaseRequest Submit(SavePurchaseRequestDraft input) => new("i45-submit", input.BranchId, input.PurchaseRequestId, input.ExpectedStateToken);
    private static Task<PurchaseRequestCommandResult> Dispatch(IPurchaseRequestCommands commands, SavePurchaseRequestDraft input, bool submit) =>
        submit ? commands.SubmitAsync(Submit(input)) : commands.SaveAsync(input);
    private static Task<PurchaseRequestLookupResult> Lookup(IPurchaseRequestCommands commands, SavePurchaseRequestDraft input, bool submit) =>
        submit ? commands.LookupAsync(Submit(input)) : commands.LookupAsync(input);
    private static string Snapshot(LivenessModel model) => JsonSerializer.Serialize(new { model.Db.Documents, model.Db.Journal, model.Db.Commits, model.Db.AllocatorCalls }, PurchaseRequestCommandRules.Json);

    private sealed class InstrumentedAuthority(LivenessModel model) : IIdentityAuthority
    {
        internal int Calls;
        public Task<IdentityResult> AuthenticateAsync(string username, string password, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<IdentityResult> RevalidateAsync(AuthoritativeIdentity identity, CancellationToken cancellationToken)
        {
            model.AssertFullOutsideResources(); cancellationToken.ThrowIfCancellationRequested(); Calls++;
            return Task.FromResult(new IdentityResult(IdentityOutcome.Success, identity with { AuthorityVersion = identity.AuthorityVersion + 1 }));
        }
    }

    private sealed class MemorySessions : IWebSessions
    {
        private readonly LivenessModel model;
        internal ResolvedSession Anchor { get; }
        internal ResolvedSession? Current;
        internal int FullCalls, Inspections;
        internal Action<int>? BeforeFull;
        private bool failure;
        internal MemorySessions(LivenessModel model)
        {
            this.model = model;
            var id = PurchaseFixtures.Identity(10);
            Anchor = new(new string('A', 64), id, new(id.DisplayName, id.TenantId, id.CompanyId, id.CompanyName, id.AuthorityVersion,
                DateTimeOffset.MaxValue, DateTimeOffset.MaxValue, id.Capabilities));
            Current = Anchor;
        }
        internal void Reset() { Current = Anchor; failure = false; }
        internal void Change(string change)
        {
            if (change == "logout") { Current = null; return; }
            if (change == "failure") { failure = true; return; }
            var id = Current!.Identity;
            Current = Current with { Token = change == "token" ? new string('B', 64) : Current.Token, Identity = change switch
            {
                "principal" => id with { PrincipalId = "other" }, "tenant" => id with { TenantId = "other" },
                "company" => id with { CompanyId = "other" }, "credential" => id with { CredentialStamp = "other" },
                "branch" => id with { BranchIds = ["B2"] }, "capabilities" => id with { Capabilities = ["changed-capability"] },
                "version" => id with { AuthorityVersion = 9 }, _ => id
            } };
        }
        public ResolvedSession? Create(AuthoritativeIdentity identity) => throw new NotSupportedException();
        public void Revoke(string token) => Current = null;
        public Task<ResolvedSession?> ResolveAsync(string token, bool userInteraction, CancellationToken cancellationToken)
        {
            Assert.False(userInteraction); model.AssertFullOutsideResources(); FullCalls++; BeforeFull?.Invoke(FullCalls);
            return Observe(token, cancellationToken);
        }
        public Task<ResolvedSession?> InspectAsync(string token, CancellationToken cancellationToken)
        {
            Inspections++;
            var connections = model.Db.Connections;
            var result = Observe(token, cancellationToken);
            Assert.Equal(connections, model.Db.Connections);
            return result;
        }
        private Task<ResolvedSession?> Observe(string token, CancellationToken cancellationToken)
        {
            Assert.Equal(Anchor.Token, token); cancellationToken.ThrowIfCancellationRequested();
            if (failure) throw new IOException("synthetic session failure");
            return Task.FromResult(Current);
        }
        internal async Task<AuthoritativeIdentity?> ResolveIdentity(CancellationToken token) => (await ResolveAsync(Anchor.Token, false, token))?.Identity;
        internal async Task<AuthoritativeIdentity?> InspectIdentity(CancellationToken token) => (await InspectAsync(Anchor.Token, token))?.Identity;
    }

    private sealed class Composition : IDisposable
    {
        private readonly ServiceProvider provider;
        private readonly IServiceScope scope;
        internal IPurchaseRequestCommands Commands { get; }
        internal IPurchaseRequestCommandAccess Access { get; }
        internal Composition(LivenessModel model, IWebSessions sessions, ResolvedSession anchor, CancellationToken aborted = default, bool explicitLocal = false)
        {
            var services = new ServiceCollection(); services.AddSingleton(sessions);
            services.AddDormantPurchaseRequestCommands(model.Factory(), explicitLocal ? (store, token, ct) => store.InspectAsync(token, ct) : null);
            provider = services.BuildServiceProvider(); scope = provider.CreateScope();
            var context = new DefaultHttpContext { User = AuthEndpoints.Principal(anchor), RequestServices = scope.ServiceProvider, RequestAborted = aborted };
            context.Items[AuthEndpoints.ResolvedKey] = anchor;
            provider.GetRequiredService<IHttpContextAccessor>().HttpContext = context;
            Commands = scope.ServiceProvider.GetRequiredService<IPurchaseRequestCommands>(); Access = scope.ServiceProvider.GetRequiredService<IPurchaseRequestCommandAccess>();
        }
        public void Dispose() { scope.Dispose(); provider.GetRequiredService<IHttpContextAccessor>().HttpContext = null; provider.Dispose(); }
    }

    private sealed class LivenessModel
    {
        internal readonly PurchaseRecordingModel Db = new();
        internal int HeldConnections, HeldTransactions, UnsafeResolutions, TransactionDisposals, ConnectionDisposals, Rollbacks;
        internal bool ForeignTransaction;
        internal Action<string>? At;
        internal Func<string, Task>? Cleanup;
        internal LivenessModel() { Db.Seed(); Db.OnStep = (phase, step) => At?.Invoke(phase + ":" + step); }
        internal PurchaseRequestCommandFactory Factory() => new(PurchaseFixtures.Binding, PurchaseFixtures.Company, (Func<DbConnection>)Connection, I22AdmissionModel.SyntheticAcceptance());
        internal DbConnection Connection() => new ObservedConnection(new PurchaseRecordingConnection(Db, Db.Connections++), this);
        internal void AssertFullOutsideResources()
        {
            if (HeldConnections != 0 || HeldTransactions != 0) UnsafeResolutions++;
            Assert.Equal(0, HeldTransactions); Assert.Equal(0, HeldConnections);
        }
        internal async Task Clean(int phase, string step)
        { await Task.Yield(); if (Cleanup is not null) await Cleanup(phase + ":" + step); At?.Invoke(phase + ":" + step); }
    }
    private sealed class ObservedConnection(PurchaseRecordingConnection inner, LivenessModel model) : DbConnection
    {
        [AllowNull] public override string ConnectionString { get => inner.ConnectionString; set => inner.ConnectionString = value; }
        public override string Database => inner.Database; public override string DataSource => inner.DataSource;
        public override string ServerVersion => inner.ServerVersion; public override ConnectionState State => inner.State;
        public override void Open() { model.HeldConnections++; inner.Open(); }
        public override void Close() => inner.Close();
        public override void ChangeDatabase(string databaseName) => throw new NotSupportedException();
        protected override DbTransaction BeginDbTransaction(IsolationLevel isolationLevel)
        { model.HeldTransactions++; return new ObservedTransaction(model.ForeignTransaction ? new PurchaseRecordingConnection(model.Db, -1) : this, inner.BeginTransaction(isolationLevel), model, inner.Phase); }
        protected override DbCommand CreateDbCommand() => new ObservedCommand(this, inner.CreateCommand());
        public override async ValueTask DisposeAsync()
        { model.ConnectionDisposals++; await model.Clean(inner.Phase, "connection-dispose"); await inner.DisposeAsync(); model.HeldConnections--; }
    }
    private sealed class ObservedTransaction(DbConnection owner, DbTransaction inner, LivenessModel model, int phase) : DbTransaction
    {
        internal DbTransaction Inner => inner;
        public override IsolationLevel IsolationLevel => inner.IsolationLevel;
        protected override DbConnection? DbConnection => inner.Connection is null ? null : owner;
        public override void Commit() => inner.Commit();
        public override void Rollback() { model.Rollbacks++; inner.Rollback(); }
        public override async ValueTask DisposeAsync()
        { model.TransactionDisposals++; await model.Clean(phase, "transaction-dispose"); await inner.DisposeAsync(); model.HeldTransactions--; }
    }
    private sealed class ObservedCommand(DbConnection owner, DbCommand inner) : DbCommand
    {
        private DbTransaction? transaction;
        [AllowNull] public override string CommandText { get => inner.CommandText; set => inner.CommandText = value; }
        public override int CommandTimeout { get => inner.CommandTimeout; set => inner.CommandTimeout = value; }
        public override CommandType CommandType { get => inner.CommandType; set => inner.CommandType = value; }
        public override bool DesignTimeVisible { get => inner.DesignTimeVisible; set => inner.DesignTimeVisible = value; }
        public override UpdateRowSource UpdatedRowSource { get => inner.UpdatedRowSource; set => inner.UpdatedRowSource = value; }
        protected override DbConnection? DbConnection { get => owner; set => throw new NotSupportedException(); }
        protected override DbTransaction? DbTransaction { get => transaction; set { transaction = value; inner.Transaction = ((ObservedTransaction?)value)?.Inner; } }
        protected override DbParameterCollection DbParameterCollection => inner.Parameters;
        protected override DbParameter CreateDbParameter() => inner.CreateParameter();
        public override void Cancel() => inner.Cancel(); public override void Prepare() => throw new NotSupportedException();
        public override int ExecuteNonQuery() => inner.ExecuteNonQuery();
        public override object? ExecuteScalar() => inner.ExecuteScalar();
        protected override DbDataReader ExecuteDbDataReader(CommandBehavior behavior) => inner.ExecuteReader(behavior);
        protected override void Dispose(bool disposing) { if (disposing) inner.Dispose(); base.Dispose(disposing); }
    }
}
