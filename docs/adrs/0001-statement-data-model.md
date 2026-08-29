# ADR 0001: Statement-based data model with a source-class precedence contract

Status: accepted, 2026-08-29

## Context

Atlas joins a dozen public registers that disagree with each other, publish on different
dates, and carry different licences. A flat "business" table would lose where each value
came from, when it was true, and which value should win when sources disagree.

## Decision

The atomic unit is the statement: (entity, field, value, source, source reference,
asserted_at, licence, precedence, confidence). Business records are views over statements.
The displayed value per field is the highest-precedence statement, ties broken by the most
recent `asserted_at`. Precedence follows the source class: operator_verified (1),
register_of_record (2), regulator_or_authority (3), derived (4), inferred (5). Losing
statements are kept and remain queryable. Schema: `schemas/statement.schema.json`.

## Consequences

- Every value on every surface links to a statement with a source reference and a date.
- Corrections and model outputs are new statements at their precedence, never edits.
- Storage grows with sources times fields, which is small at Atlas's scale (tens of
  millions of rows at most for the pilot).
- Resolution must be deterministic so the same statements always produce the same record.

## Alternatives considered

- One wide business table with a `source` column per field: loses history and licences,
  cannot represent disagreement.
- Event sourcing over business records: the same idea with a heavier runtime; statements
  are the event log without the replay machinery.
