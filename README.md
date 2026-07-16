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
claude plugin install frontend-screenshot-verification@claude-dev-plugins --scope project   # committed to this repo, for collaborators
claude plugin install frontend-screenshot-verification@claude-dev-plugins --scope local     # just you, just this project (gitignored)
```

Update your local copy after I push changes: `/plugin marketplace update`.

## Scope, in short

Install scope is **independent of where a plugin lives** — you pick per install:

| `--scope` | Written to | Reach |
|---|---|---|
| `user` (default) | `~/.claude/settings.json` | You, every project |
| `project` | `<repo>/.claude/settings.json` (committed) | Everyone who clones that repo |
| `local` | `.claude/settings.local.json` (gitignored) | Just you, just that project |

Enabling a plugin only costs a one-line description in context; a plugin's real
work runs only when it's actually invoked.

## Plugins

| Plugin | What it does |
|---|---|
| [`frontend-screenshot-verification`](plugins/frontend-screenshot-verification) | Screenshots a page across a tiered matrix of current device viewports (Playwright/Chromium) and flags horizontal-overflow breaks. Self-bootstrapping, framework-agnostic. |

## Adding a new plugin to this marketplace

1. Create `plugins/<name>/` with a `.claude-plugin/plugin.json` manifest and its
   `SKILL.md` (+ any scripts).
2. Add an entry to `.claude-plugin/marketplace.json` (`name`, `source`,
   `description`, `version`).
3. Commit and push. Users pick it up with `/plugin marketplace update`.
