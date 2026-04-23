---
name: self-improvement
description: Use for continuous, guided performance improvement across all agents by turning workflow friction and failures into concrete contract/process upgrades under runnit-agent coordination.
---

# Self Improvement Skill (Runnit)

## Purpose
Continuously improve agent effectiveness, quality, and reliability over time by converting real execution feedback into small, verifiable improvements.

## Ownership Model
- `runnit-agent` is the coordinator and decision authority for cross-agent improvement actions.
- All agents must apply this skill and report meaningful improvement signals back to `runnit-agent`.
- `memories/repo/failure-learnings.md` is a mandatory input source for every self-improvement cycle.

## Mandatory Triggers
Use this skill when any of the following occurs:
1. Repeated mistakes, regressions, or avoidable rework.
2. Ambiguous handoffs, duplicate audits, or unclear ownership boundaries.
3. Validation/deploy workflow friction or repeated command/shell failures.
4. Policy drift between instructions, agents, and skills.
5. New lessons captured in `memories/repo/failure-learnings.md`.
6. Optimization opportunities.
7. Any other signal that indicates a gap between current behavior and ideal performance.

## Standard Improvement Loop
1. Detect signal:
- Capture what failed or slowed execution.

1.1 Consult failure learnings:
- Read `memories/repo/failure-learnings.md` before proposing fixes.
- Reuse relevant prior learnings explicitly instead of rediscovering known constraints.

2. Verify with evidence:
- Use logs, command output, diffs, and docs to confirm root cause.

3. Classify improvement type:
- Agent contract update (`.github/agents/*.agent.md`)
- Skill update (`.github/skills/*/SKILL.md`)
- Instruction/policy update (`.github/instructions/*.md`)
- Workflow behavior change (delegation, gating, dedupe, validation flow)

4. Propose minimal fix:
- Prefer the smallest deterministic change that prevents recurrence.

5. Apply and align:
- If behavior contracts change, update all affected files in the same change set.

6. Record learning:
- Add/refresh entries in `memories/repo/failure-learnings.md` when appropriate.

7. Verify impact:
- Confirm the new behavior in the next relevant workflow execution.

## Guardrails
- Never bypass explicit authorization rules (especially deploy/rollout and production writes).
- Never treat assumptions as facts; verify before codifying changes.
- Avoid broad rewrites when a focused contract update solves the issue.
- Preserve role boundaries (`coding-agent` implements, `reviewer-agent` reviews, `runnit-agent` orchestrates).
- If the same avoidable failure pattern appears more than once in the same session, do not just note it verbally. Update the relevant skill/contract in that same workflow before continuing.
- If a repeated failure involves self-blocking or status ambiguity, prefer a hard ordering rule over a softer reminder. The corrective change must remove choice from the failure path.

## Output Contract
1. Improvement signal detected.
2. Root cause and evidence.
3. Failure-learnings references used (or explicit `None Found`) with brief applicability note.
4. Changes applied (files + rationale).
5. Expected behavior change.
6. Verification plan/checkpoint.
