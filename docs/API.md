# API Contracts

OpenAPI 3.1 documentation is available in [`docs/openapi.yaml`](./openapi.yaml).

All endpoints return JSON. Error responses use:

```json
{
  "error": "Human-readable message",
  "issues": []
}
```

## `GET /api/tlds`

Returns the configured TLD catalog as an array:

```json
[
  {
    "tld": "ai",
    "label": ".ai",
    "category": "ai",
    "restricted": false,
    "requiresEligibility": false,
    "supportedProviders": ["mock", "rdap", "namecheap"],
    "defaultEnabled": true
  }
]
```

## `POST /api/check`

Public check adapter. Accepts the contract shape or legacy exact-domain helpers.

Contract request:

```json
{
  "name": "aptava",
  "extensions": ["ai", "com", "sg", "com.sg"],
  "providers": ["auto"],
  "forceRefresh": false
}
```

Response:

```json
{
  "queryId": "qry_...",
  "results": [],
  "summary": {
    "availableCount": 2,
    "takenCount": 1,
    "unknownCount": 1,
    "bestDomain": "aptava.ai"
  }
}
```

Legacy exact-domain request forms remain accepted:

```json
{
  "domain": "aptava.ai",
  "mode": "mock"
}
```

```json
{
  "domains": ["aptava.ai", "mybrand.com.sg"],
  "mode": "mock"
}
```

## `POST /api/check-bulk`

Queues a bulk check job and returns immediately.

```json
{
  "names": ["aptava", "ritava", "kriyava"],
  "extensions": ["ai", "com", "sg"],
  "forceRefresh": false
}
```

Response:

```json
{
  "jobId": "job_...",
  "status": "queued"
}
```

## `GET /api/jobs/{jobId}`

Returns queued/running/completed/failed job status, progress, and accumulated results.

## `POST /api/domain/check`

Checks one or more base names across selected extensions.

Request:

```json
{
  "names": ["aptava"],
  "extensions": ["ai", "com", "sg", "com.sg"],
  "mode": "mock",
  "includeSuggestions": true
}
```

Fields:

- `names`: 1-1000 normalized base names.
- `extensions`: 1-50 extensions without a required leading dot.
- `mode`: `mock`, `hybrid`, or `live`.
- `includeSuggestions`: when true, returns transformations and recommendation scoring.
- `allowCustomExtensions`: when true, accepts syntactically valid extensions not present in the local catalog.

Response:

```json
{
  "checkedAt": "2026-05-22T04:00:00.000Z",
  "mode": "mock",
  "results": [
    {
      "id": "aptava.ai",
      "name": "aptava",
      "domain": "aptava.ai",
      "extension": "ai",
      "status": "available_confirmed",
      "confidence": "high",
      "source": "mock",
      "providerName": "MockAvailabilityProvider",
      "checkedAt": "2026-05-22T04:00:00.000Z",
      "priceRegistration": 79,
      "priceRenewal": 79,
      "currency": "USD",
      "premium": false,
      "registrarUrl": "https://www.namecheap.com/domains/registration/results/?domain=aptava.ai",
      "rawSummary": "Deterministic mock provider confirms standard availability."
    }
  ],
  "recommendations": [
    {
      "name": "aptava",
      "brandScore": 84,
      "subscores": {},
      "explanation": "Short, pronounceable, and strong across AI extensions."
    }
  ]
}
```

## `POST /api/domain/generate`

Generates name variants, filters them for brandability, checks each generated name
against selected extensions, and returns the top 20 recommendations.

Request:

```json
{
  "seed": "trust, action, data, agentic AI, automation, revenue, efficiency",
  "styles": ["sanskrit_hindi", "spiritual", "enterprise", "ai_native", "agentic_automation"],
  "minLength": 5,
  "maxLength": 12,
  "limit": 80,
  "allowedLetters": "",
  "avoidLetters": "",
  "mustInclude": "",
  "mustAvoid": "",
  "extensions": ["ai", "com", "sg", "com.sg"],
  "mode": "mock"
}
```

Response:

```json
{
  "checkedAt": "2026-05-22T04:00:00.000Z",
  "mode": "mock",
  "extensions": ["ai", "com", "sg", "com.sg"],
  "seedTerms": ["trust", "action", "data", "agentic ai", "automation", "revenue", "efficiency"],
  "candidates": [
    {
      "name": "satyflow",
      "style": "sanskrit_hindi",
      "rationale": "Uses local Sanskrit/Hindi roots for trust, action, wisdom, and flow.",
      "method": "synonym_expansion",
      "tags": []
    }
  ],
  "results": [
    {
      "domain": "satyflow.ai",
      "status": "available_confirmed",
      "confidence": "high",
      "source": "mock",
      "providerName": "MockAvailabilityProvider"
    }
  ],
  "recommendations": [
    {
      "name": "satyflow",
      "brandScore": 84,
      "subscores": {},
      "explanation": "satyflow is memorable, AI-relevant, rooted in Indic meaning with an 84/100 composite score."
    }
  ]
}
```

## `POST /api/generate`

Public generation contract. It returns scored candidates, each with checked domain
results for the selected extensions, plus the top recommendations.

```json
{
  "seedWords": ["trust", "action", "agentic AI", "workflow", "revenue"],
  "style": ["sanskrit", "enterprise", "bizarre"],
  "minLength": 5,
  "maxLength": 10,
  "count": 200,
  "extensions": ["ai", "com", "sg"]
}
```

## `POST /api/projects`

Creates a saved project shell for founder shortlists.

Request:

```json
{
  "name": "Founder shortlist",
  "description": "AI domain candidates",
  "domains": ["aptava.ai", "satyaflow.com"]
}
```

## `GET /api/projects`

Lists saved shortlist projects from the in-memory local project store.

## `POST /api/export`

Exports results as CSV, XLSX, or JSON.

```json
{
  "format": "csv",
  "results": [],
  "recommendations": [],
  "filename": "founder-shortlist"
}
```

## `GET /api/health`

Returns app and provider readiness.

Response:

```json
{
  "ok": true,
  "service": "domain-intelligence-studio",
  "providers": {
    "mock": true,
    "rdap": true,
    "namecheap": false
  }
}
```
