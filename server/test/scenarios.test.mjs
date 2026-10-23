import test from 'node:test';
import assert from 'node:assert/strict';
import { assessInputCompleteness } from '../src/scenarios.mjs';

test('underwriting scenario blocks quantitative analysis when required evidence is missing', () => {
  const result = assessInputCompleteness('underwriting', { productId:'P-1', sumInsured:1000000 });
  assert.deepEqual(result.missing, ['coveragePeriod','exposureUnits','policyWordingVersion']);
  assert.equal(result.readyForQuantitativeModel, false);
});

test('pricing scenario can pass completeness only when all required fields are present', () => {
  const result = assessInputCompleteness('pricing', {
    productId:'P-1', exposurePeriod:'2026', earnedExposure:100,
    frequencyModelVersion:'freq-v1', severityModelVersion:'sev-v1', expenseBasis:'approved-expense-v1'
  });
  assert.deepEqual(result.missing, []);
  assert.equal(result.readyForQuantitativeModel, true);
});

test('claims scenario requires policy terms and evidence inventory', () => {
  const result = assessInputCompleteness('claims', {
    policyId:'POL-1', lossDate:'2026-01-01', reportedPeril:'fire',
    deductible:1000, coverageLimit:100000
  });
  assert.ok(result.missing.includes('policyWordingVersion'));
  assert.ok(result.missing.includes('evidenceInventory'));
  assert.equal(result.readyForQuantitativeModel, false);
});

test('missing or null values cannot pass validation', () => {
  const result = assessInputCompleteness('renewal', {
    renewalCohort:'2025', earnedPremium:1000, claimsExperienceWindow:null, expenseBasis:'v1'
  });
  assert.deepEqual(result.missing, ['claimsExperienceWindow']);
});
