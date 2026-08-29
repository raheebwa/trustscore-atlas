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

Worker configuration, including the `DB` (D1) binding, is in `wrangler.jsonc`. After
changing it, run `pnpm gen` to regenerate `worker-configuration.d.ts` (the file is
committed, so keep it in sync).

## Local database

The app reads a Cloudflare D1 (SQLite) database; it never writes to it (the pipeline
does). To set up a local copy from the repository root:

```sh
cd app
pnpm exec wrangler d1 execute atlas --local --file ../infra/d1/schema.sql
pnpm exec wrangler d1 execute atlas --local --file seed/dev.sql
```

`seed/dev.sql` is a small, entirely fictional dataset: five businesses across three
Kampala divisions, a `kcca.businesses` source row, one Formality score per business, and
a live regeneration. No real business, person, or phone number appears in it.

Both `pnpm dev` and `pnpm build && pnpm preview` expose the local D1 database at
`platform.env.DB` inside server code (`event.platform.env.DB`):

- `pnpm dev` runs Vite directly. `@sveltejs/adapter-cloudflare` emulates `platform.env`
  in this mode using Wrangler's local bindings, built from `wrangler.jsonc`, without a
  separate Wrangler process. Use this for day-to-day development.
- `pnpm build && pnpm preview` builds the Worker and runs it under `wrangler dev`
  against the real bindings. Use this to check the production build before deploying.

Both commands read the same local D1 state (created in `.wrangler/state` at the repo
root by the `wrangler d1 execute --local` commands above), so seed once and either
command sees the data.

To reset the local database, delete `.wrangler/state/v3/d1` from the repository root and
re-run the two `wrangler d1 execute` commands above.
