## What changed and why

Describe the user or contributor problem, the change, and why this approach was chosen. Link the issue, ADR, or RFC when one applies.

## Evidence

List the tests added or updated and any public register references, regeneration IDs, routes, endpoints, screenshots, or output that help a reviewer verify the change.

## Checklist

- [ ] Tests covering the change were added or updated and are passing.
- [ ] `pnpm --dir app run check && pnpm --dir app run test` passes locally.
- [ ] `uv --directory pipeline run ruff check . && uv --directory pipeline run pytest` passes locally.
- [ ] Every commit includes a DCO sign-off created with `git commit -s`.
- [ ] Documentation, provenance, source rights, and attribution were updated where the change affects them.
