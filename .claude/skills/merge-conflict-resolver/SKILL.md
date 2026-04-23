---
name: merge-conflict-resolver
description: "Use when handling a merge conflict, rebase conflict, or other git conflict; resolve conflicts safely in VS Code/PowerShell with verification before continuing."
---

# Merge Conflict Resolver Skill

## Purpose
Resolve git conflicts safely and predictably in local workflows while preserving user work and repository integrity.

## When To Use vs Escalate
Use this skill when conflicts are local and mechanical, and the correct combined result is clear from existing code patterns.

Escalate to a subagent when conflict intent is unclear, touches many files with behavioral risk, involves schema/data migration logic, or requires broad codebase discovery before choosing the correct resolution.

## Non-Negotiable Safety Rules
1. Never use destructive reset commands to force conflict resolution.
2. Preserve unrelated local edits and do not discard user changes without explicit approval.
3. Verify context before resolving: inspect conflict hunks, surrounding code, and existing patterns.
4. Resolve only the conflicted files required for the current operation.
5. If uncertain, stop and escalate instead of guessing.

## Workflow
1. Inspect repository state with `git status` and identify whether the operation is merge, rebase, or cherry-pick.
2. List unmerged files using `git diff --name-only --diff-filter=U`.
3. Open each conflicted file in VS Code and resolve markers (`<<<<<<<`, `=======`, `>>>>>>>`) by selecting or combining changes intentionally.
4. Re-read resolved sections to ensure imports, types, and control flow remain valid.
5. Stage resolved files with `git add <file>` and confirm no unmerged files remain.
6. Continue the active operation:
- Merge: finalize with `git commit` if needed.
- Rebase: run `git rebase --continue`.
- Cherry-pick: run `git cherry-pick --continue`.
7. If executable code changed, run required validation before handoff.

## Verification Checklist
- `git status` shows no unmerged paths.
- No conflict markers remain in code.
- Only intended files were staged and committed/continued.
- Active operation completed successfully (merge/rebase/cherry-pick).
- Validation completed for executable changes.

## Minimal PowerShell Command Reference
```powershell
# Inspect current conflict state
git status
git diff --name-only --diff-filter=U

# Check for unresolved conflict markers quickly
rg "^(<<<<<<<|=======|>>>>>>>)" -n

# Stage resolved files
git add <path>

# Continue the operation
git rebase --continue
git cherry-pick --continue
# For merge flows, commit if Git prompts for it
git commit

# Validate executable changes when required
pnpm run validate
```
