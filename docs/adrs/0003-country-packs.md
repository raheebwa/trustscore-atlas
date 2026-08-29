# ADR 0003: Country packs as the unit of contribution and deployment

Status: accepted, 2026-08-29

## Context

Atlas is international by design with Uganda as the pilot. Without a boundary, Uganda
specifics (identifier formats, register names, admin boundaries, rubric bindings) leak
into the canonical layer and every new country becomes a fork.

## Decision

Everything jurisdiction-specific lives in `packs/<iso2>/`: `pack.yml` (country, currency,
identifier schemes with validation patterns, precedence bindings), `sources/<slug>/`
adapters, `boundaries/`, `taxonomy/`, and `rubrics/bindings.yml`. Rubric predicates are
abstract; packs bind them to registers. Identifier schemes are namespaced by country and
use org-id.guide codes where they exist. The canonical layer, score engine, surfaces and
tools never reference a specific country.

## Consequences

- Adding a country is a directory plus adapters, with no change outside it.
- A second-country adapter is the portability test for every release.
- Missing identifier schemes are proposed to org-id.guide rather than invented privately.

## Alternatives considered

- One global source list with a country column: works until the second country's
  identifier rules or precedence differ, which they do.
