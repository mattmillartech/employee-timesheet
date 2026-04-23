---
name: powershell-operations
description: Use for every PowerShell operation in this repository to prevent syntax/parsing failures, enforce Windows-safe command patterns, and provide deterministic execution/verification steps.
---

# PowerShell Operations Skill (Runnit)

## Purpose
Apply a single, failure-informed standard for all PowerShell command execution in local and agent workflows.

## Relationship To Failure Learnings
- `memories/repo/failure-learnings.md` is the canonical incident ledger for PowerShell failures.
- This skill is the distilled operating contract, not the full historical archive.
- After a PowerShell failure is recorded in the ledger, promote only the durable rule, pattern, or anti-pattern here.
- Do not copy the full incident narrative into this skill unless a short example is needed to clarify the rule.

## Mandatory Invocation Rule
- Use this skill for every PowerShell operation (single command, multi-step script run, log query, validation, rollout-adjacent diagnostics, and file inspection/edit support commands).
- If a workflow includes PowerShell commands and this skill was not applied, treat that as a process violation and correct before continuing.

## Hard-Stop Rule For Route-Group Paths
- If a command contains Next.js-style route segments such as `(app)`, `(auth)`, `[id]`, `[eventId]`, or any `[` `]` segment, stop and rewrite the command before execution unless the path argument is quoted.
- For git commands with pathspecs, always quote each pathspec after `--`.
- Never execute a command that includes unquoted route-group paths; rewrite first.

## Failure-Derived Guardrails

*Promotion rule: When repeated or high-impact PowerShell failures expose a stable rule, add or refine the guardrail here after the incident is logged in `memories/repo/failure-learnings.md`. Keep each guardrail generalized, imperative, and example-driven so it remains useful during execution.*

1. Path parsing safety:
- Always quote paths containing `(` `)` `[` `]` or spaces.
- For cmdlets reading/writing such paths, prefer `-LiteralPath` when available.
- For git pathspecs in PowerShell, use double-quoted pathspecs after `--`.

2. Native PowerShell commands only:
- Do not use Unix/POSIX utilities (`grep`, `head`, `tail`) in PowerShell.
- Use PowerShell-native equivalents:
  - `Select-String` instead of `grep`
  - `Select-Object -First/-Last` instead of `head/tail`
  - `Get-Content` instead of shell `cat` assumptions

3. File writing and manipulation:
- NEVER use bash heredoc syntax (`cat << 'EOF' > file`). This causes an immediate `ParserError` in PowerShell (`Missing file specification after redirection operator`).
- NEVER use PowerShell native here-strings (`@" ... "@`) if the content contains Javascript/Typescript template literals (backticks). PowerShell evaluates and attempts to escape backticks within here-strings, leading to broken syntax when the script is generated.
- To write multi-line files or scripts, rely exclusively on MCP/Workspace editing tools (`create_file`, `replace_string_in_file`).
- Do not append instruction/policy/docs content with `echo >> file`. Use structured patch editing (`apply_patch`) for deterministic markdown/text edits.
- If a script must be materialized via the terminal (because editor tools are unavailable), use an inline Node script with `fs.writeFileSync` or `base64` decoding rather than PowerShell multi-line operations.

4. `rg` usage on Windows:
- Never pass wildcard file paths as positional paths (for example `src/**/x.ts`).
- Use concrete directories plus `-g/--glob` filters.

5. Workspace script invocation:
- Prefer `pnpm -w run <script>` for workspace-root scripts to avoid missing-script resolution issues.
- Especially for canonical gates: `pnpm -w run validate` and `pnpm -w run functions:build`.

6. Complex quoting discipline:
- For non-trivial `node -e` content, use a PowerShell here-string and pass it as one argument.
- For complex `gcloud logging read` filters, build filters in a variable using `-f` formatting, then pass the variable.

7. Terminal lifecycle reliability:
- Treat command completion as authoritative when prompt returns with exit code.
- If terminal closes unexpectedly, rerun in a fresh terminal/session; do not wait indefinitely.

8. Bounded search only:
- Never use unbounded recursive PowerShell scans such as `Get-ChildItem -Recurse -File | Select-String ...` across the repository to discover tools, command names, or general workspace facts.
- If file search is genuinely needed, prefer bounded workspace search tooling or narrowly scoped path searches.
- If the goal is tool/capability discovery, do not use shell search at all; use the tool interface and workflow context instead.
- Never use `Get-ChildItem -Recurse -File -Include *.test.*,*.spec.*,__tests__` or similar PowerShell recursion for test discovery. In this repo it will traverse vendor/build trees such as `node_modules`, can flood the terminal with paths, and is not an acceptable way to decide what to test.
- For test-file discovery, use `rg --files` with explicit globs or a bounded workspace search tool. If the goal is validate/test status, skip file discovery entirely and read the canonical `.dev-logs` result artifacts first.
- Never run repo-root recursive PowerShell content searches such as `Get-ChildItem -Path . -Recurse -File ... | Select-String ...` for any purpose. Treat that entire command shape as forbidden in this workspace because it can traverse thousands of files, including vendor trees, and freeze VS Code.
- Never run repo-root recursive PowerShell discovery pipelines that filter with `Where-Object`, including `Get-ChildItem -Recurse -File -Include ... | Where-Object ...` and `Get-ChildItem -Path . -Recurse -File ... | Where-Object ...`. In this repo those are just as dangerous as recursive `Select-String` scans and are fully forbidden.
- If a content search is truly required, use `rg` with an explicit file glob and an explicit bounded directory. If you cannot state both the directory scope and the file-type scope up front, do not run the search.

8.1. Pre-execution veto (mandatory):
- Before any PowerShell command is executed, inspect the candidate command string.
- If it contains `Get-ChildItem` together with `-Recurse` and either `-Include`, `Where-Object`, `Select-String`, or repo-root `-Path .`, abort that command before execution.
- Do not try to "make it safe" by adding `-First`, `Select-Object`, name filters, or output formatting after the recursive enumeration. The command family itself is forbidden.
- The bare form `Get-ChildItem -Recurse -File | Select-String ...` is equally forbidden even when `-Path .` is omitted and even when the pattern is a single exact identifier. Omission of repo-root `-Path .` does not narrow the search enough to make it acceptable in this workspace.
- Replace it with one of only three allowed alternatives: direct file read by known path, bounded workspace/tool search, or `rg` with explicit directory scope and explicit glob.

8.2. Post-veto fallback rule (mandatory):
- If the pre-execution veto fires, stop terminal discovery for that step entirely.
- Do not search for a "safer" PowerShell variant of the same discovery task.
- Do not retry the same discovery intent from another terminal, another machine, or another agent.
- Immediately pivot to one approved alternative only: direct file read by known path, bounded workspace/tool search, `rg` with explicit scope and glob, or the actual MCP/tool call.
- Especially for internal Copilot/MCP labels, completion surfaces, and workflow status names: a veto hit means shell discovery is over. Resume from the supported non-shell path instead.

8.3. Shell-capable delegation ban for discovery (mandatory):
- Never send read-only discovery, status inspection, artifact lookup, or file/content retrieval through a shell-capable helper when workspace tools can answer the question.
- This includes delegated execution helpers, subagents, or terminal wrappers whose main output is command execution rather than direct workspace reads.
- If the goal is "find/read/check state" rather than "run this exact pre-verified command", stay on workspace tools and do not delegate to shell.
- If a delegated helper still becomes necessary for a discovery-adjacent step, the prompt must explicitly forbid the entire `Get-ChildItem -Recurse` discovery family and require the exact command text in the result.

9. Artifact checks must be direct when canonical paths are known:
- If the repository documents a specific result artifact path, read that file directly instead of scanning folders to rediscover it.
- Example: for validation/test state in this repo, prefer direct reads of `.dev-logs/validate-result.json`, `.dev-logs/test-result.json`, and specific rollout evidence files.
- Do not run recursive `Get-ChildItem` scans over `.`, `.dev-logs`, `artifacts`, `scripts`, or `tools` just to locate a result file whose path is already known.

10. Tool-only completion signals:
- Never use PowerShell to discover, verify, or invoke internal MCP/tool-interface capabilities such as `task_complete`.
- `task_complete` is a tool call, not a repo command, shell function, file artifact, or search target.
- If completion has already been reached, send the brief summary message and call the tool directly. Do not run shell searches, do not wait for a terminal to prove it exists, and do not invent fallback shell probes.

10.1. Internal Copilot/MCP labels are never shell targets:
- Never run PowerShell discovery for any internal Copilot UI label, MCP tool name, status string, or chat-surface phrase, even once.
- This prohibition is machine-independent: a second workstation/session is not new evidence and does not justify retrying the same discovery pattern.
- If such a label appears during work, ignore it and resume from one of the supported paths only: direct repo artifact read, documented repo script, bounded workspace tool, or the actual MCP/tool call.
- If the first supported path fails, pivot to the next bounded supported path immediately; do not inspect Copilot internals.

10.2. Delegated execution inheritance:
- If a parent agent delegates to any subagent or execution helper, this skill's veto rules still apply in full.
- The parent must restate the relevant forbidden command families in the delegated prompt whenever shell execution is possible.
- A delegated result that used forbidden PowerShell discovery is invalid and must be rejected; useful output does not make the violation acceptable.
- Especially forbidden in delegated flows: any repo-root `Get-ChildItem` command that combines `-Recurse` with `-Include`, `Where-Object`, `Select-String`, repo-root `-Path .`, or any search for MCP/Copilot/tool names such as `task_complete`.
- Also especially forbidden in delegated flows: `Get-ChildItem -Recurse -File | Select-String ...` without an explicit path. Treat that as the same banned command family and rerun the step with bounded tools instead of accepting partial output.
- Delegated results for shell-capable steps must include the exact command text used. If exact command evidence is missing, treat the result as insufficient and do not trust it for policy-sensitive workflows.

11. Deploy safety invariant:
- Never execute production or unspecified-target deploy/rollout commands without explicit user authorization in the current turn. Explicitly staging-targeted commands may be auto-approved by repository hook policy, but still require correct target flags and foreground monitoring.

## Standard Execution Pattern
1. Confirm working directory (`Get-Location`) and required env vars.
2. Preflight paths with `Test-Path`.
3. Perform path safety preflight:
- If command includes route-group or bracket paths, ensure every such path is quoted.
- If using git with `--`, ensure each pathspec is quoted.
4. Run command with PowerShell-native syntax.
5. Capture completion signal (prompt returned + exit code).
6. Summarize actionable output and next step.

## Safe Command Templates
```powershell
# Read file preview
Get-Content -LiteralPath ".\src\app\(app)\dashboard\page.tsx" | Select-Object -First 80

# Regex/text search in PowerShell
Select-String -Path ".\functions\src\**\*.ts" -Pattern "onSchedule|STRIPE_API_KEY"

# Ripgrep with glob filter (Windows-safe)
rg "pattern" src/components -g "*.tsx"

# Git diff with route-group pathspec (REQUIRED quoting)
git -C "C:\\Users\\mattm\\source\\repos\\mattmillartech\\runnit" diff master...danger -- "src/app/(app)/leagues/[id]/events/[eventId]/rsvp/page.tsx"

# Git status with bracketed route pathspec (REQUIRED quoting)
git status --short "src/app/(auth)/login/page.tsx"

# For multi-line file creation, favor MCP tools over terminal scripts!
# If needed, use PowerShell here-strings, NOT bash heredocs (<< EOF)
$scriptContent = @"
console.log('Hello from PowerShell');
"@
Set-Content -Path "test.js" -Value $scriptContent -Encoding UTF8

# Workspace-root scripts
pnpm -w run validate
pnpm -w run functions:build

# Complex gcloud filter
$since = (Get-Date).ToUniversalTime().AddHours(-6).ToString('o')
$filter = ('timestamp >= "{0}" AND resource.type="cloud_run_revision"' -f $since)
gcloud logging read $filter --project runnit-c5d14 --limit 100 --format json
```

## Output Contract
1. Command(s) run.
2. Guardrails applied (path quoting, native cmdlets, workspace script form, etc.).
3. Completion evidence (exit code/prompt return).
4. Follow-up action or retry rationale.

## Anti-Patterns (Never Execute)
```powershell
# WRONG: unquoted route-group pathspec triggers PowerShell parsing
git diff master...danger -- src/app/(app)/leagues/[id]/events/[eventId]/rsvp/page.tsx

# WRONG: split command accidentally executing `app` as a command
Set-Location '...'; git diff master ... danger
src/app/(app)/leagues/[id]/events/[eventId]/rsvp/page.tsx

# WRONG: brute-force PowerShell test discovery walks vendor trees and can freeze VS Code
Get-ChildItem -Recurse -File -Include *.test.*,*.spec.*,__tests__ | Select-Object -ExpandProperty FullName

# WRONG: repo-root recursive content search can choke VS Code and is forbidden here
Get-ChildItem -Path . -Recurse -File -ErrorAction SilentlyContinue | Select-String -Pattern "task_complete" -SimpleMatch

# WRONG: recursive repo discovery via Where-Object is equally forbidden
Get-ChildItem -Recurse -File -Include *.md,*.txt,*.ps1,*.json | Where-Object { $_.Name -match 'guardrail|powershell|pwsh|copilot|agent|instruction|review' -or $_.FullName -match '\.github|\.dev-logs|docs' } | Select-Object -ExpandProperty FullName
```
