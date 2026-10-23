export type ApiClient = { id: string; client_code: string; client_type: 'individual'|'company'; full_name: string; email: string|null; phone: string|null; status: string; consent_status: string; created_at: string; updated_at: string };
export type ScenarioType = 'underwriting'|'pricing'|'claims'|'fraud_triage'|'portfolio_stress'|'renewal'|'regulatory_change'|'liquidity_stress';
export type ScenarioDraft = { id:string; scenario_type:ScenarioType; title:string; decision_question:string; horizon_days:number; input_completeness:{missing:string[];readyForQuantitativeModel:boolean}; status:string; requires_human_approval:boolean; created_at:string; outcome_summary?:unknown };
const base = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
let token: string | null = null;
let expiresAt = 0;
export function clearSession() { token = null; expiresAt = 0; }
async function call<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const headers = new Headers(init.headers); headers.set('Accept','application/json');
  if (init.body) headers.set('Content-Type','application/json');
  if (auth) { if (!token || Date.now() >= expiresAt) { clearSession(); throw new Error('Sesi berakhir. Silakan masuk kembali.'); } headers.set('Authorization', 'Bearer '+token); }
  const response = await fetch(base+path,{...init,headers,credentials:'omit'});
  if (response.status === 401) clearSession();
  if (!response.ok) { const body = await response.json().catch(()=>({})) as {message?:string}; throw new Error(body.message || 'Permintaan gagal ('+response.status+').'); }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export async function login(email:string,password:string) {
  const result = await call<{accessToken:string;expiresIn:number;user:{id:string;email:string;fullName:string;tenantId:string;permissions:string[]}}>('/v1/auth/login',{method:'POST',body:JSON.stringify({email,password})},false);
  token=result.accessToken; expiresAt=Date.now()+Math.max(0,result.expiresIn-15)*1000; return result;
}
export function getClients(search='') {
  const q = new URLSearchParams(); if(search.trim()) q.set('search',search.trim());
  return call<{data:ApiClient[];limit:number;offset:number}>('/v1/clients'+(q.size?'?'+q:''));
}
export function createClient(input:Record<string,unknown>) { return call<{data:ApiClient}>('/v1/clients',{method:'POST',body:JSON.stringify(input)}); }
export function updateClient(id:string,input:Record<string,unknown>) { return call<{data:ApiClient}>('/v1/clients/'+encodeURIComponent(id),{method:'PUT',body:JSON.stringify(input)}); }
export function deleteClient(id:string) { return call<void>('/v1/clients/'+encodeURIComponent(id),{method:'DELETE'}); }
export function getScenarios() { return call<{data:ScenarioDraft[];limit:number;offset:number}>('/v1/scenarios'); }
export function createScenario(input:{scenarioType:ScenarioType;title:string;decisionQuestion:string;horizonDays:number;assumptions:Record<string,unknown>;inputSnapshot:Record<string,unknown>;evidence:unknown[]}) {
  return call<{data:ScenarioDraft;notice:string;completeness:{missing:string[];readyForQuantitativeModel:boolean}}>('/v1/scenarios',{method:'POST',body:JSON.stringify(input)});
}

export function runScenario(id:string) { return call<{data:{scenarioId:string;result:Record<string,unknown>};notice:string}>('/v1/scenarios/'+encodeURIComponent(id)+'/run',{method:'POST',body:JSON.stringify({})}); }
