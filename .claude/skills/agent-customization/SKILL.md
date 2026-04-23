---
name: agent-customization
description: "Use when creating, updating, reviewing, or debugging Runnit custom agents and skills (.agent.md, SKILL.md, instruction routing, and invocation contracts)."
---

# Agent And Skill Customization (Runnit)

## Purpose
Create and maintain high-quality custom agents and skills for this repository, with consistent contracts, routing, and safety gates.

## Use When
- Adding a new custom agent (`.github/agents/*.agent.md`).
- Adding a new skill (`.github/skills/<name>/SKILL.md`).
- Updating existing agent/skill instructions.
- Troubleshooting why an agent/skill is not discovered or not invoked.
- Aligning agent/skill behavior with canonical policy in `.github/instructions/working.instructions.md`.

## Required Inputs
1. Goal and expected outcome.
2. Target type: `agent`, `skill`, or both.
3. Trigger phrases for `description` (discovery text).
4. Tool boundaries and guardrails.
5. Output format requirements.

## Workflow
1. Read `.github/instructions/working.instructions.md` and relevant overlays.
2. Reuse existing patterns from `.github/agents/` and `.github/skills/` before creating new structures.
3. Create or update files with valid YAML frontmatter:
- Agents: `name`, `description`, `tools`.
- Skills: `name`, `description`.
4. Ensure responsibilities are explicit and non-overlapping (for example, `coding-agent` implements, `reviewer-agent` reviews).
5. If rollout/release behavior is touched, align both:
- `.github/skills/rollout/SKILL.md`
- `.github/skills/emulator-prod-rollout/SKILL.md`
6. If orchestration behavior changes, update:
- `.github/agents/runnit-agent.agent.md`
- `.github/instructions/working.instructions.md` (canonical)
- relevant router/overlay files when needed.
7. Validate discoverability:
- `description` contains concrete "Use when..." phrases.
- File path and naming match expected conventions.
- No conflicting duplicate names with different intent.

## Lifecycle Governance
- Treat agent/skill definitions as living contracts and update them when workflow reality changes.
- Include a short compatibility note whenever behavior changes materially:
1. What changed
2. Why it changed
3. Which workflows are affected
- Prefer additive contract evolution first; use breaking changes only when necessary and include migration guidance.
- Ensure dedupe behavior remains explicit whenever introducing new review/compliance gates.

## Guardrails
- Never assume: verify policy and existing patterns first.
- Keep changes minimal and deterministic.
- Do not deploy or mutate production data.
- Prefer additive updates over broad rewrites.

## Output Contract
Return:
1. Files created/updated.
2. Why each change was needed.
3. Invocation examples for the new/updated agent or skill.
4. Any follow-up actions required for rollout/readiness gates.
5. Lifecycle impact note for maintainers (compatibility, migration, and next review checkpoint).
