using Medcom.Application;
using Medcom.Infrastructure;
using Microsoft.AspNetCore.Http;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class NativeReadSessionTests
{
    [Fact]
    public async Task Native_GET_uses_observed_identity_but_liveness_and_cancellation_still_apply()
    {
        var authority=new ControlledAuthority(); var clock=new ManualClock();
        var sessions=new LocalWebSessions(authority,clock,new(TimeSpan.FromMinutes(10),TimeSpan.FromMinutes(30),10));
        var session=sessions.Create(authority.Identity)!;
        var context=Context(session,"GET");
        // Inspection must not wait behind another authority query. Native SQL
        // readers independently check credentials and grants around the data read.
        authority.Pending=new TaskCompletionSource<IdentityResult>().Task;
        Assert.Equal(session.Identity,await NativeReadSession.Resolve(context,sessions,default).WaitAsync(TimeSpan.FromSeconds(2)));
        using var cancel=new CancellationTokenSource(); cancel.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(()=>NativeReadSession.Resolve(context,sessions,cancel.Token));
        sessions.Revoke(session.Token); Assert.Null(await NativeReadSession.Resolve(context,sessions,default));
    }

    [Theory]
    [InlineData("POST")]
    [InlineData("PUT")]
    [InlineData("PATCH")]
    [InlineData("DELETE")]
    public async Task Non_GET_provider_admission_revalidates_credential_and_permission_changes(string method)
    {
        var authority=new ControlledAuthority(); var sessions=new LocalWebSessions(authority,new ManualClock(),WebSessionPolicy.Default);
        var session=sessions.Create(authority.Identity)!;
        authority.Identity=authority.Identity with{AuthorityVersion=2,Capabilities=[]};
        Assert.Empty((await NativeReadSession.Resolve(Context(session,method),sessions,default))!.Capabilities);
        authority.Outcome=IdentityOutcome.Rejected;
        Assert.Null(await NativeReadSession.Resolve(Context(session,method),sessions,default));
    }

    [Fact]
    public async Task Registered_SQL_read_POST_does_not_queue_another_full_authority_query()
    {
        var authority=new ControlledAuthority();var sessions=new LocalWebSessions(authority,new ManualClock(),WebSessionPolicy.Default);
        var session=sessions.Create(authority.Identity)!;var context=Context(session,"POST");
        context.SetEndpoint(new Endpoint(null,new EndpointMetadataCollection(new NativeReadSession.SqlReadOperation()),"synthetic-read"));
        authority.Pending=new TaskCompletionSource<IdentityResult>().Task;
        Assert.True(NativeReadSession.IsRead(context));
        Assert.Equal(session.Identity,await NativeReadSession.Resolve(context,sessions,default).WaitAsync(TimeSpan.FromSeconds(2)));
        sessions.Revoke(session.Token);Assert.Null(await NativeReadSession.Resolve(context,sessions,default));
    }

    [Theory]
    [InlineData("/api/erp/purchase-requests/options")]
    [InlineData("/api/erp/purchase-requests/actions/send-pm/options")]
    public void Read_like_path_and_headers_cannot_select_read_admission(string path)
    {
        var context=new DefaultHttpContext();context.Request.Method="POST";context.Request.Path=path;
        context.Request.Headers["Medcom.SqlReadOperation"]="true";
        Assert.False(NativeReadSession.IsRead(context));
    }

    private static DefaultHttpContext Context(ResolvedSession session,string method)
    {
        var context=new DefaultHttpContext();context.Request.Method=method;context.Items[AuthEndpoints.ResolvedKey]=session;return context;
    }
}
