import test from 'node:test';
import assert from 'node:assert/strict';
import { assessInputCompleteness } from '../src/scenarios.mjs';
import { runScenario } from '../src/scenario-engine.mjs';

test('underwriting scenario blocks quantitative analysis when required evidence is missing', () => {
  const result = assessInputCompleteness('underwriting', { productId:'P-1', sumInsured:1000000 });
  assert.deepEqual(result.missing, ['coveragePeriod','exposureUnits','policyWordingVersion']);
  assert.equal(result.readyForQuantitativeModel, false);
});
test('pricing completeness requires model lineage and expense basis', () => {
  const result = assessInputCompleteness('pricing', {productId:'P-1',exposurePeriod:'2026',earnedExposure:100,exposureUnits:100,expectedFrequency:0.1,averageClaimSeverity:100000,trendRate:0.05,expensePerExposure:2000,reinsuranceCostPerExposure:500,riskMarginRate:0.1,frequencyModelVersion:'freq-v1',severityModelVersion:'sev-v1',expenseBasis:'approved-expense-v1'});
  assert.deepEqual(result.missing, []);
  assert.equal(result.readyForQuantitativeModel, true);
});
test('claims scenario requires policy terms and evidence inventory', () => {
  const result = assessInputCompleteness('claims', {policyId:'POL-1',lossDate:'2026-01-01',reportedPeril:'fire',deductible:1000,coverageLimit:100000});
  assert.ok(result.missing.includes('policyWordingVersion'));
  assert.ok(result.missing.includes('evidenceInventory'));
  assert.equal(result.readyForQuantitativeModel, false);
});
test('missing or null values cannot pass validation', () => {
  const result = assessInputCompleteness('renewal', {renewalCohort:'2025',earnedPremium:1000,claimsExperienceWindow:null,expenseBasis:'v1'});
  assert.deepEqual(result.missing, ['claimsExperienceWindow']);
});
test('pricing engine calculates deterministic baseline and explicit stress sensitivities', () => {
  const result = runScenario('pricing',{exposureUnits:100,expectedFrequency:0.1,averageClaimSeverity:100000,trendRate:0.05,expensePerExposure:2000,reinsuranceCostPerExposure:500,riskMarginRate:0.1,frequencyModelVersion:'freq-v1',severityModelVersion:'sev-v1',expenseBasis:'expense-v1'},{currency:'IDR'});
  assert.equal(result.mode,'deterministic_sensitivity_not_forecast');
  assert.equal(result.variants.length,6);
  assert.ok(result.variants[1].indicatedPremiumPerExposure>result.variants[0].indicatedPremiumPerExposure);
  assert.ok(result.variants[5].indicatedPortfolioPremium>result.variants[0].indicatedPortfolioPremium);
  assert.equal(result.requiresHumanApproval,true);
});
test('pricing engine rejects invalid and incomplete actuarial inputs', () => {
  assert.throws(()=>runScenario('pricing',{exposureUnits:100},{}),/expectedFrequency/);
  assert.throws(()=>runScenario('pricing',{exposureUnits:100,expectedFrequency:0.1,averageClaimSeverity:1000,trendRate:0,expensePerExposure:10,reinsuranceCostPerExposure:0,riskMarginRate:1,frequencyModelVersion:'f',severityModelVersion:'s',expenseBasis:'e'},{}),/riskMarginRate/);
});
test('non-pricing domains return an explicit qualitative plan, not fabricated numeric results', () => {
  const result=runScenario('claims',{policyId:'POL-1'},{});
  assert.equal(result.mode,'qualitative_plan_only');
  assert.equal(result.requiresHumanApproval,true);
  assert.equal('indicatedPremiumPerExposure' in result,false);
});
