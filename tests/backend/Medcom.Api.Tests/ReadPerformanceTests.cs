using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Net;
using Medcom.Application;
using Medcom.Contracts;
using Medcom.Infrastructure;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class ReadPerformanceTests
{
    [Fact]
    public async Task Registered_POST_reads_share_one_overlapping_cookie_observation_and_do_not_revalidate_in_providers()
    {
        var authority=new GateAuthority();var sessions=new LocalWebSessions(authority,new ManualClock(),WebSessionPolicy.Default);
        var session=sessions.Create(ControlledAuthority.Original)!;
        async Task Read()
        {
            var cookie=await sessions.ResolveReadAsync(session.Token,default);Assert.NotNull(cookie);
            var context=new DefaultHttpContext();context.Request.Method="POST";
            context.Items[AuthEndpoints.ResolvedKey]=cookie;
            context.SetEndpoint(new Endpoint(null,new EndpointMetadataCollection(new NativeReadSession.SqlReadOperation()),"synthetic"));
            for(var i=0;i<3;i++)Assert.NotNull(await NativeReadSession.Resolve(context,sessions,default));
        }
        var reads=Enumerable.Range(0,8).Select(_=>Read()).ToArray();Assert.Equal(1,authority.Reads);
        authority.Release.SetResult();await Task.WhenAll(reads).WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Equal(1,authority.Reads);
        // A subsequent request must observe DB authority again; this is not a TTL cache.
        Assert.NotNull(await sessions.ResolveReadAsync(session.Token,default));Assert.Equal(2,authority.Reads);
        authority.Rejected=true;Assert.Null(await sessions.ResolveReadAsync(session.Token,default));
        Assert.Null(await sessions.InspectAsync(session.Token,default));
    }

    [Fact]
    public async Task Only_registered_read_POSTs_have_the_SQL_read_marker_and_every_command_keeps_mutation_admission()
    {
        var builder=WebApplication.CreateBuilder();builder.Services.AddSingleton<IErpScreenService,UnavailableErpScreenService>();
        await using var app=builder.Build();ErpScreenEndpoints.Map(app);
        var routes=((IEndpointRouteBuilder)app).DataSources.SelectMany(s=>s.Endpoints).OfType<RouteEndpoint>().ToArray();
        foreach(var module in ErpScreenCatalog.ModuleIds)
        {
            var endpoint=Assert.Single(routes,r=>r.RoutePattern.RawText=="/api/erp/"+module+"/options");
            Assert.NotNull(endpoint.Metadata.GetMetadata<NativeReadSession.SqlReadOperation>());
        }
        var commands=routes.Where(e=>e.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods.Contains("POST")==true
            &&e.RoutePattern.RawText is {} path&&!path.EndsWith("/options",StringComparison.Ordinal)
            &&!path.EndsWith("/selection",StringComparison.Ordinal)&&!path.EndsWith("/paste/validate",StringComparison.Ordinal)
            &&!path.EndsWith("/item-price",StringComparison.Ordinal)&&!path.EndsWith("/commands/lookup",StringComparison.Ordinal)).ToArray();
        Assert.True(commands.Length>50);
        Assert.All(commands,e=>Assert.Null(e.Metadata.GetMetadata<NativeReadSession.SqlReadOperation>()));
    }

    [Fact]
    public async Task HTTP_reads_expose_finite_BE_stage_durations_without_query_values_or_changing_data_contracts()
    {
        await using var fixture=await PurchaseHttpFixture.Start();await fixture.Login();
        using var response=await fixture.Client.GetAsync("/api/purchase-requests?search=PRIVATE_QUERY_SENTINEL");
        Assert.Equal(HttpStatusCode.OK,response.StatusCode);
        var timing=string.Join(", ",response.Headers.GetValues("Server-Timing"));
        Assert.Contains("auth;dur=",timing);Assert.Contains("provider;dur=",timing);Assert.Contains("be;dur=",timing);
        Assert.DoesNotContain("PRIVATE",timing);Assert.DoesNotContain("qa-user",timing);
        Assert.All(timing.Split(", "),entry=>Assert.Matches(@"^(auth|provider|references|be);dur=[0-9]+\.[0-9]$",entry));
    }

    [Theory]
    [InlineData("valid")][InlineData("middle-invalid")][InlineData("missing-result")][InlineData("extra-result")]
    public async Task Reference_metadata_is_one_exchange_and_incompatible_or_missing_results_cannot_be_accepted(string mutation)
    {
        var bindings=new[]{ApiReferenceCatalog.Get("item")!,ApiReferenceCatalog.Get("branch")!,ApiReferenceCatalog.Get("currency")!};
        var exchanges=0;
        using var connection=new DisplayConnection(command=>
        {
            exchanges++;Assert.Equal(3,command.Parameters.Count);
            var tables=bindings.Select((binding,index)=>
            {
                Assert.Equal("dbo."+binding.Table,command.Parameters["@table"+index].Value);
                var table=new DataTable();table.Columns.Add("name",typeof(string));table.Columns.Add("type",typeof(string));
                table.Columns.Add("max_length",typeof(short));table.Columns.Add("nullable",typeof(bool));
                foreach(var column in binding.Columns)
                {
                    var length=column.TypeArguments is null?0:column.TypeArguments=="(max)"?-1:int.Parse(column.TypeArguments.Trim('(',')'),CultureInfo.InvariantCulture);
                    if(length>0&&column.Type.StartsWith('n'))length*=2;
                    table.Rows.Add(column.Name,column.Type,(short)length,column.Nullable);
                }
                if(index==1&&mutation=="middle-invalid")table.Rows[0][1]="invalid";
                return table;
            }).ToArray();
            return new DataTableReader(mutation=="missing-result"?tables[..^1]:mutation=="extra-result"?[..tables,tables[0].Copy()]:tables);
        });
        connection.Open();using var transaction=connection.BeginTransaction(IsolationLevel.Serializable);
        if(mutation.EndsWith("result",StringComparison.Ordinal))
            await Assert.ThrowsAsync<InvalidOperationException>(()=>SqlReferenceData.Shapes(transaction,bindings,default));
        else
        {
            var shapes=await SqlReferenceData.Shapes(transaction,bindings,default);
            Assert.True(shapes["item"]);Assert.True(shapes["currency"]);Assert.Equal(mutation=="valid",shapes["branch"]);
        }
        Assert.Equal(1,exchanges);
    }

    private sealed class GateAuthority:IIdentityAuthority
    {
        internal readonly TaskCompletionSource Release=new(TaskCreationOptions.RunContinuationsAsynchronously);
        internal int Reads;internal bool Rejected;
        public Task<IdentityResult> AuthenticateAsync(string user,string password,CancellationToken token)=>throw new NotSupportedException();
        public async Task<IdentityResult> RevalidateAsync(AuthoritativeIdentity identity,CancellationToken token)
        {Interlocked.Increment(ref Reads);await Release.Task.WaitAsync(token);return new(Rejected?IdentityOutcome.Rejected:IdentityOutcome.Success,identity);}
    }
}
