# Employee Timesheet — Claude Code Project Context

## What This Project Does

Self-hosted employee hours tracking web app.

- **Stack:** React 18 + TypeScript (strict) + Vite + Tailwind v4; tiny Express sidecar; deployed via Docker + Nginx.
- **Backend data store:** Google Sheet (one tab per employee + a `_Config` tab + a `Dashboard` tab with a live pivot table).
- **Human auth:** Google Identity Services token flow, gated by `VITE_ALLOWED_GOOGLE_EMAIL`.
- **Agent / API auth:** Service Account token minted by the Express sidecar, protected by `X-Agent-Key`.
- **Prod:** a single Docker container behind a reverse proxy on any VPS. Deploy template is Portainer + Nginx Proxy Manager, but any Docker host + TLS terminator will do.

Authoritative spec: [employee-timesheet-creation-prompt.md](../employee-timesheet-creation-prompt.md).

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

## Agent Infrastructure (private — not in this repo)

This maintainer runs a shared vault + episodic memory service for cross-session agent context. Neither service is part of this project and neither should be referenced from a public repo.

- **Vault:** private Obsidian vault synced via a self-hosted git remote. Agents read/write `brain/`, `agents/claude/daily/`, `work/active/`, etc. — see the vault's own `CLAUDE.md` for structure.
- **Nexus:** private episodic memory bus. MCP tools `nexus_write`, `nexus_search`, `nexus_status` are pre-configured in the harness when the maintainer is active.
- **Rigour:** `@rigour-labs/cli` DLP hook blocks secret commits at Write / Edit / MultiEdit time. MCP server is configured in `settings.json`.

Forkers can ignore all three — nothing here depends on them.

---

## Key Rules

- No secrets in source: OAuth client IDs, allowed email, and sheet ID are baked in via `VITE_*` build args in the Dockerfile; service-account JSON and agent API key are **runtime-only** env vars, never in the frontend bundle.
- Run `npm run typecheck && npm run lint` before considering any change complete.
- TypeScript strict mode, zero `any`. All Sheets API calls wrapped in try/catch with user-facing error messages.
- Weeks start on Sunday (`weekStartsOn: 0`). Times stored internally as 24h; 12h is a display toggle only.
- `localStorage` is used for the sheet ID AND the auth session (token + expiry + email) so reloads don't force a fresh sign-in.
- Dedup-write invariant: a slot row keyed by `(date, slotType, start)` on an employee tab must be unique — update in place, don't append a duplicate.

---

## Deploy

Production deploys are defined as a git-based Portainer stack that pulls this repo's `docker-compose.yml` and builds on the host. Stack env vars (`VITE_*` baked in at build, `GOOGLE_SERVICE_ACCOUNT_JSON` + `AGENT_API_KEY` at runtime) stay in Portainer, never on disk or in git. See [`docs/DEPLOY.md`](../docs/DEPLOY.md) for the full runbook — all example URLs there are placeholders.

Portainer credentials live in the maintainer's Bitwarden vault. Forkers should substitute their own.

---

## `.claude/` Contents

`.claude/skills/` — generic agent skills kept from an earlier Runnit project: `agent-customization`, `merge-conflict-resolver`, `orchestration-manager`, `powershell-operations`, `review`, `review-artifact-policy`, `review-evidence-operations`, `review-taxonomy`, `self-improvement`, `validation-and-test-operations`, `workspace-hygiene`. Homelab-specific skills (`obsidian-mind`, `the-dev-squad`) and the session-end command were removed — they referenced private infrastructure.
