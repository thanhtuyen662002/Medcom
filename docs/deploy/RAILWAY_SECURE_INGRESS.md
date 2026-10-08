# Explicit secure ingress for Railway

## Default and purpose

`Medcom:Ingress:AllRequestsSecure` is **off when absent or false**. No environment
name or Railway marker enables it automatically. An invalid boolean fails startup.
The option changes only the effective request scheme to `https`, before
authentication, antiforgery and endpoints. Existing direct-TLS deployments need
no change. `AuthEndpoints` still requires HTTPS; cookie and CSRF policies remain.

This is an operator assertion about the complete ingress topology, not detection
of TLS on Kestrel and not authentication of a reverse proxy. The application does
not consume `Forwarded`, `X-Forwarded-*`, `X-Real-IP` or Railway edge headers.
Do not enable `ASPNETCORE_FORWARDEDHEADERS_ENABLED` or a separate broad forwarded
headers configuration alongside it.

## Activation gate

Deploy the reviewed, passing candidate with the option off first. Enable only
after the operator approves the trust boundary and verifies all these conditions:

1. Every public request uses Railway's managed HTTPS domain ingress. No public
   TCP proxy, alternate port exposure, direct HTTP listener exposure or unreviewed
   proxy path reaches the application.
2. All services and operators that can reach the backend listener within the
   Railway project/environment are trusted. The reviewed intended topology is the
   backend plus FE service. Review the live inventory again before activation.
3. The FE uses the fixed HTTPS backend origin and validates browser provenance
   before forwarding allowed ERP routes. No private HTTP BFF mode is introduced.
4. `AllowedHosts` contains only explicitly enumerated exact hostnames. Missing,
   empty, wildcard, URL, port-bearing or malformed entries fail startup while
   secure ingress is enabled. Native host filtering continues to enforce it.
5. Runtime and adversarial tests below pass for the actual deployed source head.

For the intended Medcom deployment the explicit settings are:

```text
Medcom__Ingress__AllRequestsSecure=true
AllowedHosts=medcom-production.up.railway.app;healthcheck.railway.app
```

The health-check hostname is explicitly allowed for the provider probe; verify
the actual probe behavior after deployment. `Host` is not proof of who sent a
request, even when allowlisted. Do not use it to infer secure transport.

## Security consequence

While enabled, **every request reaching the HTTP listener is treated as HTTPS**,
including a request from a private FE peer or a process/operator with access to
the container. Railway documents encrypted WireGuard private networking and
project/environment isolation, but those properties do not authenticate a
browser's original scheme or origin. A compromised trusted peer can supply Host
and Origin headers and reach the HTTPS-gated code path without Kestrel TLS.
It still needs valid credentials/session, CSRF and authorization as applicable.

Do not enable this option if that trust is unacceptable. Use a separately
reviewed, restricted/authenticated ingress topology instead. Re-review before
adding services, TCP exposure, listeners, or reverse proxies. A finite host list
is defense-in-depth; it does not replace ingress isolation.

## BFF origin semantics

The FE browser origin remains `https://medcom-fe-production.up.railway.app`.
The fixed backend origin remains `https://medcom-production.up.railway.app`.
The existing BFF validates browser Origin on POSTs (and inbound fetch provenance),
then supplies the fixed backend Origin where required by purchase/inbound APIs.
Do not forward arbitrary browser origins as authority, rewrite backend Host to
the FE host, expand CORS, or weaken secure host-only cookie handling.

## Verification and rollback

- Unit tests cover absent/false configuration, malformed values, exact hosts,
  and spoofed headers leaving Host, remote address, path and Origin unchanged.
- Synthetic loopback Kestrel tests cover early scheme application, CSRF,
  authentication, Secure/HttpOnly/Strict host-only cookies, hostile Origin and
  Host rejection, and the health-check Host. These deliberately relay synthetic
  cookies on an HTTP proxy hop; they do not model a browser accepting public HTTP.
- Run the existing direct-TLS authentication, purchase/inbound security and BFF
  tests unchanged, plus the repository's required CI checks.
- Before live credentials, verify anonymous CSRF over public HTTPS, secure cookie
  attributes, health probes, and plain-HTTP redirect behavior without sending
  credentials. Login returning an unconfigured-authority response does not prove
  real ERP login readiness.
- Roll back by removing the option or setting it to `false` and restarting. HTTP
  behind TLS termination will again fail secure auth flows; direct TLS is unchanged.

This option does not enable legacy authentication, SQL, private DLLs, business
writes, or production release acceptance.

## Provider references

- [Microsoft: manual scheme assertion when all external requests are secure](https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/proxy-load-balancer?view=aspnetcore-10.0#when-it-isnt-possible-to-add-forwarded-headers-and-all-requests-are-secure)
- [Railway public networking specifications](https://docs.railway.com/networking/public-networking/specs-and-limits)
- [Railway private networking architecture and isolation](https://docs.railway.com/networking/private-networking/how-it-works)

Railway documents HTTPS-only public domain ingress, redirecting HTTP GET and
converting HTTP POST to GET. Never send credentials to HTTP expecting a redirect
to protect them. These references justify the topology review; they are not an
application-side proof of a trusted socket peer.
