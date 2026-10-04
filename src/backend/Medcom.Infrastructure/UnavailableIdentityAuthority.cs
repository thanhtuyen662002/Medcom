using Medcom.Application;

namespace Medcom.Infrastructure;

// No guessed call to VerifyUserPass: its metadata does not prove login semantics.
public sealed class UnavailableIdentityAuthority : IIdentityAuthority
{
    public Task<IdentityResult> AuthenticateAsync(string username, string password,
        CancellationToken cancellationToken) => Task.FromResult(new IdentityResult(IdentityOutcome.Unavailable));

    public Task<IdentityResult> RevalidateAsync(AuthoritativeIdentity identity,
        CancellationToken cancellationToken) => Task.FromResult(new IdentityResult(IdentityOutcome.Unavailable));
}
