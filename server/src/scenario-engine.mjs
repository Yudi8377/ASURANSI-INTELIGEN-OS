const ENGINE_VERSION = 'pricing-indication-v1.0.0';

function finiteNumber(input, key, {min=0,max=Number.MAX_SAFE_INTEGER}={}) {
  const value=input?.[key];
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max) throw new Error(`Input ${key} must be a finite number between ${min} and ${max}.`);
  return value;
}
function pricingScenario(input, assumptions) {
  const exposureUnits=finiteNumber(input,'exposureUnits',{min:0.000001});
  const expectedFrequency=finiteNumber(input,'expectedFrequency',{min:0,max:100});
  const averageClaimSeverity=finiteNumber(input,'averageClaimSeverity',{min:0});
  const trendRate=finiteNumber(input,'trendRate',{min:-0.5,max:3});
  const expensePerExposure=finiteNumber(input,'expensePerExposure',{min:0});
  const reinsuranceCostPerExposure=finiteNumber(input,'reinsuranceCostPerExposure',{min:0});
  const riskMarginRate=finiteNumber(input,'riskMarginRate',{min:0,max:0.95});
  if(!input.frequencyModelVersion||!input.severityModelVersion||!input.expenseBasis) throw new Error('Approved frequencyModelVersion, severityModelVersion, and expenseBasis are required.');
  const calculate=(name,frequencyFactor,severityFactor,trendDelta,reinsuranceFactor,description)=>{
    const expectedLossPerExposure=expectedFrequency*frequencyFactor*averageClaimSeverity*severityFactor*(1+trendRate+trendDelta);
    if(1+trendRate+trendDelta<0) throw new Error('Combined trend assumption cannot be below -100%.');
    const riskCostPerExposure=expectedLossPerExposure+expensePerExposure+reinsuranceCostPerExposure*reinsuranceFactor;
    const indicatedPerExposure=riskCostPerExposure/(1-riskMarginRate);
    return {scenario:name,description,frequencyFactor,severityFactor,trendRate:trendRate+trendDelta,reinsuranceFactor,expectedLossPerExposure,expensePerExposure,reinsuranceCostPerExposure:reinsuranceCostPerExposure*reinsuranceFactor,riskMarginRate,indicatedPremiumPerExposure:indicatedPerExposure,indicatedPortfolioPremium:indicatedPerExposure*exposureUnits};
  };
  const variants=[
    calculate('baseline',1,1,0,1,'Menggunakan asumsi input yang diberikan.'),
    calculate('frequency_adverse',1.2,1,0,1,'Frekuensi klaim 20% lebih tinggi; sensitivitas hipotetis.'),
    calculate('severity_adverse',1,1.25,0,1,'Rata-rata severitas klaim 25% lebih tinggi; sensitivitas hipotetis.'),
    calculate('inflation_stress',1,1,0.1,1,'Tambahan tren biaya 10 poin persentase; sensitivitas hipotetis.'),
    calculate('reinsurance_stress',1,1,0,1.2,'Biaya reasuransi 20% lebih tinggi; sensitivitas hipotetis.'),
    calculate('combined_stress',1.2,1.25,0.1,1.2,'Gabungan tekanan frekuensi, severitas, tren dan reasuransi.')
  ];
  return {engineVersion:ENGINE_VERSION,scenarioType:'pricing',mode:'deterministic_sensitivity_not_forecast',currency:input.currency||'IDR',units:'per supplied exposure unit',inputSnapshot:{exposureUnits,expectedFrequency,averageClaimSeverity,trendRate,expensePerExposure,reinsuranceCostPerExposure,riskMarginRate,frequencyModelVersion:input.frequencyModelVersion,severityModelVersion:input.severityModelVersion,expenseBasis:input.expenseBasis},assumptions,variants,exclusions:['Pajak, komisi, biaya akuisisi tambahan, batas tarif, kredibilitas aktuaria, korelasi risiko dan aturan produk tidak dihitung kecuali dimodelkan terpisah.','Bukan penawaran premi, tarif final, atau prediksi hasil aktual.'],requiresHumanApproval:true,requiresActuarialValidation:true};
}

export function runScenario(scenarioType, inputSnapshot={}, assumptions={}) {
  if(scenarioType==='pricing') return pricingScenario(inputSnapshot,assumptions);
  const guidance={
    underwriting:{variants:['baseline','favorable','adverse','severe_but_plausible'],drivers:['exposure','hazard','coverage_fit','risk_appetite','accumulation'],message:'Rencana skenario kualitatif saja. Model seleksi risiko tervalidasi dan data underwriting wajib dihubungkan sebelum hasil numerik.'},
    claims:{variants:['low_case','base_case','high_case','additional_evidence','recovery_case'],drivers:['policy_wording','loss_date','deductible','coverage_limit','evidence','recovery'],message:'Checklist skenario saja. Tidak menetapkan coverage, denial, reserve, atau payout.'},
    fraud_triage:{variants:['comparison_cohort','anomaly_review','false_positive_stress'],drivers:['approved_features','cohort','time_window','adjudicated_outcomes'],message:'Sinyal anomali bukan bukti fraud. Investigasi dan due process wajib.'},
    portfolio_stress:{variants:['baseline','regional_event','severity_inflation','correlated_event','reinsurance_exhaustion'],drivers:['geographic_exposure','sum_insured','hazard_data','reinsurance_terms'],message:'Tidak menghitung kerugian bencana tanpa model hazard/eksposur dan treaty yang tervalidasi.'},
    renewal:{variants:['baseline','price_increase','price_hold','service_improvement','adverse_selection'],drivers:['retention','premium_change','loss_ratio','customer_outcomes'],message:'Tidak memprediksi elastisitas tanpa estimasi yang tervalidasi dan kohor pembanding.'},
    regulatory_change:{variants:['current_rule_baseline','effective_date_transition','control_gap'],drivers:['verified_source','effective_date','affected_products','control_inventory'],message:'Dampak regulasi perlu sumber resmi terverifikasi dan review kepatuhan.'},
    liquidity_stress:{variants:['baseline','claims_surge','recovery_delay','counterparty_stress','combined_stress'],drivers:['cash_flow','payment_schedule','reinsurance_recovery','counterparty_exposure'],message:'Tidak menghasilkan estimasi likuiditas tanpa data arus kas dan asumsi yang disetujui.'}
  };
  const spec=guidance[scenarioType];
  if(!spec) throw new Error('Unsupported scenario type.');
  return {engineVersion:'scenario-planner-v1.0.0',scenarioType,mode:'qualitative_plan_only',inputSnapshot,assumptions,variants:spec.variants.map(name=>({scenario:name,drivers:spec.drivers})),message:spec.message,missingInputs:spec.drivers.filter(key=>inputSnapshot[key]===undefined||inputSnapshot[key]===null||inputSnapshot[key]===''),requiresHumanApproval:true,requiresDomainModelValidation:true};
}
