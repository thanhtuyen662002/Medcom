# A6 synthetic audit/trace behavior preparation

This local reference model separates immutable business/security audit events
from bounded diagnostic traces. Correlation and operation identifiers are
server-issued, never authority. Support lookup revalidates current permission,
scope and a fixture-configured bounded sequence window.

The model rejects mutable or malformed authority, Boolean generation spoofing,
control-character record injection, secret/unrestricted trace fields, duplicate
outcome recording and blind replay after `OutcomeUnknown`. Unknown completion
can transition exactly once to a typed terminal reconciliation outcome.
Diagnostic sink loss never rewrites the recorded business outcome.

This is adapter-independent synthetic preparation only. It does not prove an
ASP.NET pipeline, telemetry sink, command/audit transaction atomicity, legal
retention, legacy audit binding or production support access. No external sink,
database, Tool binary, HTTP endpoint or customer data is used.
