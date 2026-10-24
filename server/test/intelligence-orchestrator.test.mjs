import test from 'node:test';
import assert from 'node:assert/strict';
import { configuredIntelligenceSources, runIntelligenceResearch } from '../src/intelligence-orchestrator.mjs';
import { listIntelligenceAgents } from '../src/intelligence-agents.mjs';

const source = { id:'public-demo', title:'Public data API', publisher:'Example publisher', agentId:'news-event-monitor', url:'https://data.example.test/api', enabled:true };
const env = { INTELLIGENCE_SOURCES_JSON: JSON.stringify([source]), INTELLIGENCE_ALLOWED_HOSTS:'data.example.test' };
const jsonResponse = (payload) => ({ ok:true, status:200, headers:{get:()=> 'application/json'}, json:async()=>payload });

test('agent registry explicitly distinguishes foundation from configured agents', () => {
  const agents = listIntelligenceAgents();
  assert.ok(agents.some(agent => agent.id === 'geospatial-risk'));
  assert.ok(agents.some(agent => agent.id === 'evidence-verifier' && agent.mode === 'deterministic'));
});

test('research normalizes configured public JSON results and marks them unverified', async () => {
  const result = await runIntelligenceResearch({ env, fetchImpl:async()=>jsonResponse({items:[{title:'Flood warning',url:'https://data.example.test/item/1',publishedAt:'2026-10-24T05:00:00Z',summary:'Official public notice'}]}) });
  assert.equal(result.summary.successfulSources,1);
  assert.equal(result.findings[0].title,'Flood warning');
  assert.equal(result.findings[0].verificationStatus,'unverified');
  assert.equal(result.summary.verifiedFindings,0);
});

test('research refuses hosts not explicitly allowlisted', async () => {
  const result = await runIntelligenceResearch({ env:{...env,INTELLIGENCE_ALLOWED_HOSTS:'other.example.test'}, fetchImpl:async()=>{throw new Error('must not fetch')} });
  assert.equal(result.sources[0].status,'unavailable');
  assert.match(result.sources[0].error,/not in INTELLIGENCE_ALLOWED_HOSTS/);
});

test('research does not follow redirects', async () => {
  const result = await runIntelligenceResearch({ env, fetchImpl:async()=>({ok:false,status:302,headers:{get:()=> 'application/json'},json:async()=>({})}) });
  assert.equal(result.sources[0].status,'unavailable');
  assert.match(result.sources[0].error,/Redirects are not followed/);
});

test('invalid source configuration fails closed', () => {
  assert.throws(()=>configuredIntelligenceSources({INTELLIGENCE_SOURCES_JSON:'{bad json'}),/valid JSON/);
  assert.throws(()=>configuredIntelligenceSources({INTELLIGENCE_SOURCES_JSON:JSON.stringify(Array.from({length:31},(_,i)=>({...source,id:String(i)})))}),/At most 30/);
});
