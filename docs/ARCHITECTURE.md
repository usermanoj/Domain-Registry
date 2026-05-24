# Architecture

Domain Intelligence Studio uses a Next.js full-stack architecture for the MVP. Backend logic is kept in `src/domain` and `src/server` so API routes remain thin.

## Layers

- `src/app`: Next.js app routes and UI shell.
- `src/components`: client-side studio components.
- `src/domain`: provider-neutral domain logic, scoring, candidate generation, export helpers, and typed availability engine.
- `src/domain/providers`: provider adapters for mock, RDAP, and registrar APIs.
- `src/server`: backend-only helpers such as queue scaffolding.
- `prisma/schema.prisma`: PostgreSQL schema for Phase 2 persistence.
- `tests/e2e`: Playwright tests.

## Provider Adapter Contract

Every provider returns a normalized `DomainCheckResult` with:

- availability status
- confidence level
- source and provider name
- timestamp
- registrar action link where useful
- optional price and premium status
- rule notes for restricted or country-specific extensions

Adapters must never inspect DNS records or website availability to decide whether a domain is available.

## Bulk Execution

The MVP client can check small-to-medium batches by chunking calls to `/api/domain/check`. Phase 2 introduces `BullMQ` workers backed by Redis. The queue factory is intentionally isolated so API routes can switch from synchronous checks to job creation without changing domain scoring or provider code.

## Deployment

Local development runs with Next.js plus optional PostgreSQL and Redis from Docker Compose. Production can run on Vercel with managed Postgres and Redis, or as a Docker container with external services.
