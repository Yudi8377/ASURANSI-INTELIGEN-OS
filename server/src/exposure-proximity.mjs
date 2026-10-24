const EARTH_RADIUS_KM = 6371.0088;
const MAX_COMPARISONS = 10_000;

function coordinate(value, name, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Invalid ${name}: expected a finite number between ${min} and ${max}.`);
  }
  return value;
}

function validatePoint(point, label) {
  if (!point || typeof point !== 'object' || Array.isArray(point)) {
    throw new Error(`Invalid ${label}: expected an object.`);
  }
  return {
    latitude: coordinate(point.latitude, `${label}.latitude`, -90, 90),
    longitude: coordinate(point.longitude, `${label}.longitude`, -180, 180)
  };
}

function haversineKm(a, b) {
  const radians = degrees => degrees * Math.PI / 180;
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const deltaLat = lat2 - lat1;
  const deltaLon = radians(b.longitude - a.longitude);
  const h = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, h)));
}

/**
 * Match supplied asset coordinates to supplied event coordinates.
 * This is proximity screening only; it does not estimate damage, insured loss,
 * coverage, causation, or claim eligibility.
 */
export function matchAssetEventProximity(assets, events, options = {}) {
  if (!Array.isArray(assets) || !Array.isArray(events)) {
    throw new Error('Assets and events must be arrays.');
  }
  if (assets.length * events.length > MAX_COMPARISONS) {
    throw new Error(`Input too large: at most ${MAX_COMPARISONS} asset-event comparisons are allowed per call.`);
  }
  const thresholds = {
    closeKm: options.closeKm ?? 5,
    elevatedKm: options.elevatedKm ?? 25,
    monitorKm: options.monitorKm ?? 100
  };
  if (!(Number.isFinite(thresholds.closeKm)
    && Number.isFinite(thresholds.elevatedKm)
    && Number.isFinite(thresholds.monitorKm)
    && thresholds.closeKm > 0
    && thresholds.closeKm < thresholds.elevatedKm
    && thresholds.elevatedKm < thresholds.monitorKm)) {
    throw new Error('Distance thresholds must be finite, positive, and strictly increasing.');
  }

  const validAssets = assets.map((asset, index) => ({
    asset,
    point: validatePoint(asset, `assets[${index}]`)
  }));
  const validEvents = events.map((event, index) => ({
    event,
    point: validatePoint(event, `events[${index}]`)
  }));

  const matches = [];
  for (const { asset, point: assetPoint } of validAssets) {
    for (const { event, point: eventPoint } of validEvents) {
      const distanceKm = haversineKm(assetPoint, eventPoint);
      if (distanceKm > thresholds.monitorKm) continue;
      const proximity = distanceKm <= thresholds.closeKm ? 'close'
        : distanceKm <= thresholds.elevatedKm ? 'elevated' : 'monitor';
      matches.push({
        assetId: asset.id ?? null,
        assetName: asset.name ?? null,
        eventId: event.id ?? null,
        eventTitle: event.title ?? null,
        eventType: event.eventType ?? null,
        eventDateLabel: event.eventDateLabel ?? null,
        sourceUrl: event.sourceUrl ?? event.url ?? null,
        attribution: event.attribution ?? null,
        distanceKm: Math.round(distanceKm * 100) / 100,
        proximity,
        interpretation: 'Proximity indicator only; verify event footprint, asset exposure, and loss evidence independently.'
      });
    }
  }
  return matches.sort((a, b) => a.distanceKm - b.distanceKm);
}

export { haversineKm };
