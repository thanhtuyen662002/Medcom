# I72: six-screen CUD and action integration

Owner direction: 2026-10-10 Asia/Saigon. Base `8531b9e18c6073982a9cb8d28345cb8da89ff466` follows merged PR #128. Custody: `docs/execution/direct-runs/I72.json`; this is a new direct isolated scope, not a takeover of a historical scheduled claim. Goal #45 remains open.

The requested implementation covers create/update/delete, workflow actions and per-record button visibility/enabled state, bounded dropdown/dropselect queries, and source-record selection/import into a new document. Screen groups are purchase requests, sales order management, internal transfer requests, both warehouse/sales QR scanning, machine movement/handover and machine repair/warranty/maintenance. Every group remains in scope; the final FE handoff must name each button, its route, payload and state/authority requirements.

Current configuration/procedure bindings are being verified against the owner-authorized MedData read-only audit and separately identified latest local ERP binaries. Exact menu/form identities, action transitions, numbering, link mappings and target runtime acceptance are UNKNOWN until verified. Historical configuration is supplementary evidence; absent rows in one configuration table do not prove an action is absent from the ERP.

The prior I71 actual main passed all four fresh push workflows. Linux and Windows each passed 3,140 backend cases; checked candidate SHA-256 is `d503d03cf89d9ba81bda47ec52a9d6fd10e62e882352ef630e42fbbed8ba0833`. Durable source/base, current-main CI and package evidence: PR #128 final checkpoint, `https://github.com/thanhtuyen662002/Medcom/pull/128#issuecomment-6093667787`. This establishes the clean implementation base, not production acceptance.

Only sanitized technical evidence and code are published. The existing password mechanism, server-side scope/permission checks, state concurrency, transaction/audit/idempotency boundaries and release admission are preserved. No production database write, raw source/row export, FE mutation, deployment or automation administration is performed by this admission.
