# TrustScore Atlas: Product Requirements

| | |
|---|---|
| Status | Draft v0.1 |
| Date | 2026-08-29 |
| Owner | Aheebwa Ramadhan (Badrama) |
| Product | TrustScore Atlas, the open harmonisation layer for public business records; Uganda pilot |
| Surface | `atlas.trustscorehq.com` |
| Repository | `trustscore-atlas` (public, Apache-2.0 code, CC-BY-4.0 data) |

## 1. Summary

The world's company data is structured where economies are rich and fragmented where they are not. Aggregators such as OpenCorporates, Open Ownership and GLEIF work from registers that are already machine-readable. In most of Africa, South Asia and Latin America the public record exists but is scattered across PDF lists, paginated portals, CMS endpoints and one-name-at-a-time searches that no one joins.

TrustScore Atlas is the open harmonisation layer for that second half of the world. It pulls the public records that regulators already publish, standardises them into one business record with field-level provenance, links records across sources, computes deterministic purpose-specific scores from the evidence, and exposes the result to people and to AI agents through a website, an HTTP API, a remote MCP server, and WebMCP tools registered on the page itself. Contribution happens at the level of a **country pack**: a set of source adapters, identifier schemes, boundaries and rubric bindings that anyone can fork for their own jurisdiction.

Uganda is the reference country pack and the pilot on merit: a dozen public registers with the densest coverage in the region, the hardest heterogeneity of formats (PDF lists, paginated portals, CMS endpoints, per-name searches), one of the largest informal-economy shares in the world, and no structured layer above any of it. A second country adapter (Kenya's central-bank licensee directories) proves the contract is portable. Regional expansion follows the same pattern.

Atlas sits under the TrustScore brand as its open data layer. TrustScore (the consent-based lending trust product) is the first consumer; Atlas itself never scores individuals and never uses private data. Atlas is complementary to the global aggregators, not a competitor: it produces the structured layer they cannot reach, and can map its records to OpenCorporates identifiers and LEIs where those exist.

## 2. Problem

In countries without a structured company-data layer, "does this business exist and what is known about it" is a question with no single answer. Uganda is the worked example. Business information is fragmented across a dozen public registers, each with its own identifier, format, and publishing habit:

- KCCA publishes ~59,000 licensed Kampala businesses with category and division, but no tax identity.
- URA publishes VAT withholding agents and ~11,000 licensed customs agents with TINs, but no bulk TIN search.
- PPDA publishes ~227,000 procurement releases (OCDS) naming buyers and suppliers.
- UNBS publishes ~12,800 product certification permits by holding company.
- BoU, CMA, URBRA, UCC, NLGRB publish licensee lists for their sectors.
- URSB, the legal register of record, is searchable one name at a time behind a CAPTCHA and charges per certified extract.

Nobody joins these. A developer sizing a market, a lender doing KYB, a procurement officer checking a bidder, a supplier vetting a new customer, or an AI agent asked "is this company real?" all end up doing the same manual, repeated, unrecorded work. The businesses themselves have no place to see, claim, or correct what the public record says about them.

The consequence is that "does this business exist and what do we know about it" costs hours and produces answers nobody can audit.

## 3. Users and their questions

Businesses are the subject of Atlas. The users are the people and agents who ask questions about them.

| Persona | Question | What Atlas answers with |
|---|---|---|
| Builder (developer, founder) | "I'm building X. Who is my customer, how many are there, where are they?" | Segment counts by category and division, candidate lists, product-fit scores |
| Lender / fintech (KYB) | "Is this business real, formal, and active?" | Business record, Formality and Activity scores, evidence rows with dates |
| Procurement officer / buyer | "Has this bidder delivered public contracts before?" | Procurement Readiness score, award and contract history from PPDA |
| Supplier / trade partner | "Should I extend credit terms to this customer?" | Formality, Compliance Signals, coverage statement |
| The business (claimant) | "What does the public record say about me, and how do I fix it?" | Claim flow, correction statements at top precedence, "last verified" badge |
| AI agent (via WebMCP, MCP, API) | Any of the above, on behalf of a user | Structured tool results with citations and hints |

## 4. Product principles

These are invariants. A feature that violates one is out of scope regardless of demand.

1. **Every value has a source.** A field is a statement: (entity, field, value, source, source reference, asserted_at, licence, precedence). The record shown is the winning statement per field; the losing ones remain queryable.
2. **Scores are deterministic and versioned.** A score is a pure function of evidence rows and a published rubric version. Same evidence, same score, forever. No language model produces, calculates, or repeats a load-bearing number.
3. **Models narrate and classify; they never assert identity.** A model may map free-text categories to a sector taxonomy or write a summary. Its output lands as a low-precedence statement with a citation, overridable by any verified source.
4. **Absence is evidence.** "Not found in the URA VAT withholding agent list as pulled on 2026-08-12" is a first-class fact. Every score reports coverage (registers checked out of registers applicable).
5. **Candidates, never identities.** Cross-source linkage produces scored candidate pairs. Only a verified label (operator claim or maintainer review) promotes a candidate to a merged identity.
6. **Corrections are upstream records, never edits to the published record.** A correction is an append-only statement at the appropriate precedence; regeneration makes it land.
7. **Businesses, not people.** Atlas holds facts about legal and trading entities. Personal contact details are not published, even when a register prints them.
8. **Open by default.** Code is Apache-2.0, published data is CC-BY-4.0, source licences travel with every row, and the ingestion contract is documented so anyone can add a register.
9. **Honest about freshness.** Every source shows its last pull date and declared cadence; a stale source is marked stale, not hidden.

## 5. Scope

### 5.1 Phase 0 (first public release)

- Standard business record schema and statement sidecar, published as JSON Schema and Parquet.
- Ingestion adapters for the Phase 0 sources (section 7.1), each producing the standard shape.
- Cross-source linkage (name-based, token-coverage) producing candidate pairs; no automatic merges.
- Score engine with four use-case rubrics (Formality, Activity, Compliance Signals, Procurement Readiness) and one parameterised Product-Fit rubric.
- Website: search, business page with evidence and trace, segment explorer with map, source status page, methodology page.
- WebMCP tools registered on every page (section 10.2).
- Public read HTTP API (JSON) and bulk downloads (Parquet, CSV).
- Claim-and-correct flow with maintainer moderation.
- Scheduled refresh per source.

### 5.2 Phase 1

- Remote MCP server (Streamable HTTP) exposing the same tools as WebMCP for non-browser agents.
- Sector taxonomy (ISIC Rev 4 mapping of KCCA categories and natures, PPDA classifications, UNBS product standards).
- Additional registers (section 7.2), prioritised by coverage gain.
- Contributor-submitted source adapters with a conformance test suite.
- Watchlists: "notify me when this business's record changes."

### 5.2a Phase 0 stretch: second country

- A `packs/ke/` country pack with one adapter: the Central Bank of Kenya directories of licensed commercial banks and microfinance banks (public HTML pages), the same adapter class as Uganda's Bank of Uganda supervised-institutions list. Purpose: demonstrate that a second country is configuration plus one adapter, with zero changes to the canonical layer, rubrics or surfaces. Kenya's PPIP procurement portal was considered first but does not yet publish OCDS (its open-data API is a stated 2026 target), so it moves to Phase 1. Rwanda's RDB enterprise search is query-only and stays a per-claim lookup.

### 5.3 Later

- Regional expansion (Kenya, Tanzania, Rwanda depth) using the same country-pack contract; then any jurisdiction a contributor brings a pack for.
- Cross-walks to OpenCorporates identifiers and GLEIF LEIs where those exist.
- Verified-business badge embeddable on the business's own site.
- Paid tier for high-volume API use and enriched exports; the base read tier stays free.

### 5.4 Non-goals

- No credit scoring, no scoring of individuals, no use of private or consented data. That is TrustScore's job, downstream.
- No free-text community editing of business records. Contribution is at the source-adapter and claim level.
- No republishing of personal contact details, home addresses, or individual-level compliance rosters.
- No scraping of login-gated, CAPTCHA-gated, or paid registers in violation of their terms.
- No prose "company profiles" written by a model as the primary record.

## 6. Data model

### 6.1 Entities

**Business**: one row per resolved legal or trading entity.

| Field | Type | Notes |
|---|---|---|
| `atlas_id` | string | Stable, opaque, assigned on first sighting; never reused |
| `country` | ISO 3166-1 alpha-2 | Jurisdiction of the record; every statement carries it too |
| `canonical_name` | string | Winning name statement |
| `name_normalised` | string | Upper, punctuation stripped, LIMITED to LTD, used for blocking |
| `identifiers` | list of {scheme, value, source} | Schemes are namespaced by country: `ug:tin`, `ug:kcca_licence`, `ug:ppda_party_id`, `ug:unbs_permit`, `ug:ursb_reg_no` (later), `ke:pin`, `rw:tin`, regulator licence numbers |
| `entity_kind` | enum | `company`, `business_name`, `sole_trader`, `public_body`, `unknown` |
| `sector` | struct | `source_category`, `source_nature`, `isic_code` (Phase 1), `isic_confidence` |
| `location` | struct | `district`, `division_or_subcounty`, `adm2_pcode`, `adm4_pcode`, `lat`, `lon` (only when a source publishes it) |
| `status` | struct | per-register status values, each with `as_of` |
| `first_seen` / `last_seen` | date | across all sources |
| `coverage` | struct | registers applicable, registers checked, registers where found |

**Statement**: one row per (entity, field, value, source).

| Field | Type | Notes |
|---|---|---|
| `atlas_id` | string | |
| `field` | string | dotted path into the Business record |
| `value` | string | JSON text for list values |
| `source` | string | source slug (`kcca.businesses`, `ura.vat_withholding_agents`, ...) |
| `source_ref` | string | URL, document name, or API call that produced the value |
| `source_record_id` | string | the source's own key for the row |
| `asserted_at` | timestamp | when the source was pulled, or the operator asserted |
| `licence` | string | licence of the source material |
| `precedence` | smallint | see 6.3 |
| `confidence` | enum | `verified`, `official`, `derived`, `inferred` |

**Source**: one row per register or adapter, with organisation, URL, licence, cadence, last pull, row count, PII posture, adapter version.

**Linkage candidate**: one row per (record A, record B, model version) with `match_probability`, `match_weight`, comparison vector, and blocking rule. Never merged automatically.

**Label**: an operator or maintainer verdict on a candidate pair, `match` or `non_match`, with note and timestamp. Append-only.

**Claim**: a business operator's request to attach to an `atlas_id`, with the verification method used and its outcome. A successful claim unlocks precedence-1 statements for that entity.

**Score**: one row per (entity, rubric, rubric_version, computed_at) with `value`, `max`, `coverage`, and the list of evidence statement IDs that contributed, each with its points.

### 6.1a Country pack

A country pack is the unit of contribution and deployment: `packs/<iso2>/` containing `pack.yml` (country, currency, languages, identifier schemes with validation patterns, precedence bindings), `sources/<slug>/` adapters (section 11.1), `boundaries/` (HDX COD-AB P-code levels used), `taxonomy/` (crosswalk from local category vocabularies to ISIC), and `rubrics/` (bindings of the abstract predicates in section 9 to this country's registers). The canonical layer, score engine, surfaces and tools are pack-agnostic; adding a country changes nothing outside its pack.

### 6.2 Standard shape for adapters

Every adapter emits two Parquet files: `records.parquet` in the source's native columns (typed, documented in the adapter's `schema.yml`) and `statements.parquet` in the Statement shape above. The statement file is what the rest of the system consumes; the native file is kept for trace-back and re-derivation.

### 6.3 Precedence contract

When sources disagree on a field, the winning value is the highest-precedence statement, ties broken by most recent `asserted_at`.

| Rank | Source class | Examples |
|---|---|---|
| 1 | `operator_verified` | The business's own claim, after verification |
| 2 | `register_of_record` | URSB (when available), URA for `tin` |
| 3 | `regulator_or_authority` | KCCA, BoU, CMA, URBRA, UCC, NLGRB, UNBS, PPDA |
| 4 | `derived` | Linkage-confirmed values, P-code tagging |
| 5 | `inferred` | Model classification, heuristics |

The two top ranks may be empty for a given entity. That is shown, not hidden.

## 7. Sources

Sources are organised by country pack. Phase 0 ships the Uganda pack (`packs/ug/`) in full and one Kenya adapter as the portability proof (section 5.2a).

### 7.1 Phase 0 sources (Uganda pack)

All are public records published by the issuing authority. Personal-data columns are handled per section 13.

| Source | Register | Rows (last pull) | Cadence | Licence | Fields used | Excluded columns |
|---|---|---|---|---|---|---|
| KCCA | Licensed businesses | ~59,000 | quarterly | public record | business name, category (16), nature (99), division (5) | contact phone, email |
| KCCA | Property-rates compliance | ~11,350 | annual | public record | company rows only: status, parish, division | all individual rows (name-level roster) |
| URA | VAT withholding agents | ~990 | quarterly | public record | TIN, name, designation date | none |
| URA | Licensed customs agents | ~11,100 | quarterly | public record | TIN, agent name, licence number, issue/expiry, registration status, tax office | none |
| URA | WHT exemption list | ~1 | quarterly | public record | TIN, taxpayer name, exemption window | none |
| PPDA | OCDS tenders, awards, contracts, parties | ~227,000 releases, FY2015/16 to FY2026/27 | daily upstream, weekly pull | CC-BY-4.0 | party id, name, roles, award/contract values and dates, buyer | contact_name where it is a person |
| UNBS | Certified products | ~12,800 | monthly | public record | permit number, holding company, product, standard, status, expiry, district | none |
| BoU | Supervised institutions | ~430 | monthly | public record | name, category (tier), code | phone, email, address |
| CMA | Licensed firms | ~45 unique | monthly | public record | firm name, licence category | contact person, tel, email |
| URBRA | Licensed schemes | ~60 | monthly | public record | scheme name | address |
| UCC | Broadcasters (radio, TV) | ~330 | monthly | public record | licensee name, call sign, licence number, category, dates | none |
| NLGRB | Gaming operators | ~80 | monthly | public record | company name, trade name, licence type and number, year, website | none |
| HDX (UBOS) | COD-AB admin boundaries | 5 levels, 1,868 units | irregular | CC-BY-IGO | P-codes, names, geometry for map and location tagging | none |

### 7.2 Phase 1 candidates

Ranked by coverage gain per unit of adapter effort. Each needs a terms-of-use check before a line of code.

| Source | Value | Known friction |
|---|---|---|
| URSB (OBRS name search) | Legal identity, registration number, entity type. The register of record. | CAPTCHA-walled; paid certified extracts; no bulk endpoint. Only a per-claim or per-request lookup is defensible, never a crawl. Treat as the precedence-2 source unlocked by the claim flow. |
| URA public TIN search | Per-record TIN confirmation | Per-lookup only, no bulk; same posture as URSB: verify on claim, do not enumerate |
| UMRA (microfinance regulator) | Tier-4 lenders and SACCOs | Register format unconfirmed |
| Insurance Regulatory Authority | Licensed insurers, brokers, agents | Static lists |
| NGO Bureau | Registered NGOs | Probe inconclusive |
| Registrar of Cooperatives, UCDA, DDA, NCHE, MoH facility registry | Sector registers | Mixed formats, some email-request only |
| Municipal councils outside Kampala | Trading licences beyond KCCA | No known online publication; partner or FOI route |

### 7.3 Ruled out

| Source | Reason |
|---|---|
| NIRA | Individual identity; auth-gated to approved institutions; out of scope by principle 7 |
| Classifieds and marketplace seller scrapes | No stated licence, login-gated contact data, and not a public record |
| Any register whose terms prohibit automated access | Principle 8 requires the data to be redistributable |

## 8. Entity resolution

Phase 0 uses probabilistic linkage on business names with a token-coverage comparison, blocked on shared first token or six-character prefix, with expert-set match weights (self-training on name-only features is deliberately not used because it trains circularly). Thresholds: candidates kept at probability ≥ 0.50; ≥ 0.95 is the "review-ready" band shown in the UI as "likely the same business".

Rules:

- A candidate pair is displayed on both business pages as "possibly the same as", with the probability and the comparison vector. It never changes either record's fields.
- A `match` label merges the pair on regeneration: the surviving `atlas_id` is the older one, the other becomes an alias that redirects.
- A `non_match` label suppresses the pair from display and from future admission.
- Labels come from a verified claimant (for their own entity) or a maintainer. Anonymous labels are not accepted.
- A second comparison field (TIN, licence number, or, later, URSB registration number) admits at ≥ 0.99 when both sides carry the same identifier; identifier equality alone still produces a candidate, not a merge, until labelled.

The labelled pair set is published with the data so the linkage model can be evaluated and improved by others.

## 9. Score engine

### 9.1 Definition

A **rubric** is a versioned document (`rubrics/<name>/v<N>.yml`) that lists evidence predicates, the points each contributes, the maximum, the applicable coverage set, and a plain-language description of each predicate. The engine evaluates every predicate against the entity's statements, records which statement IDs satisfied it, and returns:

```
{
  rubric: "formality", version: 1,
  value: 55, max: 100,
  coverage: { applicable: 7, checked: 7, found_in: 2 },
  evidence: [
    { predicate: "tin_present", points: 30, statement_ids: ["..."], as_of: "2026-08-12" },
    { predicate: "kcca_licence_present", points: 25, statement_ids: ["..."], as_of: "2026-08-01" },
    { predicate: "legal_register_present", points: 0, reason: "URSB not checked (source unavailable)" }
  ],
  computed_at: "2026-08-29T10:00:00Z"
}
```

Scores are recomputed on every regeneration and on every accepted correction. Historical score rows are kept so a change can be traced to the statement that caused it.

### 9.2 Phase 0 rubrics

Rubric predicates are abstract ("tax identity present", "sector regulator licence current") and each country pack binds them to its own registers, so a Formality score in Uganda and one in Kenya are computed the same way from different evidence. The tables below show the Uganda bindings.

**Formality (0 to 100)**: does the state know this business exists?

| Predicate | Points | Evidence |
|---|---|---|
| Legal register presence | 30 | URSB registration (Phase 1); until then reported as "not checked", not 0 |
| Tax identity present | 30 | TIN in any URA list |
| Local trading licence | 25 | KCCA licence row |
| Sector regulator licence | 15 | BoU, CMA, URBRA, UCC, NLGRB, or UNBS permit |

**Activity (0 to 100)**: is there recent evidence of operation?

| Predicate | Points | Evidence |
|---|---|---|
| Any statement dated within 12 months | 40 | most recent `asserted_at` across register rows that carry a source-side date |
| Valid, unexpired licence or permit | 30 | customs licence expiry, UNBS permit status, broadcast licence expiry |
| Public contract awarded within 24 months | 20 | PPDA award date |
| Seen in ≥ 2 independent registers | 10 | coverage.found_in ≥ 2 |

**Compliance Signals (0 to 100)**: what do regulators say about standing? Only register-published statuses, only company rows.

| Predicate | Points | Evidence |
|---|---|---|
| No suspended or deactivated status in any register | 40 | URA customs `registration_status`, broadcast `status` |
| Certification permits current | 30 | UNBS `status = Valid` for the majority of the company's permits |
| Property rates compliant (companies only) | 20 | KCCA compliance list, company rows |
| Regulator licence current | 10 | BoU, CMA, URBRA, NLGRB licence year or list membership |

**Procurement Readiness (0 to 100)**: track record with public buyers.

| Predicate | Points | Evidence |
|---|---|---|
| Registered as a PPDA party with a supplier or tenderer role | 20 | PPDA parties |
| ≥ 1 award | 20 | PPDA awards |
| ≥ 3 awards across ≥ 2 buyers | 20 | PPDA awards, distinct buyer_id |
| Contract signed within 24 months | 20 | PPDA contracts |
| Formality ≥ 55 | 20 | derived from the Formality rubric |

**Product-Fit (parameterised, 0 to 100)**: the builder's rubric. A use-case file declares which sector categories, locations, size proxies, and register signals define the target customer, with points per predicate. Atlas ships three examples that anyone can copy: retail point-of-sale fit, B2B supplier onboarding fit, SME lending pre-screen fit. A Product-Fit rubric is evaluated over a segment to produce a ranked candidate list, not only per entity.

### 9.3 What scores are not

Scores are not creditworthiness, not a fraud verdict, and not a recommendation. The methodology page says so in plain language, shows every rubric with its version history, and links to the evidence definition for each predicate. Every score in the UI and in every tool result carries its coverage statement.

### 9.4 Worked example (fictional)

"Example Hardware Supplies Ltd", Kampala. Found in KCCA (category Trade, nature Hardware, division Nakawa, pulled 2026-08-01) and in URA customs agents (TIN `10XXXXXXXX`, Registered, licence expires 2027-03-31, pulled 2026-08-12). Not found in PPDA, UNBS, BoU, CMA, URBRA, UCC, NLGRB. URSB not checked.

- Formality 55/100 (TIN 30 + KCCA 25; legal register not checked; no sector regulator). Coverage 7 of 8 checked, found in 2.
- Activity 80/100 (recent statement 40, unexpired licence 30, two registers 10; no public award).
- Compliance Signals 40/100 (no adverse status 40; no UNBS permits, no rates row, no regulator licence).
- Procurement Readiness 20/100 (Formality ≥ 55 only).

An agent asked "is this a real supplier?" answers: seen in two independent government registers in the last 30 days, customs licence current to March 2027, no public contract history, legal registration not verified. Every clause links to a statement.

## 10. Surfaces

### 10.1 Website (`atlas.trustscorehq.com`)

| Route | Purpose |
|---|---|
| `/` | Search box, headline coverage numbers, source freshness strip |
| `/search?q=` | Ranked results with identifiers, sector, location, Formality badge |
| `/b/<atlas_id>` | Business page: record, scores with evidence, per-field provenance, linkage candidates, claim button, change history |
| `/b/<atlas_id>/trace/<field>` | All statements for a field, winner highlighted, precedence explained |
| `/explore` | Segment explorer: filter by category, nature, district, division, register presence; counts, map (admin boundaries), export |
| `/sources` | Every source: organisation, URL, licence, cadence, last pull, row count, adapter version, status |
| `/methodology` | Rubrics, versions, linkage model, precedence contract, what scores are not |
| `/claim/<atlas_id>` | Claim flow (section 11.2) |
| `/api` | API docs |
| `/downloads` | Parquet and CSV bundles per source and for the canonical layer, with licence files |

The site is server-rendered with progressive enhancement, works without JavaScript for reading, and registers WebMCP tools only when `document.modelContext` exists.

### 10.2 WebMCP tools

Registered via `document.modelContext.registerTool()` on every page, scoped to the page's context where relevant, unregistered on navigation via `AbortSignal`. Tool descriptions stay under 500 characters, parameter descriptions under 150, results under 1,500 characters (paginated where needed). Scraped values in results are returned with `untrustedContentHint: true`.

| Tool | Parameters | Read/Write | Annotations | Returns |
|---|---|---|---|---|
| `search_businesses` | `query` (string), `district?`, `category?`, `limit?` (≤ 20) | read | readOnlyHint | atlas_id, name, identifiers, sector, location, Formality, coverage |
| `get_business` | `atlas_id` | read | readOnlyHint, untrustedContentHint | full record, scores, coverage, source list with dates |
| `get_evidence` | `atlas_id`, `field?` or `rubric?` | read | readOnlyHint, untrustedContentHint | statement rows (source, ref, as_of, precedence) |
| `score_business` | `atlas_id`, `rubric` (enum), `version?` | read | readOnlyHint | score object per section 9.1 |
| `find_segment` | `category?`, `nature?`, `district?`, `division?`, `present_in?` (registers), `fit_rubric?` | read | readOnlyHint | counts by division, top candidates, link to explorer with filters applied |
| `compare_businesses` | `atlas_ids` (2 to 5) | read | readOnlyHint | side-by-side scores and coverage |
| `list_sources` | none | read | readOnlyHint | source status table |
| `explain_score` | `atlas_id`, `rubric` | read | readOnlyHint | plain-language explanation built from evidence rows (template, not model) |
| `start_claim` | `atlas_id`, `claimant_role` | write | requires `requestUserInteraction()` confirmation | claim id, verification steps |
| `submit_correction` | `atlas_id`, `field`, `value`, `evidence_url` | write | requires `requestUserInteraction()`; only after a verified claim | statement id (pending moderation) |
| `label_linkage` | `atlas_id`, `candidate_atlas_id`, `verdict` | write | requires `requestUserInteraction()`; claimant or maintainer only | label id |
| `report_issue` | `atlas_id?`, `source?`, `description` | write | requires `requestUserInteraction()` | issue id |

Human-agent collaboration is designed in: read tools are safe to call freely; every write tool pauses for the user to confirm on the page, and the confirmation dialogue shows exactly what will be recorded and at what precedence. Tools are exposed to the page's own origin only; a partner embed can be added with `exposedTo` after a security review.

### 10.3 HTTP API

`GET /api/v1/businesses?q=`, `GET /api/v1/businesses/{atlas_id}`, `GET /api/v1/businesses/{atlas_id}/statements`, `GET /api/v1/businesses/{atlas_id}/scores`, `GET /api/v1/segments?…`, `GET /api/v1/sources`. JSON, CORS-open for reads, rate-limited per IP and per key, ETag and `Last-Modified` from the regeneration timestamp. Writes go through the site's claim flow only.

### 10.4 Remote MCP server (Phase 1)

Same tool set as 10.2 over Streamable HTTP, so desktop and server-side agents get the same contract as browser agents.

### 10.5 Downloads

Per-source `records.parquet` and `statements.parquet`, the canonical `businesses.parquet`, `linkage_candidates.parquet`, `labels.parquet`, and `scores.parquet`, each with a `LICENSE` and a `SOURCES.md` listing attribution lines. Refreshed on every regeneration.

### 10.6 Maintainer ops surface

Separate from the public tools, which never carry administrative actions. Four screens on a `/ops` route of the same application, behind Cloudflare Access (maintainers only), and an **ops MCP server** exposing the same four actions so maintenance can be done from an agent session. Both transports call one shared ops library; safety rules live in the library, never in a transport.

| Screen / tool | Action |
|---|---|
| Moderation queue | list pending claims and corrections; approve or reject with a reason |
| Sources | per-source last run, failure log, "run now" |
| Regeneration | trigger; show current regeneration id; roll back to the previous one |
| Linkage review | candidates in the 0.80 to 0.95 band; label `match` or `non_match` |

The moderation queue and source rerun ship in Phase 0 because the first claim can arrive on launch day. The ops MCP follows within days of launch. Nothing on this surface appears in public demos.

## 11. Contribution model

### 11.1 Adding a source

A source adapter is a directory `sources/<slug>/` containing `adapter.(ts|py)`, `schema.yml` (native columns, licence, cadence, PII posture, terms-of-use note with URL and date checked), `statements.map.yml` (native column to Business field mapping with precedence class), and fixtures. The conformance suite checks: emits both Parquet files, every statement has `source_ref` and `asserted_at`, no excluded-column leakage, licence declared, cadence declared, idempotent on re-run. Adapters that pass are wired into the scheduler by the maintainer.

### 11.2 Claim and correct

1. A business operator opens `/claim/<atlas_id>` (or an agent calls `start_claim`, which pauses for confirmation).
2. Verification, in order of strength: a verification string placed on the business's registered website or official social profile; an email from the domain named in a register; or, later, a URSB or URA per-record confirmation the operator initiates. Phone verification is not used (principle 7).
3. A verified claimant may submit field corrections with an evidence URL. Each lands as a precedence-1 statement in `pending` state.
4. A maintainer reviews within a stated SLA; accepted statements land on the next regeneration and the page shows "verified by operator on <date>".
5. Claimants may label linkage candidates for their own entity.

### 11.3 Moderation

Corrections, labels, and issues are append-only and public once accepted, with the claimant shown as "operator" (never a named individual). Rejected corrections keep a reason. Repeated bad-faith corrections revoke the claim.

## 12. Architecture

### 12.1 Platform

Cloudflare, end to end, on a Workers Paid plan:

| Concern | Component | Notes |
|---|---|---|
| Web app and API | Workers (SvelteKit) | one Worker, custom domain `atlas.trustscorehq.com` |
| Query store | D1 | canonical businesses, statements, scores, sources, claims, labels; 10 GB limit, well above Phase 0 needs (~100 MB) |
| Object store | R2 | Parquet bundles, raw pulls (bronze), rubric snapshots |
| Scheduling | Cron Triggers | per-source cadence; each trigger enqueues one adapter run |
| Adapter execution | Workers for API and HTML sources; Containers for adapters that need Python, PDF parsing, or the linkage model | a container run is triggered from the Worker's `scheduled` handler |
| Rendered sources | Browser Rendering | for registers behind client-side rendering or bot walls where terms allow |
| Queues | Queues | fan-out of per-page or per-nature fetches, retry with backoff |
| Optional | Workers AI | sector classification and templated narration only (principle 3) |

### 12.2 Pipeline

```
Cron Trigger
  -> adapter run (Worker or Container)
     -> bronze: raw payloads to R2 (kept, dated)
     -> silver: records.parquet + statements.parquet to R2
  -> regenerate (Container)
     -> linkage candidates (Splink or a port of its comparison logic)
     -> precedence resolution -> businesses
     -> rubric evaluation -> scores
     -> write D1 (transactional swap by regeneration id)
     -> publish bundles to R2
  -> site reads D1; downloads read R2
```

Bronze is immutable and dated; silver is regenerable from bronze; canonical and scores are regenerable from silver plus labels and operator statements. Lineage is computed from these layers on request, not stored.

### 12.3 Design lineage

The patterns Atlas builds on (layered raw, typed and canonical data; field-level statements with a precedence contract; candidates-never-identities linkage; corrections as upstream records) were proven on an earlier private pipeline over the same registers before being reimplemented here as a clean-room public codebase under the adapter contract. Atlas's published bundles are the single public source of truth for the Uganda business layer.

### 12.4 Refresh cadences

Per source as declared in 7.1. A source that fails three consecutive runs is marked `stale` on `/sources` and in `list_sources`; its statements keep their original `asserted_at` and are never silently extended.

## 13. Security, privacy, and legal

### 13.1 Personal data

Uganda's Data Protection and Privacy Act (2019) applies to personal data even when it appears in a public register. Atlas's posture:

- Publish business-level facts only. Sole-trader names that are also personal names appear because they are the registered business name; no other personal attribute is attached.
- Never publish phone numbers, email addresses, home or postal addresses, or individual-level compliance rosters, even where the register does. These columns are dropped at adapter time (not merely hidden) except for a salted hash of phone numbers retained solely as a linkage feature, never displayed or exported.
- Provide a documented takedown path for an individual whose name appears as a business name and who can show the business is closed.
- Operator claims record the verification artefact, not the person; public views show "operator", never a named individual.

### 13.2 Source terms

Each adapter's `schema.yml` records the terms-of-use URL and the date it was checked. Registers whose terms forbid automated access are not scraped. Robots directives are honoured. Per-lookup services (URSB, URA TIN search) are used only for a single record on an explicit user action, never enumerated.

### 13.3 Agent safety

- Tool results carrying scraped text set `untrustedContentHint` so agents treat them as data, not instructions.
- Write tools always pause for `requestUserInteraction()`; the confirmation shows the exact statement to be recorded.
- Tools are exposed to the site's own origin only until a partner review adds `exposedTo` entries.
- Result sizes are bounded and paginated; error text from upstream sources is never echoed into tool results.

### 13.4 Platform security

- Read API rate-limited per IP and per key; write paths require a verified claim session.
- No user-supplied SQL anywhere; all queries are parameterised.
- Secrets in Workers secrets only; adapters carry no credentials because Phase 0 sources need none.
- Regeneration is a single transactional swap keyed by regeneration id; a failed regeneration leaves the previous state live.

## 14. Licensing

| Artefact | Licence | Notes |
|---|---|---|
| Code | Apache-2.0 | declared in the repository |
| Published canonical data and scores | CC-BY-4.0 | attribution line "TrustScore Atlas, atlas.trustscorehq.com" |
| Per-source rows | source rights, carried per row | Each `source.yml` declares `rights`: `public_register` (data the issuing authority publishes for public access, redistributable on every surface with attribution and a takedown path), `open_licence` (PPDA CC-BY-4.0, HDX CC-BY-IGO), or `restricted` (not redistributed) |
| Rubrics | CC-BY-4.0 | forkable with attribution |

Sources with share-alike or non-redistributable terms are not included in the published layer. No ODbL material is used.

## 15. Success metrics

| Metric | Phase 0 target | Phase 1 target |
|---|---|---|
| Businesses with ≥ 1 identifier | 70,000 | 150,000 |
| Businesses found in ≥ 2 registers | 2,000 | 10,000 |
| Sources live and fresh | 12 | 20 |
| Median search latency (p50 / p95) | 200 ms / 600 ms | same |
| Verified claims | 25 | 500 |
| Accepted operator corrections | 50 | 1,000 |
| External adapters merged | 0 | 5 |
| API consumers with a key | 10 | 100 |
| TrustScore consuming Atlas as an input | yes | yes |

## 16. Delivery plan

### 16.1 Phase 0 build order

1. Repository scaffold, licences, adapter contract, JSON Schema for Business and Statement.
2. Port adapters: KCCA businesses, URA (3 lists), PPDA (4 tables), UNBS, then BoU, CMA, URBRA, UCC, NLGRB, HDX.
3. Precedence resolution and canonical build; D1 schema and loader; R2 bundles.
4. Linkage candidates (name + identifier), labels file, alias redirects.
5. Rubrics v1 and the engine; scores table; methodology page content.
6. Site: search, business page, evidence trace, explorer with map, sources, methodology, downloads.
7. WebMCP tools (read set first, then the four write tools behind confirmation), HTTP API.
8. Claim flow with website verification string and maintainer moderation.
9. Cron Triggers per source; stale marking; regeneration job; `/ops` moderation queue and source rerun.
10. Stretch: `packs/ke/` with the PPIP OCDS adapter (section 5.2a).
11. Public launch: README, country-pack guide, API docs, walkthrough.

### 16.2 First public release

The first public release is the smallest cut that keeps every principle intact: the evidence trace on every business page, the write-tool confirmations, and honest coverage statements are never cut. If scope must shrink, sources shrink first (keeping KCCA, URA, PPDA and UNBS), then the explorer map, then the remote MCP server.

## 17. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| A register changes its page structure or blocks automated access | Source goes stale | Bronze is kept, so the last good state stays published with its date; adapters are small and isolated; `/sources` shows the failure |
| Name-only linkage produces false merges | Wrong facts attached to a business | No automatic merges (principle 5); candidates shown as candidates; claimants can label |
| Personal data complaint | Legal and reputational | Section 13.1 posture, takedown path, columns dropped at adapter time |
| Scores misread as credit scores | Regulatory attention, user harm | Methodology page and every tool result state what scores are not; no individual scoring; TrustScore remains the consented product |
| Coverage skew toward Kampala | Misleading "not found" outside the capital | Coverage statement names which registers are Kampala-only; Phase 1 prioritises national registers |
| Hosting cost grows with traffic | Cost | Phase 0 footprint fits the Workers Paid base tier; reads are cached by regeneration id |
| Sole maintainer | Bus factor | Adapter contract, conformance suite and public bundles mean anyone can run the pipeline |

## 18. Open questions

1. URSB posture: is a per-claim OBRS lookup initiated by the claimant acceptable under OBRS terms? Needs a read of the terms and, ideally, a conversation with URSB about a bulk or partner feed.
2. ISIC mapping ownership: maintainer-authored crosswalk, or a model-drafted crosswalk reviewed by the maintainer, recorded as precedence 5 until reviewed?
3. Should Product-Fit rubrics submitted by third parties be hosted on Atlas (a "rubric gallery"), or only run locally against the downloads?
4. Claim verification for businesses with no website and no domain email: accept a signed letter upload reviewed manually, or leave them unclaimable in Phase 0?
5. Historical snapshots: publish a dated bundle per regeneration (cheap on R2) or only the latest plus a changelog?

## 19. Glossary

| Term | Meaning |
|---|---|
| Statement | One sourced claim about one field of one business |
| Precedence | The rank that decides which statement wins when sources disagree |
| Coverage | Registers applicable, checked, and where the business was found |
| Candidate | A scored possible match between two records; not a merge |
| Label | A verified verdict on a candidate: match or non_match |
| Claim | A business operator's verified attachment to an Atlas record |
| Rubric | A versioned list of evidence predicates and points that defines a score |
| Bronze / silver / canonical | Raw pulls / typed per-source tables / resolved business records |
| KCCA, URA, PPDA, UNBS, BoU, CMA, URBRA, UCC, NLGRB, URSB, NIRA, UBOS | Kampala Capital City Authority; Uganda Revenue Authority; Public Procurement and Disposal of Public Assets Authority; Uganda National Bureau of Standards; Bank of Uganda; Capital Markets Authority; Uganda Retirement Benefits Regulatory Authority; Uganda Communications Commission; National Lotteries and Gaming Regulatory Board; Uganda Registration Services Bureau; National Identification and Registration Authority; Uganda Bureau of Statistics |
| OCDS | Open Contracting Data Standard, the format PPDA publishes in |
| COD-AB | Common Operational Dataset, Administrative Boundaries (HDX) |
| WebMCP | Browser standard for pages to register tools that AI agents can call |
