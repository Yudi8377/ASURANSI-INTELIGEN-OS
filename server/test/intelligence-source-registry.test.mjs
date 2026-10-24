import test from 'node:test';
import assert from 'node:assert/strict';
import { listIntelligenceSourceDomains, getIntelligenceSourceCatalogSummary } from '../src/intelligence-source-registry.mjs';

test('source catalog covers 17 insurance intelligence domains', () => {
  const domains = listIntelligenceSourceDomains();
  const summary = getIntelligenceSourceCatalogSummary();
  assert.equal(domains.length, 17);
  assert.equal(summary.domainCount, 17);
  assert.ok(summary.sourceCount >= 40);
  assert.equal(summary.connectedSourceCount, 0);
});

test('catalog entries never claim that planned sources are connected', () => {
  const domains = listIntelligenceSourceDomains();
  for (const domain of domains) {
    assert.equal(domain.status, 'catalog-only');
    for (const source of domain.sources) {
      assert.equal(source.status, 'planned');
      assert.equal(source.connected, false);
      assert.ok(source.name);
      assert.ok(source.jurisdiction);
      assert.ok(source.dataTypes);
      assert.ok(source.accessMode);
    }
  }
});

test('source catalog includes tenant data and licensing controls', () => {
  const domains = listIntelligenceSourceDomains();
  const sources = domains.flatMap(domain => domain.sources);
  assert.ok(sources.some(source => source.accessMode.includes('tenant-authorization')));
  assert.ok(sources.some(source => source.accessMode.includes('license') || source.accessMode.includes('terms')));
});


test('OJK official regulation portal is catalogued without claiming API connectivity', () => {
  const sources = listIntelligenceSourceDomains().flatMap(domain => domain.sources);
  const ojkSearch = sources.find(source => source.name === 'OJK - pencarian regulasi resmi');
  assert.ok(ojkSearch);
  assert.equal(ojkSearch.url, 'https://www.ojk.go.id/id/regulasi/_layouts/15/listform.aspx?PageType=4');
  assert.equal(ojkSearch.status, 'planned');
  assert.equal(ojkSearch.connected, false);
  assert.equal(ojkSearch.accessMode, 'official-html-portal-api-not-verified');
});
