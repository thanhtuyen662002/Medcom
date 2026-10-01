# TRC-DB-001 and exhaustive traceability — closure decision

Decision date: 2026-10-02, Asia/Saigon. Owner: Lead / L01; DB evidence owner: L03 / B2 / issue #21. This decision follows the owner's explicit request to review/merge PR #43 and decide how to close the two remaining evidence gates. It narrows closure to finite evidence exports; it does not replace evidence with a plan.

## Decisions

| Item | Decision on available evidence | Exact reason |
|---|---|---|
| PR #43 | Merge the reviewed documentation/metadata head after corrective validation and expected-head recheck | Independent reviews find no product-code change or semantic merge blocker; local metadata/link/dependency checks are applicable, and no workflow/check/status is reported. Source/runtime gaps are recorded rather than certified. |
| TRC-DB-001 / B2 / #21; Phase 1 DB #2 | **Keep open: waiting authoritative source and catalog export** | No per-object/per-column DB catalog or dependency export is retained. Aggregate counts cannot prove the 583 identities and 7,985 column records or their ownership/definitions. |
| Exhaustive ERP–Web–DB disposition coverage; Lead #5 | **Keep open: missing source manifest and total export** | The bounded join does not enumerate all 232 DAT artifacts, 786 candidate-current RPX identities, 23 corroborated form identities and other verified config/action/template members. A complete filter-family subset is not the exhaustive population. |
| Runtime/pilot unknowns | **Retain separate implementation gates** | Actual Tool session/permission/action/transaction/restore facts cannot be closed by static coverage. Conversely, these runtime investigations must not create an indefinite wait for a complete static catalog/disposition export. |

The distinction resolves a contradictory final sentence in the previous traceability audit: **coverage closure** may contain properly owned bounded runtime UNKNOWNs; **safe business enablement** still requires the corresponding runtime acceptance. Missing manifest membership and extractable DB metadata are neither optional nor allowed to become blanket UNKNOWNs.

## Source-access checkpoint

The approved ERP archive hash is `801cccb871fedce049ec3c446aeff819d7661ec94641a891d6013d4b86a0bd52`; approved SQL archive hash is `2d809c2e0d4c80700a1e8946c8f09db45a5840ec6735413bd46c3bd1d1ee1e0c`, as registered in `docs/SOURCE_BASELINE.md`.

Current authorized Library inspection returned the maintenance guide and no raw ERP/SQL archive; Shared with me returned no files. Exact and simpler filename searches returned no archive candidates. The selected Page's two archive references could not be resolved as visible file content. These are access observations, not proof that the archives do not exist. This run did not reopen or rehash them and must not reuse another account's inaccessible file IDs. Restored access must yield actual bytes and match the approved hash before extraction; a different source set requires an explicit compatibility record.

## Finite TRC-DB-001 closure package

L03 owns one generated sanitized `inventories/db/` catalog, extraction manifest and validator. Use the approved SQL script, not the older guide's database or a hand-built list. Retain reproducible extraction rules and source spans/hashes while excluding all data rows, secrets and raw dump text.

| Export dimension | Required finite validation |
|---|---|
| Source / normalization | Exact archive/script identity, extraction version and rules; reconcile CREATE/ALTER duplicates and temporary/nonpermanent exclusions; Script-effective/candidate definition selection and CREATE/ALTER/version disposition are explicit rather than silently first/last; conditional ambiguity is retained and actual deployed selection remains a separate runtime UNKNOWN. |
| Schemas / tables | Every normalized schema/table has a stable qualified identity, source span, class and reuse disposition; canonical 583 permanent tables match exact identity sets. |
| Columns / types | Reconcile all 7,985 parsed table-column declarations (5,610 nullable / 2,375 NOT NULL) to sourced records with ordinal, exact type/length/precision/scale, computed and identity information. Separately validate normalized table/column identities and every CREATE/ALTER/version disposition; declaration counts do not imply live/effective column counts. |
| Constraints / indexes | Complete owner and ordered column/expression metadata; PK/FK/unique/check/default IDs and relevant actions/trust/disabled flags; implicit PK/unique indexes included, not only explicit CREATE INDEX. Reconcile 533 PK tables and 50 keyless tables as table counts; 364 FK, 812 default, 558 check and seven explicit ALTER unique records as declaration counts, with normalized identities separately reviewed. |
| Programmable objects | Per-object script-effective/candidate definition hash(es), explicit version/conditional disposition, source spans, parameters/return shape and static read/write/transaction flags; exact sets reconcile 203 views / 591 procedures / 109 functions / three distinct triggers. Declaration counts remain separate. |
| Dependencies | Every programmable definition/body region is covered by the extraction manifest: parsed or explicitly unsupported/quarantined with source span, reason and owner. Detect dynamic SQL/EXEC forms and reconcile reference-site counts; unsupported text is never silently dropped. Every parser-observed reference site resolves to a qualified object edge or a specific dynamic/ambiguous/unresolved disposition with source span, reason and owner. Include synonyms, sequences, cross-database/external targets and caller limitations where present; no claim that static parsing proves runtime reachability. |
| Classification / reuse | Every object has reuse/facade/controlled-change/additive-config/retire/unknown disposition and evidence/confidence; non-prefix and unknown classes are retained, not dropped. |
| Referential validation | Zero orphan owned records; complete table/column/constraint/index ownership; every referenced verified DB ID resolves; duplicate/unresolved sites and count drift fail visibly or carry reviewed bounded disposition. |
| Review / execution | Independent reviewer compares exact sets, samples source boundaries and reviews every unresolved extraction class. Run reproducible catalog validation on the published head. Static evidence validation is sufficient for this evidence node; product mutation, runtime/performance and restore tests remain their separate issues. |

The count vocabulary and complete record shape are owned by `docs/db/PHASE1_CATALOG_COVERAGE_MATRIX.md`. Do not introduce another mutable count baseline. Close #21/TRC-DB-001 only after this package is published, independently validated and its acceptance actually passes. Phase 1 #2 is a broader inventory review; compare its remaining scope before closing it as a duplicate or together with B2.

## Finite exhaustive traceability closure package

L01 assembles one total disposition export from actual package manifests, L03 catalog IDs and the specialist evidence. Package-manifest work is shared with L04/L05 for source/config and L09 for reports, without duplicating DB catalog ownership.

1. Generate the complete approved-source artifact manifest with qualified relative paths, artifact kind, hash/version and evidence class. Reconcile the 232 DAT population, candidate-current versus backup/historical RPX populations, named 23 corroborated forms and all verified configuration/action/template members. Basenames can collide; per-path identities and collision disposition are mandatory. Do not add the category counts and call the sum unique identities.
2. Give every in-scope VERIFIED source ID a stable Web capability/screen/report disposition and typed API/query/command/report disposition. Grouped disposition is allowed only when explicit membership enumerates every member and the validator proves total coverage.
3. Attach exact verified DB IDs/dependency edges where the source supports them. A literal table/view-like token or alias in DAT is only a verified literal reference, not proof of catalog existence, join, permission or executable binding. Quarantine unresolved alias-dependent fields until the matching query/source contract is proved.
4. Each remaining semantic UNKNOWN records the specific fact, source scope, primary issue/owner, acceptance and fail-closed unsupported behavior. Permission/data scope, freshness, coexistence and report/export disposition are present for every applicable member. Dump-extractable metadata and unenumerated artifacts cannot use this exception.
5. Validate source-set equality, zero omitted/duplicate members, zero orphan Web/API/DB links, declared exclusions, complete blocker ownership and no INFERRED-to-VERIFIED promotion. Review the exact published export and evidence references independently.
6. Mark **Gate 4 coverage PASS** only after these finite checks pass. Keep TRC-TOOL/TRC-AUTH and F5–F9/R2/R3/runtime gates open where acceptance is still unproved; coverage PASS is no permission to enable them. Lead #5 closes only when its broader seven-gate duties are met, rather than because one export passes.

Current bounded filter evidence can be normalized immediately, including its 13 families and 24 members, 600 rows and 18 literal DB identifiers. It improves the seed join and corrects aliases; it cannot fabricate the missing non-filter DAT/report/form/template manifests.

## Ordered next actions and non-circular ownership

1. **L01** integrates the reviewed plan, records the actual schedule activation/bootstrap state and keeps one authorized GitHub writer until hard fencing is proved.
2. **L03** resolves approved SQL bytes, produces the finite catalog/dependency package and performs its independent static acceptance. Do not make B2 depend on T1/B3 live commands: B3 already consumes B2.
3. **L04/L05/L09** produce approved source manifests and scoped ERP/config/report dispositions; preserve source-access blockers and work on verified repository evidence while access is unavailable.
4. **L01 + independent reviewer** produce and validate the total export against actual manifest sets and DB catalog, then decide Gate 4 coverage separately from runtime/pilot eligibility.
5. **Lead** recomputes all seven Phase 1 gates from passed artifacts. No schedule, issue existence, aggregate count or checked-in acceptance text is itself a passed gate.

No deadline or promise substitutes for source availability. The actionable source bottleneck is the approved ERP/SQL archive content becoming visible to the current authorized session; until then keep the two coverage items open with this finite acceptance contract, rather than repeatedly re-running inaccessible references or declaring an exhaustive result from summaries.
