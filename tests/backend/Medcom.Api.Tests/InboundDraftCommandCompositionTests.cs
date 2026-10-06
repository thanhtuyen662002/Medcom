using System.Collections.Concurrent;
using System.Data;
using System.Data.Common;
using System.Security.Claims;
using System.Text.Json;
using Medcom.Application;
using Medcom.Application.Inbound;
using Medcom.Contracts.Inbound;
using Medcom.Infrastructure;
using Medcom.Infrastructure.Inbound;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Medcom.Api.Tests;

// Synthetic composition only: actual I15 commands/native grants and real Web session
// classes over owned recording connections. These evidence labels do not qualify a target.
public sealed class InboundDraftCommandCompositionTests
{
    [Fact]
    public async Task Default_registration_is_scoped_and_unavailable_without_context_sessions_or_SQL()
    {
        var services = new ServiceCollection();
        services.AddDormantInboundDraftCommands();
        Assert.Equal(ServiceLifetime.Scoped, Assert.Single(services, x => x.ServiceType == typeof(IInboundDraftCommandService)).Lifetime);
        Assert.Equal(ServiceLifetime.Scoped, Assert.Single(services, x => x.ServiceType == typeof(IInboundDraftCommandAccess)).Lifetime);
        using var provider = services.BuildServiceProvider(new ServiceProviderOptions { ValidateScopes = true, ValidateOnBuild = true });
        using var scope = provider.CreateScope();
        var commands = scope.ServiceProvider.GetRequiredService<IInboundDraftCommandService>();
        var access = scope.ServiceProvider.GetRequiredService<IInboundDraftCommandAccess>();
        Assert.Null(await access.ResolveAsync(Session(InboundModel.Identity), Document, default));
        Assert.Equal(InboundDraftOutcome.Unavailable, (await commands.ReadAsync(Document)).Outcome);
        foreach (var command in new[] { InboundModel.Create(), UnobservedSave(), UnobservedSave() with { Action = InboundDraftAction.SendToWarehouse, Header = null } })
        {
            Assert.Equal(InboundDraftOutcome.Unavailable, (await commands.ExecuteAsync(command)).Outcome);
            Assert.Equal(InboundDraftOutcome.Unavailable, (await commands.ReconcileAsync(command)).Outcome);
        }
    }

    [Theory]
    [InlineData("missing")]
    [InlineData("binding")]
    [InlineData("tenant")]
    [InlineData("company")]
    [InlineData("evidence")]
    public async Task Missing_or_mismatched_runtime_acceptance_performs_no_session_or_connection_work(string fault)
    {
        var db = Model();
        InboundDraftCommandRuntimeAcceptance? acceptance = fault switch
        {
            "missing" => null,
            "binding" => Acceptance() with { DatabaseBindingId = Guid.NewGuid() },
            "tenant" => Acceptance() with { TenantId = "another-tenant" },
            "company" => Acceptance() with { CompanyId = "another-company" },
            _ => Acceptance() with { EvidenceReference = "" }
        };
        var sessions = new StaticSessions(db.ActiveIdentity);
        using var host = new Harness(new(Binding, Company, (Func<DbConnection>)db.NewConnection, acceptance), sessions);
        using var request = host.Request(Session(db.ActiveIdentity));
        Assert.Null(await request.Access.ResolveAsync(request.Session, Document, default));
        Assert.Equal(InboundDraftOutcome.Unavailable, (await request.Commands.ReadAsync(Document)).Outcome);
        Assert.Equal(InboundDraftOutcome.Unavailable, (await request.Commands.ExecuteAsync(UnobservedSave())).Outcome);
        Assert.Equal(InboundDraftOutcome.Unavailable, (await request.Commands.ReconcileAsync(UnobservedSave())).Outcome);
        Assert.Equal(InboundDraftOutcome.Unavailable, (await request.Commands.ExecuteAsync(InboundModel.Create())).Outcome);
        Assert.Empty(sessions.Observations); Assert.Equal(0, db.FactoryCalls); Assert.Equal(0, db.OpenCalls);
        Assert.Empty(db.Commands); Assert.Empty(db.Journal.Rows.Cast<DataRow>());
    }

    [Theory]
    [InlineData("missing-server-item")]
    [InlineData("unauthenticated")]
    [InlineData("claim-mismatch")]
    [InlineData("duplicate-claim")]
    public async Task Headers_query_and_supplied_sessions_cannot_replace_the_authenticated_server_anchor(string fault)
    {
        var db = Model(); var sessions = new StaticSessions(db.ActiveIdentity);
        using var host = new Harness(Factory(db), sessions);
        using var request = host.Request(Session(db.ActiveIdentity), alter: context =>
        {
            context.Request.Headers["X-Session-Token"] = TokenA;
            context.Request.QueryString = new QueryString("?session=" + TokenA);
            if (fault == "missing-server-item") context.Items.Remove(AuthEndpoints.ResolvedKey);
            if (fault == "unauthenticated") context.User = new ClaimsPrincipal(new ClaimsIdentity());
            if (fault == "claim-mismatch") context.User = AuthEndpoints.Principal(Session(db.ActiveIdentity, TokenB));
            if (fault == "duplicate-claim") ((ClaimsIdentity)context.User.Identity!).AddClaim(new Claim(AuthEndpoints.SessionClaim, TokenA));
        });
        Assert.Null(await request.Access.ResolveAsync(request.Session, Document, default));
        Assert.Equal(InboundDraftOutcome.Denied, (await request.Commands.ReadAsync(Document)).Outcome);
        Assert.Equal(InboundDraftOutcome.Denied, (await request.Commands.ExecuteAsync(UnobservedSave())).Outcome);
        Assert.Equal(InboundDraftOutcome.Denied, (await request.Commands.ReconcileAsync(UnobservedSave())).Outcome);
        Assert.Empty(sessions.Observations); Assert.Equal(0, db.FactoryCalls); Assert.Empty(db.Commands);
    }

    [Fact]
    public async Task Request_scopes_capture_separate_tokens_and_ignore_later_accessor_swaps()
    {
        var db = Model(); var issued = new List<DbConnection>();
        var factory = new InboundDraftCommandFactory(Binding, Company, (Func<DbConnection>)(() =>
        { var connection = db.NewConnection(); issued.Add(connection); return connection; }), Acceptance());
        var sessions = new StaticSessions(db.ActiveIdentity);
        using var host = new Harness(factory, sessions);
        using var first = host.Request(Session(db.ActiveIdentity, TokenA));
        using var second = host.Request(Session(db.ActiveIdentity, TokenB));
        Assert.NotSame(first.Commands, second.Commands); Assert.NotSame(first.Access, second.Access);
        Assert.Same(first.Commands, first.Scope.ServiceProvider.GetRequiredService<IInboundDraftCommandService>());
        AssertAdmitted(await first.Access.ResolveAsync(first.Session, Document, default));
        Assert.All(sessions.Observations, observation => Assert.Equal(TokenA, observation.Token));
        sessions.Observations.Clear();
        AssertAdmitted(await second.Access.ResolveAsync(second.Session, Document, default));
        Assert.All(sessions.Observations, observation => Assert.Equal(TokenB, observation.Token));
        var observations = sessions.Observations.Count; var factories = db.FactoryCalls;
        Assert.Null(await first.Access.ResolveAsync(second.Session, Document, default));
        Assert.Equal(observations, sessions.Observations.Count); Assert.Equal(factories, db.FactoryCalls);
        Assert.Equal(2, issued.Count); Assert.NotSame(issued[0], issued[1]);
        AssertReadOnly(db); Assert.Equal(2, db.ConnectionDisposes); Assert.Equal(2, db.TransactionDisposes);
    }

    [Theory]
    [InlineData("token")]
    [InlineData("actor")]
    [InlineData("tenant")]
    [InlineData("company")]
    [InlineData("branch")]
    [InlineData("stamp")]
    [InlineData("capabilities")]
    public async Task Fresh_session_changes_are_not_borrowed_from_the_request_snapshot(string change)
    {
        var db = Model(); var anchor = Session(db.ActiveIdentity);
        var identity = change switch
        {
            "actor" => anchor.Identity with { PrincipalId = "other-user" },
            "tenant" => anchor.Identity with { TenantId = "other-tenant" },
            "company" => anchor.Identity with { CompanyId = "other-company" },
            "branch" => anchor.Identity with { BranchIds = ["BR-B"] },
            "stamp" => anchor.Identity with { CredentialStamp = "changed-stamp" },
            "capabilities" => anchor.Identity with { Capabilities = ["extra-capability"] },
            _ => anchor.Identity
        };
        var sessions = new StaticSessions(db.ActiveIdentity)
        {
            OnResolve = (_, _, _) => Task.FromResult<ResolvedSession?>(Session(identity with { AuthorityVersion = 2 }, change == "token" ? TokenB : TokenA))
        };
        using var host = new Harness(Factory(db), sessions); using var request = host.Request(anchor);
        Assert.Null(await request.Access.ResolveAsync(request.Session, Document, default));
        Assert.Equal(InboundDraftOutcome.Denied, (await request.Commands.ReadAsync(Document)).Outcome);
        Assert.Equal(InboundDraftOutcome.Denied, (await request.Commands.ExecuteAsync(UnobservedSave())).Outcome);
        Assert.Equal(InboundDraftOutcome.Denied, (await request.Commands.ReconcileAsync(UnobservedSave())).Outcome);
        Assert.Equal(0, db.FactoryCalls); Assert.Empty(db.Commands); Assert.NotEmpty(sessions.Observations);
    }

    [Fact]
    public async Task Real_sessions_compose_Read_Save_new_detail_Send2_log_and_original_receipt_reconciliation()
    {
        var db = Model();
        // Existing-document additions retain I15 semantics even when native Add is absent.
        db.SourceAuthority!.Direct[0] = new("sample-user", "07011", Add: false);
        var real = await RealSession(); var observedSessions = new RecordingSessions(real.Sessions);
        using var host = new Harness(Factory(db), observedSessions); using var request = host.Request(real.Session);
        AssertAdmitted(await request.Access.ResolveAsync(request.Session, Document, default));
        var save = await Save(request.Commands);
        var clientLine = Guid.Parse("33333333-3333-3333-3333-333333333333");
        save = save with
        {
            Header = save.Header! with { Notes = "synthetic composed update" },
            DetailUpserts = [InboundModel.Detail with { RowId = null, ClientLineId = clientLine, ItemId = "ITEM-NEW", SetQuantityByDocument = 4m }]
        };
        var unchangedIntent = JsonSerializer.Serialize(save);
        var saved = await request.Commands.ExecuteAsync(save);
        Assert.Equal(InboundDraftOutcome.Committed, saved.Outcome);
        Assert.Equal(save.OperationId, saved.Receipt!.OperationId); Assert.Equal(Document, saved.Receipt.DocumentId);
        Assert.Equal(0, saved.Receipt.StatusId); Assert.Equal(2, db.CommitAcks);
        Assert.Equal(3, db.Tables[1].Rows.Count); Assert.Single(db.Journal.Rows.Cast<DataRow>());
        Assert.Equal(save.OperationId, db.Journal.Rows[0]["OperationId"]);
        var fresh = await request.Commands.ReadAsync(Document);
        Assert.Equal(InboundDraftOutcome.Observed, fresh.Outcome);
        Assert.Equal(saved.Receipt.StateEqualityToken, fresh.Document!.StateEqualityToken);
        var added = Assert.Single(fresh.Document.Details, detail => detail.ItemId == "ITEM-NEW");
        Assert.NotNull(added.RowId); Assert.Null(added.ClientLineId); Assert.Equal(4m, added.SetQuantityByDocument);
        Assert.Contains(fresh.Document.Details, detail => detail.RowId == "ROW-1");
        Assert.Contains(fresh.Document.Details, detail => detail.RowId == "ROW-2");
        Assert.Equal("locked note", db.Tables[1].Rows[0]["PalletNote"]);
        Assert.Equal(12.50m, db.Tables[2].Rows[0]["Cost"]); Assert.Equal("preserved", db.Tables[3].Rows[0]["Notes"]);

        // An unrelated session poll advances the real authority sequence. Commands
        // must retain its actual values rather than pinning the middleware snapshot.
        var polled = Assert.IsType<ResolvedSession>(await real.Sessions.ResolveAsync(real.Session.Token, false, default));
        Assert.True(polled.Identity.AuthorityVersion > real.Session.Identity.AuthorityVersion);
        var send = new InboundDraftCommand(Guid.NewGuid(), InboundDraftAction.SendToWarehouse, Document,
            fresh.Document.StateEqualityToken, null, Note: "synthetic warehouse note");
        var sent = await request.Commands.ExecuteAsync(send);
        Assert.Equal(InboundDraftOutcome.Committed, sent.Outcome); Assert.Equal(2, sent.Receipt!.StatusId);
        Assert.Equal(send.OperationId, sent.Receipt.OperationId); Assert.Equal(4, db.CommitAcks);
        var log = Assert.Single(db.Tables[4].Rows.Cast<DataRow>());
        Assert.Equal("sample-user", log["UserName"]); Assert.Equal("synthetic warehouse note", log["Notes"]);
        Assert.Equal(2, log["StatusID"]); Assert.Equal(2, db.Tables[0].Rows[0]["StatusID"]);
        Assert.Equal(2, db.Journal.Rows.Count);
        AssertAdmitted(await request.Access.ResolveAsync(request.Session, Document, default));
        var afterSend = await request.Commands.ReadAsync(Document);
        Assert.Equal(InboundDraftOutcome.Observed, afterSend.Outcome); Assert.Equal(2, afterSend.Document!.StatusId);
        Assert.Equal(sent.Receipt.StateEqualityToken, afterSend.Document.StateEqualityToken);

        var before = Snapshot(db); var writes = db.BusinessWrites; var commits = db.CommitAcks;
        db.Commands.Clear(); db.Events.Clear();
        var saveReceipt = await request.Commands.ReconcileAsync(save);
        var sendReceipt = await request.Commands.ReconcileAsync(send);
        Assert.Equal(InboundDraftOutcome.Replayed, saveReceipt.Outcome); Assert.Equal(saved.Receipt, saveReceipt.Receipt);
        Assert.Equal(InboundDraftOutcome.Replayed, sendReceipt.Outcome); Assert.Equal(sent.Receipt, sendReceipt.Receipt);
        Assert.Equal(unchangedIntent, JsonSerializer.Serialize(save));
        Assert.Equal(before, Snapshot(db)); Assert.Equal(writes, db.BusinessWrites); Assert.Equal(commits, db.CommitAcks);
        AssertReconcileOnly(db); AssertActualIncreasingObservations(observedSessions.Observations, real.Session);
        Assert.True(observedSessions.Observations.Last().Session!.Identity.AuthorityVersion > polled.Identity.AuthorityVersion);
        Assert.Equal(db.FactoryCalls, db.ConnectionDisposes); Assert.Equal(db.FactoryCalls, db.TransactionDisposes);
    }

    [Fact]
    public async Task Create_and_Create_reconciliation_are_denied_before_sessions_SQL_reservation_or_allocator()
    {
        var db = Model(); var sessions = new StaticSessions(db.ActiveIdentity);
        using var host = new Harness(Factory(db), sessions); using var request = host.Request(Session(db.ActiveIdentity));
        foreach (var create in new[] { InboundModel.Create(), InboundModel.Create() with { CostChanges = [new(null, "vendor")] } })
        {
            Assert.Equal(InboundDraftOutcome.Denied, (await request.Commands.ExecuteAsync(create)).Outcome);
            Assert.Equal(InboundDraftOutcome.Denied, (await request.Commands.ReconcileAsync(create)).Outcome);
        }
        Assert.Empty(sessions.Observations); Assert.Equal(0, db.FactoryCalls); Assert.Equal(0, db.OpenCalls);
        Assert.Equal(0, db.BusinessWrites); Assert.Equal(0, db.CommitAcks); Assert.Empty(db.Commands);
        Assert.Empty(db.Journal.Rows.Cast<DataRow>()); Assert.Single(db.Tables[0].Rows.Cast<DataRow>());
    }

    [Fact]
    public async Task New_Send_needs_separate_evidence_but_historical_Send_receipt_remains_reconcilable()
    {
        var db = Model(); var real = await RealSession();
        InboundDraftCommand original; InboundDraftReceipt receipt;
        using (var acceptedHost = new Harness(Factory(db), real.Sessions))
        using (var acceptedRequest = acceptedHost.Request(real.Session))
        {
            original = (await Save(acceptedRequest.Commands)) with { Action = InboundDraftAction.SendToWarehouse, Header = null, Note = "previous send" };
            var sent = await acceptedRequest.Commands.ExecuteAsync(original);
            Assert.Equal(InboundDraftOutcome.Committed, sent.Outcome); receipt = Assert.IsType<InboundDraftReceipt>(sent.Receipt);
        }
        var observedSessions = new RecordingSessions(real.Sessions);
        using var host = new Harness(Factory(db, newSend: false), observedSessions); using var request = host.Request(real.Session);
        AssertAdmitted(await request.Access.ResolveAsync(request.Session, Document, default), send: false);
        var before = Snapshot(db); var factories = db.FactoryCalls; var observations = observedSessions.Observations.Count;
        var denied = await request.Commands.ExecuteAsync(original with { OperationId = Guid.NewGuid() });
        Assert.Equal(InboundDraftOutcome.Denied, denied.Outcome); Assert.Null(denied.Receipt);
        Assert.Equal(factories, db.FactoryCalls); Assert.Equal(observations, observedSessions.Observations.Count);
        db.Commands.Clear(); db.Events.Clear();
        var reconciled = await request.Commands.ReconcileAsync(original);
        Assert.Equal(InboundDraftOutcome.Replayed, reconciled.Outcome); Assert.Equal(receipt, reconciled.Receipt);
        var read = await request.Commands.ReadAsync(Document);
        Assert.Equal(InboundDraftOutcome.Observed, read.Outcome); Assert.Equal(2, read.Document!.StatusId);
        Assert.Equal(before, Snapshot(db)); Assert.Equal(2, db.CommitAcks); Assert.Single(db.Journal.Rows.Cast<DataRow>());
        AssertReadOnly(db); Assert.Single(db.Tables[4].Rows.Cast<DataRow>());
    }

    [Theory]
    [InlineData("logout")]
    [InlineData("expiry")]
    [InlineData("branch")]
    [InlineData("capabilities")]
    [InlineData("credential")]
    [InlineData("native-update")]
    public async Task Real_session_or_native_Update_loss_blocks_existing_document_commands(string change)
    {
        var db = Model(); var real = await RealSession();
        using var host = new Harness(Factory(db), real.Sessions); using var request = host.Request(real.Session);
        var original = await Save(request.Commands);
        AssertAdmitted(await request.Access.ResolveAsync(request.Session, Document, default));
        var factories = db.FactoryCalls; db.Commands.Clear(); db.Events.Clear();
        Change(real, db, change);
        var result = await request.Commands.ExecuteAsync(original);
        Assert.Equal(InboundDraftOutcome.Denied, result.Outcome); Assert.Null(result.Receipt);
        Assert.Empty(db.Journal.Rows.Cast<DataRow>()); Assert.Equal(0, db.CommitAcks); Assert.Equal(0, db.BusinessWrites);
        if (change == "native-update") Assert.True(db.FactoryCalls > factories);
        else Assert.Equal(factories, db.FactoryCalls);
    }

    [Theory]
    [InlineData("logout")]
    [InlineData("branch")]
    [InlineData("credential")]
    [InlineData("capabilities")]
    public async Task Real_scope_loss_after_business_writes_rolls_back_without_releasing_a_receipt(string change)
    {
        var db = Model(); var real = await RealSession();
        using var host = new Harness(Factory(db), real.Sessions); using var request = host.Request(real.Session);
        var original = (await Save(request.Commands)) with { Header = InboundModel.Header with { Notes = "must roll back" } };
        db.OnEvent = name => { if (name == "record") Change(real, db, change); };
        var result = await request.Commands.ExecuteAsync(original);
        Assert.Equal(InboundDraftOutcome.Denied, result.Outcome); Assert.Null(result.Receipt);
        Assert.Equal("original", db.Tables[0].Rows[0]["Notes"]);
        Assert.Equal(1, db.CommitAcks); Assert.Equal(0, Assert.Single(db.Journal.Rows.Cast<DataRow>())["State"]);
        Assert.Equal(original.OperationId, db.Journal.Rows[0]["OperationId"]);
        Assert.Empty(db.Tables[4].Rows.Cast<DataRow>()); Assert.Contains("rollback", db.Events);
        Assert.Equal(db.FactoryCalls, db.ConnectionDisposes); Assert.Equal(db.FactoryCalls, db.TransactionDisposes);
    }

    [Theory]
    [InlineData("transaction-dispose")]
    [InlineData("connection-dispose")]
    public async Task Authority_loss_during_committed_cleanup_is_unknown_and_original_operation_reconciles_without_redispatch(string boundary)
    {
        var db = Model(); var real = await RealSession();
        using var host = new Harness(Factory(db), real.Sessions); using var request = host.Request(real.Session);
        var original = (await Save(request.Commands)) with { Header = InboundModel.Header with { Notes = "already committed" } };
        db.OnEvent = name => { if (name == boundary && db.CommitAcks == 2) real.Sessions.Revoke(real.Session.Token); };
        var result = await request.Commands.ExecuteAsync(original);
        Assert.Equal(InboundDraftOutcome.OutcomeUnknown, result.Outcome); Assert.Null(result.Receipt);
        Assert.Equal("result_authority_changed_reconcile_only", result.Code);
        Assert.Equal("already committed", db.Tables[0].Rows[0]["Notes"]); Assert.Equal(2, db.CommitAcks);
        Assert.Equal(1, Assert.Single(db.Journal.Rows.Cast<DataRow>())["State"]);
        Assert.Equal(original.OperationId, db.Journal.Rows[0]["OperationId"]);
        db.OnEvent = null;
        var before = Snapshot(db); var writes = db.BusinessWrites; db.Commands.Clear(); db.Events.Clear();
        var newlyAuthenticated = await RealSession();
        using var newHost = new Harness(Factory(db), newlyAuthenticated.Sessions);
        using var nextRequest = newHost.Request(newlyAuthenticated.Session);
        var reconciled = await nextRequest.Commands.ReconcileAsync(original);
        Assert.Equal(InboundDraftOutcome.Replayed, reconciled.Outcome);
        Assert.Equal(original.OperationId, reconciled.Receipt!.OperationId);
        Assert.Equal(db.Journal.Rows[0]["AuditId"], reconciled.Receipt.AuditId);
        Assert.Equal(before, Snapshot(db)); Assert.Equal(writes, db.BusinessWrites); Assert.Equal(2, db.CommitAcks);
        AssertReconcileOnly(db);
    }

    [Theory]
    [InlineData("transaction-dispose")]
    [InlineData("connection-dispose")]
    public async Task Read_does_not_release_a_document_after_cleanup_revokes_the_real_session(string boundary)
    {
        var db = Model(); var real = await RealSession();
        using var host = new Harness(Factory(db), real.Sessions); using var request = host.Request(real.Session);
        db.OnEvent = name => { if (name == boundary) real.Sessions.Revoke(real.Session.Token); };
        var read = await request.Commands.ReadAsync(Document);
        Assert.Equal(InboundDraftOutcome.Denied, read.Outcome); Assert.Null(read.Document);
        Assert.Equal(1, db.ConnectionDisposes); Assert.Equal(1, db.TransactionDisposes); AssertReadOnly(db);
    }

    [Theory]
    [InlineData("transaction")]
    [InlineData("connection")]
    public async Task Read_cleanup_failures_do_not_expose_a_document_or_escape_with_private_details(string cleanup)
    {
        var db = Model(); var real = await RealSession();
        db.TransactionDisposeFails = cleanup == "transaction"; db.ConnectionDisposeFails = cleanup == "connection";
        using var host = new Harness(Factory(db), real.Sessions); using var request = host.Request(real.Session);
        var read = await request.Commands.ReadAsync(Document);
        Assert.Equal(InboundDraftOutcome.Unavailable, read.Outcome); Assert.Null(read.Document);
        Assert.Equal(1, db.ConnectionDisposes); Assert.Equal(1, db.TransactionDisposes); AssertReadOnly(db);
    }

    [Theory]
    [InlineData("logout")]
    [InlineData("native-update")]
    public async Task Post_Send_authority_loss_hides_the_original_receipt_without_replaying_effects(string change)
    {
        var db = Model(); var real = await RealSession();
        using var host = new Harness(Factory(db), real.Sessions); using var request = host.Request(real.Session);
        var original = (await Save(request.Commands)) with { Action = InboundDraftAction.SendToWarehouse, Header = null, Note = "send once" };
        var sent = await request.Commands.ExecuteAsync(original);
        Assert.Equal(InboundDraftOutcome.Committed, sent.Outcome);
        AssertAdmitted(await request.Access.ResolveAsync(request.Session, Document, default));
        var before = Snapshot(db); var writes = db.BusinessWrites; db.Commands.Clear(); db.Events.Clear();
        Change(real, db, change);
        var reconciled = await request.Commands.ReconcileAsync(original);
        Assert.Equal(InboundDraftOutcome.Denied, reconciled.Outcome); Assert.Null(reconciled.Receipt);
        Assert.Null(await request.Access.ResolveAsync(request.Session, Document, default));
        Assert.Equal(before, Snapshot(db)); Assert.Equal(writes, db.BusinessWrites); Assert.Equal(2, db.CommitAcks);
        Assert.Single(db.Tables[4].Rows.Cast<DataRow>()); AssertReconcileOnly(db);
    }

    [Theory]
    [InlineData("request")]
    [InlineData("argument")]
    public async Task Cancellation_before_resolution_performs_no_session_or_SQL_work(string source)
    {
        var db = Model(); var sessions = new StaticSessions(db.ActiveIdentity);
        using var cancellation = new CancellationTokenSource();
        using var host = new Harness(Factory(db), sessions);
        using var request = host.Request(Session(db.ActiveIdentity), source == "request" ? cancellation.Token : default);
        cancellation.Cancel(); var token = source == "argument" ? cancellation.Token : default;
        Assert.Null(await request.Access.ResolveAsync(request.Session, Document, token));
        Assert.Equal(InboundDraftOutcome.Unavailable, (await request.Commands.ReadAsync(Document, token)).Outcome);
        Assert.Equal(InboundDraftOutcome.Unavailable, (await request.Commands.ExecuteAsync(UnobservedSave(), token)).Outcome);
        Assert.Equal(InboundDraftOutcome.Unavailable, (await request.Commands.ReconcileAsync(UnobservedSave(), token)).Outcome);
        Assert.Empty(sessions.Observations); Assert.Equal(0, db.FactoryCalls); Assert.Empty(db.Commands);
    }

    [Fact]
    public async Task Cancellation_after_reservation_keeps_the_original_operation_unknown_and_never_dispatches_on_reconcile()
    {
        var db = Model(); var real = await RealSession();
        using var cancellation = new CancellationTokenSource();
        InboundDraftCommand original;
        using (var host = new Harness(Factory(db), real.Sessions))
        using (var request = host.Request(real.Session, cancellation.Token))
        {
            original = await Save(request.Commands);
            db.OnEvent = name => { if (name == "reserve-commit-ack") cancellation.Cancel(); };
            var result = await request.Commands.ExecuteAsync(original);
            Assert.Equal(InboundDraftOutcome.OutcomeUnknown, result.Outcome); Assert.Null(result.Receipt);
        }
        db.OnEvent = null;
        Assert.Equal(0, db.BusinessWrites); Assert.Equal(1, db.CommitAcks);
        Assert.Equal(0, Assert.Single(db.Journal.Rows.Cast<DataRow>())["State"]);
        Assert.Equal(original.OperationId, db.Journal.Rows[0]["OperationId"]);
        var before = Snapshot(db); db.Commands.Clear(); db.Events.Clear();
        using var freshHost = new Harness(Factory(db), real.Sessions); using var freshRequest = freshHost.Request(real.Session);
        var reconcile = await freshRequest.Commands.ReconcileAsync(original);
        Assert.Equal(InboundDraftOutcome.OutcomeUnknown, reconcile.Outcome); Assert.Null(reconcile.Receipt);
        Assert.Equal("operation_pending_reconcile_only", reconcile.Code);
        Assert.Equal(before, Snapshot(db)); AssertReconcileOnly(db); Assert.Equal(0, db.BusinessWrites);
    }

    [Fact]
    public async Task Lost_business_commit_ack_reconciles_the_original_receipt_without_another_dispatch()
    {
        var db = Model(); var real = await RealSession();
        using var host = new Harness(Factory(db), real.Sessions); using var request = host.Request(real.Session);
        var original = (await Save(request.Commands)) with
        {
            Header = InboundModel.Header with { Notes = "committed without acknowledgement" },
            DetailUpserts = [InboundModel.Detail with { LotNumberByDocument = "original intent" }]
        };
        db.Fault = "business-commit-ack";
        var unknown = await request.Commands.ExecuteAsync(original);
        Assert.Equal(InboundDraftOutcome.OutcomeUnknown, unknown.Outcome); Assert.Null(unknown.Receipt);
        Assert.Equal("commit_ack_unknown_reconcile_only", unknown.Code);
        Assert.Equal(2, db.CommitAcks); Assert.Equal(1, Assert.Single(db.Journal.Rows.Cast<DataRow>())["State"]);
        Assert.Equal(original.OperationId, db.Journal.Rows[0]["OperationId"]);
        db.Fault = null;
        var before = Snapshot(db); var writes = db.BusinessWrites; db.Commands.Clear(); db.Events.Clear();
        var recovered = await request.Commands.ReconcileAsync(original);
        Assert.Equal(InboundDraftOutcome.Replayed, recovered.Outcome);
        Assert.Equal(original.OperationId, recovered.Receipt!.OperationId);
        Assert.Equal(db.Journal.Rows[0]["AuditId"], recovered.Receipt.AuditId);
        Assert.Equal(db.Journal.Rows[0]["AfterState"], recovered.Receipt.StateEqualityToken);
        var changed = await request.Commands.ReconcileAsync(original with { Header = original.Header! with { Notes = "different intent" } });
        Assert.Equal(InboundDraftOutcome.Conflict, changed.Outcome); Assert.Null(changed.Receipt);
        var absent = await request.Commands.ReconcileAsync(original with { OperationId = Guid.NewGuid() });
        Assert.Equal(InboundDraftOutcome.OutcomeUnknown, absent.Outcome); Assert.Null(absent.Receipt);
        Assert.Equal("operation_not_observed_no_dispatch", absent.Code);
        Assert.Equal(before, Snapshot(db)); Assert.Equal(writes, db.BusinessWrites); Assert.Equal(2, db.CommitAcks);
        AssertReconcileOnly(db);
    }

    [Fact]
    public async Task Observation_regression_after_reservation_is_denied_against_the_latest_version()
    {
        var db = Model(); var sessions = new StaticSessions(db.ActiveIdentity);
        using var host = new Harness(Factory(db), sessions); using var request = host.Request(Session(db.ActiveIdentity));
        var original = await Save(request.Commands);
        var call = 0;
        sessions.OnResolve = (token, _, _) => Task.FromResult<ResolvedSession?>(Session(db.ActiveIdentity with
        { AuthorityVersion = (++call) switch { 1 => 2, 2 => 4, _ => 3 } }, token));
        var result = await request.Commands.ExecuteAsync(original);
        Assert.Equal(InboundDraftOutcome.Denied, result.Outcome); Assert.Null(result.Receipt);
        Assert.Equal(3, call); Assert.Equal(0, db.BusinessWrites); Assert.Equal(1, db.CommitAcks);
        Assert.Equal(original.OperationId, Assert.Single(db.Journal.Rows.Cast<DataRow>())["OperationId"]);
        Assert.Equal(0, db.Journal.Rows[0]["State"]);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Same_scoped_wrapper_overlapping_real_session_reconciliations_have_independent_high_water_marks(bool committed)
    {
        var real = await RealSession(); var sessions = new GatedSnapshotSessions(real.Sessions); var db = Model();
        var original = UnobservedSave(); InboundDraftReceipt? receipt = null;
        if (committed)
        {
            using var seedHost = new Harness(Factory(db), real.Sessions); using var seedRequest = seedHost.Request(real.Session);
            original = await Save(seedRequest.Commands);
            var saved = await seedRequest.Commands.ExecuteAsync(original);
            Assert.Equal(InboundDraftOutcome.Committed, saved.Outcome); receipt = Assert.IsType<InboundDraftReceipt>(saved.Receipt);
        }
        using var host = new Harness(Factory(db), sessions); using var request = host.Request(real.Session);
        var before = Snapshot(db); var factories = db.FactoryCalls; var writes = db.BusinessWrites; var commits = db.CommitAcks;
        db.Commands.Clear(); db.Events.Clear();
        using var cancellation = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        Task<InboundDraftResult>? first = null, second = null;
        try
        {
            first = Task.Run(() => request.Commands.ReconcileAsync(original, cancellation.Token));
            var firstSnapshot = Assert.IsType<ResolvedSession>(await sessions.FirstCaptured.WaitAsync(cancellation.Token));
            second = Task.Run(() => request.Commands.ReconcileAsync(original, cancellation.Token));
            var secondSnapshot = Assert.IsType<ResolvedSession>(await sessions.SecondCaptured.WaitAsync(cancellation.Token));
            Assert.False(first.IsCompleted); Assert.False(second.IsCompleted); Assert.Empty(sessions.Delivered);
            Assert.Equal(factories, db.FactoryCalls); Assert.Empty(db.Commands);
            Assert.True(secondSnapshot.Identity.AuthorityVersion > firstSnapshot.Identity.AuthorityVersion);
            var poll = Assert.IsType<ResolvedSession>(await real.Sessions.ResolveAsync(real.Session.Token, false, cancellation.Token));
            Assert.True(poll.Identity.AuthorityVersion > secondSnapshot.Identity.AuthorityVersion);
            sessions.ReleaseSecond();
            var secondResult = await second.WaitAsync(cancellation.Token);
            Assert.Equal(committed ? InboundDraftOutcome.Replayed : InboundDraftOutcome.OutcomeUnknown, secondResult.Outcome);
            Assert.Equal(receipt, secondResult.Receipt);
            if (!committed) Assert.Equal("operation_not_observed_no_dispatch", secondResult.Code);
            Assert.False(first.IsCompleted);
            var secondObservations = sessions.Delivered;
            Assert.NotEmpty(secondObservations); Assert.Same(secondSnapshot, secondObservations[0].Session);
            Assert.Equal(factories + 1, db.FactoryCalls);
            if (committed)
            {
                Assert.Equal(3, secondObservations.Length);
                Assert.True(secondObservations[^1].Session!.Identity.AuthorityVersion > poll.Identity.AuthorityVersion);
            }
            // The first immutable snapshot is older than the second invocation's.
            // Releasing it now also prevents concurrent access to mutable DB doubles.
            sessions.ReleaseFirst();
            var firstResult = await first.WaitAsync(cancellation.Token);
            Assert.Equal(committed ? InboundDraftOutcome.Replayed : InboundDraftOutcome.OutcomeUnknown, firstResult.Outcome);
            Assert.Equal(receipt, firstResult.Receipt);
            if (!committed) Assert.Equal("operation_not_observed_no_dispatch", firstResult.Code);
            var firstObservations = sessions.Delivered.Skip(secondObservations.Length).ToArray();
            Assert.NotEmpty(firstObservations); Assert.Same(firstSnapshot, firstObservations[0].Session);
            AssertActualIncreasingObservations(firstObservations, real.Session);
            AssertActualIncreasingObservations(secondObservations, real.Session);
            Assert.Equal(committed ? 3 : 1, firstObservations.Length);
            Assert.Equal(factories + 2, db.FactoryCalls); Assert.Equal(before, Snapshot(db)); AssertReconcileOnly(db);
            Assert.Equal(writes, db.BusinessWrites); Assert.Equal(commits, db.CommitAcks);
        }
        finally
        {
            cancellation.Cancel(); sessions.ReleaseSecond(); sessions.ReleaseFirst();
            try { await Task.WhenAll(new[] { first, second }.OfType<Task<InboundDraftResult>>()).WaitAsync(TimeSpan.FromSeconds(10)); }
            catch (OperationCanceledException) { }
        }
    }

    private const string Document = "DOC-IN-1";
    private static readonly string TokenA = new('A', 64), TokenB = new('B', 64);
    private static readonly Guid Binding = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly LegacyCompany Company = new(InboundModel.Identity.TenantId, InboundModel.Identity.CompanyId, "Synthetic");
    private static InboundDraftCommandRuntimeAcceptance Acceptance(bool newSend = true) => new(Binding, Company.TenantId,
        Company.CompanyId, "synthetic-I31-test-only-not-target-acceptance", newSend ? "synthetic-Send-test-only-not-target-acceptance" : null);
    private static InboundModel Model()
    {
        var db = new InboundModel(); var source = new InboundAuthorityComparison(db);
        source.Direct.Add(new("sample-user", "07011")); return db;
    }
    private static InboundDraftCommandFactory Factory(InboundModel db, bool newSend = true) =>
        new(Binding, Company, (Func<DbConnection>)db.NewConnection, Acceptance(newSend));
    private static ResolvedSession Session(AuthoritativeIdentity identity, string? token = null) => new(token ?? TokenA, identity,
        new(identity.DisplayName, identity.TenantId, identity.CompanyId, identity.CompanyName, identity.AuthorityVersion,
            new DateTimeOffset(2026, 10, 7, 0, 0, 0, TimeSpan.Zero), new DateTimeOffset(2026, 10, 8, 0, 0, 0, TimeSpan.Zero), identity.Capabilities));
    private static InboundDraftCommand UnobservedSave() => new(Guid.NewGuid(), InboundDraftAction.Save, Document, new string('A', 64), InboundModel.Header);
    private static async Task<InboundDraftCommand> Save(IInboundDraftCommandService commands)
    {
        var read = await commands.ReadAsync(Document); Assert.Equal(InboundDraftOutcome.Observed, read.Outcome);
        return new(Guid.NewGuid(), InboundDraftAction.Save, Document, read.Document!.StateEqualityToken, read.Document.Header);
    }
    private static void AssertAdmitted(InboundDraftAuthority? result, bool send = true)
    {
        var authority = Assert.IsType<InboundDraftAuthority>(result);
        Assert.Equal(Binding, authority.DatabaseBindingId); Assert.Equal(Document, authority.DocumentId);
        Assert.Equal("BR-A", authority.BranchId); Assert.True(authority.Available); Assert.True(authority.UpdateGranted);
        Assert.Equal(send, authority.SendGranted);
    }
    private static string Snapshot(InboundModel db) => JsonSerializer.Serialize(new
    {
        Tables = db.Tables.Select(table => table.Rows.Cast<DataRow>().Select(row => row.ItemArray).ToArray()).ToArray(),
        Journal = db.Journal.Rows.Cast<DataRow>().Select(row => row.ItemArray).ToArray()
    });
    private static void AssertReadOnly(InboundModel db)
    {
        Assert.All(db.Commands, command =>
        {
            Assert.NotNull(command.Transaction); Assert.Equal(IsolationLevel.Serializable, command.Transaction!.IsolationLevel);
            Assert.DoesNotContain("inbound:reserve", command.CommandText, StringComparison.Ordinal);
            Assert.DoesNotContain("inbound:record", command.CommandText, StringComparison.Ordinal);
            Assert.DoesNotContain("inbound:create", command.CommandText, StringComparison.Ordinal);
            Assert.DoesNotContain("inbound:header", command.CommandText, StringComparison.Ordinal);
            Assert.DoesNotContain("inbound:detail-", command.CommandText, StringComparison.Ordinal);
            Assert.DoesNotContain("inbound:amounts", command.CommandText, StringComparison.Ordinal);
            Assert.DoesNotContain("inbound:send", command.CommandText, StringComparison.Ordinal);
            Assert.DoesNotContain("inbound:legacy-log", command.CommandText, StringComparison.Ordinal);
        });
        foreach (var mutation in new[] { "reserve", "record", "create", "header", "detail-insert", "detail-update", "detail-delete", "amounts", "send", "legacy-log", "reserve-commit-before", "business-commit-before" })
            Assert.DoesNotContain(mutation, db.Events);
    }
    private static void AssertReconcileOnly(InboundModel db)
    {
        AssertReadOnly(db);
        Assert.DoesNotContain("snapshot-before", db.Events); Assert.DoesNotContain("snapshot-after", db.Events);
    }
    private static void AssertActualIncreasingObservations(IEnumerable<SessionObservation> observations, ResolvedSession anchor)
    {
        var previous = anchor.Identity.AuthorityVersion;
        foreach (var observation in observations)
        {
            Assert.Equal(anchor.Token, observation.Token); Assert.False(observation.UserInteraction);
            var live = Assert.IsType<ResolvedSession>(observation.Session); Assert.Equal(anchor.Token, live.Token);
            Assert.True(live.Identity.AuthorityVersion > previous); previous = live.Identity.AuthorityVersion;
        }
    }
    private static void Change(RealInboundSession real, InboundModel db, string change)
    {
        switch (change)
        {
            case "logout": real.Sessions.Revoke(real.Session.Token); break;
            case "expiry": real.Clock.Advance(TimeSpan.FromMinutes(11)); break;
            case "branch": real.Users.Branches = ["BR-B"]; break;
            case "capabilities": real.Users.Capabilities = []; break;
            case "credential": real.Users.StoredHash = "changed-synthetic-stored-hash"; break;
            case "native-update": db.SourceAuthority!.Direct[0] = new("sample-user", "07011", Update: false); break;
            default: throw new ArgumentOutOfRangeException(nameof(change));
        }
    }
    private static async Task<RealInboundSession> RealSession()
    {
        var users = new MutableInboundUsers(); var authority = new LegacyIdentityAuthority(users, new AcceptedPassword(), Company);
        var login = await authority.AuthenticateAsync("sample-user", "synthetic-password", default);
        Assert.Equal(IdentityOutcome.Success, login.Outcome); Assert.NotNull(login.Identity);
        var clock = new TestClock();
        var sessions = new LocalWebSessions(authority, clock, new WebSessionPolicy(TimeSpan.FromMinutes(10), TimeSpan.FromMinutes(30), 20));
        var created = Assert.IsType<ResolvedSession>(sessions.Create(login.Identity!));
        // The server middleware has already revalidated this token once.
        var session = Assert.IsType<ResolvedSession>(await sessions.ResolveAsync(created.Token, false, default));
        return new(users, sessions, session, clock);
    }
    private sealed record RealInboundSession(MutableInboundUsers Users, LocalWebSessions Sessions, ResolvedSession Session, TestClock Clock);
    private sealed class TestClock : TimeProvider
    {
        private DateTimeOffset now = new(2026, 10, 6, 0, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => now;
        internal void Advance(TimeSpan duration) => now += duration;
    }
    private sealed class AcceptedPassword : ILegacyPasswordVerifier
    {
        public Task<PasswordOutcome> VerifyAsync(string username, string password, string storedHash, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            return Task.FromResult(username == "sample-user" && password == "synthetic-password" && storedHash == InboundAuthorityComparison.Password
                ? PasswordOutcome.Accepted : PasswordOutcome.Rejected);
        }
    }
    private sealed class MutableInboundUsers : ILegacyUserStore
    {
        internal string StoredHash = InboundAuthorityComparison.Password;
        internal IReadOnlyList<string> Capabilities = ["inbound-requests.read"];
        internal IReadOnlyList<string> Branches = ["BR-A", "BR-B"];
        public Task<LegacyUser?> FindAsync(string username, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            return Task.FromResult<LegacyUser?>(username == "sample-user"
                ? new("sample-user", "Synthetic actor", StoredHash, false, "GROUP-A", true, Capabilities, Branches) : null);
        }
    }
    private sealed record SessionObservation(string Token, bool UserInteraction, ResolvedSession? Session);
    private sealed class RecordingSessions(IWebSessions inner) : IWebSessions
    {
        internal readonly List<SessionObservation> Observations = [];
        public ResolvedSession? Create(AuthoritativeIdentity identity) => inner.Create(identity);
        public void Revoke(string token) => inner.Revoke(token);
        public async Task<ResolvedSession?> ResolveAsync(string token, bool userInteraction, CancellationToken cancellationToken)
        {
            var current = await inner.ResolveAsync(token, userInteraction, cancellationToken);
            Observations.Add(new(token, userInteraction, current)); return current;
        }
    }
    private sealed class StaticSessions(AuthoritativeIdentity identity) : IWebSessions
    {
        internal readonly List<SessionObservation> Observations = [];
        internal Func<string, int, CancellationToken, Task<ResolvedSession?>>? OnResolve;
        private int calls;
        public ResolvedSession? Create(AuthoritativeIdentity current) => throw new NotSupportedException();
        public void Revoke(string token) => throw new NotSupportedException();
        public async Task<ResolvedSession?> ResolveAsync(string token, bool userInteraction, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested(); Assert.False(userInteraction); calls++;
            var current = OnResolve is null ? Session(identity with { AuthorityVersion = identity.AuthorityVersion + calls }, token)
                : await OnResolve(token, calls, cancellationToken);
            Observations.Add(new(token, userInteraction, current)); return current;
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
            var current = await inner.ResolveAsync(token, userInteraction, cancellationToken);
            if (call == 1) { firstCaptured.TrySetResult(current); await firstRelease.Task.WaitAsync(cancellationToken); }
            else if (call == 2) { secondCaptured.TrySetResult(current); await secondRelease.Task.WaitAsync(cancellationToken); }
            delivered.Enqueue(new(token, userInteraction, current)); return current;
        }
    }
    private sealed class Harness : IDisposable
    {
        private readonly ServiceProvider provider;
        internal Harness(InboundDraftCommandFactory? factory, IWebSessions sessions)
        {
            var services = new ServiceCollection(); services.AddSingleton(sessions); services.AddDormantInboundDraftCommands(factory);
            provider = services.BuildServiceProvider(new ServiceProviderOptions { ValidateScopes = true, ValidateOnBuild = true });
        }
        internal RequestServices Request(ResolvedSession session, CancellationToken aborted = default, Action<HttpContext>? alter = null)
        {
            var scope = provider.CreateScope();
            var context = new DefaultHttpContext { RequestServices = scope.ServiceProvider, User = AuthEndpoints.Principal(session), RequestAborted = aborted };
            context.Items[AuthEndpoints.ResolvedKey] = session; alter?.Invoke(context);
            provider.GetRequiredService<IHttpContextAccessor>().HttpContext = context;
            return new(scope, session, scope.ServiceProvider.GetRequiredService<IInboundDraftCommandService>(),
                scope.ServiceProvider.GetRequiredService<IInboundDraftCommandAccess>());
        }
        public void Dispose() { provider.GetRequiredService<IHttpContextAccessor>().HttpContext = null; provider.Dispose(); }
    }
    private sealed record RequestServices(IServiceScope Scope, ResolvedSession Session,
        IInboundDraftCommandService Commands, IInboundDraftCommandAccess Access) : IDisposable
    { public void Dispose() => Scope.Dispose(); }
}
