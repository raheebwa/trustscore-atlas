# Contributing to TrustScore Atlas

Thank you for considering a contribution. This project harmonises public business registers with
field-level provenance, so the bar for a change is not only that it works: it is that a reader can
see where every published value came from and why it won.

## Getting the checks green

Two commands, one per side of the repository. They are the same commands continuous integration
runs, so a green pair locally is a green pipeline.

```sh
pnpm --dir app run check && pnpm --dir app run test
uv --directory pipeline run ruff check . && uv --directory pipeline run pytest
```

The pipeline suite enforces a coverage floor of 90 percent. It is set in `pipeline/pyproject.toml`
rather than in a workflow argument, so the command above and the one in CI cannot drift.

## Tests come first

Write a failing test, watch it fail for the reason you expect, then write the smallest code that
makes it pass. The commit sequence is the evidence: a pull request whose tests arrive in the same
commit as the behaviour they cover will be asked for the failing state.

A test earns its place by being able to fail. A test that would still pass with the code it covers
deleted is not coverage, and several defects in this repository's history reached production behind
exactly that kind of test.

## Data and provenance

Every published value carries the register that published it and the date it said so. A change that
adds or alters a value must say where it came from:

- A new register is a country pack plus an adapter, under `packs/<country>/sources/<slug>`, with a
  schema, a mapping and conformance fixtures. Start from an existing source directory.
- Never publish a personal phone number, an email address, or a national identity number. The
  adapter mapping excludes personal columns before anything is written; the exclusion happens at
  mapping time and is not a filter applied later.
- Identifier schemes are namespaced, and a key Atlas invented for a register row is marked
  synthetic so no surface offers it as something a reader could quote back to a register.
- Example values in code, comments, tests, and documentation use reserved or clearly fictional
  data. Phone numbers use a `+<country code> 000 000 000` shape, and test identities use
  `<role>@lvh.me`, which resolves to the local machine.

## Sign your work

Every commit carries a Developer Certificate of Origin sign-off:

```sh
git commit -s
```

That line certifies you wrote the change or otherwise have the right to submit it under the
project's licence: Apache-2.0 for the code, CC BY 4.0 for the published data.

## Review

Atlas has one maintainer today, so the usual two-person review is not available. The substitute is
deliberate and applies to every change, including the maintainer's own:

1. The change arrives as a pull request, never a direct push to `main`.
2. A change to an architectural decision links the decision record it follows or amends, under
   `docs/adrs`.
3. Continuous integration is green before merge.

This is weaker than an independent reviewer, and it is recorded here rather than implied.

## Practices this project has not adopted

These are decisions, not oversights, and they are open to being revisited:

- **REUSE compliance.** Files carry SPDX identifiers, but the full REUSE specification, with its
  licence directory and per-file copyright, is not followed.
- **OpenSSF code-review criteria.** The single-maintainer substitute above does not satisfy them.
- **Fuzzing.** The parsers here read published register files rather than untrusted input from the
  network, so fuzzing has not been prioritised.
- **Signed releases and SBOM publication.** Deferred until the first tagged release.

## Keeping local work out of the repository

Working notes, scratch directories, and any path that belongs to your machine rather than the
project go in `.git/info/exclude`, which is local to your clone. Please do not add personal paths
to the shared `.gitignore`.
