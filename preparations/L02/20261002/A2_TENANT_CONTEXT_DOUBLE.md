# A2 tenant-context synthetic acceptance model

`tenant_context_double.py` is a standard-library-only reference model for the
server-authoritative tenant/company/data-source boundary. It is deliberately
not an implementation proposal for legacy credentials, connection strings,
pool disposal, Tool login or business queries.

The model makes four reviewable invariants executable:

1. the caller requests an allowed company context but never supplies the data
   source selected by the server mapping;
2. connection, cache, job, hub and result tickets carry immutable principal,
   tenant, company, data-source and mapping-generation identity;
3. every use, including job execution and late-result delivery, rechecks that
   exact identity against current membership and mapping generation; and
4. an accepted mapping change is a compare-and-swap that advances the
   generation once, so old resources cannot be revived or relabelled.

`test_tenant_context_double.py` exercises 18 synthetic behaviors, including
identical business IDs in different tenants, cross-principal reuse, stale jobs,
late results, stale mapping updates, non-integer generations, malformed
identifiers and immutable snapshots.

This is local L02 preparation only. It does not allocate an application path,
prove connection cleanup, establish the exact legacy mapping, execute a .NET
build, or close A2/#13. Those steps remain gated by A1 build availability,
reviewed path ownership/lease admission and B4/T1 evidence where applicable.
