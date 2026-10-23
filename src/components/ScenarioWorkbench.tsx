import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardList, GitCompareArrows, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { createScenario, getScenarios, runScenario, type ScenarioDraft, type ScenarioType } from '../lib/api';

const types: {value:ScenarioType;label:string;required:string[]}[] = [
 {value:'underwriting',label:'Penerimaan / underwriting',required:['productId','coveragePeriod','exposureUnits','sumInsured','policyWordingVersion']},
 {value:'pricing',label:'Premi dan kecukupan harga',required:['productId','exposurePeriod','earnedExposure','exposureUnits','expectedFrequency','averageClaimSeverity','trendRate','expensePerExposure','reinsuranceCostPerExposure','riskMarginRate','frequencyModelVersion','severityModelVersion','expenseBasis']},
 {value:'claims',label:'Penilaian klaim dan cadangan',required:['policyId','lossDate','reportedPeril','policyWordingVersion','evidenceInventory','deductible','coverageLimit']},
 {value:'fraud_triage',label:'Anomali klaim (triase)',required:['approvedFeatures','comparisonCohort','dataWindow','featureVersion']},
 {value:'portfolio_stress',label:'Stres portofolio / bencana',required:['portfolioSnapshotDate','geographicExposure','sumInsured','hazardDatasetVersion','reinsuranceTermsVersion']},
 {value:'renewal',label:'Perpanjangan dan retensi',required:['renewalCohort','earnedPremium','claimsExperienceWindow','expenseBasis']},
 {value:'regulatory_change',label:'Dampak perubahan regulasi',required:['verifiedSourceId','instrumentVersion','effectiveDate','affectedProductIds']},
 {value:'liquidity_stress',label:'Likuiditas dan reasuransi',required:['cashFlowBaseline','claimsPaymentSchedule','reinsuranceRecoveryTerms']}
];
const boxStyle:React.CSSProperties={background:'#fff',border:'1px solid #e3e8ef',borderRadius:14,padding:20};
const labelStyle:React.CSSProperties={display:'grid',gap:6,fontSize:13,fontWeight:650,color:'#344054'};
const inputStyle:React.CSSProperties={width:'100%',boxSizing:'border-box',border:'1px solid #cbd5e1',borderRadius:8,padding:'10px 12px',font:'inherit',fontWeight:400,color:'#101828'};
export default function ScenarioWorkbench({apiMode,onNotice}:{apiMode:boolean;onNotice:(message:string)=>void}) {
 const [kind,setKind]=useState<ScenarioType>('underwriting');
 const [title,setTitle]=useState('Evaluasi risiko calon tertanggung');
 const [question,setQuestion]=useState('Bandingkan skenario dasar, adverse, dan stress sebelum keputusan underwriting.');
 const [horizon,setHorizon]=useState(365);
 const [assumptions,setAssumptions]=useState('{"baseCase":"baseline","adverseCase":"adverse","stressCase":"severe_but_plausible"}');
 const [inputs,setInputs]=useState('{}');
 const [items,setItems]=useState<ScenarioDraft[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [saved,setSaved]=useState(false);\n const [runBusyId,setRunBusyId]=useState('');\n const [results,setResults]=useState<Record<string,{mode?:string;currency?:string;variants?:Array<Record<string,unknown>>;message?:string}>>({});
 const [demoItems,setDemoItems]=useState<ScenarioDraft[]>([]);
 const selected=types.find(x=>x.value===kind)!;
 const refresh=async()=>{if(!apiMode)return;setBusy(true);setError('');try{const r=await getScenarios();setItems(r.data);setResults(Object.fromEntries(r.data.filter(x=>x.outcome_summary&&typeof x.outcome_summary==='object').map(x=>[x.id,x.outcome_summary as {mode?:string;currency?:string;variants?:Array<Record<string,unknown>>;message?:string}])) )}catch(e){setError(e instanceof Error?e.message:'Tidak dapat memuat skenario')}finally{setBusy(false)}};
 useEffect(()=>{void refresh()},[apiMode]);
 const run=async(id:string)=>{setError('');setRunBusyId(id);try{const response=await runScenario(id);setResults(old=>({...old,[id]:response.data.result as {mode?:string;currency?:string;variants?:Array<Record<string,unknown>>;message?:string}}));onNotice(response.notice)}catch(e){setError(e instanceof Error?e.message:'Eksekusi skenario gagal')}finally{setRunBusyId('')}};\n const save=async()=>{
   setError('');setSaved(false);
   let a:Record<string,unknown>,i:Record<string,unknown>;
   try{a=JSON.parse(assumptions);i=JSON.parse(inputs);if(!a||Array.isArray(a)||typeof a!=='object'||!i||Array.isArray(i)||typeof i!=='object')throw new Error('Asumsi dan snapshot input harus berupa objek JSON.')}catch(e){setError(e instanceof Error?e.message:'JSON tidak valid');return}
   if(title.trim().length<3||question.trim().length<8){setError('Isi judul dan pertanyaan keputusan dengan lengkap.');return}
   setBusy(true);
   try{
     if(apiMode){const r=await createScenario({scenarioType:kind,title:title.trim(),decisionQuestion:question.trim(),horizonDays:horizon,assumptions:a,inputSnapshot:i,evidence:[]});setItems(old=>[r.data,...old]);onNotice(r.notice);if(!r.completeness.readyForQuantitativeModel)onNotice('Draft tersimpan. Data wajib belum lengkap: '+r.completeness.missing.join(', '));}
     else {const missing=selected.required.filter(k=>i[k]===undefined||i[k]===null||i[k]==='');const row:ScenarioDraft={id:'demo-'+Date.now(),scenario_type:kind,title:title.trim(),decision_question:question.trim(),horizon_days:horizon,input_completeness:{missing,readyForQuantitativeModel:missing.length===0},status:'draft',requires_human_approval:true,created_at:new Date().toISOString()};setDemoItems(old=>[row,...old]);onNotice('Draft skenario disimpan di memori browser demo saja; belum tersimpan di server.');}
     setSaved(true);
   }catch(e){setError(e instanceof Error?e.message:'Penyimpanan gagal')}finally{setBusy(false)}
 };
 const visible=apiMode?items:demoItems;
 return <div style={{display:'grid',gap:18}}>
  <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'start',flexWrap:'wrap'}}><div><div style={{fontSize:12,fontWeight:800,letterSpacing:1.2,color:'#175cd3',marginBottom:8}}>INSURANCE INTELLIGENCE</div><h2 style={{fontSize:24,margin:'0 0 8px'}}>Simulasi Keputusan</h2><p style={{margin:0,color:'#667085',maxWidth:760,lineHeight:1.6}}>Rancang skenario bersyarat untuk underwriting, premi, klaim, risiko portofolio, dan likuiditas. Sistem tidak mengarang prediksi atau keputusan otomatis.</p></div><button onClick={()=>void refresh()} disabled={!apiMode||busy} style={{...inputStyle,width:'auto',display:'flex',alignItems:'center',gap:8,cursor:apiMode?'pointer':'not-allowed'}}><RefreshCw size={15}/> Muat ulang</button></div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:12}}>
   <div style={{...boxStyle,display:'flex',gap:12,alignItems:'center'}}><GitCompareArrows color="#175cd3"/><div><b>Perbandingan skenario</b><div style={{fontSize:12,color:'#667085',marginTop:4}}>Baseline · adverse · stress</div></div></div>
   <div style={{...boxStyle,display:'flex',gap:12,alignItems:'center'}}><ShieldCheck color="#039855"/><div><b>Human approval wajib</b><div style={{fontSize:12,color:'#667085',marginTop:4}}>Tidak ada keputusan otomatis</div></div></div>
   <div style={{...boxStyle,display:'flex',gap:12,alignItems:'center'}}><ClipboardList color="#7f56d9"/><div><b>Audit dan asumsi</b><div style={{fontSize:12,color:'#667085',marginTop:4}}>Draft, input, dan versi dapat ditelusuri</div></div></div>
  </div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,340px),1fr))',gap:18,alignItems:'start'}}>
   <section style={boxStyle}><h3 style={{margin:'0 0 16px'}}>Susun simulasi baru</h3><div style={{display:'grid',gap:14}}>
    <label style={labelStyle}>Jenis keputusan<select style={inputStyle} value={kind} onChange={e=>setKind(e.target.value as ScenarioType)}>{types.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
    <label style={labelStyle}>Judul simulasi<input style={inputStyle} value={title} onChange={e=>setTitle(e.target.value)} maxLength={180}/></label>
    <label style={labelStyle}>Pertanyaan keputusan<textarea style={{...inputStyle,minHeight:84,resize:'vertical'}} value={question} onChange={e=>setQuestion(e.target.value)} maxLength={4000}/></label>
    <label style={labelStyle}>Horizon analisis (hari)<input style={inputStyle} type="number" min={1} max={3650} value={horizon} onChange={e=>setHorizon(Math.max(1,Math.min(3650,Number(e.target.value)||1)))}/></label>
    <div style={{padding:12,background:'#f8fafc',borderRadius:9,fontSize:12,color:'#475467'}}><b>Input penting untuk jenis ini:</b><p style={{margin:'6px 0 0',lineHeight:1.7}}>{selected.required.join(' · ')}</p></div>
    <label style={labelStyle}>Asumsi skenario (JSON)<textarea spellCheck={false} style={{...inputStyle,minHeight:90,fontFamily:'ui-monospace,monospace',fontSize:12}} value={assumptions} onChange={e=>setAssumptions(e.target.value)}/></label>
    <label style={labelStyle}>Snapshot input yang sudah diotorisasi (JSON)<textarea spellCheck={false} style={{...inputStyle,minHeight:130,fontFamily:'ui-monospace,monospace',fontSize:12}} value={inputs} onChange={e=>setInputs(e.target.value)} placeholder={'{"productId":"...","policyWordingVersion":"..."}'}/></label>
    <div style={{fontSize:12,color:'#667085',lineHeight:1.6}}>Masukkan data nyata hanya jika Anda berwenang. Jangan menempelkan data pribadi yang tidak diperlukan. JSON input belum otomatis memicu kalkulasi aktuaria.</div>
    {error&&<div role="alert" style={{padding:10,borderRadius:8,background:'#fef3f2',color:'#b42318',fontSize:13}}>{error}</div>}
    {saved&&<div role="status" style={{padding:10,borderRadius:8,background:'#ecfdf3',color:'#027a48',fontSize:13,display:'flex',gap:7,alignItems:'center'}}><CheckCircle2 size={16}/> Draft skenario dibuat. Hasil finansial belum dihitung.</div>}
    <button disabled={busy} onClick={()=>void save()} style={{...inputStyle,background:'#175cd3',border:0,color:'#fff',fontWeight:750,display:'flex',justifyContent:'center',alignItems:'center',gap:8,cursor:busy?'wait':'pointer'}}><Plus size={16}/>{busy?'Menyimpan…':'Simpan draft simulasi'}</button>
   </div></section>
   <section style={{...boxStyle,minHeight:300}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}><div><h3 style={{margin:'0 0 5px'}}>Riwayat simulasi</h3><p style={{margin:0,fontSize:12,color:'#667085'}}>{apiMode?'Tersimpan di API':'Demo sementara di browser'}</p></div><span style={{borderRadius:20,background:'#eff8ff',padding:'5px 10px',fontSize:12,color:'#175cd3'}}>{visible.length} draft</span></div>
    {!visible.length&&!busy&&<div style={{textAlign:'center',padding:'48px 12px',color:'#667085'}}><ClipboardList size={30}/><p>Belum ada draft simulasi.</p></div>}
    <div style={{display:'grid',gap:10,marginTop:16}}>{visible.map(row=><article key={row.id} style={{border:'1px solid #e4e7ec',borderRadius:10,padding:13}}><div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'start'}}><b style={{fontSize:14}}>{row.title}</b><span style={{fontSize:11,background:'#f2f4f7',padding:'4px 7px',borderRadius:12}}>{row.status}</span></div><p style={{fontSize:12,color:'#475467',lineHeight:1.5}}>{row.decision_question}</p><div style={{fontSize:12,color:'#667085'}}>Horizon: {row.horizon_days} hari · {new Date(row.created_at).toLocaleString('id-ID')}</div><div style={{marginTop:10,fontSize:12,color:row.input_completeness.missing.length?'#b54708':'#027a48',display:'flex',gap:6,alignItems:'start'}}><AlertTriangle size={14}/>{row.input_completeness.missing.length?'Data belum lengkap: '+row.input_completeness.missing.join(', '):'Input wajib tersedia; validasi model masih diperlukan.'}</div><div style={{marginTop:8,fontSize:11,color:'#667085'}}>Persetujuan manusia: wajib</div>{apiMode&&<button disabled={runBusyId===row.id} onClick={()=>void run(row.id)} style={{...inputStyle,width:'auto',marginTop:10,background:'#175cd3',border:0,color:'#fff',fontWeight:700,cursor:'pointer'}}>{runBusyId===row.id?'Menghitung…':'Jalankan analisis skenario'}</button>}{results[row.id]&&<div style={{marginTop:12,display:'grid',gap:8}}><b style={{fontSize:12}}>Hasil {String(results[row.id].mode||'analisis')}</b>{results[row.id].message&&<p style={{fontSize:12,color:'#475467',lineHeight:1.5}}>{String(results[row.id].message)}</p>}{results[row.id].variants?.map((variant,index)=><div key={String(variant.scenario||index)} style={{border:'1px solid #e4e7ec',borderRadius:8,padding:9,fontSize:12}}><b>{String(variant.scenario||'Skenario')}</b>{typeof variant.indicatedPremiumPerExposure==='number'&&<div>Premi indikatif/unit: {new Intl.NumberFormat('id-ID',{style:'currency',currency:String(results[row.id].currency||'IDR'),maximumFractionDigits:2}).format(variant.indicatedPremiumPerExposure)}</div>}{typeof variant.indicatedPortfolioPremium==='number'&&<div>Indikasi total portofolio: {new Intl.NumberFormat('id-ID',{style:'currency',currency:String(results[row.id].currency||'IDR'),maximumFractionDigits:0}).format(variant.indicatedPortfolioPremium)}</div>}{variant.description&&<div style={{color:'#667085',marginTop:3}}>{String(variant.description)}</div>}</div>)}</div>}</article>)}</div>
   <div style={{marginTop:16,padding:12,borderRadius:9,background:'#fffaeb',fontSize:12,color:'#93370d',lineHeight:1.6}}>Templat ini adalah alat penyusunan draft. Sebelum dipakai untuk keputusan komersial, diperlukan model aktuaria tervalidasi, dataset yang sah, evaluasi bias, sumber terverifikasi, dan persetujuan pejabat berwenang.</div>
   {apiMode&&error&&<div style={{marginTop:10,fontSize:12,color:'#b42318'}}>Jika endpoint belum tersedia, periksa migrasi database dan izin scenarios:create / scenarios:read.</div>}
   </section>
  </div>
 </div>;
}
