Write a vault session log and durable memory for this session.

Nexus (http://192.168.1.56:8093) is read-only — no writeback endpoint. All durable session state lives in the vault (git-backed) and in-project memory.

Steps:
1. Summarise what was done this session in 2-4 sentences (decisions made, files changed, blockers found, next priorities).
2. Extract 3-6 key facts worth remembering across sessions.
3. Write a vault session log to `~/.vault/agents/claude/daily/YYYY-MM-DD.md` with YAML frontmatter (name, description, type: session-log, tags). Include: what happened, decisions made, runnit state, next priorities.
4. Commit and push the vault. GIT_SSH_COMMAND is already exported by the startup hook using the available credential (forwarded agent or file key):
   ```bash
   cd ~/.vault && git add -A && git commit -m "log: claude-code session YYYY-MM-DD — <topic>" && git push
   ```
5. Save anything new and non-obvious to in-project memory at `~/.claude/projects/-workspace/memory/` (add a pointer to `MEMORY.md`). Prefer this for recovery-related facts — the vault may not be reachable on every future session.
