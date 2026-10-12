# Swagger API inspection

Owner request, 2026-10-12: add an API inspection UI to the existing backend.

Implementation in progress on `codex/be-swagger-20261012`, based on main
`c657f03ff779ae72fa1d10082ec4ac4edb923f74`. This scope covers only backend
documentation assets, their packaging, tests and usage instructions. It does not
change the separately owned FE application or the ERP data/schema.

Verified source: `ApiContractCatalog.cs` serves the existing technical contract
at `/api/contracts/openapi.json`; `ApiContractCatalogTests.cs` reconciles its 243
method/path pairs with the host. `ApiHost.cs`, `AuthEndpoints.cs` and
`WorkspaceReadScope.cs` remain the authentication, CSRF and scope authorities.

Planned UI: `/swagger`, packaged local Swagger UI assets, same-origin API calls,
automatic CSRF/scope acquisition for explicitly executed requests, and no
credential persistence or automatic command retries. Runtime acceptance on the
owner's VPS remains UNKNOWN until the updated artifact is installed and tested.
