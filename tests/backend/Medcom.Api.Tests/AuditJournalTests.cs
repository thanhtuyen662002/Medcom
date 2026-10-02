using System.Text;
using Medcom.Application.Audit;
using Medcom.Infrastructure.Audit;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class AuditJournalTests : IDisposable
{
    private readonly string root = Path.Combine(Path.GetTempPath(), "medcom-audit-" + Guid.NewGuid().ToString("N"));
    private static readonly byte[] Key = Enumerable.Range(1, 32).Select(i => (byte)i).ToArray();
    private static readonly AuditScope Scope = new("synthetic-tenant", "synthetic-company");
    public AuditJournalTests() => Directory.CreateDirectory(root);
    private static AuditRecord Record(AuditScope? scope = null) => new(Guid.NewGuid(), scope ?? Scope,
        new DateTimeOffset(2026, 10, 2, 0, 0, 0, TimeSpan.Zero),
        AuditActorReference.Create(scope ?? Scope, "synthetic-person", Key),
        AuditOperation.CommandAttempt, AuditOutcome.Pending, Guid.NewGuid());
    private FileAuditJournal Journal() => new(root, Key);
    private string FilePath => Directory.GetFiles(root, "*.audit").Single();

    [Fact]
    public void IdentityIsScopedAndRawPrincipalIsAbsentFromEnvelope()
    {
        var first = AuditActorReference.Create(Scope, "private synthetic person", Key);
        Assert.Equal(first, AuditActorReference.Create(Scope, "private synthetic person", Key));
        Assert.NotEqual(first, AuditActorReference.Create(new("synthetic-tenant", "other-company"), "private synthetic person", Key));
        Assert.NotEqual(first, AuditActorReference.Create(Scope, "other synthetic person", Key));
        Assert.Throws<ArgumentException>(() => AuditActorReference.Create(Scope, "person\0suffix", Key));
        Assert.Throws<ArgumentException>(() => AuditActorReference.Create(Scope, "person", new byte[1]));
    }

    [Fact]
    public async Task InvalidEnvelopeAndReadBoundsHaveNoFilesystemEffect()
    {
        using var journal = Journal();
        foreach (var invalid in new[] { Record() with { EventId = Guid.Empty },
            Record() with { Scope = new("../secret", "company") },
            Record() with { ActorReference = "password=private-synthetic-secret" },
            Record() with { Operation = (AuditOperation)100 },
            Record() with { CorrelationId = Guid.Empty },
            Record() with { OccurredAt = DateTimeOffset.MinValue } })
            Assert.Equal(AuditAppendOutcome.Invalid, await journal.AppendAsync(invalid, default));
        Assert.Equal(AuditReadOutcome.Invalid, (await journal.ReadAsync(Scope, -1, 1, default)).Outcome);
        Assert.Equal(AuditReadOutcome.Invalid, (await journal.ReadAsync(Scope, 0, 101, default)).Outcome);
        Assert.Empty(Directory.GetFiles(root));
    }

    [Fact]
    public async Task AcknowledgedAppendSurvivesNewInstanceAndContainsNoRawIdentity()
    {
        var record = Record();
        using (var journal = Journal())
            Assert.Equal(AuditAppendOutcome.Acknowledged, await journal.AppendAsync(record, default));
        using var restarted = Journal();
        var page = await restarted.ReadAsync(Scope, 0, 100, default);
        Assert.Equal(AuditReadOutcome.Success, page.Outcome);
        Assert.Equal(record, Assert.Single(page.Records));
        Assert.Null(page.NextOffset);
        Assert.DoesNotContain("synthetic-person", File.ReadAllText(FilePath));
    }

    [Fact]
    public async Task EventReplayIsIdempotentAndDifferentContentConflicts()
    {
        var record = Record();
        using var journal = Journal();
        Assert.Equal(AuditAppendOutcome.Acknowledged, await journal.AppendAsync(record, default));
        var before = File.ReadAllBytes(FilePath);
        Assert.Equal(AuditAppendOutcome.AlreadyRecorded, await journal.AppendAsync(record, default));
        Assert.Equal(AuditAppendOutcome.Conflict, await journal.AppendAsync(record with { Outcome = AuditOutcome.Rejected }, default));
        Assert.Equal(before, File.ReadAllBytes(FilePath));
    }

    [Fact]
    public async Task TenantCompanyPartitionAndPagingNeverReturnOtherScope()
    {
        using var journal = Journal();
        var records = Enumerable.Range(0, 3).Select(_ => Record()).ToArray();
        foreach (var record in records) await journal.AppendAsync(record, default);
        var other = Record(new("other-tenant", "synthetic-company"));
        await journal.AppendAsync(other, default);
        var first = await journal.ReadAsync(Scope, 0, 2, default);
        Assert.Equal(records.Take(2), first.Records);
        Assert.Equal(2, first.NextOffset);
        var second = await journal.ReadAsync(Scope, first.NextOffset!.Value, 2, default);
        Assert.Equal(records[2], Assert.Single(second.Records));
        Assert.Null(second.NextOffset);
        Assert.Empty((await journal.ReadAsync(new("synthetic-tenant", "other-company"), 0, 100, default)).Records);
    }

    [Fact]
    public async Task ConcurrentDuplicateAppendsHaveOneAcknowledgedFrame()
    {
        var record = Record();
        using var journal = Journal();
        var outcomes = await Task.WhenAll(Enumerable.Range(0, 24)
            .Select(_ => Task.Run(() => journal.AppendAsync(record, default))));
        Assert.Equal(1, outcomes.Count(x => x == AuditAppendOutcome.Acknowledged));
        Assert.Equal(23, outcomes.Count(x => x == AuditAppendOutcome.AlreadyRecorded));
        Assert.Single((await journal.ReadAsync(Scope, 0, 100, default)).Records);
    }

    [Fact]
    public async Task ExistingExclusiveHandleFailsClosedWithoutClaimingAcknowledgement()
    {
        using var first = Journal();
        await first.AppendAsync(Record(), default);
        var before = File.ReadAllBytes(FilePath);
        using var held = new FileStream(FilePath, FileMode.Open, FileAccess.ReadWrite, FileShare.None);
        using var second = Journal();
        Assert.Equal(AuditAppendOutcome.Unavailable, await second.AppendAsync(Record(), default));
        Assert.Equal(AuditReadOutcome.Unavailable, (await second.ReadAsync(Scope, 0, 100, default)).Outcome);
        held.Dispose();
        Assert.Equal(before, File.ReadAllBytes(FilePath));
    }

    [Theory]
    [InlineData("partial")]
    [InlineData("tampered")]
    [InlineData("wrong-key")]
    public async Task CorruptionAndWrongKeyBlockAppendReadAndDoNotRepair(string change)
    {
        using (var writer = Journal()) await writer.AppendAsync(Record(), default);
        if (change == "partial") File.AppendAllText(FilePath, "{incomplete");
        if (change == "tampered") File.WriteAllText(FilePath, File.ReadAllText(FilePath).Replace("synthetic-company", "altered-company"));
        var before = File.ReadAllBytes(FilePath);
        using var journal = new FileAuditJournal(root, change == "wrong-key" ? new byte[32] : Key);
        Assert.Equal(AuditAppendOutcome.Unavailable, await journal.AppendAsync(Record(), default));
        Assert.Equal(AuditReadOutcome.Unavailable, (await journal.ReadAsync(Scope, 0, 100, default)).Outcome);
        Assert.Equal(before, File.ReadAllBytes(FilePath));
    }

    [Fact]
    public async Task CancellationBeforeAppendLeavesNoRecordAndDisposedAdapterDoesNotSucceed()
    {
        using var journal = Journal();
        using var cancellation = new CancellationTokenSource(); cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => journal.AppendAsync(Record(), cancellation.Token));
        Assert.Empty(Directory.GetFiles(root));
        journal.Dispose();
        Assert.Equal(AuditAppendOutcome.Unavailable, await journal.AppendAsync(Record(), default));
    }

    [Fact]
    public async Task MemberLinksIncludingDanglingLinksCannotRedirectWrites()
    {
        using var journal = Journal();
        await journal.AppendAsync(Record(), default);
        var path = FilePath;
        File.Delete(path);
        var target = Path.Combine(root, "must-not-be-created");
        File.CreateSymbolicLink(path, target);
        Assert.Equal(AuditAppendOutcome.Unavailable, await journal.AppendAsync(Record(), default));
        Assert.Equal(AuditReadOutcome.Unavailable, (await journal.ReadAsync(Scope, 0, 1, default)).Outcome);
        Assert.False(File.Exists(target));
    }

    [Fact]
    public async Task AdmissionNeverTurnsUnknownStoreFailureIntoSuccess()
    {
        var outcome = await new AuditAdmission(new FailingJournal()).RecordAsync(Record(), default);
        Assert.Equal(AuditAppendOutcome.OutcomeUnknown, outcome);
        Assert.False(AuditAdmission.HasAcknowledgement(outcome));
        Assert.False(AuditAdmission.HasAcknowledgement(AuditAppendOutcome.Unavailable));
        Assert.True(AuditAdmission.HasAcknowledgement(AuditAppendOutcome.AlreadyRecorded));
    }

    private sealed class FailingJournal : IAuditJournal
    {
        public Task<AuditAppendOutcome> AppendAsync(AuditRecord record, CancellationToken cancellationToken) =>
            throw new IOException("Synthetic storage failure.");
        public Task<AuditPage> ReadAsync(AuditScope scope, int offset, int take, CancellationToken cancellationToken) =>
            throw new IOException("Synthetic storage failure.");
    }
    public void Dispose() => Directory.Delete(root, recursive: true);
}
