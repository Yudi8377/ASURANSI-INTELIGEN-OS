const SOURCE_DOMAINS = [
  { id:'corporate-ownership', name:'Perusahaan, identitas usaha & kepemilikan', priority:'P1', sources:[
    ['AHU Online','Indonesia','https://ahu.go.id/','company_registry','portal-review-required'],
    ['Bursa Efek Indonesia','Indonesia','https://www.idx.co.id/','listed-company-disclosures','public-disclosures'],
    ['BPS','Indonesia','https://www.bps.go.id/','business-statistics','public-data'],
    ['OpenCorporates','International','https://opencorporates.com/','company-registry-aggregation','terms-and-api-review']
  ]},
  { id:'financial-health', name:'Keuangan & kesehatan perusahaan', priority:'P1', sources:[
    ['Bursa Efek Indonesia - laporan perusahaan tercatat','Indonesia','https://www.idx.co.id/','financial-statements','public-disclosures'],
    ['OJK','Indonesia','https://www.ojk.go.id/','financial-sector-reports','public-publications'],
    ['Bank Indonesia','Indonesia','https://www.bi.go.id/','financial-and-monetary-statistics','public-data'],
    ['World Bank Data','International','https://data.worldbank.org/','macro-financial-indicators','public-api-or-download']
  ]},
  { id:'geospatial-hazards', name:'Geospasial, bencana & bahaya', priority:'P1', sources:[
    ['InaRISK / BNPB','Indonesia','https://inarisk.bnpb.go.id/','hazard-exposure-vulnerability','portal-and-dataset-review'],
    ['BMKG Data Gempabumi','Indonesia','https://data.bmkg.go.id/gempabumi/','earthquake-events','public-data-review'],
    ['Badan Informasi Geospasial','Indonesia','https://www.big.go.id/','base-maps-and-geospatial-data','service-and-license-review'],
    ['MAGMA Indonesia / PVMBG','Indonesia','https://magma.esdm.go.id/','volcano-and-geological-hazards','public-data-review'],
    ['USGS Earthquake Hazards','International','https://earthquake.usgs.gov/','earthquake-events','public-api']
  ]},
  { id:'earth-observation', name:'Satelit & penginderaan jauh', priority:'P2', sources:[
    ['NASA Earthdata','International','https://earthdata.nasa.gov/','earth-observation','dataset-specific-license-review'],
    ['Copernicus Data Space Ecosystem','International','https://dataspace.copernicus.eu/','satellite-imagery','registration-and-terms-review'],
    ['USGS EarthExplorer','International','https://earthexplorer.usgs.gov/','satellite-and-land-imagery','account-and-terms-review']
  ]},
  { id:'news-events', name:'Berita, kejadian & krisis', priority:'P1', sources:[
    ['BNPB','Indonesia','https://www.bnpb.go.id/','disaster-bulletins','public-publications'],
    ['BMKG','Indonesia','https://www.bmkg.go.id/','weather-and-hazard-alerts','provider-adapter-review'],
    ['ANTARA News','Indonesia','https://www.antaranews.com/','news-events','feed-and-reuse-terms-review'],
    ['GDELT Project','International','https://www.gdeltproject.org/','global-news-events','api-and-methodology-review']
  ]},
  { id:'regulation-compliance', name:'Regulasi, kepatuhan & perizinan', priority:'P1', sources:[
    ['OJK - regulasi asuransi','Indonesia','https://www.ojk.go.id/id/kanal/iknb/regulasi/asuransi/peraturan-ojk/default.aspx','insurance-regulations','official-publications'],
    ['Peraturan.go.id','Indonesia','https://peraturan.go.id/','legislation','official-publications'],
    ['JDIHN','Indonesia','https://jdihn.go.id/','legal-documents','portal-and-terms-review'],
    ['IAIS','International','https://www.iais.org/','insurance-supervisory-standards','public-publications'],
    ['EIOPA','International','https://www.eiopa.europa.eu/','insurance-regulation-and-risk-reports','public-publications']
  ]},
  { id:'policy-wordings', name:'Polis, wording & produk asuransi', priority:'P1', sources:[
    ['Dokumen polis dan endorsement milik tenant','Tenant data','internal://tenant-authorized-documents','policy-clauses-and-endorsements','tenant-authorization-required'],
    ['Dokumen produk resmi perusahaan asuransi','Indonesia','https://www.ojk.go.id/','product-disclosures','document-specific-review']
  ]},
  { id:'claims-losses', name:'Klaim, kerugian & bukti lapangan', priority:'P1', sources:[
    ['Sistem klaim internal','Tenant data','internal://tenant-claims','claims-and-loss-history','tenant-authorization-required'],
    ['Laporan surveyor dan penilai','Partner data','internal://authorized-surveyor-reports','inspection-and-loss-assessments','contract-and-consent-required']
  ]},
  { id:'engineering-safety', name:'Rekayasa, inspeksi & keselamatan', priority:'P2', sources:[
    ['Dokumen inspeksi teknik','Tenant data','internal://tenant-engineering-inspections','asset-condition-and-recommendations','tenant-authorization-required'],
    ['Badan Standardisasi Nasional','Indonesia','https://www.bsn.go.id/','standards-catalog','standard-specific-access-review'],
    ['International Organization for Standardization','International','https://www.iso.org/','management-and-risk-standards','licensed-content-review']
  ]},
  { id:'transport-supply-chain', name:'Transportasi, perdagangan & rantai pasok', priority:'P2', sources:[
    ['Kementerian Perhubungan','Indonesia','https://dephub.go.id/','transport-safety-and-events','public-publications'],
    ['BPS - statistik perdagangan dan transportasi','Indonesia','https://www.bps.go.id/','trade-and-transport-statistics','public-data'],
    ['UN Trade and Development','International','https://unctad.org/','maritime-and-trade-statistics','public-data-review'],
    ['MarineTraffic','International','https://www.marinetraffic.com/','vessel-tracking','commercial-license-review']
  ]},
  { id:'climate-weather', name:'Iklim, cuaca ekstrem & transisi', priority:'P1', sources:[
    ['BMKG','Indonesia','https://www.bmkg.go.id/','weather-and-climate','provider-adapter-review'],
    ['World Meteorological Organization','International','https://wmo.int/','climate-and-weather-data','dataset-specific-review'],
    ['IPCC','International','https://www.ipcc.ch/','climate-assessment-and-scenarios','public-reports'],
    ['Copernicus Climate Data Store','International','https://cds.climate.copernicus.eu/','climate-reanalysis-and-projections','dataset-and-api-review']
  ]},
  { id:'insurance-reinsurance-actuarial', name:'Asuransi, reasuransi & aktuaria', priority:'P1', sources:[
    ['OJK','Indonesia','https://www.ojk.go.id/','insurance-market-statistics','public-publications'],
    ['IAIS','International','https://www.iais.org/','global-insurance-supervision','public-publications'],
    ['EIOPA','International','https://www.eiopa.europa.eu/','insurance-risk-and-protection-gap','public-publications'],
    ['NAIC','International','https://content.naic.org/','insurance-regulatory-data','jurisdiction-and-terms-review']
  ]},
  { id:'litigation-integrity', name:'Litigasi, sengketa & integritas', priority:'P2', sources:[
    ['Direktori Putusan Mahkamah Agung','Indonesia','https://putusan3.mahkamahagung.go.id/','published-court-decisions','portal-and-reuse-review'],
    ['Pengumuman resmi regulator dan penegak hukum','Indonesia','https://www.ojk.go.id/','official-sanctions-and-notices','case-by-case-source-review']
  ]},
  { id:'macro-country-risk', name:'Makroekonomi & risiko negara', priority:'P2', sources:[
    ['Bank Indonesia','Indonesia','https://www.bi.go.id/','rates-currency-and-macro-data','public-data'],
    ['BPS','Indonesia','https://www.bps.go.id/','inflation-and-economic-statistics','public-data'],
    ['International Monetary Fund Data','International','https://www.imf.org/en/Data','macro-financial-indicators','dataset-specific-review'],
    ['OECD Data','International','https://data.oecd.org/','economic-indicators','public-data-review']
  ]},
  { id:'cyber-operational', name:'Siber, teknologi & risiko operasional', priority:'P2', sources:[
    ['BSSN','Indonesia','https://www.bssn.go.id/','cybersecurity-advisories','public-advisories'],
    ['CISA','International','https://www.cisa.gov/','cybersecurity-advisories','public-advisories'],
    ['National Vulnerability Database','International','https://nvd.nist.gov/','software-vulnerabilities','public-api']
  ]},
  { id:'internal-partner-data', name:'Data internal, pelanggan & mitra', priority:'P1', sources:[
    ['CRM, underwriting, polis dan klaim tenant','Tenant data','internal://tenant-systems','customer-and-insurance-records','lawful-basis-and-tenant-authorization-required'],
    ['API mitra, broker dan surveyor','Partner data','internal://authorized-partner-apis','partner-risk-data','contract-and-scope-required']
  ]},
  { id:'data-quality-governance', name:'Kualitas data, provenance & evaluasi model', priority:'P1', sources:[
    ['Registry sumber internal','Platform','internal://source-registry','source-licence-freshness-and-status','platform-governance'],
    ['Dataset evaluasi dan hasil review manusia','Platform','internal://model-evaluation','model-quality-and-error-monitoring','restricted-governance-access']
  ]}
];

export function listIntelligenceSourceDomains() {
  return SOURCE_DOMAINS.map(domain => ({
    id: domain.id,
    name: domain.name,
    priority: domain.priority,
    status: 'catalog-only',
    sources: domain.sources.map(([name, jurisdiction, url, dataTypes, accessMode]) => ({
      name, jurisdiction, url, dataTypes, accessMode,
      status: 'planned',
      connected: false
    }))
  }));
}

export function getIntelligenceSourceCatalogSummary() {
  const domains = listIntelligenceSourceDomains();
  return {
    domainCount: domains.length,
    sourceCount: domains.reduce((total, domain) => total + domain.sources.length, 0),
    connectedSourceCount: domains.reduce((total, domain) => total + domain.sources.filter(source => source.connected).length, 0),
    status: 'catalog-only',
    note: 'Katalog perencanaan. Entri bukan bukti koneksi/API aktif; akses, lisensi, format, dan endpoint harus diverifikasi sebelum integrasi.'
  };
}
