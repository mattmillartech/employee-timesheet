---
name: validation-and-test-operations
description: "Use when running or debugging validation and Jest flows: enforces deterministic Node/package-manager setup, status-artifact checks, vendored-domain sync, and stable Jest authoring patterns."
---

# Validation And Test Operations Skill

## Purpose
Provide a deterministic execution and authoring contract for repository validation and Jest workflows.

## Relationship To Failure Learnings
- `memories/repo/failure-learnings.md` is the canonical incident ledger for validation and test failures.
- This skill is the distilled operating contract, not the full historical archive.
- Promote new validation/test guardrails here only after the underlying incident is recorded in the canonical ledger.

## Apply When
- Running `pnpm run validate`, `pnpm run validate:quick`, `pnpm run test`, or `pnpm run test:changed`.
- Debugging task-wrapper or terminal ambiguity around validation/Jest.
- Editing `packages/domain`, `functions/local-domain`, or any code that affects vendored domain artifacts.
- Writing or repairing Jest harnesses, mocks, or time-sensitive fixtures.

## Execution Guardrails
1. Preflight runtime and package manager invariants before final gates:
- repository root uses `pnpm`
- `functions/` uses `npm`
- Node 22 must be active before final validation/test gates
2. Prefer repository wrappers/tasks and status artifacts for deterministic completion:
- final executable gate: `validate (typecheck + lint, capture logs)` or `pnpm run validate`
- full Jest suite: `pnpm run test`
- deterministic status checks: `pnpm run validate:status` and `pnpm run test:status`
3. When task output includes multiple historical blocks, trust the newest result artifact or final trailer, not earlier failure text.
4. If a shared shell is stale, interactive, or unexpectedly closes, rerun in a fresh task or stateless command form rather than trusting reused shell state.
5. Do not run `validate:quick` immediately before full `validate` unless explicitly diagnosing mismatched output.
6. For one exact, already-known Jest command whose pass/fail result is the only thing needed, choose the execution path most likely to produce deterministic completion evidence in the current environment. Do not force either `execution_subagent` or `run_in_terminal` as a universal default.
7. If the first attempt to run a known exact-file Jest command appears to hang, is canceled, or does not yield a result promptly, switch execution method immediately instead of retrying the same hanging path.
8. When validating workflow state after an interrupted, canceled, or ambiguous run, use the canonical artifact path first instead of rediscovering it by search. In this repo that means reading known files such as `.dev-logs/validate-result.json` and `.dev-logs/test-result.json` directly before attempting any broader inspection.
9. If the result artifact exists and the only commits after it are docs-only or other non-executable changes, treat the result as still valid. Do not rerun or start broad diagnostics just to reconfirm a passing gate.
10. Never use recursive PowerShell enumeration to discover tests or validation scope (for example `Get-ChildItem -Recurse -File -Include *.test.*,*.spec.*,__tests__`). Use `rg --files` with bounded globs, a workspace search tool, or direct artifact reads. `node_modules` and other vendor/build trees are never valid default search surfaces for test/validate discovery in this repo.

## Domain And Build Guardrails
1. After any executable `packages/domain` change, run:
- `pnpm -F @runnit/domain build`
- `pnpm run vendor:domain`
2. Treat missing `@runnit/domain` exports in `functions` as a vendored-domain sync problem first.
3. Treat TypeScript build failures as a hard stop for downstream QA/test workflows.

## Jest Authoring Guardrails
1. Prefer stable contract assertions over brittle raw error payload matching for wrapped callables.
2. For mixed TS/JS module topologies, mirror both extensionless and `.js` mock specifiers when real implementations can leak through either path.
3. Initialize deferred resolver variables with concrete no-op functions instead of nullable optional-call patterns when TypeScript narrowing is unstable.
4. Set explicit fixture timezone when wall-clock or deadline behavior is under test.
5. When direct Jest invocation is necessary, verify `rootDir`, cwd, and config path before concluding the test result is code evidence.
6. Exact-file Jest stall recovery:
- If an exact-file command is already known, pick the execution path that will return the clearest completion evidence in the current environment.
- If `execution_subagent` stalls, switch away immediately.
- If non-background `run_in_terminal` on PowerShell echoes the command but does not return a real completion result, switch away immediately.
- Do not sit idle waiting on a path that has already shown unreliable completion behavior.

## Pre-Invocation Gate (MANDATORY — evaluate BEFORE every Jest or validate tool call)

Before calling `run_task`, `run_in_terminal`, or ANY tool that starts a validate or test run, answer both questions:

**Q1: Is a result already visible in context?**
Scan conversation context, screenshots, `<context>` terminal history, and `<attachment>` blocks.
If `VALIDATE RESULT: PASS/FAIL` or `TEST RESULT: PASS/FAIL` is visible → **Do NOT call the tool.** The run is already done. Read the visible result and take the next appropriate action (PASS → proceed; FAIL → fix errors).

This is the failure that caused the repeated incidents: the test result was already visible in a screenshot or terminal history, and the agent called `run_task` anyway — starting a second run when none was needed.

**Q2: Have code files changed since the last run?**
If no `.ts`, `.tsx`, `.js`, or `.mjs` files were edited since the last completed run → **Do NOT call the tool.** The prior result is still valid. Act on it.

Only invoke a test/validate tool if BOTH answers are:
- Q1: No visible result anywhere in context
- Q2: Yes, code changed since last run

## Completion Reading Protocol (BINDING — applies before any tool call)

This section governs how to read validate/test results when task output is already visible. It is the most important section in this skill because violating it causes multi-hour idle failures.

### Rule 1: Check context FIRST — always
Before calling ANY tool to check, wait for, or get output from a validate or test run, first look at what is already available in:
- The current conversation context (terminal output quoted in the prompt)
- Screenshots provided by the user
- `<context>` blocks listing terminal history and exit codes

If the result is already visible there — **read it and proceed immediately**. Do NOT call any tool.

### Rule 2: Recognizing a completed VS Code task
A VS Code task (`validate (typecheck + lint, capture logs)` or `test (jest, capture logs)`) is fully complete when its terminal shows ANY of:
- `VALIDATE RESULT: PASS` or `VALIDATE RESULT: FAIL`
- `TEST RESULT: PASS` or `TEST RESULT: FAIL`

When either of these strings appears in context, the task is DONE. The terminal auto-closes — no keypress or further input is needed. Act on the result immediately.

### Rule 3: Tool call hierarchy (only when result is NOT already visible)
When the result is NOT already in context:
1. Read the canonical result artifact directly when its path is known (for example `.dev-logs/validate-result.json` or `.dev-logs/test-result.json`).
2. Use `pnpm run validate:status` or `pnpm run test:status` only when the canonical artifact path is unknown or missing.
3. Use `get_terminal_output` on the task terminal only if artifact/status paths are unavailable.
4. DO NOT call a tool that blocks waiting for more output from an already-finished terminal.

### Rule 4: When run_task returns — act on its response immediately
`run_task` is synchronous: it starts the task, waits for it to complete, and returns the full terminal output in its tool response. When the tool call returns, the task is done. **Read the content of that returned tool response immediately and act on it** (PASS → proceed; FAIL → fix errors). Do NOT sit idle, call `get_terminal_output`, call `await_terminal`, or take any further action to "confirm" completion — the returned tool response IS the completion.

This is the exact failure that caused multi-hour idle incidents: `run_task` returned with `TEST RESULT: PASS` in its response, but the agent ignored the returned result and sat waiting indefinitely as if the tool was still running.

### Rule 5: SINGLE-RUN INVARIANT
Never invoke `pnpm run test`, `pnpm run test:changed`, `pnpm run validate`, or the equivalent VS Code tasks more than once per unique code change set. Running a second time "to confirm" an already-visible result is forbidden. The only valid reason to re-run is a code file change between runs. If you find yourself about to invoke a second run, apply the Pre-Invocation Gate above — you have almost certainly already seen the result.

### Rule 6: Artifact-first recovery after interruption or cancellation
If a status check or helper command is interrupted, canceled, or appears to drift, do not improvise new repo-wide searches. Fall back to this exact order:
1. Read the known result artifact directly.
2. Check `git status --short --branch` and latest commit scope to determine whether that result is stale.
3. Only if the artifact is missing and scope changed should you invoke a fresh validate/test run.

### Rule 7: Broad artifact discovery is a last resort, not a default
Do not use recursive searches across `.`, `.dev-logs`, `artifacts`, `scripts`, or `tools` to discover validate/test result files when the canonical result file names are already known. Broad scans are allowed only when the repository genuinely lacks a documented artifact path.

### Rule 8: Test discovery must be bounded and vendor-blind
If you need to locate test files, use `rg --files` with explicit globs or a bounded workspace search tool. Do not use PowerShell recursive enumeration for this purpose, and do not allow discovery to descend into `node_modules`, build outputs, vendored workspaces, or generated artifacts.

### Failure Pattern (Forbidden)
```
// WRONG: task already showed VALIDATE RESULT: PASS but agent calls tool to wait anyway
get_terminal_output("validate terminal")  // ← FORBIDDEN if result is already visible
await_terminal(...)                        // ← FORBIDDEN if result is already visible

// WRONG: recursive PowerShell test discovery over the whole repo
Get-ChildItem -Recurse -File -Include *.test.*,*.spec.*,__tests__
```

### Correct Pattern
```
// Context shows: VALIDATE RESULT: PASS
// → Read it. It passed. Proceed to next step immediately. No tool call needed.
```

## Output Contract
1. Command or test flow executed.
2. Preflights applied (Node version, package manager, vendored domain, status artifact, fresh terminal/task).
3. Completion evidence or exact blocker.
4. Follow-up action with the smallest next validation/test step.