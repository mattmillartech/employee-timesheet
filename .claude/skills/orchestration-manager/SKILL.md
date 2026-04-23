---
name: orchestration-manager
description: "Use when coordinating complex work across subagents, skills, and task gates; enforces delegation, deduping, and explicit handoffs for multi-step workflows."
---

# Orchestration Manager

## Purpose
Provide a repeatable orchestration protocol for multi-step tasks that involve delegation to
specialized subagents or skills. Applicable to any orchestrating agent — not just `runnit-agent`.
See the **Runnit Project Context** section at the bottom for project-specific routing and gates.

## Relationship To Failure Learnings
- `memories/repo/failure-learnings.md` is the canonical incident ledger for orchestration failures.
- This skill captures the durable orchestration contract distilled from that ledger.
- Promote orchestration rules here only after the underlying incident is recorded in the ledger.

## Use When
- A task spans multiple domains and needs controlled handoffs to specialists.
- You need to avoid duplicate audits or reviews on unchanged scope.
- You need deterministic evidence-backed handoffs with clear status and next actions.
- Any agent (e.g. `coding-agent`, `runnit-agent`) needs to brief a specialist and verify the result.

## Core Orchestration Responsibilities
1. Classify scope and risk before delegating.
2. Route by responsibility boundaries — smallest capable specialist first.
3. Enforce dedupe using scope fingerprints.
4. Aggregate gate outcomes for readiness decisions.
5. Report evidence-backed handoffs.
6. Decompose work into micro-tasks with checkpoints.

---

## Micro-Delegation Protocol (Required)

Before invoking any specialist or subagent, define a narrow contract:

1. **Objective**: one concrete outcome.
2. **Scope**: exact files, areas, or commit range to inspect or edit.
3. **Constraints**: required policies, do-not-touch areas, verification expectations.
4. **Deliverables**: exact output structure expected.
5. **Stop conditions**: what to do when uncertain, blocked, or out-of-scope.
6. **Context enrichment** (for any domain-specialist task): everything the specialist cannot
   observe from the component alone — see Specialist Context Enrichment below.

After receiving a result:

1. Verify returned claims against workspace evidence (code, diffs, tests, docs).
2. Apply end-to-end sanity check: does the recommendation hold across the full flow, not just the
   slice the specialist was shown? — see Specialist Context Enrichment below.
3. Accept, reject, or re-brief with missing context if locally correct but globally suboptimal.
4. Record what changed and why in the orchestration summary.

Delegation quality guardrails:

1. Never ask a specialist to "review everything" or "fix all issues" without scope boundaries.
2. Never combine implementation + final review authority in a single delegated step.
3. Never treat specialist output as authoritative without independent verification.
4. Always include explicit non-goals to reduce drift and overreach.
5. Never accept a UX recommendation without first verifying it does not leave any user class with
   no actionable path or unnecessary friction to reach their only valid destination.
6. When a delegated task may invoke terminal or shell commands, explicitly restate any active command-shape bans from repo policy in the prompt. Do not rely on the child agent to infer them from general context.
7. If a delegated result shows use of a forbidden shell-discovery family, treat the delegation as failed even if it returned useful output. Reject it, tighten the contract, and reroute using bounded tools or direct artifact reads.
8. **No-poll rule for background tasks**: When a long-running agent or command is launched with `run_in_background`, the harness delivers a completion notification. Never poll the output file in a loop. Each poll burns tokens for zero information. After launch, either do independent parallel work or wait silently for the notification. This applies to all background tasks across all workflows.

---

## Specialist Context Enrichment (Required)

Specialists assess the slice they are shown, not the full system. A recommendation that is locally
correct within a domain can be globally wrong when the orchestrator has context the specialist was
not given. **The orchestrating agent is the final synthesis layer** — specialist authority never
overrides end-to-end judgment.

### Before delegating to any specialist:
1. **Context check**: Does the specialist need system-level context to give a correct recommendation?
   If yes, explicitly provide it in the brief.
2. **Interaction availability**: For UX or flow assessments, state which actions the user *can and
   cannot* perform in the area being assessed. A specialist cannot observe from code alone that a
   user has no viable path except the one under debate.
3. **Invisible constraints**: Name any constraints not visible from the component or spec alone
   (e.g., "this user class cannot perform action X — this CTA is their only path off this page").

### After receiving any specialist result:
1. **End-to-end sanity check**: Does the recommendation serve the full flow, or only the isolated
   scope shown to the specialist?
2. **Blocked-user test**: Would the recommendation leave a specific user class stuck, confused, or
   with friction that serves no informational purpose?
3. **Challenge before accepting**: If you hold context that would materially change their
   recommendation, re-brief and request a revised assessment — or override with a documented
   rationale explaining the gap.
4. **Do not accept on domain authority alone.** A specialist is authoritative on their domain
   patterns; the orchestrating agent is authoritative on whether those patterns fit the full
   system context.

### Canonical failure pattern (2026-03-08):
A UX specialist was asked bridge-card vs. redirect for a user landing on a page via a share link.
Specialist correctly evaluated the isolated component and recommended a bridge card for contextual
clarity. Orchestrator accepted without supplying the key constraint: the arriving user class had
**no other actionable CTA on the page at all** — they could not use the page's primary function.
The bridge card was pure friction. Full incident: `memories/repo/failure-learnings.md`.

---

## Orchestration Workflow

1. Read project policy/instruction files and identify constraints.
2. Define scope fingerprint: commit range, touched subsystems, business-logic impact, deploy impact.
3. Choose minimum required agents/skills for the scope.
4. Break work into micro-tasks with explicit acceptance criteria.
5. Execute micro-tasks in dependency order with checkpoints after each.
6. Apply dedupe: reuse valid assessments on unchanged scope; rerun only failed or stale gates.
7. Produce a single readiness summary with blockers and next actions.

### State-Recovery Ladder (Required)
When workflow progress is unclear because a task result seems missing, interrupted, or ambiguous, recover state in this exact order before launching any new scan or rerun:
1. Read the canonical repo artifact for that workflow if one is documented.
2. Read current git state (`git status --short --branch`) and latest commit scope to determine whether the artifact is stale.
3. Reuse the existing result if no executable scope changed.
4. Only then consider a bounded status command or fresh run.

Never improvise broad shell discovery while a documented artifact path and commit-scope check are available. That behavior counts as orchestration drift, not investigation.

### Checkpoint reporting standard:
1. Report only deltas since the last checkpoint.
2. Include: completed micro-task, evidence captured, next micro-task.
3. Flag uncertainty immediately with a bounded follow-up plan.

### Delegated Shell Inheritance Rule (Required)
If a micro-task can touch PowerShell, terminal commands, or execution helpers:
1. Copy the active shell guardrails into the delegated prompt explicitly.
2. Name the exact forbidden command families, not just "follow repo policy".
3. Require direct artifact reads, bounded workspace search, or `rg` with explicit scope as the only allowed discovery paths when shell discovery is relevant.
4. Forbid any attempt to discover MCP/tool-interface labels or Copilot internals from the shell.
5. Reject the result if the child used a forbidden command shape, even once.
6. If the micro-task is read-only discovery, status inspection, artifact lookup, or file/content retrieval, do not use a shell-capable helper at all when workspace tools can answer it.
7. Require the child result to include the exact shell command text used for any shell-capable delegated step. Missing command evidence is a contract failure.
8. If the micro-task is an exact live-environment QA execution step with a known command sequence and side-effect-based acceptance criteria (for example fixture-user sign-in, deployed callable invocation, or real staging setup), do not use a generic execution helper. Execute it directly in the parent workflow or route it to a purpose-built specialist only.
9. If a delegated execution result comes back as research, doc summary, or planning instead of the requested live command/output evidence, treat that as a failed delegation and reroute immediately. Do not continue the QA flow on top of that result.

---

## Dedupe Principle

- Never rerun a gate on unchanged scope with a still-valid result.
- When scope changes, invalidate only the impacted assessments and rerun selectively.
- Scope fingerprint must be stable: commit range + subsystem list + business-logic/deploy flags.

---

## Evolution And Maintenance

- Run a lightweight orchestration health check at least once per release cycle:
  1. Verify delegation routing still matches team ownership.
  2. Verify gate rules still match canonical policy.
  3. Identify repeated friction and convert it into agent/skill contract improvements.
- When drift is found, update the smallest set of files required and document the rationale.
- Prefer incremental evolution over large rewrites to keep behavior stable and reviewable.

---

## Output Contract

Return:
1. Scope fingerprint and risk tier.
2. Agents/skills invoked and why.
3. Gate outcomes (pass/fail/not-required) and dedupe decisions.
4. Evidence references (files, log artifacts, commands).
5. Final status: `Ready`, `Blocked`, or `Needs-Rerun`.
6. Adaptation notes: recommended updates to agents/skills if workflow drift was detected.
7. Micro-task ledger: each delegated step, acceptance criteria, and verification result.

---

## Runnit Project Context

Project-specific routing, gates, and invariants. The general protocol above applies universally;
this section instantiates it for the Runnit codebase.

### Delegation Matrix
- `coding-agent`: implementation-only changes.
- `reviewer-agent`: release/code review gate.
- `business-logic-compliance-agent`: business logic specialist consult (used by `reviewer-agent`).
- `syntax-agent`: syntax/code-quality specialist consult (used by `reviewer-agent` + `coding-agent`).
- `jest-agent`: Jest suite creation, maintenance, and execution.
- `emulator-smoke-agent`: emulator release smoke evidence before production rollout.
- `release-verification-agent`: post-deploy production verification.
- `troubleshooter`: incident and root-cause investigations.
- `firestore-backfill-agent`: Firestore repair/migration/backfill tasks.
- `workspace-hygiene-agent`: pre-review artifact cleanup.
- `research-agent`: external source-backed research.
- `scripting-agent`: PowerShell/Node tooling reliability and script optimization.
- `ux-specialist-agent`: UX/flow assessments — always enrich with full journey context (see above).
- `functions-deploy-state-awareness` skill: target-aware functions deploy baseline audits.

### Specialist Enrichment — Runnit-Specific Application Areas
- `ux-specialist-agent`: always provide full navigation path AND the exact actions available on the
  page being assessed. State explicitly if a user class has no primary CTA on that page.
- `business-logic-compliance-agent`: always provide the live user scenario in addition to the spec.
- Any specialist assessing user-facing behavior without access to triggering nav path, session
  state, or role context.

### Gate Decision Rules (Deployment-Ready)
A single reviewer gate package is required:
1. `reviewer-agent` = `Go`
2. Business logic consult = `Compliant` (or `Not-Required` with rationale)
3. Workspace hygiene consult = `Clean`
4. UX consult = `Aligned` (or `Not-Required` with rationale)
5. Syntax consult = `Aligned` (or `Not-Required` with rationale)
6. Jest consult = `Adequate` (or `Not-Required` with rationale)
7. Authoritative inline review-thread retrieval for the exact rollout candidate tip shows zero unresolved actionable findings.
8. Temporary review PR remains open through Copilot review completion and thread triage; if code changes afterward, the gate is stale until a fresh review run exists for the new tip.

If any required gate fails, route fixes to the appropriate specialist and rerun only the
failed/stale assessments — never the full package on unchanged scope.

### Dedupe Rules (Runnit)
- Never rerun `reviewer-agent` on unchanged scope with a still-valid `Go/No-Go` assessment.
- Never rerun `business-logic-compliance-agent` on unchanged business-logic scope with a still-valid consult decision.

### Scope Fingerprint Fields (Runnit)
- commit range
- touched subsystems
- business-logic impact (`yes` / `no`)
- deploy-state impact (`none` | `staging` | `production` | `both`)
