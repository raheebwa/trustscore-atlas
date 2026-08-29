# ADR 0004: Cloudflare Workers, D1, R2, Containers and Cron Triggers as the platform

Status: accepted, 2026-08-29

## Context

The pilot needs an edge-rendered site and API, a read-heavy SQL store regenerated in bulk,
object storage for raw snapshots and bundles, a scheduler, and a place to run the Python
pipeline unchanged (pdfplumber, pyarrow, DuckDB, Splink do not run under Pyodide).

## Decision

One Cloudflare account on the Workers Paid plan: a SvelteKit Worker for site, API and
agent tools; D1 (SQLite with FTS5) as the serving database loaded by the import API as a
transactional swap; R2 for raw, typed, statements, canonical and bundles; a Python 3.13
container for adapters, resolution and scoring, started from the Worker's scheduled
handler; Cron Triggers per cadence class; Browser Rendering only for sources that need it
and whose terms allow it; Cloudflare Access in front of the maintainer surface.

## Consequences

- One vendor, one bill, one deploy tool.
- Two languages (TypeScript web tier, Python pipeline) with a language-neutral adapter
  contract so TypeScript adapters can follow.
- D1 limits (10 GB per database, 100 bound parameters, 30 s per query) are far above the
  pilot's footprint and are checked in `docs/ARCHITECTURE.md` section 13.

## Alternatives considered

- Fly.io, Render or a VPS with Postgres: a second vendor and a connection pool for no
  query the pilot needs.
- Python Workers: the pipeline's dependencies do not run there today.
- Rewriting adapters in TypeScript: spends the pilot on nothing users can see.
