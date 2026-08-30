# TrustScore Atlas

The open harmonisation layer for public business records in countries that have no
structured company-data layer. Atlas pulls the registers that regulators already publish,
turns every cell into a sourced statement, resolves statements into business records with
field-level provenance, computes deterministic purpose-specific scores from the evidence,
and exposes the result to people and to AI agents through a website, an HTTP API, and
tools registered on the page itself.

Uganda is the reference country pack and the pilot.

## Layout

| Path | What lives there |
|---|---|
| `app/` | SvelteKit application: site, API, agent tools, maintainer surface |
| `pipeline/` | Python framework: adapter context, conformance suite, resolution, scoring, loaders |
| `packs/<iso2>/` | Country packs: `pack.yml`, `sources/<slug>/` adapters, boundaries, taxonomy, rubric bindings |
| `rubrics/` | Abstract, versioned rubric definitions |
| `schemas/` | JSON Schema for Business, Statement, Source and run Manifest |
| `docs/` | Product requirements, architecture, decision records |
| `infra/` | Pipeline container image and deployment configuration |

## Principles

1. Every value has a source.
2. Scores are deterministic and versioned.
3. Models narrate and classify; they never assert identity.
4. Absence is evidence.
5. Candidates, never identities.
6. Corrections are upstream records, never edits.
7. Businesses, not people.
8. Open by default.
9. Honest about freshness.

The full statement of each principle is in `docs/PRD.md`.

## Developing

Tool versions are pinned in `.mise.toml` (Node 24, Python 3.13, uv).

```sh
# web application
cd app && pnpm install && pnpm dev

# pipeline
cd pipeline && uv sync && uv run pytest
```

## Adding a source

A source adapter is a directory `packs/<iso2>/sources/<slug>/` with `source.yml`,
`schema.yml`, `statements.map.yml`, `adapter.py` and `fixtures/`. The conformance suite in
`pipeline/` checks every adapter against the contract described in
`docs/ARCHITECTURE.md` section 6.

## Licence

Code is licensed under Apache-2.0 (LICENSE).

Published data, data packages, and rubrics are licensed under CC-BY-4.0 (LICENSE-DATA).

Per-source rights are carried in each source's source.yml file and in NOTICE.

Attribution line to use: "TrustScore Atlas, atlas.trustscorehq.com"
