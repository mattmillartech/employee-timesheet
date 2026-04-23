---
name: review
description: "Run a reviewer-gated code review over a chosen SCOPE (branch / PR / commit / ref-range). Runs cheap deterministic gates first, then AI static, then CI-backed gates, then code review — fail-fast on cheap checks before burning expensive ones. Uses GitHub Copilot code review by default; pass --dev-squad to use the-dev-squad B+D agents instead. Does not merge or deploy."
---

# Review

## Purpose
Run a standalone reviewer-gated review of a code change without merging or deploying. Produces a pass/fail gate verdict plus structured evidence, suitable for consumption by humans or the `review-and-rollout` skill.

This is the single source of review-gate behavior in the repo. `review-and-rollout` invokes this skill as an internal sub-step. Legacy skills `review-and-merge-danger`, `review-and-rollout-staging`, and `review-and-rollout-production` are deprecated shims that delegate here and to `review-and-rollout`.

## Design principle — wave ordering
Gates are ordered cheap-and-deterministic → AI-and-scoped → CI-backed → human/AI-in-loop. Fail the cheap gates before burning expensive ones. Within a wave, run gates in parallel when they are independent.

| Wave | Gates | Runtime | Why here |
|---|---|---|---|
| 0 Pre-flight | Scope resolution; commit candidate | seconds | Nothing downstream is stable without this |
| 1 Cheap local static (parallel) | `check-release-age.mjs`, `validate-skills.mjs --strict`, `rigour_review` | <1 min | Deterministic, fast, no wasted CI or agent time on broken changes |
| 2 AI static | `reviewer-agent` with 5 specialist consults | 1-2 min | Runs while Wave 3 CI warms up |
| 3 CI-backed (wait for and read) | ci-safe-validation (required), semgrep, playwright-smoke, lhci+axe, lost-pixel | 5-20 min parallel (reads, doesn't execute) | Already running in GitHub Actions; skill enforces at PR-skill level |
| 4 Code review | Copilot (default) or Dev Squad B+D (`--dev-squad`) | 5-15+ min | Most expensive; don't burn on static-broken changes |
| 5 Remediation loop | Re-run only affected gates | Variable | Minimize expensive re-runs |
| 6 Evidence output | Structured report | seconds | Final |

Stryker is **not** a PR gate — it runs weekly via `.github/workflows/stryker.yml` and is reported as a trend signal only.

## Scope Dispatch

Parse the invocation arguments for a `--scope` flag or positional SCOPE token. If none is provided, default to `branch`.

| Scope | Input | Base → Head resolution | Typical use |
|---|---|---|---|
| `branch` (default) | `--scope branch` | `danger ... HEAD` of current checkout | Reviewing work-in-progress against danger before merge |
| `pr` | `--scope pr --pr <number>` | PR base branch ... PR head SHA (via `gh pr view`) | Reviewing an existing open PR |
| `commit` | `--scope commit --sha <sha>` | `<sha>^ ... <sha>` (single commit) | Reviewing a single commit retroactively |
| `ref-range` | `--scope ref-range --base <ref> --head <ref>` | `<base> ... <head>` | Reviewing an arbitrary range (e.g., `staging...danger`) |

The resolved `baseBranch`, `headBranch` / `headSha`, and a `touchedAreas` list (derived from `git diff --name-only <base>...<head>`) are the canonical inputs to every downstream gate.

## Review Gate Mode

| Mode | Flag | Default | Gate proof block |
|---|---|---|---|
| **GitHub Copilot** | (none) or `--github` | **Yes** | `COPILOT REVIEW GATE CONFIRMED` |
| **Dev Squad B+D** | `--dev-squad` | No | `B AGENT APPROVAL CONFIRMED` + `D AGENT VERIFICATION PASSED` |

Parse the invocation arguments for `--dev-squad` or `--github`. If neither is specified, default to GitHub Copilot review.

## Policy References
- [Working Instructions](../../instructions/working.instructions.md)
- [Orchestration Manager](../orchestration-manager/SKILL.md)
- [Review Evidence Operations](../review-evidence-operations/SKILL.md)
- [Review Artifact Policy](../review-artifact-policy/SKILL.md)
- [Review Taxonomy](../review-taxonomy/SKILL.md)
- [Agent Customization](../agent-customization/SKILL.md)
- [The Dev Squad](../the-dev-squad/SKILL.md) (when `--dev-squad`)

## Relationship To Failure Learnings
- `memories/repo/failure-learnings.md` is the canonical incident ledger for reviewer-gate and review-evidence failures.
- This skill contains only the reusable review contract distilled from that ledger.
- Promote new review guardrails here only after the underlying incident is recorded in the canonical ledger.

## Execution Contract

### Wave 0 — Pre-flight
1. Resolve `baseBranch` / `headBranch` / `headSha` from the Scope Dispatch table.
2. Compute `touchedAreas` from `git diff --name-only <base>...<head>` and classify:
   - `depsTouched` — any of `package.json`, `pnpm-lock.yaml`, `functions/package.json`
   - `skillsTouched` — any of `.claude/skills/**`, `.github/skills/**`
   - `routesTouched` — any of `src/pages/**`, `src/app/**`, `src/components/**`, `functions/src/**`
   - `uiTouched` — any of `src/pages/**`, `src/app/**`, `src/components/**`, `public/**`, `src/styles/**`
   - `workspaceTouched` — map changed paths to workspace roots (`app`, `domain`, `functions`)
3. Emit a diff fingerprint: range, commit count, file count, added/removed lines, touchedAreas, preliminary risk tier (low/medium/high).
4. **Commit candidate (scope=`branch` only):** if there are review-relevant uncommitted local changes, stage only intended files, review `git diff --cached`, commit with a clear message, sync so the remote tip matches. Verify with `git log -1 --oneline`, `git status --short`. Skip for `pr` / `commit` / `ref-range` scopes.

### Wave 1 — Cheap local static (parallel, hard gates)
Run the following in parallel. Each is a hard gate — any failure blocks the skill until remediated.

| Gate | When it runs | Command | Fail mode |
|---|---|---|---|
| **Release-age (P0a)** | `depsTouched` is true | `node scripts/check-release-age.mjs --json` | Any dep under the pnpm `minimumReleaseAge` window with no approved override |
| **Skill validator (P0d)** | `skillsTouched` is true | `node scripts/validate-skills.mjs --strict --path <dir>` for each touched skill dir | Any `hard failure`, `strict failure`, or `drift failure` |
| **Rigour (MCP)** | Always | `rigour_review` on the diff / PR tip (not `rigour_check` — that is CLI repo-wide) | `FAIL` verdict |

Proof block (emit after Wave 1 completes):
```
WAVE 1 STATIC GATES CONFIRMED
Release-age: <PASS|FAIL|N/A>  (<details or "deps not touched">)
Skill validator: <PASS|FAIL|N/A>  (<details or "skills not touched">)
Rigour: <PASS|FAIL>  (<summary>)
[GATE: PASSED|FAILED]
```

### Wave 2 — AI static (hard gate)
Invoke `reviewer-agent` with `baseBranch=<resolved>`, `headBranch=<resolved or headSha>`. Require outcomes from all applicable specialist consults:
- `business-logic-compliance-agent` — Compliant / Non-Compliant / Not-Required
- `workspace-hygiene-agent` — Clean / Needs-Cleanup
- `ux-specialist-agent` — Aligned / Needs-Changes / Not-Required
- `syntax-agent` — Aligned / Needs-Changes / Not-Required
- `jest-agent` — Adequate / Needs-Work / Not-Required

Require changed-scope Jest evidence when Jest scope is touched. Any `Non-Compliant` or `Needs-Changes` / `Needs-Work` / `Needs-Cleanup` is a hard gate failure — route to Wave 5 remediation.

Proof block:
```
REVIEWER AGENT GATE CONFIRMED
Business logic: <verdict>
Workspace hygiene: <verdict>
UX: <verdict>
Syntax: <verdict>
Jest: <verdict>
[GATE: PASSED|FAILED]
```

### Wave 3 — CI-backed gates (scope-conditional, hard gates)
GitHub Actions runs these workflows on every PR against `danger` / `staging` / `master`. The skill waits for required-by-scope workflows to complete, then reads their result via `gh pr checks <prNumber> --json name,state,conclusion`.

| Workflow | Required when | Hard fail on |
|---|---|---|
| `ci-safe-validation` | Always (branch-protected) | Any conclusion ≠ `success` |
| `semgrep` | Always | Conclusion ≠ `success` |
| `playwright` (smoke) | `routesTouched` | Conclusion ≠ `success` |
| `lighthouse` (axe + LHCI) | `uiTouched` | Conclusion ≠ `success` |
| `vrt` (Lost Pixel) | `uiTouched` | Conclusion ≠ `success` (update baselines if change is intentional, then re-run) |

**Missing-when-expected is a failure.** If `routesTouched` is true and `playwright` has not run, the gate fails. Scope inference may miss changes; the default is "require, do not skip."

**For `branch` scope without a PR yet:** the skill opens a temporary review PR against `baseBranch` so CI fires; the temporary PR is closed after the proof block is emitted.

Proof block:
```
WAVE 3 CI GATES CONFIRMED
ci-safe-validation: <state>  (required)
semgrep: <state>  (required)
playwright: <state>  (<required|N/A — no routes touched>)
lighthouse: <state>  (<required|N/A — no UI touched>)
vrt: <state>  (<required|N/A — no UI touched>)
[GATE: PASSED|FAILED]
```

### Wave 4 — Code review (hard gate on unresolved high-confidence)

**GitHub Copilot mode (default):**
- Ensure the PR used in Wave 3 exists (create a temporary review PR from the already-committed tip if scope is `branch` / `commit` / `ref-range` and one was not opened earlier).
- Request Copilot review via the review integration.
- Retrieve all threads via `get_review_comments`; confirm no non-outdated unresolved high-confidence blocking comments remain.
- Keep the PR open until the proof block is emitted. For temporary PRs, close after.

Proof block:
```
COPILOT REVIEW GATE CONFIRMED
Scope: <scope> (<base>...<head>)
PR: #<number>
Tip SHA: <sha>
Unresolved high-confidence blocking comments: 0
[GATE: PASSED]
```

**Dev Squad mode (`--dev-squad`):**
- Run B agent plan review via `invoke-b-agent.mjs` or `/api/review`.
- Run D agent verification via `invoke-d-agent.mjs`.

Proof block:
```
B AGENT APPROVAL CONFIRMED
Scope: <scope> (<base>...<head>)
Status: approved
Tip SHA: <sha>

D AGENT VERIFICATION PASSED
Status: passed
Files reviewed: <count>
```

### Wave 5 — Remediation loop
On any hard gate `FAIL`:
- Route fixes via micro-tasks to the smallest-capable specialists.
- After each remediation batch, re-run only the gates touched by the fix plus Rigour (always).
- CI-backed gates re-run automatically on push; wait for them before re-asserting Wave 3.
- Max 3 remediation iterations before escalating to user with `Blocked` and a concrete ask.

### Wave 6 — Evidence output (required)
Final structured report containing:
- Scope used, resolved diff fingerprint, touchedAreas classification, risk tier
- Wave 1 proof block
- Wave 2 proof block
- Wave 3 proof block (including N/A entries with reason)
- Wave 4 proof block (Copilot or Dev Squad)
- Remediation iterations (count + brief summary if any)
- High-confidence findings resolved (or `None`)
- Commit SHA(s) reviewed
- Temporary PR number/URL if one was opened (and closed state)
- **Advisory signals** (do not block, do flag):
  - Latest `stryker` weekly run status for `workspaceTouched` workspaces (`.github/workflows/stryker.yml` last conclusion)
  - Sentry SDK instrumentation presence for `functions/src/**` changes (P6)

## Guardrails
- Use micro-orchestration: no broad "fix everything" delegation.
- Verify subagent claims before acceptance.
- Any Wave 1-4 hard gate `FAIL` blocks forward progress until resolved.
- This skill does not merge, push to protected branches, or deploy. If those actions are required, the caller (typically `review-and-rollout`) is responsible.
- Stop with `Blocked` if any hard gate cannot be satisfied after remediation iterations are exhausted.
