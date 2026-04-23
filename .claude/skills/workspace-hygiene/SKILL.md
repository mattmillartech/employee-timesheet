---
name: workspace-hygiene
description: "Use for pre-review or pre-rollout workspace cleanup: detect temporary root artifacts, confirm ignore coverage, move reversible debris into ignored folders, and report final hygiene status."
---

# Workspace Hygiene

## Purpose
Use this skill when the repository needs a clean working surface before review, handoff, merge, or rollout.

This is the higher-level hygiene workflow. For temporary review/debug artifact handling specifics, also apply `.github/skills/review-artifact-policy/SKILL.md`.

## Use When
- Root-level scratch files, one-off logs, exported diffs, or debug outputs may have been created during work.
- A reviewer or rollout gate requires workspace hygiene evidence.
- An agent needs to confirm whether unexpected untracked files are intentional assets or temporary debris.

## Workflow
1. Inspect `git status --short`.
2. Check the repository root for obvious temporary artifacts that do not belong as project assets.
3. Verify `.gitignore` covers the intended destination before moving anything.
4. Move only non-source temporary artifacts into ignored locations.
5. Prefer `.dev-logs/`; use `tmp/review-artifacts/` when the artifact is review-specific.
6. Leave uncertain files untouched and report them explicitly.
7. Re-run `git status --short` and summarize the final hygiene state.

## Guardrails
- Never delete files by default.
- Never modify product code, deployment config, or tracked source assets as part of hygiene work.
- Keep moves reversible and easy to audit.
- If a file might be intentional, do not guess. Leave it in place and report why it was not moved.

## Required Output
1. `Hygiene Result`: `PASS` or `FAIL`
2. `Files Moved`: `source -> destination`
3. `Files Left Untouched`: with reason
4. `Final Status`: concise `git status --short` summary
