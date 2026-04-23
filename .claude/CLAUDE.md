# Employee Timesheet — Claude Code Project Context

## What This Project Does

Self-hosted employee hours tracking web app.

- **Stack:** React 18 + TypeScript (strict) + Vite + Tailwind v4; tiny Express sidecar; deployed via Docker + Nginx.
- **Backend data store:** Google Sheet (one tab per employee + a `_Config` tab + a `Dashboard` tab with live aggregation formulas).
- **Human auth:** Google Identity Services token flow (in-memory only), gated by `VITE_ALLOWED_GOOGLE_EMAIL`.
- **Agent / API auth:** Service Account token minted by the Express sidecar, protected by `X-Agent-Key`.
- **Prod:** [timesheet.redpill.online](https://timesheet.redpill.online) on Redpill VPS (Contabo), managed via Portainer (endpoint id 3) behind Nginx Proxy Manager on the `npm_proxy` network.

Authoritative spec: [employee-timesheet-creation-prompt.md](../employee-timesheet-creation-prompt.md).

Current build plan: `C:/Users/mattm/.claude/plans/project-overview-build-declarative-penguin.md`.

---

## Quick Commands

```bash
# Local dev
npm install
npm run dev                 # Vite on http://localhost:5173 (proxies /api to sidecar)

# Local full-stack (Docker)
docker compose up --build   # serves on http://localhost:3000

# Validate before commit
npm run typecheck && npm run lint
```

---

## Memory Protocol (Vault + Nexus + Rigour — all active)

### Vault (structured, git-backed)

Path on this machine: `C:\Users\mattm\.vault\`. Remote: `root@192.168.1.56:/mnt/user/git/vault.git`.

- Architecture decisions → `brain/decisions/<slug>.md`
- Reusable patterns → `brain/patterns/<slug>.md`
- Gotchas / foot-guns → `brain/gotchas/<slug>.md`
- Active project context → `work/active/timesheet.md` (this project's state)
- Session logs → `agents/claude/daily/YYYY-MM-DD.md`

Every durable write → immediate commit + push:

```bash
cd C:/Users/mattm/.vault && git pull --rebase && git add -A && git commit -m "type: description" && git push
```

See `C:/Users/mattm/.vault/CLAUDE.md` and `C:/Users/mattm/.vault/AGENTS.md` for full conventions.

### Nexus (episodic, cross-agent, cross-session)

BubbleFish Nexus at `http://192.168.1.56:8093`. This machine's source: **`claude-code-millitebook`**.

- `nexus_write` — store a session summary, discovery, or decision (MCP tool)
- `nexus_search` — query all agents' memories (MCP tool)
- `nexus_status` — check daemon health (MCP tool)

Use Nexus for: session summaries on phase completion, cross-agent coordination notes, discoveries worth finding from a future session.

> **Mnemo Cortex (port 50001) is DEPRECATED — do not use.** Historical data migrated to Nexus.

### Rigour (DLP on writes)

The `@rigour-labs/cli` hook runs on every Write / Edit / MultiEdit and blocks commits that contain secrets (API keys, tokens, private keys). If a write is blocked, fix the content — don't bypass. Rigour MCP server is also configured.

---

## Key Rules

- No secrets in source: OAuth client IDs, allowed email, and sheet ID are baked in via `VITE_*` build args in the Dockerfile; service-account JSON and agent API key are **runtime-only** env vars, never in the frontend bundle.
- Run `npm run typecheck && npm run lint` before considering any change complete.
- TypeScript strict mode, zero `any`. All Sheets API calls wrapped in try/catch with user-facing error messages.
- Weeks start on Sunday (`weekStartsOn: 0`). Times stored internally as 24h; 12h is a display toggle only.
- Only `hoursTrackerSheetId` is allowed in `localStorage` (per spec). No auth-sensitive data in localStorage or sessionStorage.
- Dedup-write invariant: a slot row keyed by `(date, slotType, start)` on an employee tab must be unique — update in place, don't append a duplicate.

---

## Deploy

Production deploys happen via the `timesheet` Portainer stack on Redpill (endpoint id 3). The stack is git-based — Portainer pulls this repo from GitHub and builds on Redpill. Secrets live in Portainer stack env, not on disk. Full deploy procedure: see the build plan's M7 section.

Credential: Bitwarden item "Portainer - Redpill" (look up the UUID via `bw list items --search "portainer"` — UUIDs belong in the private vault, not a public repo).

---

## Agent Infrastructure Kept From Runnit (cross-project, safe to use)

`.claude/skills/` includes: agent-customization, merge-conflict-resolver, obsidian-mind, orchestration-manager, powershell-operations, review, review-artifact-policy, review-evidence-operations, review-taxonomy, self-improvement, the-dev-squad, validation-and-test-operations, workspace-hygiene. Runnit-specific Firebase / Stripe / rollout / QA skills were removed.
