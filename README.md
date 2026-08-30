# TrustScore Atlas

TrustScore Atlas is an open harmonisation layer for public business records in places where company data is scattered across regulator directories, PDFs, portals and bulk files. It turns those sources into one business record with field-level provenance, links records without letting name similarity assert identity, and computes versioned rubric scores from cited evidence. It is for developers building KYB, market, procurement or supplier workflows, for businesses checking and correcting the public record, and for contributors who want to fork a country pack without changing the canonical pipeline. Uganda is the reference pack; Kenya's regulator-directory adapter is the portability example. See the [product requirements](docs/PRD.md) and [architecture](docs/ARCHITECTURE.md).

## Live site

The public site is [atlas.trustscorehq.com](https://atlas.trustscorehq.com/).

| Route | What it provides |
|---|---|
| [`/`](https://atlas.trustscorehq.com/) | Search entry point and source freshness |
| [`/search`](https://atlas.trustscorehq.com/search) | Ranked business search with identifiers, sector, location, Formality and coverage |
| [`/explore`](https://atlas.trustscorehq.com/explore) | Country, sector, location and register-presence filters, counts and map |
| [`/b/<atlas_id>`](https://atlas.trustscorehq.com/b/atl_6307e13f9040f449) | One business record, scores, evidence, provenance traces, linkage candidates and claim/report paths |
| [`/sources`](https://atlas.trustscorehq.com/sources) | Publisher, register URL, licence, cadence, last accepted run, row count and status |
| [`/methodology`](https://atlas.trustscorehq.com/methodology) | Published rubrics, country bindings, precedence and linkage rules from the live regeneration |
| [`/downloads`](https://atlas.trustscorehq.com/downloads) | Canonical and per-source data packages |
| [`/tools`](https://atlas.trustscorehq.com/tools) | The complete browser tool set with schemas and a runner |
| [`/ops`](https://atlas.trustscorehq.com/ops) | Maintainer surface behind Cloudflare Access |
| [`/api/v1/...`](https://atlas.trustscorehq.com/api/v1/sources) | JSON reads plus confirmation-mediated claim, correction, linkage-label and issue writes |

## What a business record contains

A record has a stable opaque `atlas_id`, country, canonical name, entity kind, source-backed identifiers, sector, location, dates, coverage and scores. The serving schema is defined in [`infra/d1/schema.sql`](infra/d1/schema.sql): `businesses`, `segments`, `identifiers`, `statements`, `refs`, `aliases`, `linkage_candidates`, `scores`, `sources`, `regenerations`, `meta` and `businesses_fts`. Append-only claim and moderation tables come from application migrations.

“Every value has a source.” The atomic unit is a statement with an entity, field, value, source, source reference, source record key, assertion time, licence, precedence and confidence. The business record displays the winning statement for each field; competing statements remain queryable through the trace and evidence surfaces.

When statements disagree, the lower precedence rank wins. Canonical resolution then orders ties by support, recency, shortest normalised form and alphabetical order.

| Rank | Source class | Meaning |
|---:|---|---|
| 1 | `operator_verified` | A verified business claim, for fields an operator is allowed to correct |
| 2 | `register_of_record` | The legal or identifier authority for that fact |
| 3 | `regulator_or_authority` | Sector, local, standards and procurement authorities |
| 4 | `derived` | Values created from verified linkage or boundary tagging |
| 5 | `inferred` | Classification or heuristic output |

“Candidates, never identities.” Name linkage writes scored candidate pairs and never merges them. A canonical grouping needs an issuer-declared unique identifier or a verified `match` label. A `non_match` label suppresses the pair; labels and corrections are append-only upstream records applied by regeneration.

Coverage is part of every record and score: applicable registers, checked registers, registers where the business was found, and registers not yet checked. The site renders the sentence in the form “found in 3 of 8 checked; 4 not yet checked.” Unchecked predicates are unknown, never zero.

The four published scores are deterministic counts of public-register facts against the versioned rubric files:

| Rubric | Question | Predicates and points |
|---|---|---|
| [Formality v1](rubrics/formality/v1.yml) | Does the state know this business exists? | `legal_register_presence` 30; `tax_identity_present` 30; `local_trading_licence` 25; `sector_regulator_licence` 15 |
| [Activity v1](rubrics/activity/v1.yml) | Is there recent evidence of operation? | `recent_statement` 40; `valid_licence_or_permit` 30; `public_contract_awarded` 20; `seen_in_multiple_registers` 10 |
| [Compliance Signals v1](rubrics/compliance_signals/v1.yml) | What do regulators say about standing? | `no_adverse_status` 40; `certification_permits_current` 30; `property_rates_compliant` 20; `regulator_licence_current` 10 |
| [Procurement Readiness v1](rubrics/procurement_readiness/v1.yml) | What is the track record with public buyers? | `registered_party` 20; `any_award` 20; `awards_across_buyers` 20; `contract_signed_recently` 20; `formality_threshold` 20 |

Each rubric has a maximum of 100 and records value, checkable points, unknown points, coverage, evidence statement IDs and evaluation time. Scores are not creditworthiness, not a fraud verdict, not a recommendation and not a statement about a person. Atlas does not score individuals or use private data.

## Browser tools

The current implementation defines these ten tools in [`app/src/lib/webmcp/tools.ts`](app/src/lib/webmcp/tools.ts). Required inputs below are the JSON Schema `required` fields; other documented properties are optional.

| Tool | Description | Required inputs | Mode |
|---|---|---|---|
| `search_businesses` | Search TrustScore Atlas for Uganda businesses by name, with optional district paging. Returns locations, sectors, identifiers, and Formality details. Read only. | `query` | Read only |
| `get_business` | Look up one TrustScore Atlas business by `atlas_id`, including identifiers, sector, location, scores, register coverage, and sources. Read only. | `atlas_id` | Read only |
| `get_evidence` | Read paged register statements for one business field, or the stored evidence rows and linked statements for one score rubric. Provide exactly one of `field` or `rubric`. | `atlas_id` | Read only |
| `score_business` | Read one stored business score, including value, checkable and unknown mass, unknown predicates, coverage counts, evidence, and evaluation date. | `atlas_id`, `rubric` | Read only |
| `explain_score` | Explain one stored score with a fixed sentence for every evidence predicate, followed by the checkable and unknown mass and the score limitation. | `atlas_id`, `rubric` | Read only |
| `find_segment` | Find businesses matching optional sector, location, and register-presence filters. Returns division counts, the ten highest Formality candidates, total count, and a filtered search link. | None | Read only |
| `start_claim` | Record a request to claim a business. Confirms in the page when supported, otherwise returns a 24-hour page-confirmation URL. It does not verify the claim. | `atlas_id`, `claimant_role` | Write |
| `submit_correction` | Record a field correction request with supporting evidence. Confirms in the page when supported, otherwise returns a 24-hour page-confirmation URL. Published records do not change until review. | `atlas_id`, `field`, `value`, `evidence_url` | Write |
| `label_linkage` | Record whether an existing linkage candidate pair is a match or non-match. Confirms in the page when supported, otherwise returns a 24-hour page-confirmation URL. It never merges records directly. | `atlas_id`, `candidate_atlas_id`, `verdict` | Write |
| `report_issue` | Record an issue for review, optionally scoped to a business or source. Confirms in the page when supported, otherwise returns a 24-hour page-confirmation URL. It does not change published records. | `description` | Write |

Read tools carry `readOnlyHint: true`; results containing register text also carry `untrustedContentHint: true`. Results are bounded to 1,500 characters and paginated or reduced when needed.

Every write requires a person to confirm the exact request. When `requestUserInteraction()` is available, confirmation happens in the page. Chrome 152 does not yet expose that client, so the tool stores an unconfirmed request and returns `status: confirmation_required`, a `confirm_url` and `expires_at`. The person opens the URL in the same browser; it expires in 24 hours. Unconfirmed requests do not affect published records, and confirmed corrections, labels and issues still enter moderation.

## Tools by route and declarative forms

Route registration is implemented in [`app/src/lib/webmcp/routes.ts`](app/src/lib/webmcp/routes.ts) and checked against a production route capture.

| Route | Programmatic tools |
|---|---|
| `/`, `/search` | `search_businesses`, `find_segment`, `get_business`, `report_issue` |
| `/explore` | `find_segment`, `search_businesses`, `get_business`, `report_issue` |
| `/b/<atlas_id>` | `get_business`, `get_evidence`, `score_business`, `explain_score`, `start_claim`, `submit_correction`, `label_linkage`, `report_issue`, `search_businesses` |
| `/tools` | All ten tools |
| `/methodology`, `/sources`, `/downloads` and other public routes | `search_businesses`, `get_business`, `report_issue` |
| `/ops` and `/ops/*` | None |

On a business page, tools that accept `atlas_id` default it to the record on screen and no longer require the caller to repeat it. Navigation tears down and rebuilds registrations, which produces the browser `toolchange` event.

The site also exposes ordinary HTML forms as declarative tools. Each form uses `toolname` and `tooldescription`; each field uses `toolparamdescription`.

| `toolname` | Route | `tooldescription` | `toolparamdescription` values |
|---|---|---|---|
| `claim_business_form` | `/claim/<atlas_id>` | Record a confirmed claim request for the business on this page. Submitting this form asserts the claimant's role; verification happens afterwards through the listed routes. | `atlas_id`: opaque ID of the business on this page. `claimant_role`: owner or director, authorised employee, or authorised representative. |
| `report_issue_form` | `/b/<atlas_id>` | Report a problem with the business record on this page. The report is recorded as unconfirmed and a confirmation page follows; maintainers review confirmed reports. | `atlas_id`: opaque ID of the business on this page. `description`: what is wrong in plain words, 10 to 2,000 characters. |

## Chrome WebMCP evals

The captured production run used Chrome 152 with `--enable-features=WebMCP`, driven over the Chrome DevTools Protocol. Discovery called `document.modelContext.getTools()` and execution called `document.modelContext.executeTool()`. The table reports a saved capture from a local Chrome session against the live site; it is not rerun at build time. Reproduce with the runner in [app/scripts/webmcp-evals.mjs](app/scripts/webmcp-evals.mjs): start Chrome with `--enable-features=WebMCP --remote-debugging-port=9333`, open the site in a tab, then run `node app/scripts/webmcp-evals.mjs https://atlas.trustscorehq.com evals.md`.

| Check | Captured production result | Time | Result bytes |
|---|---|---:|---:|
| `search_businesses` for `CITIBANK UGANDA LIMITED` | 1 of 1 returned, `atl_6307e13f9040f449` (the bare query "Citibank" now ranks the Kenyan Citibank N.A first, which is why the demo uses exact names) | 618 ms | 1,049 |
| `find_segment` for Kampala and `GENERAL` | Total 39,987; 5 divisions; top division `Central Division`, 19,743 | 817 ms | 1,067 |
| `get_business` | `CITIBANK UGANDA LIMITED`; found in 3 of 8 checked; 4 not yet checked; 4 identifiers; truncated | 887 ms | 1,274 |
| `get_evidence` for `canonical_name` | 1 statement | 663 ms | 465 |
| `score_business` for Formality | 70 of 100 | 579 ms | 952 |
| `explain_score` for Formality | Explanation present | 777 ms | 585 |
| `get_business` with an absent ID | `business_not_found` surfaced | 144 ms | 73 |
| Tool-list checks | `/tools` exposed all ten tools; 5 pinned business pages each exposed 9 tools with 0 page errors | 0 ms | 0 |

The evals found two bugs and both are fixed:

- A search hit larger than the 1,500-character result budget could make shaping drop every result. Search shaping now falls back to one minimal identity line and a continuation cursor instead of returning an empty page.
- A duplicate list key on linked businesses broke client hydration, so the first capture of `/b/atl_11bf115c93cd7870` registered no tools. The key now includes the identifier source; the later capture shows 9 tools and 0 page errors on each pinned business page.

## Data and methodology

The pipeline keeps literal layers: immutable raw pulls, typed source-native `records.parquet`, canonical-shaped `statements.parquet`, and one shared canonical layer. It resolves fields by the precedence contract, evaluates the four rubrics, writes SQL for the serving databases and publishes a bundle. Raw and typed data remain available for trace-back and deterministic regeneration.

Current adapter metadata comes from each pack's `source.yml`:

| Country | Register | Publisher | Licence | Cadence |
|---|---|---|---|---|
| Uganda | [Licensed businesses](packs/ug/sources/kcca_businesses/source.yml) | Kampala Capital City Authority | public-record | quarterly |
| Uganda | [VAT withholding agents](packs/ug/sources/ura_vat_withholding_agents/source.yml) | Uganda Revenue Authority | public-record | quarterly |
| Uganda | [Licensed customs agents](packs/ug/sources/ura_customs_agents/source.yml) | Uganda Revenue Authority | public-record | quarterly |
| Uganda | [Withholding tax exemptions](packs/ug/sources/ura_wht_exemptions/source.yml) | Uganda Revenue Authority | public-record | quarterly |
| Uganda | [OCDS parties and procurement history](packs/ug/sources/ppda_ocds/source.yml) | Public Procurement and Disposal of Public Assets Authority | CC-BY-4.0 | weekly |
| Uganda | [Certified products](packs/ug/sources/unbs_certified_products/source.yml) | Uganda National Bureau of Standards | public-record | monthly |
| Uganda | [Supervised financial institutions](packs/ug/sources/bou_supervised_institutions/source.yml) | Bank of Uganda | public-record | monthly |
| Uganda | [Licensed gaming operators](packs/ug/sources/nlgrb_gaming_operators/source.yml) | National Lotteries and Gaming Regulatory Board | public-record | annual |
| Kenya | [Licensed banks](packs/ke/sources/cbk_licensed_banks/source.yml) | Central Bank of Kenya | public-record | irregular |

The [Uganda pack](packs/ug/pack.yml) declares the complete applicable-register universe and whether each source is loaded; the [Kenya pack](packs/ke/pack.yml) demonstrates the same contract with one regulator directory. Each source declares coverage, excluded personal-data columns, rights, attribution, terms, cadence, precedence class, identifier schemes, adapter version and row-count tolerance.

Name comparison uses expert-set weights inside blocks and creates candidates only. The published candidate threshold is 0.50, the review band is 0.80 to 0.95, and the 0.95-and-above “likely the same business” band is empty in the live regeneration. No name-only pair reaches a merge threshold. A match label is allowed only for an exactly equal normalised legal name across different issuers with no contradicting legal suffix or sector class. Wherever a label made the link, the business page says “linked by a maintainer-verified match”.

Pinned demo records make the linkage and evidence paths reproducible:

| `atlas_id` | Exact name | Registers |
|---|---|---|
| `atl_6307e13f9040f449` | `CITIBANK UGANDA LIMITED` | KCCA, BoU, URA VAT |
| `atl_10fb3cc81e7a1a4f` | `BANK OF INDIA UGANDA LIMITED` | KCCA, BoU, URA VAT |
| `atl_11bf115c93cd7870` | `ROOFINGS LIMITED` | KCCA, UNBS, URA customs, URA VAT |
| `atl_11ae4807eaee3b9c` | `TORORO CEMENT LTD` | KCCA, UNBS, URA customs, URA VAT |
| `atl_0334897f83a73044` | `ELDORADO COMPANY LIMITED` | KCCA, NLGRB |
| `atl_11b90ad8f1cbb3e5` | `SASTOS AMUSEMENTS LTD` | KCCA, NLGRB |

For the Kenya portability record, search the exact name `ABSA Bank Kenya PLC`; its page shows the per-country coverage sentence for the CBK register.

## Downloads and data packages

Every regeneration can be published with the `bundle` command as a Frictionless Data Package. The bundle contains:

- Canonical Parquet files for businesses, statements, scores, linkage candidates, aliases, segments and labels.
- CSV twins for every canonical table except statements, which stays Parquet because a statements CSV is not a practical download.
- Per-source `records.parquet`, `statements.parquet` and `manifest.json` from each accepted run.
- `datapackage.json` with Table Schemas, resource licences, source links and attribution.
- `manifest.json` with file sizes and SHA-256 checksums, plus `LICENSE` and `SOURCES.md`.

Atlas's canonical compilation is CC BY 4.0. Source-specific rights and attribution travel in the resource metadata and in `SOURCES.md`; do not replace those terms with the canonical licence.

## Fork a country pack

Kenya's [`cbk_licensed_banks`](packs/ke/sources/cbk_licensed_banks/) source is the template: one page discovers the newest regulator PDFs, the adapter parses directory sections, contact columns are dropped, fixtures are generated locally, and canonical statements use the same contract as Uganda.

1. Copy `packs/ke` to a new two-letter country directory and rename its source directory.

   ```sh
   PACK=xy
   SOURCE=regulator_directory
   cp -R packs/ke "packs/$PACK"
   mv "packs/$PACK/sources/cbk_licensed_banks" "packs/$PACK/sources/$SOURCE"
   ```

2. Rewrite `pack.yml`: country, currency, languages, timezone, identifier schemes, precedence, boundaries and source state. Bind the abstract rubrics in `rubrics/bindings.yml` to registers that can actually answer each predicate.

3. Write the adapter contract under `sources/$SOURCE/`:

   - `source.yml`: publisher, title, URL, licence, rights, attribution, cadence, coverage, PII posture, terms, precedence class, identifier schemes, version and row-count tolerance.
   - `schema.yml`: the typed native columns for `records.parquet`.
   - `statements.map.yml`: entity key, record key, source reference and native-to-canonical statement mappings.
   - `adapter.py`: an idempotent `run(ctx)` that fetches through the context and emits native records.
   - `fixtures/`: small raw inputs, `expected.json`, and a generator such as [`make_fixtures.py`](packs/ke/sources/cbk_licensed_banks/fixtures/make_fixtures.py).

4. Generate fixtures and add a conformance test patterned on [`test_cbk_licensed_banks.py`](pipeline/tests/conformance/test_cbk_licensed_banks.py).

   ```sh
   cd pipeline
   uv sync
   uv run python "../packs/$PACK/sources/$SOURCE/fixtures/make_fixtures.py"
   uv run pytest tests/conformance
   ```

5. The six conformance checks verify complete outputs and schema, statement provenance and precedence, exclusion of protected columns, identifier declarations and patterns, byte-identical reruns, and row-count tolerance. Fix every finding before running the live adapter.

6. Run the adapter. The CLI writes the raw snapshot, typed records, statements and manifest, runs conformance, and moves the accepted pointer only when findings and flags are empty.

   ```sh
   export ATLAS_LINKAGE_SALT='replace-with-a-stable-secret'
   uv run python -m atlas_pipeline run "../packs/$PACK/sources/$SOURCE" --data-root ../data
   ```

7. Regenerate all countries together by repeating `--pack`, then bundle the same regeneration.

   ```sh
   uv run python -m atlas_pipeline regenerate \
     --pack ../packs/ug \
     --pack "../packs/$PACK" \
     --data-root ../data \
     --id local_regeneration

   uv run python -m atlas_pipeline bundle \
     --regeneration local_regeneration \
     --data-root ../data \
     --out ../data/bundles/local_regeneration
   ```

8. Load the generated prelude, stage and swap files into the records, statements and scores databases in that order, as shown below. The regenerated canonical layer and tools require no country-specific code changes.

## Run the pipeline locally

Tool versions are pinned in [`.mise.toml`](.mise.toml). The pipeline uses `uv` and refuses to hash excluded linkage columns unless `ATLAS_LINKAGE_SALT` is set. Keep the salt stable across runs and out of version control.

```sh
cd pipeline
uv sync
export ATLAS_LINKAGE_SALT='replace-with-a-stable-secret'

uv run python -m atlas_pipeline run \
  ../packs/ug/sources/kcca_businesses \
  --data-root ../data

uv run python -m atlas_pipeline regenerate \
  --pack ../packs/ug \
  --pack ../packs/ke \
  --data-root ../data \
  --id local_regeneration

uv run python -m atlas_pipeline bundle \
  --regeneration local_regeneration \
  --data-root ../data \
  --out ../data/bundles/local_regeneration
```

`regenerate --pack` is repeatable, so one regeneration can serve several countries. The CLI also exposes boundary conversion:

```sh
uv run python -m atlas_pipeline boundaries \
  --input path/to/boundaries.geojson \
  --level adm2 \
  --output path/to/boundaries.topojson
```

The generated SQL is split across the three D1 databases configured in [`app/wrangler.jsonc`](app/wrangler.jsonc): `atlas`, `atlas-statements` and `atlas-scores`. Load each database in its generated order:

```sh
cd ../app
pnpm install
REGEN=../data/regen/local_regeneration

for step in prelude stage swap; do
  pnpm exec wrangler d1 execute atlas --local -y --file="$REGEN/$step.sql"
done
for step in prelude stage swap; do
  pnpm exec wrangler d1 execute atlas-statements --local -y --file="$REGEN/statements-$step.sql"
done
for step in prelude stage swap; do
  pnpm exec wrangler d1 execute atlas-scores --local -y --file="$REGEN/scores-$step.sql"
done

pnpm exec wrangler d1 migrations apply atlas --local
pnpm dev
```

The D1 free-plan discipline is to keep each database below 500 MB, report remote size after imports, and normalise or split statements when a database reaches 400 MB. Prelude files drop the largest old live table before staging its replacement; stage and swap files stay on disk as the recovery path.

Successful scheduled loads also publish the nine prelude, stage and swap SQL files under `regen/<regeneration_id>/` in the `atlas-data` R2 bucket. `regen/index.json` stores a newest-first `regenerations` array and an `updated_at` timestamp. The upload script keeps the three newest regeneration IDs in that index and deletes the nine known SQL objects for older IDs. The manual rollback workflow verifies both the retained SQL and its published bundle before loading it and moving `bundles/latest.json`.

The deployed Worker also binds static assets, R2 `DATA` to `atlas-data`, KV `CACHE`, `API_LIMITER`, and the three D1 databases. Downloads read R2; the site and tools read the same serving tables as the HTTP API.

Mail is optional. A deployment that sets the `RESEND_API_KEY` secret and a `MAIL_FROM` address can send a claimant a verification link at a domain their record already publishes; a deployment that sets neither still records claims and still verifies websites, and simply sends nothing. Set them with `pnpm exec wrangler secret put RESEND_API_KEY` and `pnpm exec wrangler secret put MAIL_FROM`, and put the same two names in `app/.dev.vars` to exercise the path locally.

## Comparables

| Project or source | What it does, and what Atlas does differently |
|---|---|
| OpenCorporates | Aggregates company-register data where structured feeds exist. Atlas prepares fragmented and sub-national regulator registers, preserves provenance per field, reports score coverage and registers tools in the page; future crosswalks can point to OpenCorporates identifiers. |
| Open Ownership | Standardises and aggregates beneficial-ownership data from available sources. Atlas focuses on broader public business evidence, including licences, certifications and procurement, then publishes rubric scores with explicit unknown coverage. |
| OpenSanctions | Uses statement-based entities, source metadata and explicit merge decisions. Atlas applies those patterns to business registers, keeps name matches as candidates, and adds country packs, evidence rubrics and page tools. |
| National register portals | Remain the authority for each fact and its current status. Atlas does not replace them; it harmonises their public records, cites the original reference on every field, records coverage and makes the joined evidence queryable. |

Atlas is complementary to these systems. Its distinct scope is fragmented and sub-national registers harmonised with field-level provenance, purpose-specific rubric scores that always report coverage, and agent tools registered directly in the page.

## Prior work

The layered raw, typed and canonical pipeline, field-level statements with precedence, candidates-never-identities linkage, and corrections as upstream records were proven on an earlier private pipeline over the same registers. They were reimplemented here as a clean-room public codebase under the documented adapter contract. The published Atlas bundles are the public source of truth for this business layer.

## Licences and attribution

- Code is licensed under the [Apache License 2.0](LICENSE).
- Atlas's canonical compilation, statements, scores, crosswalk, rubrics and data packages are licensed under [CC BY 4.0](LICENSE-DATA).
- Per-source rows keep the rights and attribution declared in their `source.yml`; every bundle carries the applicable lines in `SOURCES.md`. Repository-level register attribution is in [NOTICE](NOTICE).
- Use the canonical data attribution line: "TrustScore Atlas, atlas.trustscorehq.com".
- Brand assets under `app/static/brand` are excluded from the repository's code and data licences and may not be reused to represent another product.

## Maintainer notes

The public tools never expose administrative actions. [`/ops`](https://atlas.trustscorehq.com/ops) and [`/ops/sources`](https://atlas.trustscorehq.com/ops/sources) sit behind Cloudflare Access and fail closed when Access is not configured or the request has no verified maintainer identity.

The moderation queue lists confirmed claims, corrections, linkage labels and issues oldest first. A maintainer approves or rejects once with a reason; the decision is append-only and never edits the submitted request. Accepted corrections and labels become upstream inputs to the next regeneration. The sources screen shows each register's status, accepted run, row count and note. Pulls currently run through the pipeline; an in-page “run now” action is not part of this deployment.
