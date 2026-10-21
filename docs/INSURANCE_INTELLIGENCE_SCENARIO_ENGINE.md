# Insurance Intelligence & Scenario Simulation Engine

Status: target architecture and backlog, not a claim that all capabilities are live.

## Purpose
Provide decision support for insurance underwriting, premium pricing, claims, anomaly triage, portfolio accumulation, reinsurance, reserving, liquidity, renewals and regulatory change. Each run compares plausible futures, explains assumptions and evidence, quantifies supported outcomes and identifies where human judgment is required.

## Standard simulation workflow
1. Define the decision, product, coverage period, segment, geography, horizon, constraints and decision owner.
2. Assemble authorized, tenant-scoped internal data plus allowlisted external sources with provenance, effective dates and privacy/purpose checks.
3. Validate data completeness, duplicates, units, currency, time periods, outliers, leakage, selection bias and drift. Stop calculations if critical fields are missing.
4. Calculate a reproducible baseline with deterministic formulas or validated statistical models.
5. Compare baseline, favorable, adverse, severe-but-plausible, stress, reverse-stress and user-defined what-if scenarios.
6. Quantify supported metrics: claim frequency/severity, expected loss range, loss ratio, premium adequacy, reserves/cash flow, concentration, reinsurance recoveries, capital/liquidity and customer outcomes.
7. Have independent agents challenge evidence, actuarial validity, policy wording, legal compliance, fairness, privacy and operational feasibility.
8. Return options, trade-offs, uncertainty, sensitivity drivers, citations, missing data and escalation thresholds.
9. Require an authorized human to make binding underwriting, pricing, coverage, claim, fraud, payment, reserve or regulatory decisions.
10. Compare eventual outcomes to scenarios, measure drift and propose versioned improvements.

## Specialist agents
- **Scenario Supervisor**: decomposes questions, delegates least-privilege tools and reconciles agent results.
- **Underwriting**: exposure/hazard profile, coverage fit, risk appetite, missing evidence, referral rules and explainable draft options.
- **Actuarial & Pricing**: exposure, frequency/severity, pure premium, trend, expenses, risk margin, reinsurance and sensitivity.
- **Claims Assessment**: policy period, coverage clauses, evidence checklist, deductible/limits, reserve and settlement alternatives.
- **Fraud & Anomaly Triage**: explainable signals for investigation; never treats an anomaly as proof of fraud.
- **Catastrophe & Accumulation**: correlated exposures, geographic concentration and event stress when data supports it.
- **Portfolio, Capital & Reinsurance**: profitability, concentration, reserve, liquidity and reinsurance scenarios.
- **Legal & Conduct**: effective-dated Indonesian regulations, policy terms, consumer protection, privacy and complaint obligations.
- **Data Quality & Governance**: completeness, lineage, data purpose, tenant scope, leakage, bias and drift.
- **Knowledge Research & Update**: monitor approved sources, capture changes and quarantine new material.
- **Model Validation**: out-of-time backtests, calibration, stability, fairness and challenger comparisons.
- **Decision Memo**: concise evidence-based options, assumptions, downside and sign-off fields.

## Local-first knowledge pack
Bundle versioned, read-only searchable material: insurance principles and policy wording concepts; underwriting workflows; actuarial basics; claims handling; fraud investigation controls; reinsurance/accumulation; financial and reserving concepts; data governance; model risk; and effective-dated Indonesian legal/regulatory indexes (including insurance law, P2SK, personal data protection, and applicable OJK instruments).

Each source needs publisher, official URL, instrument/article, jurisdiction, publication/effective/repeal dates, retrieval timestamp, checksum, verification state and reviewer. Only material checked against authoritative publications becomes verified. Search snippets, model memory and unreviewed imports remain unverified. Show pack version and staleness, especially offline. Existing source metadata is not the same as a complete, verified legal corpus.

## Internal and external learning
Potential internal signals, only when authorized and lawful: proposals, decisions and reason codes; policy terms and earned exposure; premium components; claims timelines and paid/incurred/reserve values; recoveries; renewals, cancellations, complaints and service times; distribution channel quality; portfolio concentration; approved hazard data; and adjudicated investigation outcomes. Use pseudonymized or aggregated features where feasible. Never train ground truth from unresolved denials or unverified fraud flags.

External ingestion must use an allowlist, respect licensing and rate limits, capture provenance and dates, scan files, detect duplicates and prompt injection, compare versions, validate legal effective dates, and place changes in quarantine. Publish only after review and regression tests, as a signed versioned pack with rollback.

Autonomous improvement is governed, not self-modifying: collect permitted outcome feedback; propose data/rule/prompt/model changes in an isolated evaluation environment; test on held-out and out-of-time data for calibration, error cost, fairness, stability, leakage and reproducibility; compare against a baseline; require approval; then release a signed version. Agents cannot rewrite their own permissions, approve their own changes or promote quarantined sources.

## Scenario-specific outputs
**Underwriting:** draft accept / accept with terms / refer / decline options; risk drivers; evidence gaps; expected loss range; accumulation and legal/conduct checks.

**Pricing:** technical premium range with transparent components, assumptions and sensitivity; compare loss ratio, retention and adverse selection. A qualified pricing owner approves any tariff or customer quote.

**Claims:** cited policy clauses and dates; evidence checklist; low/base/high reserve and cash-flow cases; deductibles, limits and recoveries; alternative explanations and review path. An authorized claims officer decides coverage, denial and payout.

**Enterprise stress:** inflation or repair-cost shocks, frequency/severity shifts, catastrophe, correlated claims, lapse spikes, reinsurance exhaustion/default, regulatory wording change, liquidity shock and cyber/data outage. Each scenario records trigger, impact range, leading indicators, mitigation, owner and threshold.

## Required simulation record
Decision question and owner; timestamp/horizon/jurisdiction; authorized data scope; scenario assumptions and exclusions; baseline and metrics; citations and verification status; uncertainty and sensitivity; privacy/fairness/legal checks; missing data; model/agent/prompt/calculator/dataset/knowledge versions; recommendation options; approver, decision and rationale; immutable audit reference.

## Delivery phases
A. Define typed scenario contracts, audit/version records and synthetic fixtures.
B. Build deterministic calculation services with unit tests; never delegate arithmetic to LLM prose.
C. Add bounded agent orchestration, least-privilege tools, tenant scope, citations, timeouts and safe failure.
D. Implement verified offline retrieval; only claim offline generative inference after installing and testing a local model.
E. Add external-source allowlists, quarantine, effective-date checks, signed packs and rollback.
F. Establish governed datasets, baseline models, out-of-time backtests, drift monitoring and shadow mode.
G. Build scenario editor, comparison charts, evidence drawer, decision memo, approval inbox and outcome tracking.
H. Gate production on tenant-isolation and authorization tests, security/privacy review, dependency scanning, backup restore, incident response, load tests and human-factors evaluation.

## Non-negotiable safeguards
- AI must not independently accept/reject applications, deny claims, label fraud, release money, change tariffs or submit regulatory filings.
- Numerical outputs must come from tested calculations or validated models, with dataset/model versions and uncertainty.
- No external source is trusted just because a crawler found it.
- No sensitive customer records go to an external AI provider without reviewed processing controls.
- No claim of learning unless a versioned and evaluated artifact changed.
- Every material recommendation must be explainable, reproducible, tenant-scoped and subject to accountable human approval.
- If evidence is insufficient or sources conflict, return an explicit uncertainty/abstention and escalate.
