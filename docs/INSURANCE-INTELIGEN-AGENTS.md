# Insurance Intelligence Agents — foundation status

## Current state

This change introduces an explicit agent registry and a safe, configurable public-JSON source ingestion foundation. It does **not** claim that autonomous multi-agent intelligence is production-ready.

### Registered capabilities
- Corporate intelligence (public company and financial information)
- Geospatial risk (hazard/weather/location feeds)
- News and event monitoring
- Regulatory watch
- Deterministic evidence/source metadata checks
- Insurance intelligence synthesis (currently rules-only placeholder)

The first four are connectors only after an operator configures approved source endpoints. No feed is enabled by default. The evidence verifier currently labels items `unverified`; it does not independently establish truth. The synthesizer is not an LLM agent yet.

## Source-domain catalog

The authenticated read-only endpoint `GET /api/v1/intelligence/sources` exposes the planning catalog under `intelligence:read`. It currently lists 17 domains: corporate ownership, financial health, geospatial hazards, earth observation, news/events, regulation/compliance, policy wording, claims/losses, engineering/safety, transport/supply chain, climate/weather, insurance/reinsurance/actuarial, litigation/integrity, macro/country risk, cyber/operational risk, and data quality/governance.

Catalog entries are deliberately marked `planned` and `connected: false`. The catalog is not an API connection and does not imply a source is approved, accessible, licensed for reuse, or tested. Several entries are discovery portals rather than API endpoints. Internal and partner data entries are placeholders and must never be fetched as public URLs. Before a connector is enabled, confirm its actual endpoint, authentication, terms, permitted reuse, update frequency, data minimization, and test results. A provider-specific adapter is required when the source does not expose the supported public JSON format.

## OJK regulatory source readiness

The source catalog now includes the official OJK regulation search portal and the insurance-sector regulation listing:

- General regulation search: https://www.ojk.go.id/id/regulasi/_layouts/15/listform.aspx?PageType=4
- Insurance-sector regulation listing: https://www.ojk.go.id/id/kanal/iknb/regulasi/asuransi/peraturan-ojk/default.aspx

These are official web portals for discovery, not verified JSON API endpoints. The catalog intentionally marks them `planned` and `connected: false`. No HTML scraping or source activation is introduced by this change. Before building an automated connector, confirm whether OJK provides a documented machine-readable endpoint or download interface, inspect its current terms and response format, and test it in validation. If only HTML pages are available, implement a dedicated, narrowly scoped adapter with fixture tests and clear source citations rather than passing the page to the generic JSON ingestion pipeline. Every regulation record should ultimately retain its official URL, regulation identifier/type, publication date, effective/status metadata when available, retrieval timestamp, and a clear distinction between publication date and legal effective date.

## Provider-specific public hazard adapters

The research pipeline includes explicit normalization adapters for two public earthquake-feed formats:
- `usgs-earthquake-geojson`: USGS GeoJSON features, including event time, magnitude, place, coordinates, depth summary, and source URL.
- `bmkg-earthquake-json`: BMKG `Infogempa.gempa` JSON records, including location, magnitude, depth/potential summary, and coordinates with hemisphere sign handling.

Adapters only normalize responses after the source is explicitly configured. They do not enable sources automatically, verify events independently, or calculate insured loss. Findings remain `unverified`. Before enabling a provider in an environment, check its current endpoint, response schema, terms, update behavior, availability, and the appropriate `INTELLIGENCE_ALLOWED_HOSTS` allowlist. Provider format changes should fail visibly and be covered by fixtures/tests.

Example configuration (review and enable only in a non-production validation environment first):

```json
[
  {
    "id": "usgs-earthquakes-daily",
    "title": "USGS earthquake feed",
    "publisher": "USGS",
    "agentId": "geospatial-risk",
    "adapter": "usgs-earthquake-geojson",
    "url": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
    "enabled": true
  },
  {
    "id": "bmkg-earthquakes-latest",
    "title": "BMKG recent earthquake feed",
    "publisher": "BMKG",
    "attribution": "Sumber data: BMKG",
    "agentId": "geospatial-risk",
    "adapter": "bmkg-earthquake-json",
    "url": "https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json",
    "enabled": true
  }
]
```

For this example, the exact host allowlist must include `earthquake.usgs.gov,data.bmkg.go.id`. This example is a configuration template, not evidence that either endpoint has been live-tested from the deployed service.

## Read-only live validation of public earthquake feeds

A manual GitHub Actions workflow, **Validate public hazard source endpoints**, can check the currently published BMKG and USGS feed URLs without credentials or database access. Run it only when a live network check is intended and enter `CHECK-PUBLIC-SOURCES`. It checks HTTP 200, JSON content type, basic provider schema, and representative event fields/coordinates. The workflow does not deploy the API, write to Neon, enable sources in the research orchestrator, or prove that an event is independently verified. Results describe endpoint reachability and schema at the time of the run only. BMKG attribution must be displayed wherever its data is presented in the application.

## Source configuration

Set the Neon Function environment variables only after reviewing the source's terms, privacy implications, rate limits and data licence:

- `INTELLIGENCE_ALLOWED_HOSTS`: comma-separated exact HTTPS hostnames approved for outbound retrieval.
- `INTELLIGENCE_SOURCES_JSON`: JSON array of objects with `id`, `title`, `publisher`, `agentId`, `url`, and `enabled: true`. Optional `attribution` is preserved in source results and each finding; if omitted, the publisher name is used. Supply any attribution required by the provider's terms.

Only HTTPS, exact allowlisted hosts and JSON responses are accepted. Redirects are refused, requests time out, and source/item counts are capped. RSS/XML, websites requiring scraping, authenticated sources, geocoding and provider-specific APIs need dedicated adapters and legal review; they are not silently scraped. Never include API credentials inside source URLs.

Example configuration template (not an active source):
```json
[
  {
    "id": "replace-with-reviewed-source-id",
    "title": "Reviewed public data endpoint",
    "publisher": "Official publisher name",
    "agentId": "news-event-monitor",
    "url": "https://approved.example.org/api/feed",
    "enabled": true
  }
]
```

## Production gaps before commercial use

1. Implement reviewed adapters for official corporate registries, OJK/BI and other regulators, BMKG/BIG/BPBD and hazard datasets, reputable news providers, and approved geospatial APIs.
2. Persist raw snapshots and normalized observations with tenant-aware authorization, provenance, hashes, retention and deletion controls.
3. Add scheduled ingestion, deduplication, retries, backoff, freshness/SLA monitoring, source outage alerts and a review queue.
4. Add an actual model provider behind a server-side gateway, with structured outputs, prompt-injection isolation, source citations, uncertainty, evaluation sets and spend controls.
5. Implement cross-agent orchestration, corroboration, contradiction detection, human approval and audit logging.
6. Complete threat modelling, privacy/legal review, penetration testing, disaster recovery and operational monitoring.

## Non-goals / safety

Research output is intelligence support, not a confirmed fact or automatic underwriting/claim decision. Do not ingest personal/sensitive data without a documented lawful basis, purpose, access policy and retention plan. Do not use unverified findings as a basis for customer adverse decisions.
