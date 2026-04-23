---
name: the-dev-squad
description: "Use when planning or building a large-scope, greenfield, or multi-phase feature that benefits from a locked build plan and a plan-before-code discipline, OR when invoking the B agent (Plan Reviewer) structured JSON approval that gates every Runnit rollout and reviewer workflow. Invokes The Dev Squad (https://github.com/johnkf5-ops/the-dev-squad) — a local Claude Code multi-agent team: Supervisor → Planner → Plan Reviewer → Coder → Tester."
---

# The Dev Squad

## Purpose
Two distinct use cases for this skill:

1. **Feature build pipeline**: Integrate The Dev Squad's plan-first, multi-agent build workflow into the Runnit development process. The Dev Squad enforces a locked build plan contract before any code is written, which eliminates design gaps and context loss across complex multi-file features.

2. **B agent review gate**: Invoke the B agent (Plan Reviewer) as a standalone Runnit code review gate that replaced GitHub Copilot PR review. A B agent structured JSON approval (`{ "status": "approved" }`) is mandatory before any staging or production rollout.

Source: https://github.com/johnkf5-ops/the-dev-squad

## The Team

| Role | Responsibility | Internal Label |
|---|---|---|
| Supervisor (S) | Default front door. Captures the concept, manages the team, narrates transitions. | S |
| Planner (A) | Researches the concept, writes a complete build plan with copy-pasteable code. No placeholders. | A |
| Plan Reviewer (B) | Reads the plan and challenges every gap. Loops with the planner until approved. Locks the plan. | B |
| Coder (C) | Follows the approved, locked plan exactly — every file, every dependency. No improvising. | C |
| Tester (D) | Checks code against the approved plan, runs it, loops with the coder until all tests pass. | D |

## Use When
- Building a new feature that spans multiple files, subsystems, or agents and would benefit from a research-first, plan-before-code contract.
- The task is greenfield or large enough that starting directly in code carries meaningful risk of design drift or missed edge cases.
- The implementation scope is too large for a single `coding-agent` micro-task and needs structured phase gates (concept → plan → review → code → test).
- You want a locked plan to serve as the shared contract for the build, so that QA testing (including `qa-specialist-agent`) checks the result against a defined spec.
- External research (web docs, API references, library source) is required before code can be written reliably.
- `reviewer-agent` needs to obtain B agent structured JSON approval for any diff scope before emitting a `Go` gate decision.
- `runnit-agent` needs to verify that B agent approval exists for the exact rollout candidate tip before launching rollout.

## Do NOT Use When
- The task is a targeted bug fix, hotfix, or small-scope change (1–3 files, well-understood logic). Use `coding-agent` directly.
- The task is a review, audit, or analysis only. Use `reviewer-agent`, `business-logic-compliance-agent`, or `syntax-agent`.
- The task requires Runnit-specific Firebase/Stripe/Firestore knowledge that only in-repo agents and skills carry. Always keep the Runnit reviewer gate (`reviewer-agent thorough-final`) *after* The Dev Squad delivers code — The Dev Squad is a build accelerator, not a Runnit-specific release gate.
- The task is a production incident or data backfill. Use `troubleshooter` or `firestore-backfill-agent`.

## Requirements
- Claude Code CLI must be installed and available in the terminal (`claude` command).
- Active Claude subscription (Max, Pro, or Team). All 5 agent sessions run on the user's subscription.
- Node.js 22+ and pnpm.
- The Dev Squad runs as a service on Biggie — no local clone needed. Open http://192.168.1.56:3100 (LAN) or http://100.68.1.56:3100 (Tailscale).

## Invocation

### Setup

The Dev Squad runs as a persistent Docker service on Biggie. No local clone or install required.

- LAN: http://192.168.1.56:3100
- Tailscale: http://100.68.1.56:3100

The `claude` CLI is installed on a persistent volume inside the Dev Squad container. Both `invoke-b-agent.mjs` and `invoke-d-agent.mjs` use the Dev Squad service directly — no local `claude` CLI required.

### Pipeline Mode (recommended for planned builds)
1. Open the viewer at `http://192.168.1.56:3100`.
2. Tell the **Supervisor** what you want to build.
3. Ask the Supervisor to start planning or start the build.
4. Choose **Full Build** (Supervisor → Planner → Reviewer → Coder → Tester) or **Plan Only** (stop after the plan is approved).
5. Monitor via the 5-panel grid. All agents communicate through structured JSON signals; no manual copy-paste required.
6. Retrieve the finished plan from `~/Builds/<project-name>/plan.md` and the code from `~/Builds/<project-name>/`.

### Manual Mode (for directed or exploratory work)
- Toggle MANUAL in the dashboard.
- Use the per-panel inputs to direct each specialist at will.
- Use the **Hand off →** button to pass one agent's output as context for the next.

### Strict Mode (for shell-execution safety)
- Enable Strict mode to require human approval for every Bash command from the Coder and Tester.
- Every approval is request-scoped (one-time grant per explicit approval).

## Workflow Phases

```
Phase 0: Concept      — Talk to the Supervisor or Planner. Describe the goal.
Phase 1: Planning     — Planner researches + writes plan.md with complete, copy-pasteable code. One self-review pass.
Phase 1b: Plan Review — Plan Reviewer challenges the plan. Loops until fully approved. Plan is locked.
Phase 2: Coding       — Coder follows the locked plan exactly. No improvising.
Phase 3: Testing      — Tester checks every plan item against the code. Loops with Coder until passing.
Phase 4: Done         — Finished project is in ~/Builds/<project-name>/
```

## Integration with Runnit Release Workflow

The Dev Squad produces a working implementation as output. That output must still flow through the
standard Runnit release gates **before** any deployment or merge:

1. **Copy/move** The Dev Squad build output into the appropriate Runnit source paths.
2. **Run `pnpm run validate`** to confirm typecheck + lint pass.
3. **Apply `working.instructions.md` Firestore/schema verification** if the code touches Firestore collections or Cloud Functions.
4. **Delegate to `reviewer-agent` (thorough-final level)** as the mandatory pre-rollout gate.
5. **Update docs** (`DATABASE.md`, `API.md`, `CLOUD_FUNCTIONS_REFERENCE.md`) if schema/contracts changed.

The Dev Squad is a build accelerator and plan contract enforcer — it does not replace the Runnit
security rules, type safety gates, reviewer gate package, or deployment safety checks.

## Agent Communication Format
Agents signal each other through structured JSON only — no text parsing:

```json
// Plan Reviewer approving
{ "status": "approved" }
// Plan Reviewer asking questions
{ "status": "questions", "questions": ["What about error handling?"] }
// Tester approving
{ "status": "passed" }
// Tester failing
{ "status": "failed", "failures": ["PUT /users returns 500"] }
```

The orchestrator routes these signals and advances the pipeline when an approval is received.

## Security Constraints (per The Dev Squad SECURITY.md)

| Agent | Write access | Bash | Network |
|---|---|---|---|
| Planner (A) | plan.md only in current project | No | WebSearch / WebFetch only |
| Plan Reviewer (B) | Nothing | No | WebSearch / WebFetch only |
| Coder (C) | Current project only (not plan.md) | Yes (risky cmds need approval) | No |
| Tester (D) | Nothing | Yes (risky cmds need approval) | No |
| Supervisor (S) | ~/Builds/ only (no .claude/) | Yes (pattern-restricted) | No |

- Plan is locked after the Plan Reviewer approves — no agent can modify it.
- `CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR=1` prevents Bash `cd` from persisting into later file-edit calls.
- Strict mode requires explicit human approval for every Bash call from the Coder and Tester.

## Validation (local)
```sh
pnpm test:hook      # Verifies agent/tool contract against the live approval hook
pnpm test:signals   # Verifies structured signal parsing for plan review, code review, and test results
```

## Guardrails
- Never skip the Plan Reviewer phase for any non-trivial build; the review loop is what prevents design gaps from reaching the Coder.
- The locked `plan.md` is the single source of truth for the build. If the plan changes, restart the review phase — do not let the Coder deviate from the approved contract.
- After code is delivered, do not treat `Tester (D) approved` as Runnit-release-ready. The Runnit reviewer gate and validation pipeline are still required.
- When the build output is brought into the Runnit repo, apply all standard Runnit conventions: no raw Firestore writes, wall-clock time rules, domain type contracts, `sanitizedTxSet`/`sanitizedTxUpdate` for transactions.

---

## B + D Agent Dual-Gate Integration for Runnit

This section applies when using the B agent (Plan Reviewer) and D agent (Tester) as the standalone Runnit code review gates — outside of a full pipeline build. This is the primary integration path for `reviewer-agent` and `runnit-agent`.

### ⚠️ Important: What B and D Agents Actually Do

**B agent (Plan Reviewer)**: Validates design, correctness, and security **before/after code is written**. It is NOT natively a code diff reviewer, but when invoked with a custom system prompt and a diff, it catches design flaws, logical gaps, and correctness issues.

**D agent (Tester)**: Validates **post-implementation behavior**. It runs tests, executes the code, and confirms that the implemented changes work as intended. D agent catches runtime errors and integration issues that static review misses.

**For Runnit's review gate**, both agents are invoked headlessly:
- B agent via `node scripts/invoke-b-agent.mjs` (custom code review system prompt)
- D agent via similar invocation pattern (test execution and behavior validation)

The web UI at http://192.168.1.56:3100 is **not required** for headless invocation.

### Role in Runnit

B and D agents have replaced GitHub Copilot PR review as the authoritative review gates. Every staging and production rollout (application code changes) requires:
1. **B agent approval**: `{ "status": "approved" }` (design & correctness validated)
2. **D agent approval**: `{ "status": "passed" }` (post-implementation behavior validated)

Both approvals must be for the **exact same tip SHA**.

### Dual-Gate Workflow

```
1. Diff is committed and pushed to origin/<headBranch>
2. Run B agent review (design/correctness check)
   ↓
3. If B returns questions:
   - Resolve via prompt context or code fixes
   - Re-run B agent for same tip (if code unchanged)
   - Re-run D agent after B approves
   ↓
4. If B returns issues:
   - Implement fixes, commit, push (new tip SHA)
   - Re-run B agent against new tip
   - Once B approves new tip, run D agent
   ↓
5. Once B approves: immediately run D agent
   ↓
6. If D returns failures:
   - Fix code, commit, push (new tip SHA)
   - Re-run B agent against new tip
   - Once B approves new tip, re-run D agent
   ↓
7. Both B and D approve same tip SHA → rollout can proceed
   - Include both proof blocks in reviewer output
   - runnit-agent verifies both approvals before launching rollout
```

### How Agents Are Invoked

Both agents run via the Dev Squad service's `/api/review` endpoint on Biggie. The scripts push the head branch to origin, then tell the agent to fetch and diff from the Runnit repo mounted inside the container at `/root/Builds/runnit`. The agent generates the diff itself — no need to pass large diffs in the prompt.

**B Agent — Design & Correctness Review:**
```powershell
# Staging (uses Haiku by default):
node scripts/invoke-b-agent.mjs --base staging --head danger

# Production (uses Opus by default):
node scripts/invoke-b-agent.mjs --base master --head danger

# Explicit model override:
node scripts/invoke-b-agent.mjs --base staging --head danger --model opus
```

Evidence: `.dev-logs/b-agent-review.json`

**D Agent — Post-Implementation Verification:**
```powershell
# After B agent approves. Runs pnpm test locally first (hard-fail on any failure),
# then sends diff scope + test output to D agent for intelligent analysis.
node scripts/invoke-d-agent.mjs --base staging --head danger
```

Evidence: `.dev-logs/d-agent-verification.json`

**Model defaults:** Haiku for staging reviews, Opus for production. Override with `--model haiku|sonnet|opus`.

Both scripts share infrastructure via `scripts/lib/dev-squad-client.mjs` (service discovery, `/api/review` HTTP client, model aliases, JSON extraction).

### Architecture

The `/api/review` endpoint (added via fork at `mattmillartech/the-dev-squad`) spawns `claude -p` with:
- Configurable `cwd` (set to the mounted Runnit repo)
- `--permission-mode auto` with `--allowedTools` for git/read operations
- Prompt piped via stdin (avoids Linux 128KB MAX_ARG_STRLEN limit)
- Returns structured `{ success, result, usage }` JSON

The agent runs inside the Dev Squad container, fetches the latest refs, generates the diff via `git diff origin/<base>...origin/<head>`, reads source files as needed, and responds with structured JSON.

### Setup

1. Dev Squad service running on Biggie (LAN: `http://192.168.1.56:3100`, Tailscale: `http://100.68.1.56:3100`)
2. Fork (`mattmillartech/the-dev-squad`) deployed with `/api/review` endpoint
3. Runnit repo mounted in container at `/root/Builds/runnit`
4. Claude CLI installed on persistent volume with PATH configured
5. `.dev-logs/` is gitignored — approval evidence lives there locally

### Failure Recovery

**CRITICAL: Always use the scripts.** Never attempt to replicate the review flow inline (e.g. embedding diffs in prompts, calling `/api/chat` manually, or using the Dev Squad web UI for review gate work). The scripts handle session cleanup, repo sync, prompt construction, and JSON extraction correctly.

| Symptom | Cause | Fix |
|---------|-------|-----|
| "branch not found" or "does not exist" | Biggie repo mirror missing the branch | Run on Biggie: `git -C "/mnt/user/MiLLaR/=Development=/Runnit/github/runnit/" fetch --all` |
| Dev Squad web UI shows stale session | Prior manual mode session not cleaned up | Scripts auto-reset on each run. Manual fix: `curl -X POST http://192.168.1.56:3100/api/reset -H "Content-Type: application/json" -d '{"mode":"manual"}'` |
| "RunnerOptions requires roleFile" | Stale session ID in manual state | Same as above — reset manual state |
| Agent asks for permission / won't run git | Wrong endpoint or permission mode | Ensure scripts use `/api/review` (not `/api/chat`). Never use manual mode for review gate |
| "Headers Timeout Error" or "socket hang up" | Long-running review exceeded HTTP timeout | Scripts use `node:http` (no timeout limit). If still timing out, the Dev Squad container may have restarted mid-review — retry |
| Agent returns prose instead of JSON | Model didn't follow system prompt | Retry. Opus is more reliable than Haiku for JSON-only responses |
| `pnpm test` fails → D agent exits immediately | Hard gate: all tests must pass | Fix the test failures first, regardless of whether they're related to current changes |

### B + D Agent Invocation Flow

1. Ensure the diff scope is committed and synced to `origin/<headBranch>` before invoking agents.

**Phase 1: B Agent Review (Design & Correctness)**
2. Run: `node scripts/invoke-b-agent.mjs --base staging --head danger`
3. B agent produces a structured JSON response (written to `.dev-logs/b-agent-review.json`).
4. If `questions` or `issues`:
   - For `questions`: Add context to prompt or fix code if the question reveals a real gap. Re-run B agent against same tip.
   - For `issues`: Implement fixes via `coding-agent`, commit and push (new tip SHA), then re-run B agent against new tip.
5. Continue looping until `{ "status": "approved" }` is received for a tip SHA.

**Phase 2: D Agent Verification (Post-Implementation Testing)**
6. Once B agent approves a tip SHA, immediately run: `node scripts/invoke-d-agent.mjs --base staging --head danger`
7. D agent executes tests, validates code behavior, and produces a structured JSON response.
8. If `failed`:
   - Implement fixes via `coding-agent`, commit and push (new tip SHA)
   - **Re-run B agent against the new tip** (all prior approvals invalidated)
   - Once B approves new tip, re-run D agent
9. Continue looping until `{ "status": "passed" }` is received for a tip SHA.

**Phase 3: Both Approved**
10. When both B and D approve the same tip SHA, the dual-gate is satisfied. Record both tip SHAs (should be identical) for proof blocks.
11. If the Dev Squad service or review invocation fails (unreachable, auth error, timeout), classify the review gate as `Blocked` — never infer approval from absence of rejection.

### B + D Agent JSON Protocol

**B Agent Response:**
```json
{ "status": "approved" }
{ "status": "questions", "questions": ["<question1>", "<question2>"] }
{ "status": "issues", "issues": ["<issue1>", "<issue2>"] }
```

**D Agent Response:**
```json
{ "status": "passed" }
{ "status": "failed", "failures": ["<test failure 1>", "<integration issue 1>"] }
```

**Only both `{ "status": "approved" }` AND `{ "status": "passed" }` satisfy the Runnit review gate.**
PR body text, PR merged state, PR status checks, and human review comments do NOT satisfy this requirement.

### Tip-SHA Validity Rules
- Approval is tied to the exact tip SHA reviewed.
- Any commit pushed after an approved tip invalidates **both B and D approvals** for all prior tips.
- If code changes after B approval but before D completes, re-run B agent first (design may have changed).
- If code changes after D failure, re-run B agent against new tip, then re-run D agent.
- Record the final approved tip SHA for both proof blocks — they must be identical.

### Reviewer Gate Proof Blocks

When `reviewer-agent` emits a `Go` gate decision for application code, it MUST include **both** proof blocks:

```
B AGENT APPROVAL CONFIRMED
Tip SHA: <sha>
Unresolved actionable findings: 0

D AGENT VERIFICATION PASSED
Tip SHA: <sha>
Test coverage: All tests passing
```

These proof blocks are the machine-readable artifacts consumed by `runnit-agent` before launching rollout. If either proof block is absent, references a stale tip, or the agent returned anything other than `{ "status": "approved" }` (B) or `{ "status": "passed" }` (D), the gate must be `No-Go`.

**For documentation-only changes**, B+D gating is exempt; normal review suffices.

### Non-Negotiable Rules (Dual-Gate Review)
1. **B agent approval** (`{ "status": "approved" }`) AND **D agent approval** (`{ "status": "passed" }`) are mandatory before any staging or production rollout of application code.
2. Both approvals must be for the **exact same candidate tip SHA** — not prior commits, not earlier branch states.
3. D agent is invoked **after B approves**, regardless of how many B-loop cycles occurred (even if only questions required).
4. If code changes after B approval, all prior approvals are invalidated. Re-run B agent first.
5. If code changes after D approval, re-run B agent (new tip), then D agent.
6. Never substitute a PR review comment, passing CI check, or any other signal for explicit B+D JSON approvals.
7. If the `claude` CLI is unavailable or fails, mark the review gate as `Blocked` and surface to `runnit-agent` before proceeding.
8. Documentation-only changes (README, comments, markdown) are exempt from B+D gating.
9. When questions are resolved through prompt context (without code change), B agent re-approval for the same tip is acceptable before running D.

### Output Contract (Dual-Gate Review Usage)

When invoking B+D gates, return to caller:

**B Agent Results:**
1. B agent status: `approved` / `questions` / `issues` / `Blocked`
2. Approved tip SHA (if `approved`)
3. List of unresolved questions or issues (if not `approved`)
4. Path to evidence file: `.dev-logs/b-agent-review.json`

**D Agent Results (after B approves):**
5. D agent status: `passed` / `failed` / `Blocked`
6. Verified tip SHA (if `passed`)
7. List of test failures or integration issues (if `failed`)
8. Path to evidence file: `.dev-logs/d-agent-verification.json`

**Proof Blocks (when both agents approve):**
9. Both proof blocks with identical tip SHA:
   ```
   B AGENT APPROVAL CONFIRMED
   Tip SHA: <sha>
   Unresolved actionable findings: 0

   D AGENT VERIFICATION PASSED
   Tip SHA: <sha>
   Test coverage: All tests passing
   ```
10. Next action recommendation (rollout proceed, retry B, retry D, or resolve findings)


