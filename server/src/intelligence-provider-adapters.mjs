function toIsoFromEpoch(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? new Date(n).toISOString() : null;
}

function parseBmkgCoordinate(value, negativeHemisphere) {
  const text = String(value ?? '').trim().toUpperCase().replace(',', '.');
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const numeric = Number(match[0]);
  if (!Number.isFinite(numeric)) return null;
  const negative = negativeHemisphere.some(hemisphere => text.includes(hemisphere));
  return negative ? -Math.abs(numeric) : Math.abs(numeric);
}

function cleanString(value) {
  return typeof value === 'string' ? value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

export function normalizeProviderPayload(adapter, payload) {
  if (!adapter || adapter === 'generic-json') {
    if (Array.isArray(payload)) return payload;
    for (const key of ['items','results','data','articles','features']) {
      if (Array.isArray(payload?.[key])) return payload[key];
    }
    return [];
  }

  if (adapter === 'usgs-earthquake-geojson') {
    if (!Array.isArray(payload?.features)) throw new Error('USGS GeoJSON payload has no features array.');
    return payload.features.map(feature => {
      const p = feature?.properties || {};
      const coords = feature?.geometry?.coordinates;
      const longitude = Array.isArray(coords) ? coords[0] : null;
      const latitude = Array.isArray(coords) ? coords[1] : null;
      const depthKm = Array.isArray(coords) && Number.isFinite(Number(coords[2])) ? Number(coords[2]) : null;
      const magnitude = Number.isFinite(Number(p.mag)) ? Number(p.mag) : null;
      const location = cleanString(p.place);
      const details = [magnitude === null ? null : 'Magnitude ' + magnitude, location || null, depthKm === null ? null : 'depth ' + depthKm + ' km'].filter(Boolean).join(' · ');
      return {
        title: cleanString(p.title) || 'Earthquake event',
        url: typeof p.url === 'string' ? p.url : null,
        summary: details,
        publishedAt: toIsoFromEpoch(p.time),
        eventType: 'earthquake',
        location: location || null,
        latitude: Number.isFinite(Number(latitude)) ? Number(latitude) : null,
        longitude: Number.isFinite(Number(longitude)) ? Number(longitude) : null,
        magnitude
      };
    });
  }

  if (adapter === 'bmkg-earthquake-json') {
    const events = payload?.Infogempa?.gempa;
    if (!Array.isArray(events)) throw new Error('BMKG earthquake payload has no Infogempa.gempa array.');
    return events.map(event => {
      const latitude = parseBmkgCoordinate(event?.Lintang, ['LS']);
      const longitude = parseBmkgCoordinate(event?.Bujur, ['BB']);
      const magnitude = Number(String(event?.Magnitude ?? '').replace(',', '.'));
      const title = [cleanString(event?.Wilayah) || 'Gempa bumi', cleanString(event?.Tanggal), cleanString(event?.Jam)].filter(Boolean).join(' — ');
      const summary = [event?.Magnitude ? 'Magnitude ' + cleanString(String(event.Magnitude)) : null, cleanString(event?.Kedalaman) || null, cleanString(event?.Potensi) || null].filter(Boolean).join(' · ');
      return {
        title,
        url: null,
        summary,
        publishedAt: null,
        eventType: 'earthquake',
        location: cleanString(event?.Wilayah) || null,
        latitude: Number.isFinite(latitude) ? latitude : null,
        longitude: Number.isFinite(longitude) ? longitude : null,
        magnitude: Number.isFinite(magnitude) ? magnitude : null,
        eventDateLabel: cleanString(event?.Tanggal) || null,
        eventTimeLabel: cleanString(event?.Jam) || null
      };
    });
  }

  throw new Error('Unsupported intelligence provider adapter.');
}
