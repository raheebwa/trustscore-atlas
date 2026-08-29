# ADR 0002: Raw, typed, statements, canonical; no consumer marts

Status: accepted, 2026-08-29

## Context

The medallion pattern (bronze, silver, gold) is the default answer for a multi-source data
platform. Its critics are right about the failure modes: generic transformations forced on
every source, quality work pushed to consumers, and per-consumer marts that sprawl.

## Decision

Every source must produce three layers: an immutable dated raw snapshot, a typed table in
the source's own columns (`records.parquet` with a Table Schema), and `statements.parquet`.
One shared canonical layer (businesses, identifiers, statements_resolved, linkage
candidates, decisions, scores) is built from statements. No per-consumer marts: the site,
the API, the tools and downstream products query canonical directly. Layer names are
literal, not colours.

## Consequences

- Any canonical record can be recomputed from raw plus labelled decisions.
- A mapping fix re-derives statements without a re-crawl.
- Consumers that need a different shape build it on their side from published bundles.

## Alternatives considered

- Full medallion with gold marts per consumer: sprawl for one consumer.
- Adapters writing canonical directly: no provenance, no rebuild.
