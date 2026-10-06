using Medcom.Application;
using Medcom.Application.Inbound;
using Medcom.Contracts.Inbound;
using Medcom.Infrastructure.Inbound;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

namespace Medcom.Api;

// ApiHost deliberately does NOT call this helper. An integrator must supply
// actual target-specific acceptance; no flag or default provider activates I15.
public static class InboundDraftCommandRegistration
{
    public static IServiceCollection AddDormantInboundDraftCommands(this IServiceCollection services,
        InboundDraftCommandFactory? factory = null)
    {
        ArgumentNullException.ThrowIfNull(services);
        services.AddHttpContextAccessor();
        services.AddScoped<InboundDraftCommandRequestScope>(provider =>
        {
            if (factory?.RuntimeAccepted != true)
                return new(null, null, null, CancellationToken.None);
            var context = provider.GetRequiredService<IHttpContextAccessor>().HttpContext;
            ResolvedSession? anchor = null;
            // Capture only the original server-authenticated token and matching claim.
            if (context?.User.Identity?.IsAuthenticated == true
                && context.Items[AuthEndpoints.ResolvedKey] is ResolvedSession server)
            {
                var claims = context.User.FindAll(AuthEndpoints.SessionClaim).ToArray();
                if (claims.Length == 1 && claims[0].Value == server.Token) anchor = server;
            }
            return new(factory, provider.GetService<IWebSessions>(), anchor,
                context?.RequestAborted ?? CancellationToken.None);
        });
        services.AddScoped<IInboundDraftCommandAccess>(provider =>
            new SqlInboundDraftCommandAccess(provider.GetRequiredService<InboundDraftCommandRequestScope>()));
        services.AddScoped<IInboundDraftCommandService>(provider =>
            provider.GetRequiredService<InboundDraftCommandRequestScope>().Commands);
        return services;
    }
}

internal sealed class InboundDraftCommandRequestScope
{
    private readonly InboundDraftCommandFactory? factory;
    private readonly IWebSessions? sessions;
    private readonly ResolvedSession? anchor;
    private readonly CancellationToken requestAborted;
    internal IInboundDraftCommandService Commands { get; }

    internal InboundDraftCommandRequestScope(InboundDraftCommandFactory? factory, IWebSessions? sessions,
        ResolvedSession? server, CancellationToken requestAborted)
    {
        this.factory = factory; this.sessions = sessions; this.requestAborted = requestAborted;
        if (server is not null && !string.IsNullOrEmpty(server.Token)
            && new InboundDraftSessionFence().TryAccept(server.Identity, out var accepted))
            anchor = server with { Identity = accepted };
        Commands = new RequestCommands(this);
    }

    internal async Task<InboundDraftAuthority?> ReadAccess(ResolvedSession supplied, string document, CancellationToken token)
    {
        if (factory?.RuntimeAccepted != true) return null;
        if (anchor is null || supplied is null || supplied.Token != anchor.Token) return null;
        var fence = NewFence();
        if (fence is null || !fence.TryAccept(supplied.Identity, out _)) return null;
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(token, requestAborted);
        var result = await factory.CreateAuthorityReader(t => Resolve(fence, t)).ReadAsync(document, linked.Token);
        return result.Outcome switch
        {
            InboundDraftCommandAuthorityOutcome.Admitted => new(factory.DatabaseBindingId, document,
                result.BranchId!, true, factory.NewSendAccepted, true),
            InboundDraftCommandAuthorityOutcome.Denied => null,
            _ => null
        };
    }

    // A denied/unavailable observation cannot assert an unobserved document branch;
    // the unchanged facade treats null as closed without fabricated authority.

    private InboundDraftSessionFence? NewFence()
    {
        var fence = new InboundDraftSessionFence();
        return anchor is not null && fence.TryAccept(anchor.Identity, out _) ? fence : null;
    }

    private async Task<AuthoritativeIdentity?> Resolve(InboundDraftSessionFence fence, CancellationToken token)
    {
        if (factory?.RuntimeAccepted != true || anchor is null || sessions is null) return null;
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(token, requestAborted);
        linked.Token.ThrowIfCancellationRequested();
        var live = await sessions.ResolveAsync(anchor.Token, false, linked.Token).WaitAsync(linked.Token);
        linked.Token.ThrowIfCancellationRequested();
        return live is not null && live.Token == anchor.Token && fence.TryAccept(live.Identity, out var accepted) ? accepted : null;
    }

    private sealed class RequestCommands(InboundDraftCommandRequestScope scope) : IInboundDraftCommandService
    {
        private IInboundDraftCommandService Create()
        {
            if (scope.factory?.RuntimeAccepted != true) return new UnavailableInboundDraftCommandService();
            var fence = scope.NewFence();
            return scope.factory.CreateCommands(fence is null ? _ => Task.FromResult<AuthoritativeIdentity?>(null)
                : token => scope.Resolve(fence, token));
        }
        public async Task<InboundDraftReadResult> ReadAsync(string documentId, CancellationToken token = default)
        {
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(token, scope.requestAborted);
            return await Create().ReadAsync(documentId, linked.Token);
        }
        public async Task<InboundDraftResult> ExecuteAsync(InboundDraftCommand request, CancellationToken token = default)
        {
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(token, scope.requestAborted);
            return await Create().ExecuteAsync(request, linked.Token);
        }
        public async Task<InboundDraftResult> ReconcileAsync(InboundDraftCommand originalRequest, CancellationToken token = default)
        {
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(token, scope.requestAborted);
            return await Create().ReconcileAsync(originalRequest, linked.Token);
        }
    }
}
