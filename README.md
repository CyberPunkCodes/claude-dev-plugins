# claude-dev-plugins — a Claude Code plugin marketplace

My personal, reusable [Claude Code](https://code.claude.com/docs) plugins, so I
stop reinventing the same tooling across projects. Each plugin lives under
`plugins/` and is listed in [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json).

## Add this marketplace

```bash
# in Claude Code
/plugin marketplace add CyberPunkCodes/claude-dev-plugins
```

Then browse and install with `/plugin` (a checkbox list of everything here), or
install one directly:

```bash
claude plugin install frontend-screenshot-verification@claude-dev-plugins            # user scope (all your projects)
claude plugin install frontend-screenshot-verification@claude-dev-plugins --scope project   # writes the enable flag to committed .claude/settings.json (files stay global; collaborators still add the marketplace + install)
claude plugin install frontend-screenshot-verification@claude-dev-plugins --scope local     # just you, just this project (gitignored)
```

After I push changes: `/plugin marketplace update claude-dev-plugins` refreshes
the catalog, then `/plugin update <plugin>@claude-dev-plugins` pulls the latest
version of a plugin you already have installed (`/reload-plugins` applies it
mid-session). Plugins here are versioned by git commit — no release tags — so
every push is available on your next update. You can also turn on auto-update
for this marketplace under `/plugin` → **Marketplaces** (off by default for
third-party marketplaces).

## Scope, in short

Install scope is **independent of where a plugin lives** — you pick per install:

| `--scope` | Written to | Reach |
|---|---|---|
| `user` (default) | `~/.claude/settings.json` | You, every project |
| `project` | `<repo>/.claude/settings.json` (committed) | Collaborators who clone are prompted to install it (files still land in their own global cache — nothing is vendored into the repo) |
| `local` | `.claude/settings.local.json` (gitignored) | Just you, just that project |

Enabling a skill-only plugin (everything here, for now) costs about a one-line
description in context; the real work runs only when it's invoked. Plugins that
bundle MCP servers, agents, or hooks cost more — `/plugin` shows a per-plugin
context estimate before you install.

## Plugins

| Plugin | What it does |
|---|---|
| [`frontend-screenshot-verification`](plugins/frontend-screenshot-verification) | Screenshots a page across a tiered matrix of current device viewports (Playwright/Chromium) and flags horizontal-overflow breaks. Self-bootstrapping, framework-agnostic. |

## Adding a new plugin to this marketplace

1. Create `plugins/<name>/` with a `.claude-plugin/plugin.json` manifest and its
   components — for a skill plugin, `skills/<skill-name>/SKILL.md` (+ any
   scripts). Plugins can also ship agents, commands, hooks, or MCP servers.
2. Add an entry to `.claude-plugin/marketplace.json` (`name`, `source`,
   `description`).
3. Commit and push. New plugins appear after `/plugin marketplace update
   claude-dev-plugins`; changes to an already-installed plugin arrive via
   `/plugin update <name>@claude-dev-plugins`. These plugins carry no `version`
   field, so git commits version them — every push propagates on the next
   update, no tags or releases needed.
