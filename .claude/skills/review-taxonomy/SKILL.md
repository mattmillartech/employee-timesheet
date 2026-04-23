---
name: review-taxonomy
description: "Apply when any agent performs code review work: provides the standard category taxonomy, criticality model, coverage requirement, cross-surface duplication detection protocol, and triage pass pattern."
---

# Review Taxonomy Skill

## Purpose
Provide a shared, consistent vocabulary and framework for code review work across all agents that produce review findings: `reviewer-agent`, `business-logic-compliance-agent`, `syntax-agent`, `remediation-orchestrator-agent`, and any others.

## Apply When
- Categorizing or prioritizing review findings.
- Deciding whether a finding is a release blocker.
- Summarizing category coverage in a review output.
- Scanning for cross-surface duplication.
- Starting a triage pass on a diff.

## Review Category Taxonomy
Every actionable finding must include one primary category from this set:
1. `Correctness`: Logic and behavioral correctness, including regressions and incorrect state/data transformations.
2. `Security`: Vulnerabilities and unsafe auth/authz, secret handling, or data-flow patterns.
3. `Reliability`: Robustness under failure (error paths, retries/timeouts, idempotency, partial-failure behavior).
4. `Performance`: Efficiency/scalability risks (complexity, redundant I/O, memory/resource pressure, latency hotspots).
5. `Maintainability`: Structural quality risks (complexity, duplication, brittle coupling, readability that impedes safe changes).
6. `Testing`: Missing or inadequate test coverage for changed behavior, edge cases, and regressions.
7. `Style-Consistency`: Conformance with repository conventions and idiomatic patterns.
8. `Docs-Contracts`: API/schema/interface contract drift, and documentation required for correct integration.
9. `Dependency-Configuration`: Supply-chain, lockfile, CI/runtime configuration, and unsafe-default risks.
10. `Accessibility-UX` (when applicable): Accessibility and interaction quality for user-facing flows.

## Category Criticality Model
Use this model when deciding blocker status:
1. Production-critical by default: `Correctness`, `Security`, `Reliability`, `Dependency-Configuration`, `Testing`, and contract-impacting `Docs-Contracts`.
2. Context-dependent critical: `Performance`, `Maintainability`, `Accessibility-UX` (escalate when user/SLO/compliance/core-path impact is plausible).
3. Advisory by default: `Style-Consistency` and non-contract documentation polish.
4. A `No-Go` decision must cite at least one production-critical or context-escalated category with evidence.

## Category Coverage Requirement
Each final review must include a short category coverage summary:
1. `Checked` or `Not-Required` status for each taxonomy category.
2. Brief rationale for each `Not-Required` category.
3. Explicit statement when no problematic findings were detected in a checked category.

## Cross-Surface Duplication Detection
Proactively detect and flag duplicated logic introduced across different runtime surfaces or modules.

Required checks:
1. Search for duplicated abstractions (constants, helper functions, contracts, builders, adapters, and test utilities) that were redefined locally instead of reused.
2. Compare changed code against existing shared modules before accepting new local implementations.
3. If duplication is found, require extraction or reuse of a shared utility as the preferred remediation unless there is a documented boundary reason not to share.
4. Treat unneeded duplicate implementations as at least `Medium` severity when they affect correctness-sensitive flows, otherwise `Low` with explicit remediation.
5. Include one explicit statement in every review confirming duplication scan status: `No problematic duplication detected` or a findings list with evidence.

## Triage Pass Pattern
Run a fast, high-signal review pass before deep specialist analysis:
1. Start with changed lines/files first (diff scope).
2. Expand to nearby code only when needed to validate a claim or reduce uncertainty.
3. Prioritize concrete behavioral risk over exhaustive style/nit feedback.
4. Prefer findings with direct user, reliability, data-integrity, or security impact.

### Confidence and Evidence Rules
1. Every finding must include severity, confidence, and anchored evidence (`path:line`).
2. Low-confidence findings are advisory and cannot independently produce `No-Go` unless corroborated by deterministic checks, failing tests, or runtime/log evidence.
3. If confidence cannot be raised with reasonable context checks, downgrade to advisory and avoid blocker language.

### Noise-Control Rules
1. Avoid flooding with low-value style comments unless they violate explicit repository policy/instructions.
2. Skip generated/vendor/lock/minified artifacts unless directly relevant to a defect or policy violation.
3. Keep comments deduplicated; one issue should map to one primary finding with clear remediation.
