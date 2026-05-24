# API Contracts

All endpoints return JSON. Error responses use:

```json
{
  "error": "Human-readable message",
  "issues": []
}
```

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

- `names`: 1-500 normalized base names.
- `extensions`: 1-50 extensions without a required leading dot.
- `mode`: `mock`, `hybrid`, or `live`.
- `includeSuggestions`: when true, returns transformations and recommendation scoring.

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

Generates name variants and returns recommended names. The frontend can pass the generated names into `/api/domain/check`.

Request:

```json
{
  "seed": "trust, action, data, agentic AI, automation, revenue, efficiency",
  "limit": 80,
  "styles": ["sanskrit", "western", "bizarre", "enterprise", "short", "premium", "acronym", "compound", "synonym", "prefix_suffix"]
}
```

Response:

```json
{
  "seedTerms": ["trust", "action", "data", "agentic ai", "automation", "revenue", "efficiency"],
  "candidates": [
    {
      "name": "satyflow",
      "style": "sanskrit",
      "rationale": "Combines satya/truth with operating flow."
    }
  ],
  "recommendations": []
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
