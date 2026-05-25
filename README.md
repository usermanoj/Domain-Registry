# Domain Intelligence Studio

Premium AI-native domain research studio for generating, checking, scoring,
shortlisting, exporting, and preparing to register domain names.

The app deliberately does not use DNS failure, website absence, or HTTP behavior
as proof of availability. Domain checks go through provider adapters with
explicit status, confidence, source, and timestamp.

## Stack

- Next.js App Router, React, TypeScript, Tailwind CSS
- Framer Motion, Recharts, lucide-react
- Provider-based availability engine: mock, RDAP, Namecheap scaffold, SG/manual checks
- PostgreSQL schema via Prisma
- Redis-ready queue/cache configuration
- Vitest unit/integration tests and Playwright E2E tests
- Docker and Docker Compose deployment artifacts

## Local Setup

Install dependencies and start the Next.js dev server:

```bash
npm install
cp .env.example .env
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

For local Postgres and Redis without containerizing the app:

```bash
docker compose up -d postgres redis
```

Then set these in `.env`:

```bash
DATABASE_URL=postgresql://domain:domain@localhost:5432/domain_intelligence?schema=public
REDIS_URL=redis://localhost:6379
```

Generate Prisma client and run migrations when persistence-backed work is enabled:

```bash
npm run prisma:generate
npm run prisma:migrate
```

## Docker Compose

Run the full local stack:

```bash
cp .env.example .env
docker compose up --build
```

Services:

- App: `http://127.0.0.1:3000`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

The compose file provides container-safe defaults for `DATABASE_URL` and
`REDIS_URL`, even if those values are blank in `.env`.

## Provider Configuration

Provider modes:

- `mock`: deterministic local results for development, tests, and demos.
- `hybrid`: registrar/RDAP where configured, with mock fallback.
- `live`: registrar/RDAP/manual results without treating mock data as real availability.

Namecheap variables:

```bash
NAMECHEAP_API_BASE_URL=https://api.sandbox.namecheap.com/xml.response
NAMECHEAP_API_USER=
NAMECHEAP_API_KEY=
NAMECHEAP_USERNAME=
NAMECHEAP_CLIENT_IP=
```

Operational variables:

```bash
DEFAULT_CACHE_TTL_HOURS=24
ENABLE_MOCK_PROVIDER=true
```

Keep registrar credentials server-side only. Do not expose them with
`NEXT_PUBLIC_` prefixes.

## Seed Data

Portable seed artifacts live in [data/seeds](./data/seeds):

- `default-tld-catalog.json`
- `restricted-tlds.json`
- `sanskrit-hindi-roots.json`
- `tech-suffixes.json`

The app currently reads TypeScript constants from `src/domain`; keep seed JSON
and code constants synchronized until a database bootstrap script is introduced.

## Tests

Run static checks and the unit/integration suite:

```bash
npm run typecheck
npm run lint
npm run test
```

Build production output:

```bash
npm run build
```

## Playwright

Install browser dependencies once:

```bash
npx playwright install --with-deps chromium
```

Run the full E2E suite:

```bash
npm run test:e2e
```

Run one smoke flow:

```bash
npx playwright test tests/e2e/domain-studio.spec.ts --project=chromium --grep "user enters a seed name"
```

Playwright starts the dev server from `playwright.config.ts` when needed.

## Deployment

### Docker Host or Container Platform

Build and run the standalone Next.js image:

```bash
docker build -t domain-intelligence-studio .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:password@host:5432/db?schema=public" \
  -e REDIS_URL="redis://host:6379" \
  -e ENABLE_MOCK_PROVIDER="false" \
  domain-intelligence-studio
```

For managed platforms such as Cloud Run, Fly.io, Render, Railway, ECS, or
Kubernetes, deploy the Docker image and provide managed PostgreSQL/Redis URLs as
environment variables. Run Prisma migrations as a release step before routing
traffic to a persistence-backed deployment.

### Node Server

On a Node host:

```bash
npm ci
npm run build
npm run start -- --hostname 0.0.0.0
```

### Vercel or Next-Compatible Adapters

This app uses Route Handlers and server-side provider credentials, so deploy as a
server-backed Next.js app rather than static export. Configure:

- `DATABASE_URL`
- `REDIS_URL`
- Namecheap credentials, if live registrar checks are enabled
- `DEFAULT_CACHE_TTL_HOURS`
- `ENABLE_MOCK_PROVIDER`

## Domain Availability Caveats

Availability is nuanced:

- Only `available_confirmed` should be shown as a green available result.
- `premium_available` means the name may be purchasable but pricing and renewal
  terms need registrar confirmation.
- `unknown`, `rate_limited`, and `manual_check_required` are not available
  claims.
- RDAP behavior varies by registry. A `404` can indicate likely availability for
  some registries, but not all.
- DNS records are used only as evidence that a domain is already in use; missing
  DNS records are never treated as evidence of availability.
- Mock results are simulated. They are excluded from available-only filters and
  should never be used for purchasing decisions.
- Restricted namespaces such as `.edu`, government, and military-style TLDs need
  eligibility checks.
- `.sg` and `.com.sg` should be verified through SGNIC-accredited registrars.
- Registrar APIs remain the strongest confirmation source, but pricing and
  availability can change between check and checkout.

## Project Docs

- [Specification](./docs/SPEC.md)
- [API Contracts](./docs/API.md)
- [OpenAPI](./docs/openapi.yaml)
- [Architecture](./docs/ARCHITECTURE.md)
