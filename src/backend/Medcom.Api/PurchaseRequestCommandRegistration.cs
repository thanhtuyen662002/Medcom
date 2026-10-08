using Medcom.Application;
using Medcom.Application.PurchaseRequests;
using Medcom.Contracts;
using Medcom.Infrastructure.PurchaseRequests;
using Medcom.Infrastructure;
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
    // Custom session stores must explicitly supply an inspector that performs only
    // local liveness/identity inspection. Missing adapters leave commands unavailable.
    public static IServiceCollection AddDormantPurchaseRequestCommands(this IServiceCollection services,
        PurchaseRequestCommandFactory? factory = null,
        Func<IWebSessions, string, CancellationToken, Task<ResolvedSession?>>? inspectLocalSession = null)
        => Register(services, factory, inspectLocalSession, PurchaseRequestCommandComposition.Production);

    // Explicit server-composition path for a bounded owner-approved experiment.
    // ApiHost/Program never call it. A pilot is not production runtime acceptance.
    public static IServiceCollection AddOwnerAuthorizedPurchaseRequestPilotCommands(this IServiceCollection services,
        PurchaseRequestCommandFactory factory,
        Func<IWebSessions, string, CancellationToken, Task<ResolvedSession?>>? inspectLocalSession = null)
    {
        ArgumentNullException.ThrowIfNull(factory);
        if (!factory.IsOwnerAuthorizedPilot || factory.RuntimeAccepted)
            throw new ArgumentException("A distinct owner-authorized purchase pilot factory is required.");
        return Register(services, factory, inspectLocalSession, PurchaseRequestCommandComposition.OwnerAuthorizedPilot);
    }

    private static IServiceCollection Register(IServiceCollection services, PurchaseRequestCommandFactory? factory,
        Func<IWebSessions, string, CancellationToken, Task<ResolvedSession?>>? inspectLocalSession,
        PurchaseRequestCommandComposition composition)
    {
        ArgumentNullException.ThrowIfNull(services);
        services.AddHttpContextAccessor();
        services.AddScoped<PurchaseRequestCommandRequestScope>(provider =>
        {
            if (composition == PurchaseRequestCommandComposition.Production
                ? factory?.RuntimeAccepted != true : factory?.IsOwnerAuthorizedPilot != true)
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
                anchor, context?.RequestAborted ?? CancellationToken.None, inspectLocalSession, composition);
        });
        services.AddScoped<IPurchaseRequestCommandAccess>(provider =>
            new SqlPurchaseRequestCommandAccess(provider.GetRequiredService<PurchaseRequestCommandRequestScope>()));
        services.AddScoped<IPurchaseRequestCommands>(provider =>
            provider.GetRequiredService<PurchaseRequestCommandRequestScope>().Commands);
        return services;
    }
}

internal enum PurchaseRequestCommandComposition { Production, OwnerAuthorizedPilot }

// One frozen server token/anchor per DI request scope. Identity snapshots are NOT
// authorization caches; every reader/writer/lookup fence calls IWebSessions again.
internal sealed class PurchaseRequestCommandRequestScope
{
    private readonly PurchaseRequestCommandFactory? factory;
    private readonly PurchaseRequestCommandComposition composition;
    private readonly IWebSessions? sessions;
    private readonly ResolvedSession? anchor;
    private readonly Func<string, CancellationToken, Task<ResolvedSession?>>? inspect;
    private readonly CancellationToken requestAborted;
    public IPurchaseRequestCommands Commands { get; }
    internal bool CompositionAdmitted => composition == PurchaseRequestCommandComposition.Production
        ? factory?.RuntimeAccepted == true : factory?.IsOwnerAuthorizedPilot == true;
    internal bool MayWrite => CompositionAdmitted && (composition == PurchaseRequestCommandComposition.Production
        || factory!.PilotWriteAllowed);

    internal PurchaseRequestCommandRequestScope(PurchaseRequestCommandFactory? factory, IWebSessions? sessions,
        ResolvedSession? serverSession, CancellationToken requestAborted,
        Func<IWebSessions, string, CancellationToken, Task<ResolvedSession?>>? inspectLocalSession = null,
        PurchaseRequestCommandComposition composition = PurchaseRequestCommandComposition.Production)
    {
        this.factory = factory;
        this.composition = composition;
        this.sessions = sessions;
        this.requestAborted = requestAborted;
        // IWebSessions.InspectAsync has a full-resolution fallback. Only the sealed
        // LocalWebSessions implementation is known here to be SQL-free. Other stores
        // require a server-owned, explicitly local adapter; never infer this from an
        // override or invoke the interface fallback while a transaction is active.
        inspect = sessions is LocalWebSessions local ? local.InspectAsync
            : sessions is not null && inspectLocalSession is not null
                ? (token, ct) => inspectLocalSession(sessions, token, ct) : null;
        if (serverSession is { Identity: { Capabilities: not null, BranchIds: not null } } server
            && server.Token is { Length: 64 } && server.Token.All(Uri.IsHexDigit))
        {
            var initial = new PurchaseRequestSessionFence();
            if (initial.TryAccept(server.Identity, out var accepted)) anchor = server with { Identity = accepted };
        }
        Commands = new RequestCommands(CreateInvocationCommands, requestAborted);
    }

    internal async Task<PurchaseRequestCommandAuthorityOutcome> ReadAccess(ResolvedSession supplied,
        string documentId, string branchId, CancellationToken token)
    {
        if (!CompositionAdmitted) return PurchaseRequestCommandAuthorityOutcome.Unavailable;
        if (anchor is null || supplied is null || supplied.Token != anchor.Token)
            return PurchaseRequestCommandAuthorityOutcome.Denied;
        if (inspect is null) return PurchaseRequestCommandAuthorityOutcome.Unavailable;
        var sessionFence = NewInvocationFence();
        if (sessionFence is null || !sessionFence.TryAccept(supplied.Identity, out _))
            return PurchaseRequestCommandAuthorityOutcome.Denied;
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(token, requestAborted);
        var reader = composition == PurchaseRequestCommandComposition.Production
            ? factory!.CreateAuthorityReader(t => ResolveLive(sessionFence, t), t => ResolveLive(sessionFence, t, localOnly: true))
            : factory!.CreatePilotAuthorityReader(t => ResolveLive(sessionFence, t), t => ResolveLive(sessionFence, t, localOnly: true));
        return await reader.ReadAsync(documentId, branchId, linked.Token);
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
        Func<CancellationToken, Task<AuthoritativeIdentity?>> resolve = sessionFence is null
            ? _ => Task.FromResult<AuthoritativeIdentity?>(null) : t => ResolveLive(sessionFence, t);
        Func<CancellationToken, Task<AuthoritativeIdentity?>>? local = inspect is null ? null
            : t => sessionFence is null ? Task.FromResult<AuthoritativeIdentity?>(null)
                : ResolveLive(sessionFence, t, localOnly: true);
        return composition == PurchaseRequestCommandComposition.Production
            ? factory.CreateCommands(resolve, local) : factory.CreatePilotCommands(resolve, local);
    }

    private async Task<AuthoritativeIdentity?> ResolveLive(PurchaseRequestSessionFence sessionFence, CancellationToken token, bool localOnly = false)
    {
        if (!CompositionAdmitted || anchor is null || sessions is null) return null;
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(token, requestAborted);
        linked.Token.ThrowIfCancellationRequested();
        var live = await (localOnly ? inspect!(anchor.Token, linked.Token)
            : sessions.ResolveAsync(anchor.Token, false, linked.Token)).WaitAsync(linked.Token);
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
