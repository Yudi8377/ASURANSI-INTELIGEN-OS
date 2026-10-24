import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerIntelligencePersistence } from '../src/intelligence-persistence.mjs';

const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const userId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const runId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function makeApp({failInsert=false,researchRunner}={}) {
  const calls=[];
  const pool={
    connect:async()=>({
      query:async(sql,params=[])=>{
        calls.push({sql,params});
        if(sql.includes('INSERT INTO asuransi.intelligence_research_runs')) {
          if(failInsert) throw new Error('simulated database failure');
          return {rows:[{id:runId}],rowCount:1};
        }
        return {rows:[],rowCount:0};
      },
      release:()=>{calls.push({sql:'RELEASE',params:[]});}
    }),
    query:async(sql,params=[])=>{calls.push({sql,params});return {rows:[],rowCount:0};}
  };
  const app=Fastify({logger:false});
  const auth=async request=>{request.user={tenantId,userId,permissions:['intelligence:read','intelligence:research']};};
  const permit=permission=>async(request,reply)=>{if(!request.user.permissions.includes(permission))return reply.code(403).send({error:'FORBIDDEN'});};
  return registerIntelligencePersistence(app,{pool,auth,permit,researchRunner}).then(()=>({app,calls}));
}

const finding = {
  title:'Flood alert',url:'https://source.example.test/alert',summary:'Official alert',
  publishedAt:'2026-10-24T10:00:00.000Z',sourceId:'feed-1',sourceTitle:'Public feed',
  sourceUrl:'https://source.example.test/',publisher:'Publisher',attribution:'Publisher attribution',
  providerRecordId:'event-1',agentId:'geospatial-risk',retrievedAt:'2026-10-24T10:01:00.000Z',
  verificationStatus:'unverified',confidence:'not_assessed',eventType:'flood',location:'Test area',
  latitude:999,longitude:101,magnitude:null,eventDateLabel:null,eventTimeLabel:null
};
const fixtureResearch = async () => ({
  generatedAt:'2026-10-24T10:01:00.000Z',mode:'test',sources:[],
  findings:[finding],
  summary:{configuredSources:1,successfulSources:1,failedSources:0,findings:1,verifiedFindings:0}
});

test('persistent research endpoint stores a run and audit entry under the authenticated tenant',async()=>{
  const {app,calls}=await makeApp();
  try {
    const response=await app.inject({method:'POST',url:'/api/v1/intelligence/research/run'});
    assert.equal(response.statusCode,201);
    const body=response.json();
    assert.equal(body.data.runId,runId);
    assert.equal(body.data.persistenceStatus,'saved');
    assert.equal(body.data.persistedFindings,0);
    const insert=calls.find(call=>call.sql.includes('INSERT INTO asuransi.intelligence_research_runs'));
    assert.equal(insert.params[0],tenantId);
    assert.equal(insert.params[1],userId);
    assert.ok(calls.some(call=>call.params.includes('intelligence.research')));
    assert.ok(calls.some(call=>call.sql==='COMMIT'));
  } finally { await app.close(); }
});

test('findings are persisted with tenant and run IDs and out-of-range coordinates are nulled',async()=>{
  const {app,calls}=await makeApp({researchRunner:fixtureResearch});
  try {
    const response=await app.inject({method:'POST',url:'/api/v1/intelligence/research/run'});
    assert.equal(response.statusCode,201);
    assert.equal(response.json().data.persistedFindings,1);
    const insert=calls.find(call=>call.sql.includes('INSERT INTO asuransi.intelligence_findings'));
    assert.ok(insert);
    assert.equal(insert.params[0],tenantId);
    assert.equal(insert.params[1],runId);
    const rows=JSON.parse(insert.params[2]);
    assert.equal(rows[0].verification_status,'unverified');
    assert.equal(rows[0].latitude,null);
    assert.equal(rows[0].longitude,101);
    assert.equal(rows[0].source_url,'https://source.example.test/');
  } finally { await app.close(); }
});

test('persistent research endpoint rolls back and does not claim success when persistence fails',async()=>{
  const {app,calls}=await makeApp({failInsert:true});
  try {
    const response=await app.inject({method:'POST',url:'/api/v1/intelligence/research/run'});
    assert.equal(response.statusCode,503);
    assert.equal(response.json().error,'INTELLIGENCE_PERSISTENCE_UNAVAILABLE');
    assert.ok(calls.some(call=>call.sql==='ROLLBACK'));
    assert.ok(!calls.some(call=>call.sql==='COMMIT'));
  } finally { await app.close(); }
});

test('findings history query is tenant-scoped and bounded',async()=>{
  const {app,calls}=await makeApp();
  try {
    const response=await app.inject({method:'GET',url:'/api/v1/intelligence/findings?limit=10&offset=0&status=unverified'});
    assert.equal(response.statusCode,200);
    const query=calls.find(call=>call.sql.includes('FROM asuransi.intelligence_findings'));
    assert.equal(query.params[0],tenantId);
    assert.equal(query.params[1],'unverified');
    assert.equal(query.params[3],10);
    assert.match(query.sql,/WHERE tenant_id=\$1/);
  } finally { await app.close(); }
});
