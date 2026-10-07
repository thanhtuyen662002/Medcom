using System.Data;
using Medcom.Application;
using Medcom.Contracts.Inbound;
using Medcom.Infrastructure;
using Medcom.Infrastructure.Inbound;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class InboundDraftCommandLivenessTests
{
    private sealed class Clock : TimeProvider
    {
        internal DateTimeOffset Now=new(2026,10,7,0,0,0,TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow()=>Now;
    }
    private sealed class Authority(InboundModel model) : IIdentityAuthority
    {
        internal int Calls,InsideCalls;
        public Task<IdentityResult> AuthenticateAsync(string user,string password,CancellationToken ct)=>throw new NotSupportedException();
        public Task<IdentityResult> RevalidateAsync(AuthoritativeIdentity identity,CancellationToken ct)
        {
            Calls++;
            if(model.TransactionActive){InsideCalls++;throw new InvalidOperationException("full revalidation inside owned transaction");}
            ct.ThrowIfCancellationRequested();
            return Task.FromResult(new IdentityResult(IdentityOutcome.Success,model.ActiveIdentity with {AuthorityVersion=identity.AuthorityVersion+1}));
        }
    }
    [Fact]
    public async Task Actual_request_scope_LocalWebSessions_and_native_factory_never_revalidate_in_a_transaction()
    {
        var m=InboundDraftTargetQualificationTests.Model();var authority=new Authority(m);var clock=new Clock();
        var sessions=new LocalWebSessions(authority,clock,new WebSessionPolicy(TimeSpan.FromMinutes(10),TimeSpan.FromMinutes(30),10));
        var session=Assert.IsType<ResolvedSession>(sessions.Create(m.ActiveIdentity));
        var services=new ServiceCollection();services.AddSingleton<IWebSessions>(sessions);
        services.AddDormantInboundDraftCommands(InboundDraftTargetQualificationTests.Factory(m));
        using var provider=services.BuildServiceProvider();using var scope=provider.CreateScope();
        var context=new DefaultHttpContext{User=AuthEndpoints.Principal(session)};context.Items[AuthEndpoints.ResolvedKey]=session;
        provider.GetRequiredService<IHttpContextAccessor>().HttpContext=context;
        var access=scope.ServiceProvider.GetRequiredService<IInboundDraftCommandAccess>();
        var commands=scope.ServiceProvider.GetRequiredService<Medcom.Application.Inbound.IInboundDraftCommandService>();
        Assert.NotNull(await access.ResolveAsync(session,"DOC-IN-1",default));
        var read=await commands.ReadAsync("DOC-IN-1");Assert.Equal(InboundDraftOutcome.Observed,read.Outcome);
        var save=new InboundDraftCommand(Guid.NewGuid(),InboundDraftAction.Save,"DOC-IN-1",read.Document!.StateEqualityToken,InboundModel.Header);
        var result=await commands.ExecuteAsync(save);Assert.Equal(InboundDraftOutcome.Committed,result.Outcome);
        Assert.Equal(InboundDraftOutcome.Replayed,(await commands.ReconcileAsync(save)).Outcome);
        Assert.Equal(0,authority.InsideCalls);Assert.True(authority.Calls>=6);
        var factories=m.FactoryCalls;var calls=authority.Calls;
        for(var i=0;i<4;i++)Assert.NotNull(await sessions.InspectAsync(session.Token,default));
        Assert.Equal(factories,m.FactoryCalls);Assert.Equal(calls,authority.Calls);
    }
    [Theory]
    [InlineData("logout","reserve")][InlineData("expiry","reserve")][InlineData("cancel","reserve")]
    [InlineData("logout","header")][InlineData("expiry","header")][InlineData("cancel","header")]
    [InlineData("logout","record")][InlineData("expiry","record")][InlineData("cancel","record")]
    [InlineData("logout","business-commit-ack")][InlineData("expiry","business-commit-ack")][InlineData("cancel","business-commit-ack")]
    public async Task Local_loss_at_reservation_effects_and_possible_commit_preserves_original_custody(string loss,string at)
    {
        var m=InboundDraftTargetQualificationTests.Model();var authority=new Authority(m);var clock=new Clock();
        var sessions=new LocalWebSessions(authority,clock,new WebSessionPolicy(TimeSpan.FromMinutes(10),TimeSpan.FromMinutes(30),10));
        var session=Assert.IsType<ResolvedSession>(sessions.Create(m.ActiveIdentity));
        async Task<AuthoritativeIdentity?> Resolve(CancellationToken ct)=>(await sessions.ResolveAsync(session.Token,false,ct))?.Identity;
        async Task<AuthoritativeIdentity?> Inspect(CancellationToken ct)
        {
            var calls=authority.Calls;var factories=m.FactoryCalls;
            var live=await sessions.InspectAsync(session.Token,ct);
            Assert.Equal(calls,authority.Calls);Assert.Equal(factories,m.FactoryCalls);return live?.Identity;
        }
        var factory=InboundDraftTargetQualificationTests.Factory(m);var commands=factory.CreateCommands(Resolve,Inspect);
        var read=await commands.ReadAsync("DOC-IN-1");Assert.Equal(InboundDraftOutcome.Observed,read.Outcome);
        var original=new InboundDraftCommand(Guid.NewGuid(),InboundDraftAction.Save,"DOC-IN-1",read.Document!.StateEqualityToken,InboundModel.Header with {Notes="changed"});
        using var cancellation=new CancellationTokenSource();m.Events.Clear();
        m.OnEvent=tag=>
        {
            if(tag!=at)return;
            if(loss=="logout")sessions.Revoke(session.Token);
            if(loss=="expiry")clock.Now=clock.Now.AddMinutes(11);
            if(loss=="cancel")cancellation.Cancel();
        };
        var result=await commands.ExecuteAsync(original,cancellation.Token);
        Assert.Null(result.Receipt);Assert.NotEqual(InboundDraftOutcome.Committed,result.Outcome);Assert.Equal(0,authority.InsideCalls);
        var possible=at=="business-commit-ack";
        Assert.Equal(possible?2:at=="reserve"?0:1,m.CommitAcks);
        Assert.Equal(possible?"changed":"original",m.Tables[0].Rows[0]["Notes"]);
        if(possible)
        {
            Assert.Equal(InboundDraftOutcome.OutcomeUnknown,result.Outcome);
            Assert.DoesNotContain("rollback",m.Events);
        }
        m.OnEvent=null;session=Assert.IsType<ResolvedSession>(sessions.Create(m.ActiveIdentity));
        var writes=m.BusinessWrites;var commits=m.CommitAcks;
        var reconcile=await factory.CreateCommands(Resolve,Inspect).ReconcileAsync(original);
        Assert.Equal(possible?InboundDraftOutcome.Replayed:InboundDraftOutcome.OutcomeUnknown,reconcile.Outcome);
        Assert.Equal(writes,m.BusinessWrites);Assert.Equal(commits,m.CommitAcks);
    }
    [Theory]
    [InlineData("actor")][InlineData("company")][InlineData("tenant")][InlineData("credential")]
    [InlineData("branch")][InlineData("capability")][InlineData("version")]
    public async Task Changed_local_scope_or_regressed_version_after_reservation_prevents_dispatch(string change)
    {
        var m=InboundDraftTargetQualificationTests.Model();var commands=InboundDraftTargetQualificationTests.Factory(m).CreateCommands(m.ResolveAsync,m.InspectAsync);
        var read=await commands.ReadAsync("DOC-IN-1");Assert.Equal(InboundDraftOutcome.Observed,read.Outcome);
        var request=new InboundDraftCommand(Guid.NewGuid(),InboundDraftAction.Save,"DOC-IN-1",read.Document!.StateEqualityToken,InboundModel.Header);
        m.ActiveIdentity=m.ActiveIdentity with{AuthorityVersion=4};
        m.OnEvent=tag=>
        {
            if(tag!="reserve-commit-ack")return;
            m.ActiveIdentity=change switch
            {
                "actor"=>m.ActiveIdentity with{PrincipalId="other"},"company"=>m.ActiveIdentity with{CompanyId="other"},
                "tenant"=>m.ActiveIdentity with{TenantId="other"},"credential"=>m.ActiveIdentity with{CredentialStamp="other"},
                "branch"=>m.ActiveIdentity with{BranchIds=["BR-B"]},"capability"=>m.ActiveIdentity with{Capabilities=["extra"]},
                _=>m.ActiveIdentity with{AuthorityVersion=3}
            };
        };
        var result=await commands.ExecuteAsync(request);Assert.Equal(InboundDraftOutcome.Denied,result.Outcome);
        Assert.Null(result.Receipt);Assert.Equal(1,m.CommitAcks);Assert.Equal(0,m.BusinessWrites);Assert.Equal(0,m.Journal.Rows[0]["State"]);
    }
    [Theory]
    [InlineData("transaction-dispose",false)][InlineData("connection-dispose",false)]
    [InlineData("transaction-dispose",true)][InlineData("connection-dispose",true)]
    public async Task Cleanup_faults_stop_phase_transition_and_do_not_release_committed_receipts(string at,bool afterEffects)
    {
        var m=InboundDraftTargetQualificationTests.Model();var commands=InboundDraftTargetQualificationTests.Factory(m).CreateCommands(m.ResolveAsync,m.InspectAsync);
        var read=await commands.ReadAsync("DOC-IN-1");var request=new InboundDraftCommand(Guid.NewGuid(),InboundDraftAction.Save,"DOC-IN-1",read.Document!.StateEqualityToken,InboundModel.Header);
        m.OnEvent=tag=>{if(tag==at && m.CommitAcks==(afterEffects?2:1))throw new IOException("synthetic cleanup fault");};
        var result=await commands.ExecuteAsync(request);Assert.Equal(InboundDraftOutcome.OutcomeUnknown,result.Outcome);Assert.Null(result.Receipt);
        Assert.Equal(afterEffects?2:1,m.CommitAcks);Assert.Equal(afterEffects?1:0,m.BusinessWrites);
        Assert.Equal(0,m.FullDuringTransaction);
    }
    [Fact]
    public async Task Omitted_local_delegate_fails_closed_without_falling_back_to_full_resolution()
    {
        var m=InboundDraftTargetQualificationTests.Model();var factory=InboundDraftTargetQualificationTests.Factory(m);
        Assert.Equal(InboundDraftOutcome.Denied,(await factory.CreateCommands(m.ResolveAsync).ReadAsync("DOC-IN-1")).Outcome);
        Assert.Equal(InboundDraftCommandAuthorityOutcome.Denied,(await factory.CreateAuthorityReader(m.ResolveAsync).ReadAsync("DOC-IN-1")).Outcome);
        Assert.Equal(0,m.FullDuringTransaction);Assert.DoesNotContain("user",m.Events);
    }
    private sealed class FallbackSessions(ResolvedSession session,InboundModel model) : IWebSessions
    {
        internal int Calls,InsideCalls;
        public ResolvedSession? Create(AuthoritativeIdentity identity)=>session;
        public void Revoke(string token){}
        public Task<ResolvedSession?> ResolveAsync(string token,bool interaction,CancellationToken ct)
        {Calls++;if(model.TransactionActive)InsideCalls++;return Task.FromResult<ResolvedSession?>(session);}
        // Deliberately inherits the unsafe-for-transactions default InspectAsync.
    }
    [Fact]
    public async Task Request_scope_does_not_invoke_unknown_stores_default_Inspect_fallback()
    {
        var m=InboundDraftTargetQualificationTests.Model();
        var local=new LocalWebSessions(new Authority(m),new Clock(),new WebSessionPolicy(TimeSpan.FromMinutes(10),TimeSpan.FromMinutes(30),10));
        var anchor=Assert.IsType<ResolvedSession>(local.Create(m.ActiveIdentity));var fallback=new FallbackSessions(anchor,m);
        var services=new ServiceCollection();services.AddSingleton<IWebSessions>(fallback);
        services.AddDormantInboundDraftCommands(InboundDraftTargetQualificationTests.Factory(m));
        using var provider=services.BuildServiceProvider();using var scope=provider.CreateScope();
        var context=new DefaultHttpContext{User=AuthEndpoints.Principal(anchor)};context.Items[AuthEndpoints.ResolvedKey]=anchor;
        provider.GetRequiredService<IHttpContextAccessor>().HttpContext=context;
        var commands=scope.ServiceProvider.GetRequiredService<Medcom.Application.Inbound.IInboundDraftCommandService>();
        Assert.Equal(InboundDraftOutcome.Denied,(await commands.ReadAsync("DOC-IN-1")).Outcome);
        Assert.Equal(1,fallback.Calls);Assert.Equal(0,fallback.InsideCalls);Assert.DoesNotContain("user",m.Events);
    }
    [Theory]
    [InlineData("user")][InlineData("native-user")][InlineData("grants")][InlineData("native-restricted")]
    public async Task Logout_during_last_native_grant_read_cannot_slip_past_the_local_precommit_fence(string at)
    {
        var m=InboundDraftTargetQualificationTests.Model();var a=new Authority(m);
        var sessions=new LocalWebSessions(a,new Clock(),new WebSessionPolicy(TimeSpan.FromMinutes(10),TimeSpan.FromMinutes(30),10));
        var session=Assert.IsType<ResolvedSession>(sessions.Create(m.ActiveIdentity));
        async Task<AuthoritativeIdentity?> Resolve(CancellationToken ct)=>(await sessions.ResolveAsync(session.Token,false,ct))?.Identity;
        async Task<AuthoritativeIdentity?> Inspect(CancellationToken ct)=>(await sessions.InspectAsync(session.Token,ct))?.Identity;
        var c=InboundDraftTargetQualificationTests.Factory(m).CreateCommands(Resolve,Inspect);
        var read=await c.ReadAsync("DOC-IN-1");var r=new InboundDraftCommand(Guid.NewGuid(),InboundDraftAction.Save,"DOC-IN-1",read.Document!.StateEqualityToken,InboundModel.Header);
        var written=false;m.OnEvent=tag=>{if(tag=="record")written=true;if(written && tag==at)sessions.Revoke(session.Token);};
        var result=await c.ExecuteAsync(r);Assert.Equal(InboundDraftOutcome.Denied,result.Outcome);Assert.Null(result.Receipt);
        Assert.Equal(1,m.CommitAcks);Assert.Equal(0,m.Journal.Rows[0]["State"]);Assert.Equal(0,a.InsideCalls);
    }

}
