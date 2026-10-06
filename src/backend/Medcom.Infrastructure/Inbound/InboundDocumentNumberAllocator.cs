using System.Data.Common;

namespace Medcom.Infrastructure.Inbound;

// Trusted deployment dependency. Allocation must use the supplied transaction and preserve
// the qualified legacy DN/{P}{MM}{YY}/{4}/DocumentDate protocol under concurrent writers.
// No caller-supplied ID, SQL text, procedure name, MAX+1 or local counter is accepted here.
public interface IInboundDocumentNumberAllocator
{
    bool IsQualified { get; }
    Task<string?> AllocateAsync(DbTransaction transaction, DateTime documentDate,
        CancellationToken token);
}

public sealed class UnqualifiedInboundDocumentNumberAllocator : IInboundDocumentNumberAllocator
{
    public bool IsQualified => false;
    public Task<string?> AllocateAsync(DbTransaction transaction, DateTime documentDate,
        CancellationToken token) => Task.FromResult<string?>(null);
}
