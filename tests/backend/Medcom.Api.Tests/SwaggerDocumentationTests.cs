using System.Net;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class SwaggerDocumentationTests
{
    [Fact]
    public async Task Packaged_documentation_is_public_under_existing_CSP_without_identity_or_SQL_resolution()
    {
        await using var fixture = await PurchaseHttpFixture.Start();
        using var redirect = await fixture.Client.GetAsync("/swagger");
        Assert.Equal(HttpStatusCode.MovedPermanently, redirect.StatusCode);
        Assert.Equal("swagger/index.html", redirect.Headers.Location!.ToString());
        foreach (var path in new[] { "/swagger/index.html", "/swagger/swagger-ui.css",
            "/swagger/swagger-ui-bundle.js", "/swagger/medcom-swagger.js", "/swagger/medcom-swagger.css" })
        {
            using var response = await fixture.Client.GetAsync(path);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.True(response.Headers.CacheControl?.NoStore);
            Assert.Contains("script-src 'self'", response.Headers.GetValues("Content-Security-Policy").Single());
            Assert.DoesNotContain("script-src 'self' 'unsafe-inline'", response.Headers.GetValues("Content-Security-Policy").Single());
            Assert.Equal("DENY", response.Headers.GetValues("X-Frame-Options").Single());
            Assert.DoesNotContain("Set-Cookie", response.Headers.Select(header => header.Key));
        }
        Assert.Equal(0, fixture.Authority.Revalidations);
        Assert.Equal(0, fixture.Source.Commits);
        using var html = await fixture.Client.GetAsync("/swagger/index.html");
        var text = await html.Content.ReadAsStringAsync();
        Assert.Contains("src=\"./medcom-swagger.js\"", text);
        Assert.DoesNotContain("<script>", text);
        Assert.DoesNotContain("https://", text); // assets do not require a CDN
        Assert.DoesNotContain("synthetic-password", text);

        await fixture.Login();
        var resolutions = fixture.Authority.Revalidations;
        fixture.Authority.Rejected = true;
        using var authenticatedPage = await fixture.Client.GetAsync("/swagger/index.html");
        using var authenticatedScript = await fixture.Client.GetAsync("/swagger/medcom-swagger.js");
        Assert.Equal(HttpStatusCode.OK, authenticatedPage.StatusCode);
        Assert.Equal(HttpStatusCode.OK, authenticatedScript.StatusCode);
        Assert.Equal(resolutions, fixture.Authority.Revalidations);
        using var protectedRequest = await fixture.Client.GetAsync("/api/workspace");
        Assert.Equal(HttpStatusCode.Unauthorized, protectedRequest.StatusCode);
        Assert.True(fixture.Authority.Revalidations > resolutions);
    }

    [Fact]
    public async Task Swagger_does_not_bypass_session_CSRF_or_capability_guards()
    {
        await using var fixture = await PurchaseHttpFixture.Start();
        using var anonymous = await fixture.Client.GetAsync("/api/workspace");
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
        await fixture.Login();
        using var missingCsrf = await fixture.Client.PostAsync("/api/auth/session/continue", null);
        Assert.Equal(HttpStatusCode.Forbidden, missingCsrf.StatusCode);
        using var denied = await fixture.Client.GetAsync("/api/v2/documents/purchase-orders");
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        using var workspace = await fixture.Client.GetAsync("/api/workspace");
        Assert.Equal(HttpStatusCode.OK, workspace.StatusCode);
        Assert.NotEmpty(workspace.Headers.GetValues("X-Medcom-Read-Scope").Single());
        using var continued = await fixture.Post("/api/auth/session/continue", null);
        Assert.Equal(HttpStatusCode.OK, continued.StatusCode);
        Assert.Equal(0, fixture.Source.Commits);
    }
}
