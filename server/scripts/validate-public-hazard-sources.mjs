import assert from 'node:assert/strict';

const SOURCES = [
  {
    id: 'usgs-earthquakes-daily',
    url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
    validate(payload) {
      assert.equal(payload?.type, 'FeatureCollection', 'USGS payload type must be FeatureCollection');
      assert.ok(Array.isArray(payload.features), 'USGS features must be an array');
      assert.ok(payload.features.length > 0, 'USGS feed should contain at least one feature');
      const sample = payload.features[0];
      assert.ok(typeof sample?.id === 'string' || typeof sample?.properties?.code === 'string', 'USGS event ID/code is required');
      assert.ok(Number.isFinite(sample?.properties?.time), 'USGS event timestamp is required');
      assert.ok(Number.isFinite(sample?.properties?.mag), 'USGS magnitude must be numeric');
      assert.ok(Array.isArray(sample?.geometry?.coordinates) && sample.geometry.coordinates.length >= 2, 'USGS coordinates are required');
      const [longitude, latitude] = sample.geometry.coordinates;
      assert.ok(Number.isFinite(longitude) && longitude >= -180 && longitude <= 180, 'USGS longitude is invalid');
      assert.ok(Number.isFinite(latitude) && latitude >= -90 && latitude <= 90, 'USGS latitude is invalid');
      return { itemCount: payload.features.length, sampleId: sample.id ?? sample.properties.code, sampleTitle: sample.properties.title };
    }
  },
  {
    id: 'bmkg-earthquakes-latest',
    url: 'https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json',
    validate(payload) {
      const events = payload?.Infogempa?.gempa;
      assert.ok(Array.isArray(events), 'BMKG Infogempa.gempa must be an array');
      assert.ok(events.length > 0, 'BMKG feed should contain at least one event');
      const sample = events[0];
      assert.ok(typeof sample?.Tanggal === 'string' && sample.Tanggal.trim(), 'BMKG event date is required');
      assert.ok(typeof sample?.Jam === 'string' && sample.Jam.trim(), 'BMKG event time is required');
      assert.ok(typeof sample?.Wilayah === 'string' && sample.Wilayah.trim(), 'BMKG event region is required');
      const magnitude = Number(String(sample?.Magnitude ?? '').replace(',', '.'));
      assert.ok(Number.isFinite(magnitude) && magnitude >= 0, 'BMKG magnitude must be numeric');
      assert.ok(typeof sample?.Lintang === 'string' && /LU|LS/i.test(sample.Lintang), 'BMKG latitude hemisphere is required');
      assert.ok(typeof sample?.Bujur === 'string' && /BT|BB/i.test(sample.Bujur), 'BMKG longitude hemisphere is required');
      return { itemCount: events.length, sampleTitle: sample.Wilayah, attribution: 'Sumber data: BMKG' };
    }
  }
];

async function main() {
  let failed = false;
  for (const source of SOURCES) {
    const checkedAt = new Date().toISOString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(source.url, {
        headers: { accept: 'application/json', 'user-agent': 'ASURANSI-INTELIGEN-OS-validation/1.0' },
        redirect: 'error',
        signal: controller.signal
      });
      assert.equal(response.status, 200, source.id + ' must return HTTP 200');
      const contentType = response.headers.get('content-type') ?? '';
      assert.match(contentType.toLowerCase(), /json/, source.id + ' must return JSON content type');
      const result = source.validate(await response.json());
      console.log(JSON.stringify({ sourceId: source.id, status: 'passed', checkedAt, httpStatus: response.status, contentType, ...result }));
    } catch (error) {
      failed = true;
      console.error(JSON.stringify({ sourceId: source.id, status: 'failed', checkedAt, error: error instanceof Error ? error.message : String(error) }));
    } finally {
      clearTimeout(timer);
    }
  }
  if (failed) process.exitCode = 1;
}
await main();
