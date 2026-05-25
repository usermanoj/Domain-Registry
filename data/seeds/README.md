# Seed Data

These JSON files are portable seed artifacts for local development, future Prisma
bootstrap scripts, and cloud initialization jobs.

- `default-tld-catalog.json`: default extension catalog exposed by `/api/tlds`.
- `restricted-tlds.json`: restricted and manual-check namespaces.
- `sanskrit-hindi-roots.json`: local roots used by the name generator.
- `tech-suffixes.json`: suffix and syllable dictionaries used by transformations.

The running app currently uses TypeScript constants in `src/domain`. Keep these
seed files synchronized when changing the in-app catalogs.
