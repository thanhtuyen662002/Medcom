using System.Data;
using System.Data.Common;
using System.Diagnostics.CodeAnalysis;
using System.Text.Json;
using Medcom.Api;
using Medcom.Application;
using Medcom.Application.PurchaseRequests;
using Medcom.Contracts;
using Medcom.Infrastructure;
using Medcom.Infrastructure.PurchaseRequests;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Data.SqlClient;
using Xunit;

namespace Medcom.Api.Tests;

// Synthetic providers only. This proves bounded composition, not SQL Server runtime acceptance.
public sealed class PurchaseRequestPilotAuthorizationTests
{
    private static readonly DateTimeOffset Start = new(2026, 10, 8, 12, 0, 0, TimeSpan.Zero);
    private static PurchaseRequestPilotAuthorization Permit(string server = "Synthetic", string database = "Synthetic",
        Guid? binding = null, string? actor = null, string? branch = null, string? document = null,
        DateTimeOffset? starts = null, DateTimeOffset? expires = null) => new(server, database,
            binding ?? PurchaseFixtures.Binding, PurchaseFixtures.Company.TenantId, PurchaseFixtures.Company.CompanyId,
            actor ?? PurchaseFixtures.Actor, branch ?? "B1", document ?? PurchaseFixtures.DocumentId,
            "synthetic-owner-approval-only-NOT-runtime-acceptance", starts ?? Start, expires ?? Start.AddHours(1));
    private static PurchaseRequestCommandFactory Factory(PurchaseRecordingModel db, PilotClock clock,
        PurchaseRequestPilotAuthorization? permit = null) => PurchaseRequestCommandFactory.ForOwnerAuthorizedPilot(
            permit ?? Permit(), PurchaseFixtures.Company,
            (Func<DbConnection>)(() => new PurchaseRecordingConnection(db, db.Connections++)), clock);
    private static Task<AuthoritativeIdentity?> Resolve(CancellationToken token) => Task.FromResult<AuthoritativeIdentity?>(PurchaseFixtures.Identity());
    private static IPurchaseRequestCommands Commands(PurchaseRecordingModel db, PilotClock clock,
        PurchaseRequestPilotAuthorization? permit = null, Func<CancellationToken, Task<AuthoritativeIdentity?>>? resolve = null) =>
        Factory(db, clock, permit).CreatePilotCommands(resolve ?? Resolve, resolve ?? Resolve);
    private static SavePurchaseRequestDraft Save(PurchaseRecordingModel db) => new("pilot-save", "B1", PurchaseFixtures.DocumentId,
        PurchaseRequestCommandRules.EqualityToken(db.Documents[PurchaseFixtures.DocumentId]),
        PurchaseFixtures.Header with { Notes = "Synthetic pilot change" }, []);
    private static void NoEffects(PurchaseRecordingModel db)
    {
        Assert.Empty(db.Journal); Assert.Equal(0, db.Commits); Assert.Equal(0, db.AllocatorCalls);
        Assert.DoesNotContain(db.Commands, command => command.CommandText == PurchaseRequestSql.UpdateHeadText
            || command.CommandText == PurchaseRequestSql.UpdateLineText || command.CommandText == PurchaseRequestSql.SubmitText
            || command.CommandText == PurchaseRequestSql.InsertHeadText || command.CommandText == PurchaseRequestSql.InsertLineText
            || command.CommandText == PurchaseRequestSql.DeleteLineText || command.CommandText == PurchaseRequestSql.ReserveText);
    }

    [Theory]
    [InlineData("server-empty")] [InlineData("server-wildcard")] [InlineData("server-injection")]
    [InlineData("server-space")] [InlineData("database-empty")] [InlineData("database-wildcard")]
    [InlineData("master")] [InlineData("localdb")] [InlineData("binding")]
    [InlineData("actor")] [InlineData("branch")] [InlineData("document")]
    [InlineData("zero-window")] [InlineData("reverse-window")] [InlineData("unbounded-window")]
    [InlineData("local-offset")]
    public void Authorization_requires_an_exact_scope_and_bounded_UTC_window(string invalid)
    {
        Assert.Throws<ArgumentException>(() => Permit(
            server: invalid switch { "server-empty" => "", "server-wildcard" => "*.example", "server-injection" => "host;Password=x",
                "server-space" => " Synthetic", "localdb" => "(localdb)\\test", _ => "Synthetic" },
            database: invalid switch { "database-empty" => "", "database-wildcard" => "*", "master" => "master", _ => "Synthetic" },
            binding: invalid == "binding" ? Guid.Empty : null, actor: invalid == "actor" ? "" : null,
            branch: invalid == "branch" ? "" : null, document: invalid == "document" ? "" : null,
            starts: invalid == "local-offset" ? Start.ToOffset(TimeSpan.FromHours(7)) : null,
            expires: invalid switch { "zero-window" => Start, "reverse-window" => Start.AddMinutes(-1),
                "unbounded-window" => Start.AddHours(8).AddTicks(1), _ => null }));
    }

    [Fact]
    public async Task Pilot_never_confers_production_acceptance_or_uses_dormant_production_entrypoints()
    {
        var db = new PurchaseRecordingModel(); db.Seed(); var clock = new PilotClock(Start);
        var factory = Factory(db, clock); var calls = 0;
        Task<AuthoritativeIdentity?> Session(CancellationToken _) { calls++; return Resolve(default); }
        Assert.False(factory.RuntimeAccepted); Assert.True(factory.IsOwnerAuthorizedPilot);
        Assert.Equal(PurchaseRequestCommandOutcome.Unavailable, (await factory.CreateCommands(Session, Session).SaveAsync(Save(db))).Outcome);
        Assert.Equal(PurchaseRequestCommandAuthorityOutcome.Unavailable,
            await factory.CreateAuthorityReader(Session, Session).ReadAsync(PurchaseFixtures.DocumentId, "B1"));
        var services = new ServiceCollection(); services.AddDormantPurchaseRequestCommands(factory);
        using var provider = services.BuildServiceProvider(); using var scope = provider.CreateScope();
        Assert.Equal(PurchaseRequestCommandOutcome.Unavailable,
            (await scope.ServiceProvider.GetRequiredService<IPurchaseRequestCommands>().SaveAsync(Save(db))).Outcome);
        Assert.Equal(0, calls); Assert.Equal(0, db.Connections); NoEffects(db);
    }

    [Fact]
    public async Task Production_factory_cannot_be_relabelled_as_a_pilot()
    {
        var db = new PurchaseRecordingModel(); db.Seed();
        var factory = new PurchaseRequestCommandFactory(PurchaseFixtures.Binding, PurchaseFixtures.Company,
            (Func<DbConnection>)(() => new PurchaseRecordingConnection(db, db.Connections++)));
        Assert.False(factory.IsOwnerAuthorizedPilot);
        Assert.Throws<ArgumentException>(() => new ServiceCollection().AddOwnerAuthorizedPurchaseRequestPilotCommands(factory));
        Assert.Equal(PurchaseRequestCommandOutcome.Unavailable, (await factory.CreatePilotCommands(Resolve, Resolve).SaveAsync(Save(db))).Outcome);
        Assert.Equal(PurchaseRequestCommandAuthorityOutcome.Unavailable,
            await factory.CreatePilotAuthorityReader(Resolve, Resolve).ReadAsync(PurchaseFixtures.DocumentId, "B1"));
        Assert.Equal(0, db.Connections); NoEffects(db);
    }

    [Theory]
    [InlineData("create")] [InlineData("add")] [InlineData("remove")] [InlineData("document")]
    [InlineData("branch")] [InlineData("expired")] [InlineData("not-started")]
    public async Task Out_of_pilot_commands_fail_before_any_connection_or_reservation(string denied)
    {
        var db = new PurchaseRecordingModel(); db.Seed(); var clock = new PilotClock(Start);
        if (denied == "expired") clock.Now = Start.AddHours(1);
        if (denied == "not-started") clock.Now = Start.AddTicks(-1);
        var save = Save(db);
        if (denied is "add" or "remove") save = save with { LineChanges = [denied == "add"
            ? new(PurchaseRequestLineChangeKind.Add, null, "new", PurchaseFixtures.Values)
            : new(PurchaseRequestLineChangeKind.Remove, "line-1", null, null)] };
        if (denied == "document") save = save with { PurchaseRequestId = "another-document" };
        if (denied == "branch") save = save with { BranchId = "B2" };
        var commands = Commands(db, clock);
        var result = denied == "create" ? await commands.CreateAsync(PurchaseFixtures.Create) : await commands.SaveAsync(save);
        Assert.Equal(PurchaseRequestCommandOutcome.Denied, result.Outcome); Assert.Null(result.Receipt);
        Assert.Equal(0, db.Connections); NoEffects(db);
    }

    [Theory]
    [InlineData("actor")] [InlineData("tenant")] [InlineData("company")] [InlineData("branch")]
    public async Task Pinned_identity_cannot_be_borrowed_from_another_authenticated_scope(string changed)
    {
        var db = new PurchaseRecordingModel(); db.Seed();
        var id = PurchaseFixtures.Identity(); id = changed switch { "actor" => id with { PrincipalId = "other" },
            "tenant" => id with { TenantId = "other" }, "company" => id with { CompanyId = "other" }, _ => id with { BranchIds = ["B2"] } };
        Task<AuthoritativeIdentity?> Session(CancellationToken _) => Task.FromResult<AuthoritativeIdentity?>(id);
        Assert.Equal(PurchaseRequestCommandOutcome.Denied,
            (await Commands(db, new(Start), resolve: Session).SaveAsync(Save(db))).Outcome);
        Assert.Equal(0, db.Connections); NoEffects(db);
    }

    [Theory]
    [InlineData("server")] [InlineData("database")]
    public async Task Wrong_connection_target_is_rejected_before_Open_for_reader_and_writer(string mismatch)
    {
        var permit = Permit(server: mismatch == "server" ? "other" : "Synthetic", database: mismatch == "database" ? "other" : "Synthetic");
        var db = new PurchaseRecordingModel(); db.Seed();
        Assert.Equal(PurchaseRequestCommandOutcome.Unavailable,
            (await Commands(db, new(Start), permit).SaveAsync(Save(db))).Outcome);
        Assert.Empty(db.Events); NoEffects(db);
        var reader = new I22AdmissionModel();
        var factory = PurchaseRequestCommandFactory.ForOwnerAuthorizedPilot(permit, PurchaseFixtures.Company, (Func<DbConnection>)reader.NewConnection, new PilotClock(Start));
        Assert.Equal(PurchaseRequestCommandAuthorityOutcome.Unavailable,
            await factory.CreatePilotAuthorityReader(reader.Resolve, reader.Inspect).ReadAsync(PurchaseFixtures.DocumentId, "B1"));
        Assert.Equal(0, reader.Opens); reader.AssertReadOnly();
    }

    [Fact]
    public async Task Actual_database_binding_probe_and_local_inspector_remain_mandatory()
    {
        var db = new PurchaseRecordingModel(); db.Seed(); var clock = new PilotClock(Start);
        var factory = Factory(db, clock);
        Assert.Equal(PurchaseRequestCommandOutcome.Unavailable, (await factory.CreatePilotCommands(Resolve).SaveAsync(Save(db))).Outcome);
        Assert.Equal(PurchaseRequestCommandAuthorityOutcome.Unavailable,
            await factory.CreatePilotAuthorityReader(Resolve).ReadAsync(PurchaseFixtures.DocumentId, "B1"));
        Assert.Equal(0, db.Connections);
        Assert.Equal(PurchaseRequestCommandOutcome.QualificationRequired,
            (await Commands(db, clock, Permit(binding: Guid.NewGuid())).SaveAsync(Save(db))).Outcome);
        NoEffects(db);
    }

    [Theory]
    [InlineData("actor", true, true)] [InlineData("actor", true, false)] [InlineData("actor", false, true)]
    [InlineData("group", true, true)] [InlineData("group", true, false)] [InlineData("group", false, true)]
    [InlineData("delegation", true, true)] [InlineData("delegation", true, false)] [InlineData("delegation", false, true)]
    public async Task Pilot_admission_retains_native_Run_AND_Update(string route, bool run, bool update)
    {
        var db = new I22AdmissionModel { Grants = [new(PurchaseGrantFixture.For(route, "exact"), run, update)] };
        var factory = PurchaseRequestCommandFactory.ForOwnerAuthorizedPilot(Permit(), PurchaseFixtures.Company, (Func<DbConnection>)db.NewConnection, new PilotClock(Start));
        var outcome = await factory.CreatePilotAuthorityReader(db.Resolve, db.Inspect).ReadAsync(PurchaseFixtures.DocumentId, "B1");
        Assert.Equal(run && update ? PurchaseRequestCommandAuthorityOutcome.Admitted : PurchaseRequestCommandAuthorityOutcome.Denied, outcome);
        Assert.False(factory.RuntimeAccepted); db.AssertReadOnly();
    }

    [Theory]
    [InlineData("foreign")] [InlineData("isolation")] [InlineData("rollback")]
    [InlineData("transaction-dispose")] [InlineData("connection-dispose")]
    public async Task Pilot_reader_retains_transaction_ownership_and_cleanup_fail_closed(string fault)
    {
        var db = new I22AdmissionModel { ForeignTransaction = fault == "foreign", WrongIsolation = fault == "isolation",
            FaultAt = fault is "foreign" or "isolation" ? null : fault };
        var factory = PurchaseRequestCommandFactory.ForOwnerAuthorizedPilot(Permit(), PurchaseFixtures.Company, (Func<DbConnection>)db.NewConnection, new PilotClock(Start));
        Assert.Equal(PurchaseRequestCommandAuthorityOutcome.Unavailable,
            await factory.CreatePilotAuthorityReader(db.Resolve, db.Inspect).ReadAsync(PurchaseFixtures.DocumentId, "B1"));
        db.AssertReadOnly();
    }

    [Theory]
    [InlineData(1, true)] [InlineData(2, true)] [InlineData(3, true)] [InlineData(4, false)]
    public async Task No_state_four_or_locked_draft_extension_is_admitted(int status, bool locked)
    {
        var db = new PurchaseRecordingModel(); db.Seed();
        db.Documents[PurchaseFixtures.DocumentId] = db.Documents[PurchaseFixtures.DocumentId] with { StatusId = status, IsLocked = locked };
        Assert.Equal(PurchaseRequestCommandOutcome.Conflict, (await Commands(db, new(Start)).SaveAsync(Save(db))).Outcome);
        NoEffects(db);
    }

    [Theory]
    [InlineData("reservation-ack")] [InlineData("business-before-commit")]
    public async Task Expiry_after_reservation_never_replaces_intent_or_commits_business_changes(string stage)
    {
        var db = new PurchaseRecordingModel(); db.Seed(); var before = db.Documents[PurchaseFixtures.DocumentId];
        var clock = new PilotClock(Start); var original = Save(db); var commands = Commands(db, clock);
        db.OnStep = (phase, name) => { if (stage == "reservation-ack" ? phase == 0 && name == "commit-ack" : phase == 1 && name == "complete") clock.Now = Start.AddHours(1); };
        var result = await commands.SaveAsync(original);
        Assert.Equal(PurchaseRequestCommandOutcome.OutcomeUnknown, result.Outcome); Assert.Null(result.Receipt);
        Assert.Equal(PurchaseRequestCommandRules.IntentBytes(before), PurchaseRequestCommandRules.IntentBytes(db.Documents[PurchaseFixtures.DocumentId]));
        var pending = Assert.Single(db.Journal.Values); Assert.Equal(0, pending.State);
        Assert.Equal(PurchaseRequestCommandRules.IntentBytes(PurchaseRequestCommandRules.Freeze(original)), pending.Intent);
        var commits = db.Commits; var effects = db.Commands.Count(c => c.CommandText == PurchaseRequestSql.ReserveText);
        Assert.Equal(PurchaseRequestLookupOutcome.Pending, (await commands.LookupAsync(original)).Outcome);
        Assert.Equal(PurchaseRequestCommandOutcome.Denied, (await commands.SaveAsync(original)).Outcome);
        Assert.Equal(commits, db.Commits); Assert.Equal(effects, db.Commands.Count(c => c.CommandText == PurchaseRequestSql.ReserveText));
    }

    [Fact]
    public async Task Completed_original_receipt_remains_observable_after_write_expiry()
    {
        var db = new PurchaseRecordingModel(); db.Seed(); var clock = new PilotClock(Start);
        var original = Save(db); var factory = Factory(db, clock); var commands = factory.CreatePilotCommands(Resolve, Resolve);
        var result = await commands.SaveAsync(original); Assert.Equal(PurchaseRequestCommandOutcome.Committed, result.Outcome);
        clock.Now = Start.AddHours(1); Assert.False(factory.PilotWriteAllowed); Assert.False(factory.RuntimeAccepted);
        var commits = db.Commits; var before = db.Commands.Count;
        var lookup = await commands.LookupAsync(original); Assert.Equal(PurchaseRequestLookupOutcome.Committed, lookup.Outcome);
        Assert.Equal(JsonSerializer.Serialize(result.Receipt, PurchaseRequestCommandRules.Json),
            JsonSerializer.Serialize(lookup.Receipt, PurchaseRequestCommandRules.Json)); Assert.Equal(commits, db.Commits);
        var readPlans = new[] { PurchaseRequestSql.CredentialText, PurchaseRequestSql.GrantsText,
            PurchaseRequestSql.ProbeText, PurchaseRequestSql.TransactionText, PurchaseRequestSql.LookupText,
            PurchaseRequestSql.HeadText, PurchaseRequestSql.DetailsText, SqlLegacyBranchScope.NativeUserText,
            SqlLegacyBranchScope.RestrictedText, SqlLegacyBranchScope.CatalogShapeText, SqlLegacyBranchScope.CatalogText };
        Assert.All(db.Commands.Skip(before), c => Assert.Contains(c.CommandText, readPlans));
        Assert.Equal(PurchaseRequestCommandOutcome.Denied, (await commands.SubmitAsync(new("pilot-submit", "B1", PurchaseFixtures.DocumentId, result.Receipt!.StateToken))).Outcome);
    }

    [Theory]
    [InlineData(false)] [InlineData(true)]
    public async Task Existing_session_fence_accepts_increases_but_rejects_regression(bool regress)
    {
        var db = new PurchaseRecordingModel(); db.Seed(); var calls = 0;
        Task<AuthoritativeIdentity?> Session(CancellationToken _) { calls++; return Task.FromResult<AuthoritativeIdentity?>(PurchaseFixtures.Identity(regress && calls >= 3 ? 1 : calls)); }
        var result = await Commands(db, new(Start), resolve: Session).SaveAsync(Save(db));
        Assert.Equal(regress ? PurchaseRequestCommandOutcome.OutcomeUnknown : PurchaseRequestCommandOutcome.Committed, result.Outcome);
        if (regress) Assert.DoesNotContain(db.Commands, c => c.CommandText == PurchaseRequestSql.UpdateHeadText);
    }

    [Fact]
    public async Task Original_lookup_rejects_out_of_scope_documents_without_attempting_a_write()
    {
        var db = new PurchaseRecordingModel(); db.Seed(); var commands = Commands(db, new(Start));
        Assert.Equal(PurchaseRequestLookupOutcome.Denied, (await commands.LookupAsync(Save(db) with { PurchaseRequestId = "other" })).Outcome);
        Assert.Equal(PurchaseRequestLookupOutcome.Denied, (await commands.LookupAsync(PurchaseFixtures.Create)).Outcome);
        Assert.Equal(0, db.Connections); NoEffects(db);
    }

    [Theory]
    [InlineData("Failover Partner=other")] [InlineData("AttachDBFilename=synthetic.mdf")]
    [InlineData("User Instance=true")] [InlineData("ApplicationIntent=ReadOnly")]
    public void Sql_routing_or_file_options_cannot_inherit_a_target_permission(string option)
    {
        // A closed provider object only; never Open or any server command.
        using var connection = new SqlConnection("Server=Synthetic;Database=Synthetic;Integrated Security=true;" + option);
        Assert.Throws<InvalidOperationException>(() => Permit().VerifyTarget(connection));
        Assert.Equal(ConnectionState.Closed, connection.State);
    }

    [Fact]
    public async Task Target_is_checked_again_after_Open_before_any_transaction()
    {
        var db = new PurchaseRecordingModel(); db.Seed(); var connection = new ChangedTargetConnection();
        var factory = PurchaseRequestCommandFactory.ForOwnerAuthorizedPilot(Permit(), PurchaseFixtures.Company,
            (Func<DbConnection>)(() => connection), new PilotClock(Start));
        Assert.Equal(PurchaseRequestCommandOutcome.Unavailable,
            (await factory.CreatePilotCommands(Resolve, Resolve).SaveAsync(Save(db))).Outcome);
        Assert.Equal(1, connection.Opens); Assert.Equal(0, connection.Begins); Assert.True(connection.WasDisposed);
    }

    [Fact]
    public async Task Pilot_reader_rejects_wrong_document_branch_and_unstarted_window_before_sessions()
    {
        var db = new I22AdmissionModel(); var clock = new PilotClock(Start);
        var factory = PurchaseRequestCommandFactory.ForOwnerAuthorizedPilot(Permit(), PurchaseFixtures.Company,
            (Func<DbConnection>)db.NewConnection, clock);
        var reader = factory.CreatePilotAuthorityReader(db.Resolve, db.Inspect);
        Assert.Equal(PurchaseRequestCommandAuthorityOutcome.Denied, await reader.ReadAsync("other", "B1"));
        Assert.Equal(PurchaseRequestCommandAuthorityOutcome.Denied, await reader.ReadAsync(PurchaseFixtures.DocumentId, "B2"));
        clock.Now = Start.AddTicks(-1);
        Assert.Equal(PurchaseRequestCommandAuthorityOutcome.Denied, await reader.ReadAsync(PurchaseFixtures.DocumentId, "B1"));
        Assert.Equal(0, db.SessionCalls); Assert.Equal(0, db.FactoryCalls);
    }

    [Fact]
    public void Pilot_company_cannot_be_changed_by_the_composing_host()
    {
        Assert.Throws<ArgumentException>(() => PurchaseRequestCommandFactory.ForOwnerAuthorizedPilot(Permit(),
            PurchaseFixtures.Company with { CompanyId = "other" }, (Func<DbConnection>)(() => throw new InvalidOperationException())));
    }

    [Fact]
    public async Task Cancellation_and_ambient_transactions_fail_before_connection_creation()
    {
        var db = new PurchaseRecordingModel(); db.Seed(); var commands = Commands(db, new(Start));
        using var cancelled = new CancellationTokenSource(); cancelled.Cancel();
        Assert.Equal(PurchaseRequestCommandOutcome.Cancelled, (await commands.SaveAsync(Save(db), cancelled.Token)).Outcome);
        using (var ambient = new System.Transactions.TransactionScope(System.Transactions.TransactionScopeAsyncFlowOption.Enabled))
            Assert.Equal(PurchaseRequestCommandOutcome.Unavailable, (await commands.SaveAsync(Save(db))).Outcome);
        Assert.Equal(0, db.Connections); NoEffects(db);
    }

    private sealed class ChangedTargetConnection : DbConnection
    {
        private ConnectionState state;
        internal int Opens, Begins;
        internal bool WasDisposed;
        [AllowNull] public override string ConnectionString { get; set; } = "";
        public override string Database => "Synthetic";
        public override string DataSource => state == ConnectionState.Closed ? "Synthetic" : "other";
        public override string ServerVersion => "Synthetic";
        public override ConnectionState State => state;
        public override void Open() { Opens++; state = ConnectionState.Open; }
        public override void Close() => state = ConnectionState.Closed;
        public override void ChangeDatabase(string databaseName) => throw new NotSupportedException();
        protected override DbTransaction BeginDbTransaction(IsolationLevel isolationLevel) { Begins++; throw new NotSupportedException(); }
        protected override DbCommand CreateDbCommand() => throw new NotSupportedException();
        protected override void Dispose(bool disposing) { WasDisposed = true; Close(); base.Dispose(disposing); }
    }

    private sealed class PilotClock(DateTimeOffset now) : TimeProvider
    {
        internal DateTimeOffset Now = now;
        public override DateTimeOffset GetUtcNow() => Now;
    }
}
