using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Medcom.Application.Audit;

namespace Medcom.Infrastructure.Audit;

// Opt-in single-host adapter, not registered in API startup. Exclusive file handles
// fence simultaneous readers/writers across instances; contention fails closed.
// No tail repair/truncation, directory discovery, schema changes or success fakes.
public sealed class FileAuditJournal : IAuditJournal, IDisposable
{
    private sealed record Frame(int Sequence, string Previous, AuditRecord Record, string Mac);
    private static readonly JsonSerializerOptions Json = new()
    {
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
        MaxDepth = 8
    };
    private const int MaxBytes = 8 * 1024 * 1024;
    private const int MaxRecords = 10000;
    private readonly string root;
    private readonly byte[] key;
    private readonly SemaphoreSlim gate = new(1, 1);
    private bool disposed;

    public FileAuditJournal(string existingPrivateDirectory, ReadOnlySpan<byte> integrityKey)
    {
        if (integrityKey.Length is < 32 or > 64 || !Path.IsPathFullyQualified(existingPrivateDirectory)
            || !Directory.Exists(existingPrivateDirectory))
            throw new ArgumentException("Audit requires an existing private directory and integrity key.");
        root = Path.GetFullPath(existingPrivateDirectory);
        if ((File.GetAttributes(root) & FileAttributes.ReparsePoint) != 0)
            throw new ArgumentException("Audit root must not be a link.");
        key = integrityKey.ToArray();
    }

    public async Task<AuditAppendOutcome> AppendAsync(AuditRecord record, CancellationToken cancellationToken)
    {
        if (record is null || !record.IsValid) return AuditAppendOutcome.Invalid;
        await gate.WaitAsync(cancellationToken);
        var writing = false;
        try
        {
            ObjectDisposedException.ThrowIf(disposed, this);
            cancellationToken.ThrowIfCancellationRequested();
            var path = PathFor(record.Scope);
            RejectLink(path);
            // Private root ACLs are an operator prerequisite. FileShare.None is also
            // respected by this adapter's independent instances; no lock-age takeover.
            using var file = new FileStream(path, FileMode.OpenOrCreate, FileAccess.ReadWrite,
                FileShare.None, 4096, FileOptions.WriteThrough);
            var frames = ReadFrames(file, record.Scope);
            var duplicate = frames.FirstOrDefault(f => f.Record.EventId == record.EventId);
            if (duplicate is not null)
                return duplicate.Record == record ? AuditAppendOutcome.AlreadyRecorded : AuditAppendOutcome.Conflict;
            if (frames.Count >= MaxRecords) return AuditAppendOutcome.CapacityExceeded;
            var previous = frames.Count == 0 ? new string('0', 64) : frames[^1].Mac;
            var frame = new Frame(frames.Count + 1, previous, record, Mac(frames.Count + 1, previous, record));
            var bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(frame, Json) + "\n");
            if (file.Length + bytes.Length > MaxBytes) return AuditAppendOutcome.CapacityExceeded;
            cancellationToken.ThrowIfCancellationRequested();
            file.Position = file.Length;
            writing = true;
            // Once write starts, finish and flush despite caller cancellation. Do not
            // report cancellation as proof of no append after the side effect began.
            file.Write(bytes);
            file.Flush(flushToDisk: true);
            return AuditAppendOutcome.Acknowledged;
        }
        catch (OperationCanceledException) when (!writing && cancellationToken.IsCancellationRequested) { throw; }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or JsonException
                                     or InvalidDataException or ObjectDisposedException or ArgumentException)
        {
            return writing ? AuditAppendOutcome.OutcomeUnknown : AuditAppendOutcome.Unavailable;
        }
        finally { gate.Release(); }
    }

    public async Task<AuditPage> ReadAsync(AuditScope scope, int offset, int take, CancellationToken cancellationToken)
    {
        if (scope is not { IsValid: true } || offset is < 0 or > MaxRecords || take is < 1 or > 100)
            return new(AuditReadOutcome.Invalid, []);
        await gate.WaitAsync(cancellationToken);
        try
        {
            ObjectDisposedException.ThrowIf(disposed, this);
            cancellationToken.ThrowIfCancellationRequested();
            var path = PathFor(scope);
            RejectLink(path);
            if (!File.Exists(path)) return new(AuditReadOutcome.Success, []);
            using var file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.None);
            var frames = ReadFrames(file, scope);
            cancellationToken.ThrowIfCancellationRequested();
            var rows = Array.AsReadOnly(frames.Skip(offset).Take(take).Select(f => f.Record).ToArray());
            return new(AuditReadOutcome.Success, rows, offset + rows.Count < frames.Count ? offset + rows.Count : null);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or JsonException
                                     or InvalidDataException or ObjectDisposedException or ArgumentException)
        { return new(AuditReadOutcome.Unavailable, []); }
        finally { gate.Release(); }
    }

    private List<Frame> ReadFrames(FileStream file, AuditScope scope)
    {
        if (file.Length > MaxBytes) throw new InvalidDataException("Audit capacity exceeded.");
        if (file.Length == 0) return [];
        file.Position = file.Length - 1;
        if (file.ReadByte() != '\n') throw new InvalidDataException("Incomplete audit frame.");
        file.Position = 0;
        using var reader = new StreamReader(file, new UTF8Encoding(false, true), false, 4096, leaveOpen: true);
        var frames = new List<Frame>();
        var previous = new string('0', 64);
        var ids = new HashSet<Guid>();
        while (reader.ReadLine() is { } line)
        {
            var frame = JsonSerializer.Deserialize<Frame>(line, Json);
            if (frame is null || frame.Record is null || !frame.Record.IsValid || frame.Record.Scope != scope
                || frame.Sequence != frames.Count + 1 || frame.Previous != previous || frames.Count >= MaxRecords
                || !ids.Add(frame.Record.EventId) || frame.Mac != Mac(frame.Sequence, previous, frame.Record))
                throw new InvalidDataException("Invalid audit chain.");
            previous = frame.Mac;
            frames.Add(frame);
        }
        return frames;
    }

    private string Mac(int sequence, string previous, AuditRecord record) => Convert.ToHexStringLower(
        HMACSHA256.HashData(key, Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { sequence, previous, record }, Json))));
    private string PathFor(AuditScope scope) => Path.Combine(root,
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(scope.TenantId + "\0" + scope.CompanyId))) + ".audit");
    private static void RejectLink(string path)
    {
        var info = new FileInfo(path);
        if (info.LinkTarget is not null || (info.Exists && (info.Attributes & FileAttributes.ReparsePoint) != 0))
            throw new IOException("Audit file must not be a link.");
    }
    public void Dispose()
    {
        gate.Wait();
        try { disposed = true; CryptographicOperations.ZeroMemory(key); }
        finally { gate.Release(); }
        // Keep gate alive so racing/late calls fail as unavailable, not disposed waits.
    }
}
