# Geospatial exposure proximity — implementation status

## Purpose

The deterministic helper in `server/src/exposure-proximity.mjs` matches caller-supplied asset coordinates to caller-supplied event coordinates using the Haversine great-circle distance. It retains event identifiers, date labels, source URLs, and attribution where supplied.

Default proximity bands are:
- `close`: up to and including 5 km
- `elevated`: over 5 km and up to and including 25 km
- `monitor`: over 25 km and up to and including 100 km
- farther events are not returned

Thresholds can be supplied by the caller and must be strictly increasing. Output is sorted nearest-first. Coordinates outside latitude/longitude bounds are rejected rather than silently interpreted.

## Safety and limitations

This is a **proximity screen, not a damage or insurance-loss model**. Straight-line distance does not account for flood boundaries, earthquake intensity, terrain, building characteristics, event footprint, policy terms, insured values, deductibles, limits, or reinsurance. A close event is not proof that an asset was damaged or that a claim is covered. Do not use the result alone to price, accept/decline, reserve, or settle a claim.

Asset/event data must come from an authorized source and be processed under tenant access controls and applicable privacy/retention rules. This helper does not fetch sources, read the database, persist matches, or make external requests. Integrate it behind authenticated, tenant-scoped API logic only after validating asset permissions and the event's provenance.

## Validation

Fixture-based tests cover provenance fields, distance ordering, bands, invalid coordinates, date-line wrap, and empty input. These tests do not establish live provider connectivity or validate a catastrophe model.
