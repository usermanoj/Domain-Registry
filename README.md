# Domain Intelligence Studio

Premium AI-native domain research studio for generating, checking, scoring, comparing, shortlisting, exporting, and preparing to register domain names.

The app deliberately does not use DNS failure, website absence, or HTTP behavior as proof of availability. Domain checks go through provider adapters with explicit confidence, source, and timestamp.

## Stack

- Next.js App Router, TypeScript, Tailwind CSS
- Framer Motion, Recharts, lucide-react
- Provider adapters: mock, RDAP through IANA bootstrap, Namecheap scaffold
- Prisma schema for PostgreSQL persistence
- BullMQ/Redis queue scaffold for Phase 2 bulk jobs
- Vitest unit tests and Playwright E2E tests
- Docker-first local deployment

## Quick Start

```bash
npm install
cp .env.example .env
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

## Checks

```bash
npm run typecheck
npm run lint
npm run test
npm run test:e2e
```

## Docker

```bash
cp .env.example .env
docker compose up --build
```

Services:

- App: `http://127.0.0.1:3000`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

## Provider Modes

- `mock`: deterministic local results for development and demos.
- `hybrid`: Namecheap when configured, then RDAP, then mock fallback.
- `live`: Namecheap when configured, then RDAP; inconclusive registries return manual-check states.

Availability status values:

- `available_confirmed`
- `taken_confirmed`
- `premium_available`
- `restricted`
- `unknown`
- `rate_limited`
- `invalid`
- `manual_check_required`

Provider confidence levels are stored separately as `high`, `medium`, or `low`.

`.edu` is always marked eligibility-restricted. `.sg` and `.com.sg` include Singapore registry notes and registrar action links.

## Optional Namecheap Configuration

Set these in `.env` to enable the registrar adapter:

```bash
NAMECHEAP_API_BASE_URL=https://api.sandbox.namecheap.com/xml.response
NAMECHEAP_API_USER=
NAMECHEAP_API_KEY=
NAMECHEAP_USERNAME=
NAMECHEAP_CLIENT_IP=
```

The adapter calls `namecheap.domains.check` and maps availability, premium status, and rate limits into the normalized confidence model.

## Database

The Prisma schema lives at [prisma/schema.prisma](./prisma/schema.prisma). It models projects, search runs, domain results, recommendation scores, favorites, and watchlist alerts.

Generate the client:

```bash
npm run prisma:generate
```

Create a migration after PostgreSQL is running:

```bash
npm run prisma:migrate
```

## Deployment Notes

Vercel:

- Set `DATABASE_URL` to a managed PostgreSQL URL.
- Set `REDIS_URL` to a managed Redis URL for Phase 2 queues/cache.
- Configure Namecheap credentials only in server-side environment variables.
- Keep provider mode `live` or `hybrid` depending on whether mock fallback is acceptable.

Docker:

- Build with `docker compose up --build`.
- Use external Postgres/Redis by overriding `DATABASE_URL` and `REDIS_URL`.
- Run Prisma migrations before enabling persistence-backed Phase 2 features.

## Project Docs

- [Specification](./docs/SPEC.md)
- [API Contracts](./docs/API.md)
- [Architecture](./docs/ARCHITECTURE.md)
