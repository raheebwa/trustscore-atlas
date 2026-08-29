# TrustScore Atlas: Architecture

| | |
|---|---|
| Status | Draft v0.1 |
| Date | 2026-08-29 |
| Companion | `docs/PRD.md` (requirements), `docs/adrs/` (decision records, to be written from section 12) |

This document settles the stack, the data layering, and the shape of the system for the Uganda pilot, with the reasoning for each choice and the alternatives rejected. It is written to survive the pilot: every part that is Uganda-specific lives in a country pack; everything else is jurisdiction-neutral.

## 1. What the system is, in one paragraph

A scheduled pipeline pulls public business registers, keeps an immutable raw snapshot of each pull, types each source into its native table, and rewrites every cell as a **statement** (entity, field, value, source, reference, time, licence, precedence). A resolution step aggregates statements into **canonical business records** using a precedence contract and maintainer-labelled linkage decisions, then evaluates **versioned rubrics** over each record's statements to produce scores with evidence. The serving layer loads the canonical tables into an edge SQL database and publishes downloadable bundles; a web application, an HTTP API, browser-registered WebMCP tools, and a remote MCP server all read from the same tables. Maintainers moderate claims and corrections through an ops surface that writes append-only upstream records, never edits to canonical data.

## 2. Best practices adopted, and where they come from

Atlas borrows deliberately from systems that have solved the same problem at scale. Each pattern is named so contributors can read the original.

| Pattern | Origin | What Atlas takes |
|---|---|---|
| Statement-based data model | OpenSanctions (`statements`: entity_id, prop, value, dataset, first_seen, last_seen, canonical_id; entities are aggregated from statements, provenance is never lost) | The statement is the atomic unit. Entities are views over statements. Every value keeps its dataset, original value, and time range. |
| Crawler-as-contract | OpenSanctions `zavod` (YAML dataset metadata + a small crawler script + a runtime context with fetch, cache, emit) | A source adapter is metadata plus a script that emits statements through a context; the framework owns fetching, caching, output, and validation. |
| Canonical IDs via explicit decisions | OpenSanctions `nomenklatura` resolver (merge and non-merge decisions are records; canonical IDs are derived, source IDs are preserved) | Linkage produces candidates; merges come only from labelled decisions; every source identifier survives as an alias. |
| Statements with references, precedence by source class | Wikidata (statements with references and ranks) | Per-field provenance and a rank order that decides the displayed value when sources disagree. |
| Organisation identifier schemes | org-id.guide (codes such as `UG-RSB`, `UG-NGO`, `KE-RCO`, `KE-KRA`, used by OCDS and BODS) | Identifier schemes are namespaced with org-id.guide codes where they exist; missing schemes are proposed upstream rather than invented privately. |
| Publishing contract | Frictionless Data Package (`datapackage.json` with resources, Table Schema, licenses, sources, contributors) | Every published bundle carries a machine-readable descriptor; adapter `schema.yml` files are Table Schema. |
| Raw snapshot retention and deterministic rebuild | Lakehouse practice (raw is immutable and dated; everything downstream is regenerable) | Any canonical record can be recomputed from raw plus decisions; lineage is computed, not stored. |
| Corrections as upstream records | Event-sourcing discipline | A correction is an appended statement at the appropriate precedence, applied on the next regeneration. |

## 3. Layering: is this "medallion for every source"?

Short answer: **two mandatory per-source layers, one shared canonical layer, and no per-consumer gold layer.** It is medallion-shaped where the shape is earned and deliberately not where it is not.

The medallion pattern (bronze raw, silver cleaned, gold aggregated) is criticised, fairly, on three grounds: it forces every source through generic transformations regardless of need, it pushes quality work onto consumers, and it multiplies storage and movement for data nobody uses. Those critiques apply to enterprise platforms with many consumers and vague contracts. Atlas has one consumer (the canonical layer) and a strict contract at the source (the adapter conformance suite), which is exactly the "push context to the source" remedy the critics propose.

What every source must produce, and why:

| Layer | Name in Atlas | Mandatory per source? | Reason |
|---|---|---|---|
| Raw | `raw/<pack>/<source>/<run_id>/` | Yes | Provenance and reproducibility. A register page changes or disappears; the snapshot is the only proof of what it said on that date. Cheap on object storage. |
| Typed | `sources/<pack>/<source>/records.parquet` + `schema.yml` | Yes | Trace-back needs the source's own columns, and re-deriving statements after a mapping fix must not require a re-crawl. |
| Statements | `sources/<pack>/<source>/statements.parquet` | Yes | The only shape the resolution layer reads. Produced mechanically from typed records by the adapter's mapping file. |
| Canonical | `canonical/{businesses, identifiers, statements_resolved, linkage_candidates, decisions, scores}` | One, shared | Cross-source resolution and scoring. Jurisdiction-neutral. |
| Consumer marts | none | No | Consumers (site, API, tools, downstream products) query canonical directly. Per-consumer marts are where medallion sprawl starts. |

So the honest description is "raw, typed, statements, canonical." The names are kept literal rather than bronze/silver/gold so nobody argues about which layer a table belongs to.

## 4. Stack decisions

### 4.1 Summary table

| Concern | Choice | Alternatives considered | Why this one |
|---|---|---|---|
| Hosting | Cloudflare Workers (Paid plan) | Fly.io, Render, a VPS | One platform for the edge app, SQL, object storage, cron, containers, browser rendering and access control, so the pilot has one deploy tool, one bill and no cross-vendor networking. |
| Web app and API | SvelteKit (Svelte 5) on `@sveltejs/adapter-cloudflare`, TypeScript, Tailwind 4 | Next.js, Astro, Rails | Server-rendered by default with progressive enhancement, a small client bundle, and first-class Workers bindings via `platform.env`. |
| Serving database | D1 (SQLite) with FTS5 | Postgres via Hyperdrive (Neon/Supabase), Turso, DuckDB-Wasm over R2 | Read-heavy, single-writer, regenerated in bulk: SQLite's sweet spot. FTS5 is supported. 10 GB limit is two orders of magnitude above Phase 0 (~100 MB). Postgres would add a second vendor and a connection pool for no query Atlas needs. |
| Object storage | R2 | S3 | Zero egress, same account, native Worker binding, serves downloads directly. |
| Pipeline runtime | Python 3.13 run by a GitHub Actions scheduled workflow (one job per cadence class) that executes the adapters, resolution and scoring and loads the serving database through the D1 import API; a local run is the fallback | Cloudflare Containers (paid plan only, Phase 1), Python Workers (Pyodide), rewriting adapters in TypeScript | The adapters use `pdfplumber`, `pyarrow`, DuckDB and Splink, none of which run under Pyodide; a scheduled workflow runs them unchanged on a free tier. Containers become the runtime in Phase 1 when the paid plan is justified. |
| Scheduling | GitHub Actions cron (one workflow per cadence class); the Cloudflare API token is a repository secret scoped to D1, R2 and Workers | Cloudflare Cron Triggers plus Containers (paid) | Free, observable per run, and the pipeline needs no Worker to start it. Cron Triggers return with Containers in Phase 1. |
| Rendered sources | Browser Rendering binding, free tier (ten minutes per day), only for sources that need a browser and whose terms allow it; never for KCCA, URA, PPDA or UNBS | Headless Chrome in the pipeline runner | Managed and metered; the Phase 0 registers are plain HTML, PDF and JSON. |
| Entity resolution | Splink (DuckDB backend) in the container | dedupe, hand-written blocking + Jaro-Winkler | Proven on this data; expert-set weights, no EM on name-only features; outputs candidates with a comparison vector. |
| Canonical build | DuckDB SQL in the container, Parquet out | dbt-duckdb, Polars | Same engine as the linkage step; SQL is reviewable by contributors; dbt adds a toolchain for a dozen models. Revisit if models exceed ~20. |
| Load to D1 | D1 import API (init, upload SQL to R2, ingest, poll), one SQL file per regeneration | Row-by-row inserts from a Worker | Bulk import is built for this; the Worker never writes canonical tables. |
| Search | D1 FTS5 over normalised name, trade names, identifiers; prefix queries; `LIKE` fallback on `name_normalised` | Vectorize, AI Search | Names, not semantics. Trigram tokenizer confirmed on local D1 (wrangler 4.127, workerd 1.20260828); remote confirmation pending. The fallback is retained: FTS5 `unicode61` with prefix indexes plus a normalised `LIKE` covers the search box. |
| Map | HDX COD-AB polygons simplified to TopoJSON at build time, rendered client-side; choropleth by admin unit | Tiles, PostGIS | Counts by admin unit are the product; no geocoding, no tile server. Raster basemap only if needed, with attribution. |
| WebMCP | `document.modelContext.registerTool()` from a layout-level component; `AbortController` per navigation; tools call the HTTP API | Registering per page | One registration point, tool availability follows route via `toolchange`. |
| Remote MCP | `createMcpHandler` (`agents/mcp`) with a per-request `McpServer` factory, Streamable HTTP at `/mcp`, no Durable Object binding; ops MCP at `/ops/mcp` uses the same pattern behind Cloudflare Access | `McpAgent` (deprecated and feature-frozen upstream), separate service | Same tool implementations as WebMCP, different transport. A global server instance fails on the second request with MCP SDK 1.26 and later, so the factory is mandatory. |
| Auth (claims) | Email magic link (Resend) + Turnstile; sessions in D1 | Password accounts, social login | Claimants are businesses; a domain-bound email is itself evidence. No passwords to protect. |
| Auth (ops) | Cloudflare Access (maintainer identity) | App-level roles | Zero code; audit log for free. |
| Observability | Workers Logs, Analytics Engine counters per tool and per source run, `/sources` status page as the public SLO | Third-party APM | Enough for a single maintainer; the public status page is the accountability mechanism. |
| CI/CD | GitHub Actions: lint, tests, adapter conformance, `wrangler deploy`; container image built in CI | Manual deploys | Reproducible; deploy on tag. |
| Tests | Vitest (Worker, tools), pytest (adapters, resolution, rubrics), adapter conformance suite, Chrome WebMCP evals | | Rubrics and resolution are pure functions; they get golden tests. |

### 4.2 The one decision worth arguing about: Python container versus TypeScript adapters

The tension: the web tier is TypeScript, the pipeline is Python. Two languages is a real cost for contributors.

Decision: keep Python for the pipeline in Phase 0 and make the **adapter contract language-neutral** (an adapter is anything that writes `records.parquet`, `statements.parquet` and a run manifest into the expected paths). The framework ships Python helpers first; TypeScript helpers follow when a contributor wants them. Rewriting twelve working scrapers to save one runtime would spend the pilot's time on nothing users can see.

### 4.3 What is explicitly not in the stack

- No Kubernetes, no managed Postgres, no Airflow/Dagster. The pipeline is a dozen sequential steps on a schedule; an orchestrator is a Phase 2 question if source count passes ~40.
- No language model in the data path. Workers AI may be used for sector classification drafts and for templated narration only, and its outputs land as precedence-5 statements.
- No user-generated free text on business records.

## 5. Component view

```
                     +---------------------------- Cloudflare account ----------------------------+
                     |                                                                             |
  GitHub Actions   |                                                                             |
  (cron per        |  Worker: atlas (SvelteKit)                                                  |
   cadence class)  |                                                                             |
   (per cadence)     |   /            site (SSR + islands)     reads D1                            |
                     |   /api/v1/*    JSON API                  reads D1, R2 (downloads)           |
                     |   /mcp         remote MCP (createMcpHandler) same handlers as /api          |
                     |   /ops/*       maintainer UI (Access)    writes claims/labels/statements    |
                     |   /ops/mcp     ops MCP (createMcpHandler, Access) same ops library          |
                     |                                                                             |
                     |  Pipeline runner: GitHub Actions job (Python 3.13), Phase 1: Container      |
                     |   adapters -> raw (R2) -> typed + statements (R2)                           |
                     |   resolve  -> canonical parquet (R2) -> SQL -> D1 import API                |
                     |   Browser Rendering (free tier) only for sources that need it              |
                     |                                                                             |
                     |  D1: atlas        canonical tables + FTS + claims/sessions/labels           |
                     |  R2: atlas-data   raw/, sources/, canonical/, bundles/, regen/<id>.sql      |
                     |  KV: atlas-cache  hot pages, segment counts                                 |
                     |  Access: ops policy (maintainers)                                           |
                     +-----------------------------------------------------------------------------+
```

## 6. The adapter contract

A source adapter lives at `packs/<iso2>/sources/<slug>/` and contains:

```
source.yml          publisher, title, url, licence, cadence, coverage, pii posture,
                    terms_url, terms_checked_on, identifier schemes emitted
schema.yml          Table Schema for records.parquet (native columns, types, descriptions)
statements.map.yml  native column -> canonical field, precedence class, value transform
adapter.py | .ts    the crawler; receives a Context, must be idempotent for a run_id
fixtures/           a small raw sample + expected records/statements for conformance tests
```

The Context gives the adapter `fetch(url, cache=...)`, `fetch_rendered(url)` (Browser Rendering), `raw.put(name, bytes)`, `emit_record(dict)`, and nothing else. The framework writes `records.parquet`, applies the map to produce `statements.parquet`, and writes `manifest.json` (run_id, started, finished, rows, raw objects, adapter version, framework version, checksum).

Conformance suite (runs in CI on fixtures and nightly against live runs):

1. Emits both Parquet files and a manifest.
2. Every statement has `source_ref`, `asserted_at`, `licence`, `precedence`, `country`.
3. No column listed as excluded in `source.yml` appears in either file.
4. Identifier values match the scheme's validation pattern from `pack.yml`.
5. Re-running with the same raw input yields byte-identical outputs.
6. Row count within a declared tolerance of the previous run, else the run is flagged, not published.

## 7. Data model in the serving database

Tables in D1, all regenerated wholesale except the last group.

| Table | Grain | Notes |
|---|---|---|
| `businesses` | one per canonical entity | `atlas_id`, `country`, `canonical_name`, `name_normalised`, `entity_kind`, sector fields, location fields, `first_seen`, `last_seen`, coverage JSON, score summary JSON |
| `identifiers` | one per (atlas_id, scheme, value) | scheme codes per org-id.guide where available |
| `aliases` | one per (source_id, atlas_id) | every merged or source identifier redirects here |
| `statements` | one per statement | full provenance; indexed on (atlas_id, field, precedence, asserted_at) |
| `linkage_candidates` | one per candidate pair | probability, weight, comparison vector, model version |
| `scores` | one per (atlas_id, rubric, version, regeneration_id) | value, max, coverage JSON, evidence JSON |
| `sources` | one per source | publisher, cadence, last run, status, row count, adapter version |
| `regenerations` | one per regeneration | id, started, finished, inputs (source run ids), status; the live one is referenced by a single row in `meta` |
| `businesses_fts` | FTS5 virtual table | name, trade names, identifier values |
| `claims`, `claim_events`, `sessions`, `operator_statements`, `labels`, `issues` | append-only, not regenerated | maintained by the ops library; exported to R2 on every regeneration so they are inputs, never state trapped in the serving store |

Regeneration is a transactional swap: new tables are loaded under a suffixed name via the import API, then a single transaction renames them into place and updates `meta.live_regeneration`. A failed import never touches the live tables. Two D1 limits shape the SQL writer: a single SQL statement may not exceed 100,000 bytes, so multi-row `INSERT`s are split into batches well under that size; and an import blocks the database for its duration, so the writer always stages under suffixed table names and never imports into a live table. Phase 0 runs on the free plan, so each database stays under 500 MB: the remote size is reported after every import, and at 400 MB the statements table is normalised (sources by id, shorter statement ids, repeated source references in a refs table) or split into a second database; the full statements always remain in the Parquet bundles.

## 8. Resolution and scoring

**Resolution** (Python, DuckDB, in the container):

1. Union all `statements.parquet` across the pack.
2. Exact identifier joins produce deterministic same-entity groups (same `UG-URA` TIN, same licence number within one register).
3. Splink produces name-based candidate pairs across registers; candidates are written, never merged.
4. Apply `decisions` (labels): `match` unions groups, `non_match` blocks a pair permanently.
5. Assign `atlas_id`: stable hash of the earliest source identifier in the group; on merge the older id survives, the other becomes an alias.
6. Per field, choose the winning statement by precedence, then support (the number of source records carrying the value), then recency, then the shortest normalised form, then alphabetical order; write `businesses`. Losing name values are kept as `name_variants` on the record and feed the search index, so a case or spacing variant published by the same register still finds the business.

**Scoring** (pure function, Python and TypeScript implementations share golden tests):

- A rubric is `rubrics/<name>/v<N>.yml`: predicates with points, max, applicable-coverage rule, and human descriptions. Country packs bind abstract predicates to concrete registers in `packs/<iso2>/rubrics/bindings.yml`.
- The engine evaluates predicates against the entity's statements and returns value, max, coverage, and evidence rows with statement ids, exactly as the PRD specifies. It never calls a network or a model.
- Score rows are written per regeneration; a score change is always attributable to a statement change or a rubric version change.

## 9. Serving paths

| Path | Reads | Caching |
|---|---|---|
| Search | `businesses_fts` then `businesses` | none (fast) |
| Business page | `businesses`, `identifiers`, `scores`, `statements` (by atlas_id) | KV 10 minutes, keyed by regeneration id |
| Trace | `statements` for one field | none |
| Explore | aggregate queries over `businesses` by sector and admin unit | KV 1 hour; counts precomputed at regeneration for the default views |
| Downloads | R2 objects with `datapackage.json` | R2 direct |
| WebMCP and MCP tools | the same handlers as `/api/v1` | as above |

All reads carry `ETag` derived from the live regeneration id so agents and browsers revalidate cheaply. On the free plan a request has 10 ms of CPU and 50 database queries: explore aggregates (counts by category, division and register presence) are precomputed into a table at regeneration, and the business page stays under ten queries.

## 10. Security model

- Read paths: parameterised SQL only; rate limits per IP and per API key at the Worker; bounded page sizes; no upstream error text echoed.
- Write paths: claim sessions (magic link + Turnstile) for `start_claim`, `submit_correction`, `label_linkage`, `report_issue`; every write is an append to the ops tables, moderated before it becomes a statement.
- Ops: Cloudflare Access in front of `/ops/*`; the ops MCP uses Access OAuth; the ops library enforces state transitions and refuses direct table edits.
- Tools: `readOnlyHint` on all read tools, `untrustedContentHint` on any result containing scraped text, `requestUserInteraction()` before every write tool executes, tools exposed to the site origin only.
- Pipeline: the container has bindings to R2 and Browser Rendering and a scoped token for the D1 import API; it never holds user session data.
- Personal data: excluded columns are dropped in the adapter mapping, so they never reach typed records; phone numbers survive only as a salted hash used by linkage and never exported.

## 11. Repository layout

```
atlas/
  app/                  SvelteKit application (site, API, WebMCP component, MCP, ops)
  pipeline/             Python framework: context, conformance, resolution, scoring, loaders
  packs/
    ug/                 pack.yml, sources/*, boundaries/, taxonomy/, rubrics/bindings.yml
    ke/                 pack.yml, sources/cbk_licensed_banks/
  rubrics/              abstract rubric definitions, versioned
  schemas/              JSON Schema for Business, Statement, Source, Manifest, Data Package profile
  docs/                 PRD, ARCHITECTURE, adrs/, country-pack guide, API reference
  infra/                wrangler.jsonc, Dockerfile (pipeline), GitHub Actions
```

## 12. Decisions to record as ADRs

Each row becomes `docs/adrs/NNNN-*.md` with context, decision, consequences, alternatives.

1. Statement-based data model with a source-class precedence contract.
2. Raw, typed, statements, canonical layering; no consumer marts.
3. Country packs as the unit of contribution and deployment.
4. Cloudflare Workers, D1, R2, Containers, Cron Triggers as the platform.
5. Python pipeline in a container; language-neutral adapter contract.
6. Candidates never identities: Splink with expert-set weights, merges only by labelled decision.
7. Regeneration as a transactional swap loaded via the D1 import API.
8. Personal-data exclusion at adapter mapping time; hashed phone for linkage only.
9. Identifier schemes namespaced by org-id.guide codes; missing schemes proposed upstream.
10. Frictionless Data Package as the publishing contract.
11. Ops surface with two transports over one library.
12. Rubrics as versioned files; scores as pure functions with evidence.

## 13. Open technical questions

1. D1 FTS5 tokenizer availability (trigram). Partially closed: trigram, porter and unicode61 all work on local D1 (wrangler 4.127, workerd 1.20260828); remote D1 confirmation pending. Whether `businesses_fts` needs a separate prefix index for identifier search remains open.
2. Closed: container image size and cold start with Splink and DuckDB installed. Measured locally at 746 MB uncompressed, 0.5 s to import DuckDB, pyarrow and Splink, about 1 s container wall time. No image split needed; a slimming pass is scheduled before launch.
3. Closed: the binding D1 import limit is per statement (100,000 bytes), not per file (5 GB). The regeneration SQL writer splits multi-row inserts; per-table files are not required at Phase 0 volumes.
4. TopoJSON simplification tolerance for admin4 polygons that keeps the explore map under ~1 MB.
5. Closed: no Durable Object state is needed. `McpAgent` is deprecated upstream; `createMcpHandler` with a per-request `McpServer` factory serves stateless read tools over Streamable HTTP.
