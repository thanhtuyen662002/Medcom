using System.Data;
using System.Data.Common;
using System.Diagnostics.CodeAnalysis;
using System.Globalization;
using Medcom.Application;
using Medcom.Application.PurchaseRequests;
using Medcom.Contracts;
using Medcom.Infrastructure.PurchaseRequests;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class PurchaseRequestCommandAdmissionTests
{
    [Theory]
    [InlineData("missing")] [InlineData("empty-binding")] [InlineData("binding")]
    [InlineData("tenant")] [InlineData("company")] [InlineData("evidence")]
    public async Task Default_off_or_mismatched_attestation_never_resolves_session_or_opens_SQL(string fault)
    {
        var db = new I22AdmissionModel();
        PurchaseRequestCommandRuntimeAcceptance? a = I22AdmissionModel.SyntheticAcceptance();
        a = fault switch {
            "missing" => null, "binding" => a with { DatabaseBindingId = Guid.NewGuid() },
            "tenant" => a with { TenantId = "other" }, "company" => a with { CompanyId = "other" },
            "evidence" => a with { EvidenceReference = "" }, _ => a };
        var factory = new PurchaseRequestCommandFactory(fault == "empty-binding" ? Guid.Empty : PurchaseFixtures.Binding,
            PurchaseFixtures.Company, (Func<DbConnection>)db.NewConnection, a);
        Assert.False(factory.RuntimeAccepted);
        Assert.Equal(PurchaseRequestCommandAuthorityOutcome.Unavailable,
            await factory.CreateAuthorityReader(db.Resolve).ReadAsync(PurchaseFixtures.DocumentId, "B1"));
        Assert.Equal(0, db.SessionCalls); Assert.Equal(0, db.FactoryCalls); Assert.Equal(0, db.Opens);
        db.AssertReadOnly();
    }

    [Theory]
    [InlineData("actor", true, true)] [InlineData("group", true, true)] [InlineData("delegation", true, true)]
    [InlineData("actor", true, false)] [InlineData("group", true, false)] [InlineData("delegation", true, false)]
    [InlineData("actor", false, true)] [InlineData("group", false, true)] [InlineData("delegation", false, true)]
    public async Task Only_one_native_route_with_both_Run_and_Update_grants_EDIT(string route, bool run, bool update)
    {
        var db = new I22AdmissionModel();
        db.Grants = [new(PurchaseGrantFixture.For(route, "exact"), run, update)];
        db.Identity = db.Identity with { Capabilities = ["purchase-requests.read"] };
        var outcome = await db.Reader().ReadAsync(PurchaseFixtures.DocumentId, "B1");
        Assert.Equal(run && update ? PurchaseRequestCommandAuthorityOutcome.Admitted : PurchaseRequestCommandAuthorityOutcome.Denied, outcome);
        Assert.True(db.GrantEvaluations > 0); db.AssertReadOnly();
        Assert.Contains(db.Commands, c => c.CommandText == PurchaseRequestSql.GrantsText);
    }

    [Fact]
    public async Task Split_grants_disabled_delegation_and_read_only_capability_do_not_create_EDIT()
    {
        foreach (var mode in new[] { "split", "disabled-delegation", "read-only" })
        {
            var db = new I22AdmissionModel();
            db.Identity = db.Identity with { Capabilities = ["purchase-requests.read"] };
            db.Grants = mode switch {
                "split" => [new(PurchaseGrantFixture.For("actor", "exact"), true, false),
                    new(PurchaseGrantFixture.For("group", "exact"), false, true)],
                "disabled-delegation" => [new(PurchaseGrantFixture.For("delegation", "exact"), true, true, false)],
                _ => [] };
            Assert.Equal(PurchaseRequestCommandAuthorityOutcome.Denied,
                await db.Reader().ReadAsync(PurchaseFixtures.DocumentId, "B1"));
            db.AssertReadOnly();
        }
        var nativeOnly = new I22AdmissionModel();
        nativeOnly.Identity = nativeOnly.Identity with { Capabilities = [] };
        Assert.Equal(PurchaseRequestCommandAuthorityOutcome.Admitted,
            await nativeOnly.Reader().ReadAsync(PurchaseFixtures.DocumentId, "B1"));
        nativeOnly.AssertReadOnly();
    }

    [Theory]
    [InlineData("actor", "case")] [InlineData("actor", "accent")] [InlineData("actor", "space")] [InlineData("actor", "zero")]
    [InlineData("group", "case")] [InlineData("group", "space")] [InlineData("group", "zero")]
    [InlineData("delegation", "case")] [InlineData("delegation", "space")] [InlineData("delegation", "zero")]
    [InlineData("delegation-permission-group", "zero")] [InlineData("delegation-enabled-group", "zero")]
    [InlineData("actor-menu", "space")] [InlineData("actor-menu", "zero")]
    public async Task Native_physical_grant_aliases_cannot_borrow_EDIT(string route, string alias)
    {
        var db = new I22AdmissionModel { Grants = [new(PurchaseGrantFixture.For(route, alias), true, true)] };
        Assert.Equal(PurchaseRequestCommandAuthorityOutcome.Denied,
            await db.Reader().ReadAsync(PurchaseFixtures.DocumentId, "B1"));
        db.AssertReadOnly();
    }

    [Theory]
    [InlineData("principal")] [InlineData("stamp")] [InlineData("user-disabled")] [InlineData("group-disabled")]
    [InlineData("group-null")] [InlineData("menu")] [InlineData("form")] [InlineData("parent")]
    [InlineData("menu-disabled")] [InlineData("parent-disabled")] [InlineData("parameters")]
    [InlineData("native-branch")] [InlineData("physical-branch")] [InlineData("missing-document")]
    public async Task Credential_native_scope_and_document_denials_release_no_authority(string fault)
    {
        var db = new I22AdmissionModel();
        db.Transform = (stage, table) =>
        {
            if (stage == "credential")
            {
                if (fault == "principal") table.Rows[0][0] = PurchaseFixtures.Actor.ToUpperInvariant();
                if (fault == "stamp") table.Rows[0][1] = "changed-synthetic-hash";
                if (fault == "user-disabled") table.Rows[0][2] = true;
                if (fault == "group-disabled") table.Rows[0][4] = true;
                if (fault == "group-null") table.Rows[0][3] = DBNull.Value;
            }
            if (stage == "grants")
            {
                if (fault == "menu") table.Rows[0][0] = "05011 ";
                if (fault == "form") table.Rows[0][1] = "AP_PurposeRequestListFrm ";
                if (fault == "parent") table.Rows[0][4] = "05 ";
                if (fault == "menu-disabled") table.Rows[0][3] = true;
                if (fault == "parent-disabled") table.Rows[0][5] = true;
                if (fault == "parameters") table.Rows[0][2] = "unexpected";
            }
            if (stage == "branches" && fault == "native-branch") table.Rows[0][0] = "B2";
            if (stage == "head" && fault == "physical-branch") table.Rows[0][13] = "B2";
            if (stage == "head" && fault == "missing-document") table.Rows.Clear();
            return table;
        };
        Assert.Equal(fault == "group-null" ? PurchaseRequestCommandAuthorityOutcome.Unavailable : PurchaseRequestCommandAuthorityOutcome.Denied,
            await db.Reader().ReadAsync(PurchaseFixtures.DocumentId, "B1"));
        Assert.Equal(1, db.Rollbacks); Assert.Equal(1, db.ConnectionDisposals); db.AssertReadOnly();
    }

    [Theory]
    [InlineData("head", "case")] [InlineData("head", "accent")] [InlineData("head", "space")] [InlineData("head", "zero")]
    [InlineData("details", "case")] [InlineData("details", "accent")] [InlineData("details", "space")] [InlineData("details", "zero")]
    [InlineData("branch", "case")] [InlineData("branch", "space")] [InlineData("branch", "zero")]
    public async Task Physical_master_child_and_branch_aliases_are_rejected(string kind, string alias)
    {
        var db = new I22AdmissionModel();
        db.Transform = (stage, table) =>
        {
            if (stage == "head" && kind == "head") table.Rows[0][0] = PurchaseSqlComparisonModel.Alias(PurchaseFixtures.DocumentId, alias);
            if (stage == "head" && kind == "branch") table.Rows[0][13] = alias == "case" ? "b1" : PurchaseSqlComparisonModel.Alias("B1", alias);
            if (stage == "details" && kind == "details") table.Rows[0][8] = PurchaseSqlComparisonModel.Alias(PurchaseFixtures.DocumentId, alias);
            return table;
        };
        Assert.Equal(PurchaseRequestCommandAuthorityOutcome.Denied,
            await db.Reader().ReadAsync(PurchaseFixtures.DocumentId, "B1"));
        db.AssertReadOnly();
    }

    [Theory]
    [InlineData("tenant")] [InlineData("company")] [InlineData("branch")] [InlineData("logout")]
    public async Task Initial_live_scope_denial_opens_nothing(string fault)
    {
        var db = new I22AdmissionModel();
        db.SessionObservation = _ => fault switch {
            "tenant" => db.Identity with { TenantId = "other" }, "company" => db.Identity with { CompanyId = "other" },
            "branch" => db.Identity with { BranchIds = ["B2"] }, _ => null };
        Assert.Equal(PurchaseRequestCommandAuthorityOutcome.Denied,
            await db.Reader().ReadAsync(PurchaseFixtures.DocumentId, "B1"));
        Assert.Equal(0, db.Opens); db.AssertReadOnly();
    }

    [Theory]
    [InlineData(2, "logout")] [InlineData(3, "logout")]
    [InlineData(3, "stamp")] [InlineData(2, "branch")] [InlineData(3, "actor")]
    [InlineData(2, "capability")]
    public async Task Live_session_fences_reject_logout_or_security_scope_changes(int call, string fault)
    {
        var db = new I22AdmissionModel();
        db.SessionObservation = n => n != call ? db.Identity : fault switch {
            "logout" => null, "stamp" => db.Identity with { CredentialStamp = "changed" },
            "branch" => db.Identity with { BranchIds = ["B2"] },
            "capability" => db.Identity with { Capabilities = ["purchase-requests.read"] },
            _ => db.Identity with { PrincipalId = "other" } };
        Assert.Equal(PurchaseRequestCommandAuthorityOutcome.Denied,
            await db.Reader().ReadAsync(PurchaseFixtures.DocumentId, "B1"));
        Assert.Equal(1, db.Rollbacks); db.AssertReadOnly();
    }

    [Fact]
    public async Task Live_session_fence_accepts_monotone_version_observations_when_security_scope_is_unchanged()
    {
        var db = new I22AdmissionModel();
        db.SessionObservation = n => db.Identity with { AuthorityVersion = n };
        Assert.Equal(PurchaseRequestCommandAuthorityOutcome.Admitted,
            await db.Reader().ReadAsync(PurchaseFixtures.DocumentId, "B1"));
        Assert.True(db.SessionCalls >= 3); Assert.Equal(1, db.Rollbacks); db.AssertReadOnly();
    }

    [Fact]
    public async Task Live_session_fence_rejects_1_2_1_version_regression_against_last_accepted_observation()
    {
        var db = new I22AdmissionModel();
        db.SessionObservation = n => db.Identity with { AuthorityVersion = n == 2 ? 2 : 1 };
        Assert.Equal(PurchaseRequestCommandAuthorityOutcome.Denied,
            await db.Reader().ReadAsync(PurchaseFixtures.DocumentId, "B1"));
        Assert.Equal(3, db.SessionCalls); Assert.Equal(1, db.Rollbacks); db.AssertReadOnly();
    }

    [Fact]
    public async Task Native_grant_revoked_after_document_read_is_denied_at_second_SQL_fence()
    {
        var db = new I22AdmissionModel();
        db.OnStep = stage => { if (stage == "details") db.Grants.Clear(); };
        Assert.Equal(PurchaseRequestCommandAuthorityOutcome.Denied,
            await db.Reader().ReadAsync(PurchaseFixtures.DocumentId, "B1"));
        Assert.Equal(2, db.Events.Count(x => x == "grants")); db.AssertReadOnly();
    }

    [Theory]
    [InlineData("binding")] [InlineData("version")] [InlineData("durability")] [InlineData("shape")]
    [InlineData("empty")] [InlineData("null")] [InlineData("duplicate")] [InlineData("type")]
    public async Task Invalid_actual_schema_or_binding_blocks_before_private_rows(string fault)
    {
        var db = new I22AdmissionModel();
        db.Transform = (stage, table) =>
        {
            if (stage != "probe") return table;
            switch (fault)
            {
                case "binding": table.Rows[0][1] = Guid.NewGuid(); break;
                case "version": table.Rows[0][0] = 2; break;
                case "durability": table.Rows[0][2] = 0; break;
                case "shape": table.Rows[0][3] = 0; break;
                case "empty": table.Rows.Clear(); break;
                case "null": table.Rows[0][3] = DBNull.Value; break;
                case "duplicate": table.ImportRow(table.Rows[0]); break;
                case "type": return I22AdmissionModel.Table([typeof(string)], ["wrong shape"]);
            }
            return table;
        };
        Assert.Equal(PurchaseRequestCommandAuthorityOutcome.Unavailable,
            await db.Reader().ReadAsync(PurchaseFixtures.DocumentId, "B1"));
        Assert.DoesNotContain("credential", db.Events); Assert.DoesNotContain("head", db.Events); db.AssertReadOnly();
    }

    [Theory]
    [InlineData("probe")] [InlineData("transaction")] [InlineData("credential")] [InlineData("grants")]
    [InlineData("branches")] [InlineData("head")] [InlineData("details")]
    public async Task Extra_result_sets_fail_closed_at_every_fixed_reader(string stage)
    {
        var db = new I22AdmissionModel { ExtraResultAt = stage };
        Assert.Equal(PurchaseRequestCommandAuthorityOutcome.Unavailable,
            await db.Reader().ReadAsync(PurchaseFixtures.DocumentId, "B1"));
        db.AssertReadOnly();
    }

    [Theory]
    [InlineData("open")] [InlineData("begin")] [InlineData("probe")] [InlineData("transaction")]
    [InlineData("credential")] [InlineData("grants")] [InlineData("branches")]
    [InlineData("head")] [InlineData("details")]
    public async Task Timeouts_never_become_admission_and_owned_connections_are_cleaned(string stage)
    {
        var db = new I22AdmissionModel { FaultAt = stage };
        Assert.Equal(PurchaseRequestCommandAuthorityOutcome.Unavailable,
            await db.Reader().ReadAsync(PurchaseFixtures.DocumentId, "B1"));
        Assert.Equal(1, db.ConnectionDisposals); db.AssertReadOnly();
    }

    [Theory]
    [InlineData("session")] [InlineData("open")] [InlineData("begin")] [InlineData("probe")]
    [InlineData("transaction")] [InlineData("credential")] [InlineData("grants")]
    [InlineData("branches")] [InlineData("head")] [InlineData("details")] [InlineData("rollback")]
    [InlineData("transaction-dispose")] [InlineData("connection-dispose")]
    public async Task Cancellation_before_during_and_after_SQL_does_not_release_positive(string stage)
    {
        using var stop = new CancellationTokenSource();
        var db = new I22AdmissionModel { OnStep = s => { if (s == stage) stop.Cancel(); } };
        Assert.Equal(PurchaseRequestCommandAuthorityOutcome.Cancelled,
            await db.Reader().ReadAsync(PurchaseFixtures.DocumentId, "B1", stop.Token));
        db.AssertReadOnly();
    }

    [Theory]
    [InlineData("rollback")] [InlineData("transaction-dispose")] [InlineData("connection-dispose")]
    public async Task Cleanup_failures_and_logout_during_cleanup_never_release_positive(string stage)
    {
        var db = new I22AdmissionModel { FaultAt = stage };
        Assert.Equal(PurchaseRequestCommandAuthorityOutcome.Unavailable,
            await db.Reader().ReadAsync(PurchaseFixtures.DocumentId, "B1"));
        Assert.Equal(1, db.ConnectionDisposals); db.AssertReadOnly();
        var revoked = false;
        db = new I22AdmissionModel { OnStep = s => { if (s == stage) revoked = true; } };
        db.SessionObservation = _ => revoked ? null : db.Identity;
        Assert.Equal(PurchaseRequestCommandAuthorityOutcome.Denied,
            await db.Reader().ReadAsync(PurchaseFixtures.DocumentId, "B1"));
        db.AssertReadOnly();
    }

    [Fact]
    public async Task Precancelled_and_ambient_transaction_open_nothing()
    {
        var db = new I22AdmissionModel();
        using var stop = new CancellationTokenSource(); stop.Cancel();
        Assert.Equal(PurchaseRequestCommandAuthorityOutcome.Cancelled,
            await db.Reader().ReadAsync(PurchaseFixtures.DocumentId, "B1", stop.Token));
        using var ambient = new System.Transactions.TransactionScope(System.Transactions.TransactionScopeAsyncFlowOption.Enabled);
        Assert.Equal(PurchaseRequestCommandAuthorityOutcome.Unavailable,
            await db.Reader().ReadAsync(PurchaseFixtures.DocumentId, "B1"));
        Assert.Equal(0, db.Opens); Assert.Equal(0, db.SessionCalls); db.AssertReadOnly();
    }

    [Fact]
    public async Task Cancellation_of_a_stalled_session_resolver_does_not_open_SQL()
    {
        var db = new I22AdmissionModel();
        var never = new TaskCompletionSource<AuthoritativeIdentity?>(TaskCreationOptions.RunContinuationsAsynchronously);
        using var stop = new CancellationTokenSource();
        var pending = db.Factory().CreateAuthorityReader(_ => never.Task).ReadAsync(PurchaseFixtures.DocumentId, "B1", stop.Token);
        stop.Cancel();
        Assert.Equal(PurchaseRequestCommandAuthorityOutcome.Cancelled, await pending);
        Assert.Equal(0, db.Opens); db.AssertReadOnly();
    }

    [Fact]
    public async Task Fresh_closed_connections_are_required_and_foreign_transactions_are_not_cleaned()
    {
        var db = new I22AdmissionModel();
        var connection = db.NewConnection(); connection.Open();
        var factory = new PurchaseRequestCommandFactory(PurchaseFixtures.Binding, PurchaseFixtures.Company,
            (Func<DbConnection>)(() => connection), I22AdmissionModel.SyntheticAcceptance());
        Assert.Equal(PurchaseRequestCommandAuthorityOutcome.Unavailable,
            await factory.CreateAuthorityReader(db.Resolve).ReadAsync(PurchaseFixtures.DocumentId, "B1"));
        Assert.Equal(ConnectionState.Open, connection.State); Assert.Equal(0, db.ConnectionDisposals);
        connection.Close();
        Assert.Equal(PurchaseRequestCommandAuthorityOutcome.Admitted,
            await factory.CreateAuthorityReader(db.Resolve).ReadAsync(PurchaseFixtures.DocumentId, "B1"));
        var opens = db.Opens;
        Assert.Equal(PurchaseRequestCommandAuthorityOutcome.Unavailable,
            await factory.CreateAuthorityReader(db.Resolve).ReadAsync(PurchaseFixtures.DocumentId, "B1"));
        Assert.Equal(opens, db.Opens); db.AssertReadOnly();
        db = new I22AdmissionModel { ForeignTransaction = true };
        Assert.Equal(PurchaseRequestCommandAuthorityOutcome.Unavailable,
            await db.Reader().ReadAsync(PurchaseFixtures.DocumentId, "B1"));
        Assert.Equal(0, db.Rollbacks); Assert.Equal(0, db.TransactionDisposals); Assert.Equal(1, db.ConnectionDisposals);
        db = new I22AdmissionModel { WrongIsolation = true };
        Assert.Equal(PurchaseRequestCommandAuthorityOutcome.Unavailable,
            await db.Reader().ReadAsync(PurchaseFixtures.DocumentId, "B1"));
        Assert.Equal(1, db.Rollbacks); db.AssertReadOnly();
    }

    [Theory]
    [InlineData(1, false)] [InlineData(1, true)] [InlineData(2, true)] [InlineData(3, true)] [InlineData(4, false)]
    public async Task EDIT_admission_is_not_draft_eligibility_and_survives_submitted_locked_state(int status, bool locked)
    {
        var db = new I22AdmissionModel();
        db.Document = db.Document with { StatusId = status, IsLocked = locked };
        Assert.Equal(PurchaseRequestCommandAuthorityOutcome.Admitted,
            await db.Reader().ReadAsync(PurchaseFixtures.DocumentId, "B1"));
        Assert.Equal(3, db.SessionCalls); Assert.Equal(1, db.Rollbacks); db.AssertReadOnly();
    }
}

// Synthetic query-aware grant projection. This executes production reader control
// flow, not SQL Server. Inherited comparison helpers model the fixed byte predicates.
internal sealed record I22NativeGrant(PurchaseGrantFixture Scope, bool Run, bool Update, bool Enabled = true);
internal sealed class I22AdmissionModel
{
    internal AuthoritativeIdentity Identity = PurchaseFixtures.Identity();
    internal PurchaseRequestAggregate Document = PurchaseFixtures.Aggregate();
    internal List<I22NativeGrant> Grants = [new(PurchaseGrantFixture.For("actor", "exact"), true, true)];
    internal readonly List<DbCommand> Commands = [];
    internal readonly List<string> Events = [];
    internal int FactoryCalls, SessionCalls, Opens, Rollbacks, TransactionDisposals, ConnectionDisposals, ForbiddenCalls, GrantEvaluations;
    internal string? FaultAt, ExtraResultAt;
    internal bool ForeignTransaction, WrongIsolation;
    internal Action<string>? OnStep;
    internal Func<string, DataTable, DataTable>? Transform;
    internal Func<int, AuthoritativeIdentity?>? SessionObservation;
    internal static PurchaseRequestCommandRuntimeAcceptance SyntheticAcceptance() => new(PurchaseFixtures.Binding,
        PurchaseFixtures.Company.TenantId, PurchaseFixtures.Company.CompanyId, "synthetic-recording-only-NOT-production-acceptance");
    internal PurchaseRequestCommandFactory Factory() => new(PurchaseFixtures.Binding, PurchaseFixtures.Company,
        (Func<DbConnection>)NewConnection, SyntheticAcceptance());
    internal SqlPurchaseRequestCommandAuthorityReader Reader() => Factory().CreateAuthorityReader(Resolve);
    internal DbConnection NewConnection() { FactoryCalls++; return new Connection(this); }
    internal Task<AuthoritativeIdentity?> Resolve(CancellationToken token)
    {
        token.ThrowIfCancellationRequested(); SessionCalls++; Step("session"); token.ThrowIfCancellationRequested();
        return Task.FromResult(SessionObservation is null ? Identity : SessionObservation(SessionCalls));
    }
    internal void Step(string stage)
    {
        Events.Add(stage); OnStep?.Invoke(stage);
        if (FaultAt == stage) throw new TimeoutException("Synthetic recording fault.");
    }
    internal void AssertReadOnly()
    {
        Assert.Equal(0, ForbiddenCalls);
        var allowed = new[] { PurchaseRequestSql.ProbeText, PurchaseRequestSql.TransactionText, PurchaseRequestSql.CredentialText,
            PurchaseRequestSql.GrantsText, PurchaseRequestSql.BranchesText, PurchaseRequestSql.HeadText, PurchaseRequestSql.DetailsText };
        Assert.All(Commands, c => { Assert.Contains(c.CommandText, allowed); Assert.Equal(CommandType.Text, c.CommandType); });
    }
    internal static DataTable Table(Type[] types, object[]? row = null)
    {
        var table = new DataTable();
        for (var i = 0; i < types.Length; i++) table.Columns.Add("C" + i, types[i]);
        if (row is not null) table.Rows.Add(row);
        return table;
    }
    private static object O(object? value) => value ?? DBNull.Value;
    private static decimal? D(string? value) => value is null ? null : decimal.Parse(value, CultureInfo.InvariantCulture);
    private DataTable Result(string stage, DbCommand cmd)
    {
        DataTable table;
        switch (stage)
        {
            case "probe": table = Table([typeof(int), typeof(Guid), typeof(int), typeof(int)], [1, PurchaseFixtures.Binding, 1, 1]); break;
            case "transaction": table = Table([typeof(int), typeof(int)], [1, 1]); break;
            case "credential":
                Assert.Equal(Identity.PrincipalId, cmd.Parameters["@actor"].Value);
                table = Table([typeof(string), typeof(string), typeof(bool), typeof(string), typeof(bool)],
                    [PurchaseFixtures.Actor, PurchaseFixtures.Stored, false, PurchaseFixtures.Group, false]); break;
            case "grants":
                Assert.Contains("CASE WHEN G.IsRun=1 AND G.IsUpdate=1", cmd.CommandText, StringComparison.Ordinal);
                Assert.Contains("U.[Disable]=0 AND G.IsDisable=0", cmd.CommandText, StringComparison.Ordinal);
                Assert.Equal(PurchaseRequestCommandRules.MenuId, cmd.Parameters["@menu"].Value);
                Assert.Equal(PurchaseFixtures.Group, cmd.Parameters["@group"].Value);
                GrantEvaluations++;
                var update = Grants.Any(g => g.Run && g.Update && g.Enabled && g.Scope.Matches(cmd.CommandText,
                    (string)cmd.Parameters["@username"].Value!, (string)cmd.Parameters["@group"].Value!, (string)cmd.Parameters["@menu"].Value!));
                table = Table([typeof(string), typeof(string), typeof(string), typeof(bool), typeof(string), typeof(bool), typeof(int), typeof(int)],
                    [PurchaseRequestCommandRules.MenuId, PurchaseRequestCommandRules.FormId, DBNull.Value, false, "05", false, 0, update ? 1 : 0]); break;
            case "branches": table = Table([typeof(string)], ["B1"]); break;
            case "head":
                Assert.Equal(PurchaseFixtures.DocumentId, cmd.Parameters["@document"].Value);
                var h = Document.Header;
                table = Table([typeof(string), typeof(DateTime), typeof(int), typeof(string), typeof(string), typeof(string), typeof(decimal), typeof(string), typeof(int), typeof(bool), typeof(string), typeof(string), typeof(double), typeof(string)],
                    [Document.PurchaseRequestId, O(h.PurchaseDate is null ? null : DateTime.Parse(h.PurchaseDate, CultureInfo.InvariantCulture)), O(h.PurposeId), h.PersonSuggest, h.Department,
                     O(h.PurposeDescOrClient), O(D(h.Price)), O(h.Notes), Document.StatusId, O(Document.IsLocked), h.CurrencyId, h.ObjectId, h.RateExchange, Document.BranchId]); break;
            case "details":
                Assert.Equal(PurchaseFixtures.DocumentId, cmd.Parameters["@document"].Value);
                table = Table([typeof(string), typeof(string), typeof(decimal), typeof(string), typeof(decimal), typeof(decimal), typeof(decimal), typeof(string), typeof(string)]);
                foreach (var line in Document.Lines)
                {
                    var v = line.Values;
                    table.Rows.Add(line.LineId, v.ItemId, O(D(v.Budget)), O(v.TimeRequired), O(D(v.Quantity)), O(D(v.UnitPrice)), O(D(v.TotalPrice)), O(v.Model), Document.PurchaseRequestId);
                }
                break;
            default: ForbiddenCalls++; throw new InvalidOperationException("Non-admission command.");
        }
        return Transform?.Invoke(stage, table) ?? table;
    }

    private sealed class Connection(I22AdmissionModel model) : DbConnection
    {
        private ConnectionState state;
        [AllowNull] public override string ConnectionString { get; set; } = "";
        public override string Database => "Synthetic";
        public override string DataSource => "Synthetic";
        public override string ServerVersion => "Synthetic";
        public override ConnectionState State => state;
        public override void Open() { model.Opens++; model.Step("open"); state = ConnectionState.Open; }
        public override Task OpenAsync(CancellationToken token)
        { token.ThrowIfCancellationRequested(); Open(); token.ThrowIfCancellationRequested(); return Task.CompletedTask; }
        public override void Close() => state = ConnectionState.Closed;
        public override void ChangeDatabase(string databaseName) => throw new NotSupportedException();
        protected override DbTransaction BeginDbTransaction(IsolationLevel isolationLevel)
        {
            Assert.Equal(IsolationLevel.Serializable, isolationLevel); model.Step("begin");
            return new Transaction(model.ForeignTransaction ? new Connection(model) : this, model,
                model.WrongIsolation ? IsolationLevel.ReadCommitted : isolationLevel);
        }
        protected override DbCommand CreateDbCommand()
        { var cmd = new Command(this, model); model.Commands.Add(cmd); return cmd; }
        public override ValueTask DisposeAsync()
        { Close(); model.ConnectionDisposals++; model.Step("connection-dispose"); return ValueTask.CompletedTask; }
    }
    private sealed class Transaction(Connection owner, I22AdmissionModel model, IsolationLevel isolation) : DbTransaction
    {
        public override IsolationLevel IsolationLevel => isolation;
        protected override DbConnection DbConnection => owner;
        public override void Commit() { model.ForbiddenCalls++; throw new InvalidOperationException("Admission COMMIT forbidden."); }
        public override void Rollback() { model.Rollbacks++; model.Step("rollback"); }
        public override ValueTask DisposeAsync()
        { model.TransactionDisposals++; model.Step("transaction-dispose"); return ValueTask.CompletedTask; }
    }
    private sealed class Command(Connection owner, I22AdmissionModel model) : DbCommand
    {
        [AllowNull] public override string CommandText { get; set; } = "";
        public override int CommandTimeout { get; set; }
        public override CommandType CommandType { get; set; }
        public override bool DesignTimeVisible { get; set; }
        public override UpdateRowSource UpdatedRowSource { get; set; }
        protected override DbConnection? DbConnection { get => owner; set => throw new NotSupportedException(); }
        protected override DbTransaction? DbTransaction { get; set; }
        protected override DbParameterCollection DbParameterCollection { get; } = new RecordingParameters();
        protected override DbParameter CreateDbParameter() => new RecordingParameter();
        public override void Cancel() { }
        public override void Prepare() => throw new NotSupportedException();
        public override object? ExecuteScalar() { model.ForbiddenCalls++; throw new InvalidOperationException("Admission scalar forbidden."); }
        public override int ExecuteNonQuery() { model.ForbiddenCalls++; throw new InvalidOperationException("Admission write forbidden."); }
        protected override DbDataReader ExecuteDbDataReader(CommandBehavior behavior)
        {
            Assert.Equal(5, CommandTimeout); Assert.Equal(CommandType.Text, CommandType);
            Assert.Same(owner, DbTransaction!.Connection); Assert.Equal(IsolationLevel.Serializable, DbTransaction.IsolationLevel);
            string stage = CommandText == PurchaseRequestSql.ProbeText ? "probe" : CommandText == PurchaseRequestSql.TransactionText ? "transaction"
                : CommandText == PurchaseRequestSql.CredentialText ? "credential" : CommandText == PurchaseRequestSql.GrantsText ? "grants"
                : CommandText == PurchaseRequestSql.BranchesText ? "branches" : CommandText == PurchaseRequestSql.HeadText ? "head"
                : CommandText == PurchaseRequestSql.DetailsText ? "details" : "forbidden";
            model.Step(stage);
            var table = model.Result(stage, this);
            return new DataTableReader(model.ExtraResultAt == stage ? [table, table.Copy()] : [table]);
        }
        protected override Task<DbDataReader> ExecuteDbDataReaderAsync(CommandBehavior behavior, CancellationToken token)
        {
            token.ThrowIfCancellationRequested();
            var reader = ExecuteDbDataReader(behavior);
            if (token.IsCancellationRequested) { reader.Dispose(); token.ThrowIfCancellationRequested(); }
            return Task.FromResult(reader);
        }
    }
}
