import test from 'node:test';
import assert from 'node:assert/strict';
import { haversineKm, matchAssetEventProximity } from '../src/exposure-proximity.mjs';

test('matches nearby assets to events with distance and provenance', () => {
  const result = matchAssetEventProximity(
    [{id:'asset-1',name:'Gudang Jakarta',latitude:-6.2,longitude:106.8}],
    [{id:'event-1',title:'Gempa contoh',eventType:'earthquake',latitude:-6.21,longitude:106.81,sourceUrl:'https://example.test/event',attribution:'Example feed'}]
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].proximity, 'close');
  assert.ok(result[0].distanceKm > 0);
  assert.equal(result[0].sourceUrl, 'https://example.test/event');
  assert.equal(result[0].attribution, 'Example feed');
  assert.match(result[0].interpretation, /Proximity indicator only/);
});

test('does not return events beyond the monitoring threshold', () => {
  const result = matchAssetEventProximity(
    [{id:'a',latitude:0,longitude:0}],
    [{id:'e',latitude:10,longitude:10}],
  );
  assert.deepEqual(result, []);
});

test('orders matches by nearest distance and classifies configured thresholds', () => {
  const result = matchAssetEventProximity(
    [{id:'a',latitude:0,longitude:0}],
    [
      {id:'far',latitude:0,longitude:0.5},
      {id:'near',latitude:0,longitude:0.01},
      {id:'middle',latitude:0,longitude:0.1}
    ]
  );
  assert.deepEqual(result.map(x=>x.eventId), ['near','middle','far']);
  assert.equal(result[0].proximity, 'close');
  assert.equal(result[1].proximity, 'elevated');
  assert.equal(result[2].proximity, 'monitor');
});

test('haversine handles longitude wrap across the date line', () => {
  assert.ok(haversineKm({latitude:0,longitude:179.9},{latitude:0,longitude:-179.9}) < 23);
});

test('rejects invalid coordinates and invalid thresholds', () => {
  assert.throws(() => matchAssetEventProximity([{latitude:91,longitude:0}], []), /Invalid assets/);
  assert.throws(() => matchAssetEventProximity([], [{latitude:0,longitude:181}]), /Invalid events/);
  assert.throws(() => matchAssetEventProximity([], [], {closeKm:25,elevatedKm:5,monitorKm:100}), /thresholds/);
  assert.throws(() => matchAssetEventProximity({}, []), /must be arrays/);
  assert.throws(() => matchAssetEventProximity([null], []), /Invalid assets/);
});

test('rejects inputs that exceed the comparison budget', () => {
  const assets = Array.from({length:101}, () => ({latitude:0,longitude:0}));
  const events = Array.from({length:100}, () => ({latitude:0,longitude:0}));
  assert.throws(() => matchAssetEventProximity(assets, events), /at most 10000/);
});

test('empty input returns no matches', () => {
  assert.deepEqual(matchAssetEventProximity([], []), []);
});
