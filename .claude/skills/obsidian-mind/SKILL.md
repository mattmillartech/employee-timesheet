---
name: obsidian-mind
description: |
  ALWAYS ACTIVE — Apply automatically for every vault interaction. No invocation needed.

  This vault uses obsidian-mind + a custom top-level agents/ directory.

  WHERE THINGS GO:
  - Homelab change/discovery → bases/Infrastructure/<slug>.md
  - Gotcha / foot-gun → brain/gotchas/<slug>.md
  - Architecture decision → brain/decisions/<slug>.md
  - Reusable pattern → brain/patterns/<slug>.md
  - Hermes session log → agents/hermes/daily/YYYY-MM-DD.md
  - Hermes-specific notes → agents/hermes/<topic>.md
  - Cross-agent handoff → agents/_shared/<topic>.md
  - Runnit context → work/runnit/ (state.md, architecture.md, etc.)
  - Active work note → work/active/<slug>.md
  - Person / contact → org/people/<name>.md

  KEY RULES:
  - Use [[wikilinks]] for all internal vault cross-references — never markdown links
  - Every vault file needs YAML frontmatter (name, description, type, tags)
  - Date-stamped session logs belong in agents/*/daily/ — NOT brain/
  - Every durable write → immediate commit + push (daily logs can batch)

  Invoke this skill for the full structure reference and file format template.
---

# Obsidian Mind Vault — Operational Reference

Always-active reference for working with the vault. No invocation needed — apply these
conventions for every vault operation across all sessions and projects.

## Vault Locations

| Clone | Path | Used By |
|-------|------|---------|
| Claude (Cowork) | `/mnt/user/Claude/vault` | Cowork sessions |
| Hermes | `/mnt/user/appdata/.hermes/vault` → `/opt/data/vault` | TurboClaw |
| Runnit | `/mnt/user/development/Runnit/github/runnit/.claude/vault` | Claude Code |

**Bare repo:** `/mnt/user/git/vault.git` on Biggie (192.168.1.56)

## Full Directory Structure

```
vault/
├── agents/               # Custom extension — AI agent memory (NOT obsidian-mind core)
│   ├── _shared/          # Cross-agent handoff notes
│   ├── hermes/           # Hermes/TurboClaw config notes, migration context
│   │   └── daily/        # Append-only session logs (batched commits OK)
│   └── claude/           # Cowork Claude memory
│
├── bases/
│   └── Infrastructure/   # Homelab: network, devices, services, credentials, access
│
├── brain/                # Durable cross-agent knowledge (agent-agnostic only)
│   ├── North Star.md     # Core mission
│   ├── Memories.md       # Aggregate memory index
│   ├── Key Decisions.md  # Aggregate decisions index
│   ├── Gotchas.md        # Aggregate gotchas index
│   ├── Patterns.md       # Aggregate patterns index
│   ├── decisions/        # ADRs — architecture decisions
│   ├── patterns/         # Reusable approaches
│   ├── gotchas/          # Foot-guns, edge cases, hard lessons
│   └── antipatterns/     # Recurring failure modes
│
├── org/                  # People + teams ONLY (not agents)
│   ├── people/
│   └── teams/
│
├── perf/                 # Performance tracking, brag doc, review evidence
├── reference/            # Codebase / architecture snapshots
├── skills/               # Agent skills
├── templates/            # Obsidian note templates
├── thinking/             # Scratchpad / in-progress drafts
│
├── work/
│   ├── active/           # Currently active work notes
│   ├── archive/          # Completed / parked work
│   ├── incidents/        # Incident records
│   ├── meetings/         # Meeting notes
│   └── runnit/           # Runnit booking platform context
│
├── CLAUDE.md             # Vault overview + structure (read this first)
├── MEMORY.md             # Live operational state (infra health, active issues)
├── OPERATIONS.md         # Full sync rules, formatting guide, commit conventions
└── AGENTS.md             # Agent-specific instructions (hooks, commands, subagents)
```

## Where Things Go — Detailed

| I want to record... | Location |
|---|---|
| A homelab discovery (new device, service, config) | `bases/Infrastructure/<slug>.md` |
| A foot-gun or surprising edge case | `brain/gotchas/<slug>.md` |
| An architecture decision | `brain/decisions/<slug>.md` |
| A reusable pattern or approach | `brain/patterns/<slug>.md` |
| A recurring failure mode | `brain/antipatterns/<slug>.md` |
| Hermes session log / notes | `agents/hermes/daily/YYYY-MM-DD.md` |
| Hermes agent config or context | `agents/hermes/<topic>.md` |
| Cross-agent handoff or coordination | `agents/_shared/<topic>.md` |
| Runnit project state change | `work/runnit/state.md` |
| Runnit architecture change | `work/runnit/architecture.md` |
| Active work in progress | `work/active/<slug>.md` |
| Meeting notes | `work/meetings/YYYY-MM-DD-<topic>.md` |
| Person or contact info | `org/people/<name>.md` |
| In-progress thinking / draft | `thinking/<slug>.md` |

> [!danger] Session logs ≠ brain content
> Files named `2026-04-06-rsi-gotchas.md` are session logs — they belong in
> `agents/hermes/daily/`, NOT in `brain/gotchas/`. Only distilled, agent-agnostic,
> durable knowledge belongs in `brain/`.

> [!note] agents/ vs org/
> `org/` is for **human people and teams**. `agents/` is for **AI agent memory**.
> These are separate by design — don't put agent files under `org/`.

## Required File Format

Every `.md` file needs this frontmatter:

```markdown
---
name: Short Title
description: One-line summary for relevance matching
type: reference|project|gotcha|decision|pattern|feedback
tags:
  - relevant-tag
  - subtopic
aliases:
  - Alternative Name
---

# Title

Content using [[wikilinks]] for internal vault cross-references.

> [!note] Key Context
> Use callouts for important information.

Related: [[Other Note]] | [[Another Note]]
```

**`type` values:**
- `reference` — Infrastructure docs, config reference, how-to
- `project` — Active project context (Runnit state, work notes)
- `gotcha` — Foot-guns, edge cases, surprising behaviors
- `decision` — Architecture decisions, tech choices
- `pattern` — Reusable approaches, what works
- `feedback` — User corrections, preferences

## Wikilinks — Internal References

Use `[[wikilinks]]` for ALL internal vault cross-references. Never use standard markdown links.

```markdown
# CORRECT
See [[OPERATIONS]] for sync rules.
Full topology in [[bases/Infrastructure/network-topology|Network Topology]].
Related: [[Hermes Memory]] | [[Runnit Overview]]

# WRONG
See [OPERATIONS](OPERATIONS.md) for sync rules.
See [Network Topology](bases/Infrastructure/network-topology.md)
```

**Wikilink variants:**
- `[[Filename]]` — links by filename (Obsidian resolves automatically)
- `[[path/to/file]]` — explicit path (use when filename alone is ambiguous)
- `[[Filename|Display Text]]` — custom display text
- `[[Filename#Heading]]` — link to specific heading

## Callout Blocks

```markdown
> [!note] Context        — background info, extra context
> [!tip] Pattern         — useful approach, best practice
> [!warning] Important   — remember this, non-obvious requirement
> [!danger] Gotcha       — will break if done wrong
> [!info] Quick Fact     — quick reference, statistic
> [!example] Example     — concrete example
```


## Agent Identity

Each vault clone uses a distinct git identity — **no convention to remember**, it is automatic.

| Agent | user.name | user.email |
|-------|-----------|------------|
| Cowork Claude | `Claude (Cowork)` | `cowork@biggie` |
| TurboClaw / Hermes | `TurboClaw (Hermes)` | `hermes@biggie` |
| Claude Code (any machine) | `Claude Code (Runnit)` | `claude-code@runnit` |

Check authorship at a glance:
```bash
git log --oneline --format="%h %an: %s" -10
```

If your clone is missing the identity (new clone or fresh machine), set it:
```bash
git config user.name "Claude Code (Runnit)" && git config user.email "claude-code@runnit"
```

## Sync Rules

> [!danger] Golden Rule
> Every durable write → immediate commit + push.
> Exception: `agents/*/daily/` logs may batch and commit at end of session.

### Claude (Cowork) — via SSH to Biggie

```bash
ssh ... root@192.168.1.56 "
cd /mnt/user/Claude/vault
git add -A && git commit -m 'type: description' && git push
cd /mnt/user/appdata/.hermes/vault && git pull -q
cd /mnt/user/development/Runnit/github/runnit/.claude/vault && git pull -q
"
```

### Hermes — from container via SSH

```bash
ssh -i /root/.ssh/id_ed25519 root@192.168.1.56 "
cd /mnt/user/appdata/.hermes/vault
git add -A && git commit -m 'type: description' && git push
cd /mnt/user/Claude/vault && git pull -q
cd /mnt/user/development/Runnit/github/runnit/.claude/vault && git pull -q
"
```

### Runnit Claude Code — local git

```bash
cd /mnt/user/development/Runnit/github/runnit/.claude/vault
git pull -q   # before reading
git add -A && git commit -m "type: description" && git push   # after writing
```

## Commit Message Convention

| Prefix | Use For |
|--------|---------|
| `add:` | New file |
| `update:` | Modified existing content |
| `fix:` | Corrected inaccurate information |
| `remove:` | Deleted outdated content |
| `doc:` | Documentation / meta changes |
| `refactor:` | Reorganization without content change |

## Key Files Quick Reference

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Vault overview, structure, quick links |
| `OPERATIONS.md` | Full sync rules, directory guide, formatting |
| `MEMORY.md` | Live operational state (NOT an index) |
| `AGENTS.md` | Agent hooks, commands, subagents |
| `agents/hermes/memory.md` | Hermes agent config and current state |
| `bases/Infrastructure/core-knowledge.md` | Key homelab facts |
| `bases/Infrastructure/network-topology.md` | Home network map |
| `bases/Infrastructure/device-inventory.md` | All registered devices |
| `bases/Infrastructure/credential-map.md` | Where credentials live |
| `work/runnit/overview.md` | Runnit project summary |
| `work/runnit/state.md` | Runnit current deployment state |
