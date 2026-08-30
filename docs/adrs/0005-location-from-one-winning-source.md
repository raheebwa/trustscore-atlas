# ADR 0005: Location fields resolve from one winning source

Status: proposed (Phase 1)

## Context

District and division are resolved independently by precedence. A tax list (precedence 2) can win
the district with a head-office address while the city trading licence (precedence 3) wins the
division, which produced records reading "Nakawa Division, Wakiso": a division of Kampala paired
with a neighbouring district.

## Decision for now (Phase 0)

Display rule only: when the winning division is one of the five KCCA divisions listed in
`packs/ug/pack.yml` under `boundaries.kcca_divisions`, the displayed district is Kampala, taken
from the same source as the division. Search cards, business pages and tool results apply it
(`app/src/lib/location.ts`). Statements and the trace are untouched.

## Decision to take in Phase 1

Resolve district and division together: the location of a record is the (district, division)
pair from the single statement group that wins precedence for the division, falling back to the
district-only winner when no division exists. Administrative-boundary tagging (P-codes from the
boundaries pack) then validates that the pair nests. This moves the rule from the display layer
into `resolve.py`, with a golden case for the Kampala divisions and one for a business with a
head office outside the licensing district.

## Consequences

Until Phase 1, the explorer's counts by district come from the resolved (unadjusted) district
column, so a KCCA-licensed business whose tax address is elsewhere counts under that district in
the explorer while its page says Kampala. The difference is small (tax lists carry addresses for
a minority of records) and is documented on the methodology page once the resolver rule lands.
