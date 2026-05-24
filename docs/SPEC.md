# Domain Intelligence Studio Specification

## Product Goal

Domain Intelligence Studio helps founders, operators, and brand strategists generate, check, compare, shortlist, export, and prepare to register domain names across global and Singapore-relevant extensions.

The product must never infer availability from DNS failure, HTTP failure, parked pages, or lack of a website. Availability is determined only through provider adapters that can explain their source and confidence.

## MVP Scope

Phase 1 ships:

- Single-name search across selected extensions.
- Deterministic candidate generation from one or more seed terms.
- Name transformation suggestions.
- Mock provider adapter for fast local development.
- RDAP provider adapter using IANA RDAP bootstrap data where supported.
- Registrar adapter interface plus Namecheap implementation that activates when credentials are configured.
- Result cards, table, domain stack view, extension heatmap, score chart, comparison shelf, favorites, and export.
- CSV, JSON, and XLSX export from current results.
- Unit tests for normalization, generation, scoring, providers, and engine behavior.
- Playwright E2E smoke test.

Phase 2 targets:

- Persistent projects, saved searches, and watchlists in PostgreSQL.
- Redis-backed BullMQ bulk jobs for 100-5,000 seed names.
- Recommendation explanations stored with candidate snapshots.
- Auth and account-scoped rate limits.

Phase 3 targets:

- AI name generation through a configured LLM provider.
- Watchlist alerts.
- Price comparison across registrar adapters.
- Registrar deep links and checkout handoff.
- Production deployment hardening.

## Availability Principles

The layered availability engine evaluates providers in this order for live checks:

1. Registrar availability API if configured.
2. RDAP lookup discovered through IANA bootstrap where supported.
3. WHOIS fallback adapter where RDAP and registrar APIs are unavailable.
4. Manual-check result when a registry is restricted, inconclusive, unavailable, or rate limited.

The MVP includes registrar, RDAP, and mock adapters. WHOIS is represented in the provider interface but intentionally not used by default because WHOIS parsing is registry-specific and often rate limited.

Allowed availability status values:

- `available_confirmed`
- `taken_confirmed`
- `premium_available`
- `restricted`
- `unknown`
- `rate_limited`
- `invalid`
- `manual_check_required`

Provider result confidence is stored separately as `high`, `medium`, or `low`.

Important extension rules:

- `.edu` is eligibility-restricted and must be marked restricted.
- `.sg` and `.com.sg` expose Singapore-specific rule notes and accredited registrar links.
- Multi-label public suffix style extensions such as `.com.sg` are treated as one selected extension.
- Any syntactically valid extension may be checked. RDAP discovery determines whether the root TLD is supported through IANA bootstrap.

## Recommendation Inputs

Each generated candidate receives sub-scores for:

- Memorability
- Pronunciation ease
- Spelling clarity
- Brand strength
- Enterprise credibility
- Spiritual or Indian depth
- AI-native feel
- Domain stack quality
- Risk of confusion
- Length
- Extension quality
- Availability confidence

The composite `brandScore` is a weighted 0-100 score. Explanations must be deterministic in the MVP so tests are stable.

## UX Requirements

The default interface is dark, premium, dense, and operational. Light mode is available. The first viewport contains the working search studio, not a marketing page.

Required MVP surfaces:

- Hero search panel.
- Extension selector with `.ai`, `.com`, `.sg`, `.com.sg`, `.net`, `.io`, `.co`, `.app`, `.dev`, `.tech`, `.education`, `.edu`, plus custom extension input.
- Provider mode selector: mock, hybrid, live.
- Result cards and sortable table.
- Confidence/source badges.
- Domain extension heatmap.
- Brand score radial chart.
- Domain stack view.
- Side-by-side comparison shelf.
- Favorites/watchlist state.
- Batch progress for local bulk-style checks.
- Export buttons for CSV, JSON, and XLSX.

## Non-Goals For MVP

- Taking payment or registering domains directly.
- Claiming real-time registrar price accuracy unless returned by a configured registrar provider.
- Treating DNS, website content, or search engine presence as availability proof.
- Background bulk queue execution for 5,000 names. The UI may process manageable local batches, while Redis/BullMQ infrastructure is prepared for Phase 2.
