using System.Diagnostics;
using System.Globalization;

namespace Medcom.Api;

// Durations only. Never emit SQL text, query strings, credentials, identities or
// row values. These headers describe BE work up to response headers, not the
// browser's entire round trip or a promise of deployed latency.
internal sealed class RequestPerformance
{
    private static readonly object Key=new();
    private readonly long started=Stopwatch.GetTimestamp();
    private readonly Dictionary<string,double> durations=new(StringComparer.Ordinal);
    internal static async Task Observe(HttpContext context,RequestDelegate next)
    {
        if(!context.Request.Path.StartsWithSegments("/api")){await next(context);return;}
        var metrics=new RequestPerformance();context.Items[Key]=metrics;
        context.Response.OnStarting(()=>
        {
            context.Response.Headers["Server-Timing"]=metrics.Header();return Task.CompletedTask;
        });
        try{await next(context);}
        finally
        {
            var elapsed=Stopwatch.GetElapsedTime(metrics.started).TotalMilliseconds;
            if(elapsed>=2000)
                context.RequestServices.GetRequiredService<ILogger<RequestPerformance>>().LogWarning(
                    new EventId(1120,"SlowBackendRequest"),
                    "Slow BE request; correlation {CorrelationId}; module {Module}; status {Status}; elapsed ms {ElapsedMilliseconds}; stages {Stages}",
                    context.TraceIdentifier,FeDisplayProjection.Module(context.Request.Path.Value??"")??"other",
                    context.Response.StatusCode,(long)elapsed,metrics.Header());
        }
    }
    internal static IDisposable Measure(HttpContext context,string stage)
        =>new Measurement(context.Items.TryGetValue(Key,out var value)?value as RequestPerformance:null,stage);
    private string Header()=>string.Join(", ",durations.OrderBy(p=>p.Key,StringComparer.Ordinal)
        .Select(p=>p.Key+";dur="+p.Value.ToString("F1",CultureInfo.InvariantCulture))
        .Append("be;dur="+Stopwatch.GetElapsedTime(started).TotalMilliseconds.ToString("F1",CultureInfo.InvariantCulture)));
    private sealed class Measurement(RequestPerformance? owner,string stage):IDisposable
    {
        private readonly long start=Stopwatch.GetTimestamp();private bool disposed;
        public void Dispose()
        {
            if(disposed||owner is null)return;disposed=true;
            owner.durations[stage]=owner.durations.GetValueOrDefault(stage)+Stopwatch.GetElapsedTime(start).TotalMilliseconds;
        }
    }
}
