import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProviderPayload } from '../src/intelligence-provider-adapters.mjs';
import { runIntelligenceResearch } from '../src/intelligence-orchestrator.mjs';

test('USGS GeoJSON adapter extracts event, coordinates, magnitude and timestamp', () => {
  const payload = { features:[{properties:{title:'M 4.2 - Java Sea',url:'https://earthquake.usgs.gov/event/1',time:1792828800000,mag:4.2,place:'Java Sea'},geometry:{coordinates:[110.5,-6.2,35]}}] };
  const [event] = normalizeProviderPayload('usgs-earthquake-geojson', payload);
  assert.equal(event.title,'M 4.2 - Java Sea');
  assert.equal(event.latitude,-6.2);
  assert.equal(event.longitude,110.5);
  assert.equal(event.magnitude,4.2);
  assert.equal(event.publishedAt,'2026-10-24T00:00:00.000Z');
});

test('BMKG adapter applies southern and western hemisphere signs', () => {
  const payload = { Infogempa:{gempa:[{Tanggal:'24 Okt 2026',Jam:'10:00:00 WIB',Lintang:'6.50 LS',Bujur:'106.80 BT',Magnitude:'3.1',Kedalaman:'10 km',Wilayah:'Jawa Barat',Potensi:'Tidak berpotensi tsunami'}]} };
  const [event] = normalizeProviderPayload('bmkg-earthquake-json', payload);
  assert.equal(event.latitude,-6.5);
  assert.equal(event.longitude,106.8);
  assert.equal(event.magnitude,3.1);
  assert.match(event.title,/Jawa Barat/);
});

test('unknown provider adapter fails closed', () => {
  assert.throws(() => normalizeProviderPayload('arbitrary-adapter', {}), /Unsupported/);
});

test('research pipeline preserves geospatial event fields and provenance', async () => {
  const source = {id:'usgs-test',title:'USGS earthquakes',publisher:'USGS',agentId:'geospatial-risk',adapter:'usgs-earthquake-geojson',url:'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',enabled:true};
  const env = {INTELLIGENCE_SOURCES_JSON:JSON.stringify([source]),INTELLIGENCE_ALLOWED_HOSTS:'earthquake.usgs.gov'};
  const result = await runIntelligenceResearch({env,fetchImpl:async()=>({ok:true,status:200,headers:{get:()=> 'application/geo+json'},json:async()=>({features:[{properties:{title:'M 4.2 - Java Sea',url:'https://earthquake.usgs.gov/event/1',time:1792828800000,mag:4.2,place:'Java Sea'},geometry:{coordinates:[110.5,-6.2,35]}}]})}),now:()=>new Date('2026-10-24T00:01:00.000Z')});
  assert.equal(result.summary.findings,1);
  assert.equal(result.findings[0].eventType,'earthquake');
  assert.equal(result.findings[0].latitude,-6.2);
  assert.equal(result.findings[0].verificationStatus,'unverified');
});
