import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock3, Database, ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react';
import { getIntelligenceFindings, getIntelligenceRuns, runIntelligenceResearch, type IntelligenceFinding, type IntelligenceRun } from '../lib/api';

type Props = { onNotice: (message:string)=>void };
const dateLabel = (value:string|null|undefined) => value ? new Date(value).toLocaleString('id-ID') : 'Tanggal tidak tersedia';

export default function IntelligenceWorkbench({onNotice}:Props) {
  const [runs,setRuns]=useState<IntelligenceRun[]>([]);
  const [findings,setFindings]=useState<IntelligenceFinding[]>([]);
  const [loading,setLoading]=useState(true);
  const [running,setRunning]=useState(false);
  const [error,setError]=useState('');

  const refresh=useCallback(async()=>{
    setLoading(true);setError('');
    try {
      const [runResult,findingResult]=await Promise.all([getIntelligenceRuns(),getIntelligenceFindings()]);
      setRuns(runResult.data);setFindings(findingResult.data);
    } catch(e) {
      const message=e instanceof Error?e.message:'Gagal memuat data intelijen.';
      setError(message);onNotice('Pemuatan intelijen gagal: '+message);
    } finally {setLoading(false);}
  },[onNotice]);

  useEffect(()=>{void refresh();},[refresh]);

  const execute=async()=>{
    setRunning(true);setError('');
    try {
      const result=await runIntelligenceResearch();
      onNotice(`Riset tersimpan. ${result.data.persistedFindings} temuan disimpan; status tetap unverified sampai diverifikasi.`);
      await refresh();
    } catch(e) {
      const message=e instanceof Error?e.message:'Riset intelijen gagal.';
      setError(message);onNotice('Riset intelijen gagal: '+message);
    } finally {setRunning(false);}
  };

  return <section className="panel" style={{display:'grid',gap:20}}>
    <div className="panel-heading">
      <div><h2>Pusat Intelijen Asuransi</h2><p>Riset sumber publik, provenance, dan riwayat temuan per organisasi.</p></div>
      <button className="primary-btn" disabled={running} onClick={()=>void execute()}><Activity size={16}/>{running?'Menjalankan riset…':'Jalankan riset'}</button>
    </div>
    <div className="notice"><ShieldCheck size={16}/><span>Temuan tidak otomatis diverifikasi. Jangan gunakan hasil ini sendirian untuk underwriting, harga, fraud, atau keputusan klaim.</span></div>
    {error&&<p role="alert" style={{color:'#b91c1c'}}>{error}</p>}
    <div className="stats-grid">
      <article className="stat-card"><div className="stat-top"><span>Pelaksanaan tersimpan</span><span className="stat-icon blue"><Database size={18}/></span></div><strong>{runs.length}</strong><div className="stat-foot"><span>Riwayat yang dapat diakses tenant ini</span></div></article>
      <article className="stat-card"><div className="stat-top"><span>Total temuan</span><span className="stat-icon violet"><Activity size={18}/></span></div><strong>{findings.length}</strong><div className="stat-foot"><span>Hasil dari sumber yang dikonfigurasi</span></div></article>
      <article className="stat-card"><div className="stat-top"><span>Belum diverifikasi</span><span className="stat-icon orange"><AlertTriangle size={18}/></span></div><strong>{findings.filter(f=>f.verification_status==='unverified').length}</strong><div className="stat-foot"><span>Perlu pemeriksaan sumber</span></div></article>
    </div>
    <div className="panel-heading"><div><h2>Riwayat riset</h2><p>Metadata dan hasil pelaksanaan terakhir.</p></div><button className="secondary-btn" disabled={loading} onClick={()=>void refresh()}><RefreshCw size={15}/> Muat ulang</button></div>
    {loading?<p>Memuat riwayat intelijen…</p>:runs.length===0?<p>Belum ada riwayat. Jalankan riset setelah sumber publik disetujui dan dikonfigurasi oleh administrator.</p>:<div className="table-wrap"><table><thead><tr><th>WAKTU</th><th>STATUS</th><th>SUMBER BERHASIL</th><th>TEMUAN</th></tr></thead><tbody>{runs.map(run=><tr key={run.id}><td>{dateLabel(run.created_at)}</td><td><span className={'pill '+(run.status==='completed'?'pill-green':run.status==='partial'?'pill-orange':'pill-blue')}>{run.status}</span></td><td>{run.summary.successfulSources??0} / {run.summary.configuredSources??0}</td><td>{run.summary.findings??0}</td></tr>)}</tbody></table></div>}
    <div className="panel-heading"><div><h2>Temuan terbaru</h2><p>Sumber, atribusi, dan status verifikasi ditampilkan bersama.</p></div></div>
    {loading?<p>Memuat temuan…</p>:findings.length===0?<p>Belum ada temuan tersimpan. Tidak ada sumber yang dianggap aktif secara default.</p>:<div style={{display:'grid',gap:12}}>{findings.map(f=><article key={f.id} style={{border:'1px solid #e2e8f0',borderRadius:12,padding:16,display:'grid',gap:8}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'start'}}><strong>{f.title}</strong><span className={'pill '+(f.verification_status==='verified'?'pill-green':f.verification_status==='rejected'?'pill-blue':'pill-orange')}>{f.verification_status}</span></div>
      {f.summary&&<p style={{margin:0,color:'#475569',lineHeight:1.5}}>{f.summary}</p>}
      <div style={{fontSize:12,color:'#64748b',display:'flex',gap:12,flexWrap:'wrap'}}><span>{f.source_title} · {f.publisher}</span><span><Clock3 size={12} style={{display:'inline',verticalAlign:'middle'}}/> Diambil: {dateLabel(f.retrieved_at)}</span>{f.location&&<span>Lokasi: {f.location}</span>}</div>
      <div style={{display:'flex',gap:14,flexWrap:'wrap',fontSize:13}}>{f.source_url&&<a href={f.source_url} target="_blank" rel="noreferrer">Sumber utama <ExternalLink size={12} style={{display:'inline'}}/></a>}{f.url&&<a href={f.url} target="_blank" rel="noreferrer">Buka temuan <ExternalLink size={12} style={{display:'inline'}}/></a>}</div>
      <small style={{color:'#64748b'}}>Atribusi: {f.attribution||f.publisher||'Tidak dicantumkan'} · Diterbitkan: {dateLabel(f.published_at)}</small>
    </article>)}</div>}
    <small style={{color:'#64748b'}}>Mode konektor saat ini hanya menjalankan sumber JSON yang dikonfigurasi. Katalog sumber OJK dan sumber lainnya bukan bukti konektivitas aktif.</small>
  </section>;
}
