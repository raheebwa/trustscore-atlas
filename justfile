# TrustScore Atlas command surface. Run `just` or `just --list` to see all recipes.

set shell := ["bash", "-cu"]

# List available recipes.
default:
    @just --list

# Install the app and pipeline dependencies.
install:
    pnpm --dir app install
    uv --directory pipeline sync

# Start the local web app on this project's assigned port, never the framework default.
dev PORT="5110":
    pnpm --dir app exec vite dev --host 127.0.0.1 --port {{ PORT }} --strictPort

# Run the app and pipeline test suites.
test:
    pnpm --dir app run test
    uv --directory pipeline run pytest

# Run JavaScript formatting and lint checks, then Python lint checks.
lint:
    pnpm --dir app run lint
    uv --directory pipeline run ruff check .

# Generate Worker types and typecheck the Svelte app.
typecheck:
    pnpm --dir app run check

# Build the production web app.
build:
    pnpm --dir app run build

# Remove generated Svelte build output. This intentionally preserves dependencies.
clean:
    rm -rf app/.svelte-kit

# Requires ATLAS_LINKAGE_SALT in the environment.

# Regenerate both loaded country packs into one canonical data release.
regenerate REGENERATION_ID="local_regeneration":
    uv --directory pipeline run python -m atlas_pipeline regenerate --pack ../packs/ug --pack ../packs/ke --data-root ../data --id "{{ REGENERATION_ID }}"

# Requires authenticated Cloudflare credentials in the environment.

# Load one regeneration's SQL into the three remote D1 databases.
load REGENERATION_ID:
    ./infra/scripts/load-d1.sh "{{ REGENERATION_ID }}"

# Build a downloadable data package for one regeneration.
bundle REGENERATION_ID="local_regeneration":
    uv --directory pipeline run python -m atlas_pipeline bundle --regeneration "{{ REGENERATION_ID }}" --data-root ../data --out "../data/bundles/{{ REGENERATION_ID }}"

# Requires Chrome with WebMCP and remote debugging enabled on port 9333.

# Evaluate the page tools against a deployed or local Atlas site.
evals BASE_URL="https://atlas.trustscorehq.com" OUTPUT="evals.md":
    node app/scripts/webmcp-evals.mjs "{{ BASE_URL }}" "{{ OUTPUT }}"
