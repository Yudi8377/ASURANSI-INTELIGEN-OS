const AGENTS = [
  { id:'corporate-intelligence', name:'Corporate Intelligence Agent', domains:['company','financial','ownership'], purpose:'Mengumpulkan dan membandingkan informasi perusahaan dari sumber publik yang dikonfigurasi.' },
  { id:'geospatial-risk', name:'Geospatial Risk Agent', domains:['geospatial','hazard','weather'], purpose:'Mengumpulkan sinyal lokasi dan bahaya geospasial dari API data yang diizinkan.' },
  { id:'news-event-monitor', name:'News & Event Monitor Agent', domains:['news','incident','market'], purpose:'Memantau berita dan peristiwa yang diterbitkan sumber terdaftar.' },
  { id:'regulatory-watch', name:'Regulatory Watch Agent', domains:['regulation','compliance'], purpose:'Memantau publikasi regulasi dan pengumuman otoritas.' },
  { id:'evidence-verifier', name:'Evidence & Source Verifier', domains:['provenance','freshness','quality'], purpose:'Memvalidasi asal sumber, waktu pengambilan, URL, kelengkapan, dan ketidakpastian data.' },
  { id:'insurance-synthesis', name:'Insurance Intelligence Synthesizer', domains:['underwriting','claims','portfolio','risk'], purpose:'Menyiapkan temuan lintas agen untuk analisis asuransi; tidak membuat keputusan underwriting atau klaim otomatis.' }
];

export function listIntelligenceAgents() {
  return AGENTS.map(agent => ({ ...agent, mode: agent.id === 'evidence-verifier' ? 'deterministic' : agent.id === 'insurance-synthesis' ? 'rules-only' : 'source-connector', status: 'foundation', requiresConfiguredSources: !['evidence-verifier','insurance-synthesis'].includes(agent.id) }));
}
