import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeonFetchHandler } from '../src/neon-fetch-adapter.mjs';

function response(statusCode, body, headers = {}) {
  return { statusCode, rawPayload: Buffer.from(body), headers };
}

test('Neon adapter forwards method, path, query and request headers to Fastify inject', async () => {
  let captured;
  const handler = createNeonFetchHandler({ inject: async options => {
    captured = options;
    return response(200, '{"status":"ok"}', { 'content-type': 'application/json' });
  }});
  const result = await handler(new Request('https://api.example.test/api/health?full=1', {
    headers: { 'x-request-id': 'req-test', accept: 'application/json' }
  }));

  assert.equal(captured.method, 'GET');
  assert.equal(captured.url, '/api/health?full=1');
  assert.equal(captured.headers['x-request-id'], 'req-test');
  assert.equal(captured.payload, undefined);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { status: 'ok' });
});

test('Neon adapter forwards JSON request body and preserves response headers', async () => {
  let captured;
  const handler = createNeonFetchHandler({ inject: async options => {
    captured = options;
    return response(201, '{"data":{"id":"abc"}}', {
      'content-type': 'application/json',
      'x-content-type-options': 'nosniff'
    });
  }});
  const result = await handler(new Request('https://api.example.test/api/v1/clients', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
    body: JSON.stringify({ full_name: 'Contoh Klien' })
  }));

  assert.equal(captured.method, 'POST');
  assert.equal(captured.headers.authorization, 'Bearer test-token');
  assert.deepEqual(JSON.parse(captured.payload.toString()), { full_name: 'Contoh Klien' });
  assert.equal(result.status, 201);
  assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(await result.json(), { data: { id: 'abc' } });
});

test('Neon adapter preserves empty responses and non-success status codes', async () => {
  const handler = createNeonFetchHandler({ inject: async () => response(204, '') });
  const result = await handler(new Request('https://api.example.test/api/v1/clients/1', { method: 'DELETE' }));
  assert.equal(result.status, 204);
  assert.equal(await result.text(), '');
});

test('Neon adapter rejects an invalid Fastify app early', () => {
  assert.throws(() => createNeonFetchHandler({}), /app\.inject function/);
});
