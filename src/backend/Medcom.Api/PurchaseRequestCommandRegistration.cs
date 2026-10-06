using Medcom.Application;
using Medcom.Application.PurchaseRequests;
using Medcom.Contracts;
using Medcom.Infrastructure.PurchaseRequests;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

namespace Medcom.Api;

/// <summary>
/// Dormant helper: ApiHost does NOT call it. The parent supplies a bound factory only
/// after actual runtime acceptance and corrected I20 integration. Calling with no
/// factory leaves both services unavailable, without resolving sessions or opening SQL.
/// </summary>
public static class PurchaseRequestCommandRegistration
{
    public static IServiceCollection AddDormantPurchaseRequestCommands(this IServiceCollection services,
        PurchaseRequestCommandFactory? factory = null)
    {
        ArgumentNullException.ThrowIfNull(services);
        services.AddHttpContextAccessor();
        services.AddScoped<PurchaseRequestCommandRequestScope>(provider =>
        {
            if (factory?.RuntimeAccepted != true)
                return new PurchaseRequestCommandRequestScope(null, null, null, CancellationToken.None);
            var context = provider.GetRequiredService<IHttpContextAccessor>().HttpContext;
            ResolvedSession? anchor = null;
            // Token comes from server authentication middleware, never a DTO, header,
            // query parameter, caller-provided ResolvedSession, or a cached singleton.
            if (context?.User.Identity?.IsAuthenticated == true
                && context.Items[AuthEndpoints.ResolvedKey] is ResolvedSession server)
            {
                var claims = context.User.FindAll(AuthEndpoints.SessionClaim).ToArray();
                if (claims.Length == 1 && claims[0].Value == server.Token) anchor = server;
            }
            return new PurchaseRequestCommandRequestScope(factory, provider.GetService<IWebSessions>(),
                anchor, context?.RequestAborted ?? CancellationToken.None);
        });
        services.AddScoped<IPurchaseRequestCommandAccess>(provider =>
            new SqlPurchaseRequestCommandAccess(provider.GetRequiredService<PurchaseRequestCommandRequestScope>()));
        services.AddScoped<IPurchaseRequestCommands>(provider =>
            provider.GetRequiredService<PurchaseRequestCommandRequestScope>().Commands);
        return services;
    }
}

// One frozen server token/anchor per DI request scope. Identity snapshots are NOT
// authorization caches; every reader/writer/lookup fence calls IWebSessions again.
internal sealed class PurchaseRequestCommandRequestScope
{
    private readonly PurchaseRequestCommandFactory? factory;
    private readonly IWebSessions? sessions;
    private readonly ResolvedSession? anchor;
    private readonly CancellationToken requestAborted;
    public IPurchaseRequestCommands Commands { get; }
    internal bool RuntimeAccepted => factory?.RuntimeAccepted == true;

    internal PurchaseRequestCommandRequestScope(PurchaseRequestCommandFactory? factory, IWebSessions? sessions,
        ResolvedSession? serverSession, CancellationToken requestAborted)
    {
        this.factory = factory;
        this.sessions = sessions;
        this.requestAborted = requestAborted;
        if (serverSession is { Identity: { Capabilities: not null, BranchIds: not null } } server
            && !string.IsNullOrEmpty(server.Token))
        {
            var initial = new PurchaseRequestSessionFence();
            if (initial.TryAccept(server.Identity, out var accepted)) anchor = server with { Identity = accepted };
        }
        Commands = new RequestCommands(CreateInvocationCommands, requestAborted);
    }

    internal async Task<PurchaseRequestCommandAuthorityOutcome> ReadAccess(ResolvedSession supplied,
        string documentId, string branchId, CancellationToken token)
    {
        if (!RuntimeAccepted) return PurchaseRequestCommandAuthorityOutcome.Unavailable;
        if (anchor is null || supplied is null || supplied.Token != anchor.Token)
            return PurchaseRequestCommandAuthorityOutcome.Denied;
        var sessionFence = NewInvocationFence();
        if (sessionFence is null || !sessionFence.TryAccept(supplied.Identity, out _))
            return PurchaseRequestCommandAuthorityOutcome.Denied;
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(token, requestAborted);
        return await factory!.CreateAuthorityReader(t => ResolveLive(sessionFence, t))
            .ReadAsync(documentId, branchId, linked.Token);
    }

    private PurchaseRequestSessionFence? NewInvocationFence()
    {
        if (anchor is null) return null;
        var sessionFence = new PurchaseRequestSessionFence();
        return sessionFence.TryAccept(anchor.Identity, out _) ? sessionFence : null;
    }

    private IPurchaseRequestCommands CreateInvocationCommands()
    {
        if (factory is null) return new UnavailablePurchaseRequestCommands();
        var sessionFence = NewInvocationFence();
        return factory.CreateCommands(sessionFence is null
            ? _ => Task.FromResult<AuthoritativeIdentity?>(null)
            : t => ResolveLive(sessionFence, t));
    }

    private async Task<AuthoritativeIdentity?> ResolveLive(PurchaseRequestSessionFence sessionFence, CancellationToken token)
    {
        if (!RuntimeAccepted || anchor is null || sessions is null) return null;
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(token, requestAborted);
        linked.Token.ThrowIfCancellationRequested();
        var live = await sessions.ResolveAsync(anchor.Token, false, linked.Token).WaitAsync(linked.Token);
        linked.Token.ThrowIfCancellationRequested();
        if (live is null || live.Token != anchor.Token || !sessionFence.TryAccept(live.Identity, out var accepted)) return null;
        // Preserve the authority's actual positive, nondecreasing observation version.
        // This request-scope fence never pins, rewrites or caches a live identity.
        return accepted;
    }

    // Only link the request lifetime; no writer/lookup logic, retries, receipt changes
    // or post-Submit draft check is introduced here. I14/I19 decide their own outcomes.
    private sealed class RequestCommands(Func<IPurchaseRequestCommands> createInvocation, CancellationToken requestAborted) : IPurchaseRequestCommands
    {
        private async Task<T> Call<T>(Func<IPurchaseRequestCommands, CancellationToken, Task<T>> action, CancellationToken token)
        {
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(token, requestAborted);
            var inner = createInvocation();
            return await action(inner, linked.Token);
        }
        public Task<PurchaseRequestCommandResult> CreateAsync(CreatePurchaseRequestDraft request, CancellationToken token = default) =>
            Call((inner, t) => inner.CreateAsync(request, t), token);
        public Task<PurchaseRequestCommandResult> SaveAsync(SavePurchaseRequestDraft request, CancellationToken token = default) =>
            Call((inner, t) => inner.SaveAsync(request, t), token);
        public Task<PurchaseRequestCommandResult> SubmitAsync(SubmitPurchaseRequest request, CancellationToken token = default) =>
            Call((inner, t) => inner.SubmitAsync(request, t), token);
        public Task<PurchaseRequestLookupResult> LookupAsync(CreatePurchaseRequestDraft originalIntent, CancellationToken token = default) =>
            Call((inner, t) => inner.LookupAsync(originalIntent, t), token);
        public Task<PurchaseRequestLookupResult> LookupAsync(SavePurchaseRequestDraft originalIntent, CancellationToken token = default) =>
            Call((inner, t) => inner.LookupAsync(originalIntent, t), token);
        public Task<PurchaseRequestLookupResult> LookupAsync(SubmitPurchaseRequest originalIntent, CancellationToken token = default) =>
            Call((inner, t) => inner.LookupAsync(originalIntent, t), token);
    }
}
