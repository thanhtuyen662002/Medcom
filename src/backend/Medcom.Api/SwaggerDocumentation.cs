namespace Medcom.Api;

// Documentation is static and anonymous, like the existing technical contract.
// API calls from this page still traverse the ordinary HTTPS/session/CSRF gates.
internal static class SwaggerDocumentation
{
    internal static void Use(WebApplication app)
    {
        app.Use(async (context, next) =>
        {
            if (context.Request.Path.StartsWithSegments("/swagger"))
                context.Response.OnStarting(() =>
                {
                    // Swagger's embedded static-file middleware sets its own
                    // cache header. Retain this host's no-store contract.
                    context.Response.Headers.CacheControl = "no-store";
                    return Task.CompletedTask;
                });
            var resource = context.Request.Path.Value switch
            {
                "/swagger/medcom-swagger.js" => ("medcom-swagger.js", "text/javascript"),
                "/swagger/medcom-swagger.css" => ("medcom-swagger.css", "text/css"),
                _ => ((string, string)?)null
            };
            if (resource is null || (!HttpMethods.IsGet(context.Request.Method)
                && !HttpMethods.IsHead(context.Request.Method)))
            {
                await next(context);
                return;
            }
            using var stream = Open(resource.Value.Item1);
            context.Response.ContentType = resource.Value.Item2 + "; charset=utf-8";
            context.Response.ContentLength = stream.Length;
            if (!HttpMethods.IsHead(context.Request.Method))
                await stream.CopyToAsync(context.Response.Body, context.RequestAborted);
        });
        app.UseSwaggerUI(options =>
        {
            options.RoutePrefix = "swagger";
            options.DocumentTitle = "Medcom — Kiểm tra API";
            // External initialization script works under the existing script-src
            // policy without unsafe-inline, unsafe-eval, CDN or remote validation.
            options.IndexStream = () => Open("index.html");
        });
    }

    private static Stream Open(string name) => typeof(SwaggerDocumentation).Assembly
        .GetManifestResourceStream("Medcom.Api.Swagger." + name)
        ?? throw new InvalidOperationException("Packaged API documentation resource is missing.");
}
