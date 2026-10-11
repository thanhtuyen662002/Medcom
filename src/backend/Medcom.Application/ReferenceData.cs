using Medcom.Contracts;
namespace Medcom.Application;

// Supplement an already authorized response. This is not an arbitrary catalog lookup API.
public sealed record ReferenceKey(string Binding,string Key);
public sealed record ReferenceValue(string? Name,string State,IReadOnlyDictionary<string,string?> Extra);
public interface IReferenceData
{
    Task<ErpReadResult<IReadOnlyDictionary<ReferenceKey,ReferenceValue>>> ReadAsync(
        IReadOnlyList<ReferenceKey> keys,CancellationToken token);
    Task<ErpReadResult<BranchChoicePage>> BranchesAsync(int page,int size,string? search,CancellationToken token);
}
public sealed class UnavailableReferenceData:IReferenceData
{
    public Task<ErpReadResult<IReadOnlyDictionary<ReferenceKey,ReferenceValue>>> ReadAsync(IReadOnlyList<ReferenceKey> keys,CancellationToken token)
        =>Task.FromResult(new ErpReadResult<IReadOnlyDictionary<ReferenceKey,ReferenceValue>>(ErpReadOutcome.Unavailable));
    public Task<ErpReadResult<BranchChoicePage>> BranchesAsync(int page,int size,string? search,CancellationToken token)
        =>Task.FromResult(new ErpReadResult<BranchChoicePage>(ErpReadOutcome.Unavailable));
}
