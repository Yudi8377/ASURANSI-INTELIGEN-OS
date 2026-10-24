import { normalizeProviderPayload } from './intelligence-provider-adapters.mjs';
import { listIntelligenceAgents } from './intelligence-agents.mjs';

const MAX_SOURCES = 30;
const MAX_ITEMS_PER_SOURCE = 50;
const MAX_SUMMARY_LENGTH = 4000;
const TIMEOUT_MS = 8000;

function safeSourceUrl(raw, allowedHosts) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('Source URL is invalid.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Only credential-free HTTPS sources are allowed.');
  if (!allowedHosts.has(url.hostname.toLowerCase())) throw new Error('Source host is not in INTELLIGENCE_ALLOWED_HOSTS.');
  return url;
}

function getItems(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ['items','results','data','articles','features']) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function cleanText(value, max = MAX_SUMMARY_LENGTH) {
  return typeof value === 'string' ? value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function normalizeItem(item, source, retrievedAt) {
  const title = cleanText(item?.title ?? item?.name ?? item?.headline, 500);
  const rawUrl = item?.url ?? item?.link ?? item?.source_url;
  let url = null;
  if (typeof rawUrl === 'string') {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) url = parsed.href;
    } catch {}
  }
  if (!title) return null;
  const published = item?.publishedAt ?? item?.published_at ?? item?.date ?? item?.updated;
  const publishedAt = typeof published === 'string' && Number.isFinite(Date.parse(published)) ? new Date(published).toISOString() : null;
  return {
    title,
    url,
    summary: cleanText(item?.summary ?? item?.description ?? item?.abstract),
    publishedAt,
    sourceId: source.id,
    sourceTitle: source.title,
    publisher: source.publisher,
    agentId: source.agentId,
    retrievedAt,
    verificationStatus: 'unverified',
    confidence: 'not_assessed',
    eventType: typeof item?.eventType === 'string' ? item.eventType : null,
    location: typeof item?.location === 'string' ? item.location : null,
    latitude: Number.isFinite(item?.latitude) ? item.latitude : null,
    longitude: Number.isFinite(item?.longitude) ? item.longitude : null,
    magnitude: Number.isFinite(item?.magnitude) ? item.magnitude : null,
    eventDateLabel: typeof item?.eventDateLabel === 'string' ? item.eventDateLabel : null,
    eventTimeLabel: typeof item?.eventTimeLabel === 'string' ? item.eventTimeLabel : null
  };
}

export function configuredIntelligenceSources(env = process.env) {
  let configured = [];
  if (env.INTELLIGENCE_SOURCES_JSON) {
    try { configured = JSON.parse(env.INTELLIGENCE_SOURCES_JSON); } catch { throw new Error('INTELLIGENCE_SOURCES_JSON must be valid JSON.'); }
  }
  if (!Array.isArray(configured)) throw new Error('INTELLIGENCE_SOURCES_JSON must be an array.');
  if (configured.length > MAX_SOURCES) throw new Error(`At most ${MAX_SOURCES} intelligence sources may be configured.`);
  return configured.filter(source => source && source.enabled === true && typeof source.id === 'string' && typeof source.title === 'string' && typeof source.publisher === 'string' && typeof source.agentId === 'string' && typeof source.url === 'string');
}

export async function runIntelligenceResearch({ env = process.env, fetchImpl = fetch, now = () => new Date() } = {}) {
  const sources = configuredIntelligenceSources(env);
  const allowedHosts = new Set((env.INTELLIGENCE_ALLOWED_HOSTS || '').split(',').map(host => host.trim().toLowerCase()).filter(Boolean));
  const agents = listIntelligenceAgents();
  const findings = [];
  const sourceResults = await Promise.all(sources.map(async source => {
    const retrievedAt = now().toISOString();
    try {
      const url = safeSourceUrl(source.url, allowedHosts);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let response;
      try {
        response = await fetchImpl(url, { method:'GET', redirect:'manual', signal:controller.signal, headers:{accept:'application/json','user-agent':'ASURANSI-INTELIGEN-OS/0.1 (+configured public-data research)'} });
      } finally { clearTimeout(timeout); }
      if (response.status >= 300 && response.status < 400) throw new Error('Redirects are not followed; configure the final HTTPS URL explicitly.');
      if (!response.ok) throw new Error(`Source returned HTTP ${response.status}.`);
      const contentType = response.headers?.get?.('content-type') || '';
      if (!contentType.toLowerCase().includes('json')) throw new Error('Source did not return JSON; an explicit provider adapter is required.');
      const payload = await response.json();
      const adapter = source.adapter || 'generic-json';
      const items = normalizeProviderPayload(adapter, payload).slice(0, MAX_ITEMS_PER_SOURCE);
      const normalized = items.map(item => normalizeItem(item, source, retrievedAt)).filter(Boolean);
      findings.push(...normalized);
      return { sourceId:source.id, title:source.title, publisher:source.publisher, agentId:source.agentId, status:'success', itemCount:normalized.length, retrievedAt };
    } catch (error) {
      return { sourceId:source.id, title:source.title, publisher:source.publisher, agentId:source.agentId, status:'unavailable', itemCount:0, retrievedAt, error: error instanceof Error ? error.message : 'Unknown source error' };
    }
  }));
  return {
    generatedAt: now().toISOString(),
    mode: 'configured-public-json-sources',
    agentStatus: agents.map(agent => ({id:agent.id,name:agent.name,status:agent.id === 'evidence-verifier' || agent.id === 'insurance-synthesis' ? 'rules-only-foundation' : sources.some(s => s.agentId === agent.id) ? 'configured' : 'awaiting-source-configuration'})),
    sources: sourceResults,
    findings,
    summary: {
      configuredSources: sources.length,
      successfulSources: sourceResults.filter(source => source.status === 'success').length,
      failedSources: sourceResults.filter(source => source.status === 'unavailable').length,
      findings: findings.length,
      verifiedFindings: 0,
      note: 'Temuan bersifat unverified. Tidak ada LLM synthesis, verifikasi fakta independen, database persistence, atau keputusan asuransi otomatis pada foundation ini.'
    }
  };
}
