# Atlas web application

SvelteKit (Svelte 5, TypeScript, Tailwind 4) deployed to Cloudflare Workers with
`@sveltejs/adapter-cloudflare`. Serves the site, the JSON API under `/api/v1`, and the
WebMCP tools registered on each page (`docs/PRD.md` sections 10.1 to 10.3).

```sh
pnpm install
pnpm dev          # local development server
pnpm check        # type check
pnpm lint         # prettier and eslint
pnpm test         # vitest
pnpm build        # production build
pnpm preview      # run the built Worker locally with wrangler
```

Worker configuration, including the `DB`, `DB_STATEMENTS`, and `DB_SCORES` D1 bindings, is in
`wrangler.jsonc`. After changing it, run `pnpm gen` to regenerate
`worker-configuration.d.ts`.

## Local database

The app reads three Cloudflare D1 (SQLite) databases. Claim, correction, linkage-label, and issue
requests write only to the append-only operations tables in the main database. To set up local
copies from the repository root:

```sh
cd app
pnpm exec wrangler d1 execute atlas --local --file ../infra/d1/schema.sql
pnpm exec wrangler d1 execute atlas-statements --local --file ../infra/d1/schema.sql
pnpm exec wrangler d1 execute atlas --local --file seed/dev.sql
pnpm exec wrangler d1 execute atlas-statements --local --file seed/dev-statements.sql
pnpm exec wrangler d1 execute atlas-scores --local --file ../infra/d1/schema.sql
pnpm exec wrangler d1 execute atlas-scores --local --file seed/dev-scores.sql
pnpm exec wrangler d1 execute atlas --local --file migrations/0001_ops_tables.sql
pnpm exec wrangler d1 execute atlas --local --file migrations/0002_claim_confirmation.sql
pnpm exec wrangler d1 execute atlas --local --file migrations/0003_write_tools.sql
```

Apply the operations migration to the remote main database with:

```sh
pnpm exec wrangler d1 execute atlas --remote --file migrations/0001_ops_tables.sql
pnpm exec wrangler d1 execute atlas --remote --file migrations/0002_claim_confirmation.sql
pnpm exec wrangler d1 execute atlas --remote --file migrations/0003_write_tools.sql
```

## Request rate limit

`wrangler.jsonc` binds `API_LIMITER` to Workers rate limit namespace `1001`. The application calls
it before every `/api/v1` request and before claim, correction, linkage-label, and issue-confirmation
pages can reach D1. The shared allowance is 60 requests per 60 seconds for each
`CF-Connecting-IP`. A request beyond the allowance receives a compact JSON `429` response.

## Claim confirmation

When the browser provides `requestUserInteraction`, `start_claim` asks for confirmation in the
page, creates the request, and confirms it immediately. Otherwise it returns a confirmation URL
that expires after 24 hours. Opening that URL shows the exact request and a plain HTML confirmation
form. A request started directly from the claim page is confirmed when submitted.

The current WebMCP draft temporarily omits the client object that carries
`requestUserInteraction`, as tracked in WebMCP PR 205. Chrome 152 therefore takes the page
confirmation path.

The `submit_correction`, `label_linkage`, and `report_issue` actions use the same confirmation
contract. Each first stores an unconfirmed request with a hashed token and a 24-hour expiry.
In-page confirmation confirms it immediately when available. Otherwise, `/correct/<id>`,
`/label/<id>`, or `/report/<id>` shows the exact stored request and a plain HTML form. Unconfirmed
and rejected requests are not read by published business pages or results.

The three seed files form one small, entirely fictional dataset: five businesses across
three Kampala divisions, a `kcca.businesses` source row, one Formality score per
business, their statements and references, and matching live regeneration rows. No real
business, person, or phone number appears in them.

Both `pnpm dev` and `pnpm build && pnpm preview` expose the local D1 databases at
`platform.env.DB`, `platform.env.DB_STATEMENTS`, and `platform.env.DB_SCORES` inside server code:

- `pnpm dev` runs Vite directly. `@sveltejs/adapter-cloudflare` emulates `platform.env`
  in this mode using Wrangler's local bindings, built from `wrangler.jsonc`, without a
  separate Wrangler process. Use this for day-to-day development.
- `pnpm build && pnpm preview` builds the Worker and runs it under `wrangler dev`
  against the real bindings. Use this to check the production build before deploying.

Both commands read the same local D1 state, created in `.wrangler/state` at the repo
root by the `wrangler d1 execute --local` commands above, so seed once and either command
sees the data.

To reset the local databases, delete `.wrangler/state/v3/d1` from the repository root
and re-run the nine `wrangler d1 execute` commands above.
