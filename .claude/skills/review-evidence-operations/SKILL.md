---
name: review-evidence-operations
description: "Use when gathering or validating reviewer, PR, and inline-comment evidence: enforces authoritative review-thread retrieval, remote-tip scope discipline, and review-worktree preflights."
---

# Review Evidence Operations Skill

## Purpose
Provide a deterministic evidence contract for reviewer-agent workflows, PR review integration, and inline review-thread retrieval.

## Relationship To Failure Learnings
- `memories/repo/failure-learnings.md` is the canonical incident ledger for review-evidence failures.
- This skill contains the reusable review-evidence rules distilled from that ledger.
- Promote new review-evidence guardrails here only after the underlying incident is recorded in the canonical ledger.

## Apply When
- Running or validating `reviewer-agent` workflows.
- Requesting, retrieving, and triaging GitHub Copilot code review comments on a PR.
- Checking whether Copilot review threads (or human inline review comments) have been addressed.
- Preparing review evidence for rollout, merge, or release gates.
- Using split review worktrees under `tmp/review-*`.

## Non-Negotiable Rules
1. **Default gate**: Review completeness requires GitHub Copilot code review — request Copilot review on the PR, retrieve all review threads via `get_review_comments`, and confirm all non-outdated unresolved high-confidence comments are actioned.
2. Do not treat PR open/closed state, PR summary comments, PR metadata, or browser snapshot inspection as authoritative evidence that a review is complete.
3. If Copilot review cannot be requested, or has unresolved blocking/high-confidence non-outdated threads remaining, report review as `Blocked` instead of inferring clean state.
4. Reviewer evidence is branch-tip evidence, not working-tree evidence; commit and push remediation before rerunning a reviewer gate that compares remote scope.
5. For split review worktrees, preflight dependency and tool availability before using test/validation results as evidence.
6. PR title, PR body text, PR closed/open state, and summary review comments are never sufficient proof that the review gate is complete.
7. Any commit pushed after the reviewed PR tip invalidates the prior review evidence for rollout/release readiness. Re-request Copilot review (or re-run the-dev-squad path if in use) for the new tip before rollout can continue.
8. When reviewer findings require remediation, commit and push the remediation, then treat the prior review artifact as stale and rerun the review package against the new tip before declaring the gate complete.
9. **Alternative gate (opt-in, explicit user request only)**: the-dev-squad B agent structured JSON approval (`{ "status": "approved" }`) replaces the Copilot review gate when the user explicitly requests dev-squad review. Follow the B → D sequential protocol in that case.

## Standard Workflow
1. Identify exact review scope:
- `baseBranch`
- `headBranch`
- Candidate tip SHA
2. Ensure review-relevant local changes for that scope are already committed and synced before requesting review.
3. **Default path**: Request GitHub Copilot review on the PR for the committed tip. Retrieve all review threads via `get_review_comments`. Triage each non-outdated, non-resolved thread and action all high-confidence findings.
4. If findings require remediation, commit and push fixes, then re-request Copilot review against the new tip (prior review is stale).
5. Confirm the reviewed tip SHA matches the current rollout candidate — review from a prior tip is stale.
6. If operating in `tmp/review-*`, verify `node_modules` or tool availability first.
7. **Alternative path (opt-in)**: If the user explicitly requests the-dev-squad review, obtain B agent structured JSON approval (`{ "status": "approved" }`) for the exact diff scope, then run D agent after B approves.

## Output Contract
1. Exact review scope used (baseBranch, headBranch, tip SHA).
2. Review gate path used: `copilot` (default) or `dev-squad` (opt-in).
3. Copilot path: count of non-outdated unresolved threads at close; `0 blocking threads unresolved` = gate satisfied.
4. Dev-squad path: B agent approval status (`approved` or `Blocked` with evidence) + D agent status.
5. Dependency/worktree preflights applied.
6. Whether the reviewed tip SHA matches the current rollout candidate SHA.
7. Final classification: `authoritative`, `blocked`, or `stale`.
