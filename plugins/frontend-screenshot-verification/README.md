# frontend-screenshot-verification

A Claude Code plugin: screenshot-based responsive verification for **any web
project**. After a frontend change, it renders the affected route(s) across a
tiered set of current real-device viewports (via Playwright/Chromium) and flags
horizontal-overflow breaks. Framework-agnostic — Astro, Next, SvelteKit, Vite,
Remix, static sites, or any URL.

## Install

From the marketplace (recommended — one canonical copy, no drift):

```bash
/plugin marketplace add CyberPunkCodes/claude-dev-plugins
claude plugin install frontend-screenshot-verification@claude-dev-plugins [--scope user|project|local]
```

Then invoke it after frontend edits (Claude runs it by description), or manually:

```bash
node "${CLAUDE_PLUGIN_ROOT}/run.cjs" --check              # bootstrap/verify deps only
node "${CLAUDE_PLUGIN_ROOT}/run.cjs" light                # Light tier (4 viewports), home page
node "${CLAUDE_PLUGIN_ROOT}/run.cjs" medium / /pricing    # Medium tier (10), two pages
node "${CLAUDE_PLUGIN_ROOT}/run.cjs" full /blog/hello      # Full tier (25), one route
node "${CLAUDE_PLUGIN_ROOT}/run.cjs" light / --base-url http://localhost:4321   # reuse/any URL
```

Output (PNGs + `last-run.json`) → `<project>/.verify-shots/`.

## Zero host-machine assumptions

Built to run on a stock machine that has never seen Playwright:

- **Self-bootstrapping deps.** Missing Playwright → installed into this plugin's
  own `node_modules`. Missing Chromium → downloaded once (~150 MB, cached
  machine-wide at `~/.cache/ms-playwright`, shared across projects). Idempotent.
  The host project's `package.json` is never touched.
- **Package-manager agnostic.** Detects npm / pnpm / yarn / bun by lockfile to
  launch the `dev` server. `VERIFY_DEV_CMD` overrides it.
- **Universal fallback.** `--base-url <url>` skips server management entirely —
  works for any framework, an already-running server, or a live/remote URL.
- **Isolated + tidy.** Runs its own throwaway dev server on a dedicated port
  (4325 → 4326 → 4327, else abort) so it never collides with a server you're
  already running, and confirms teardown (SIGTERM → SIGKILL → port kill).

## Tiers

Cumulative — `light` ⊂ `medium` ⊂ `full`.

| Tier | Devices | Use |
|---|---|---|
| Light | 4 | Routine post-edit check (default). |
| Medium | 10 | Substantial change spanning breakpoints. |
| Full | 25 | Pre-ship audit (explicit request only). |

## What's in the box

| File | Role |
|---|---|
| `.claude-plugin/plugin.json` | Plugin manifest. |
| `skills/verify-frontend/SKILL.md` | Instructions Claude reads — when to run, which tier, how to read results. |
| `run.cjs` | Engine — bootstraps deps, launches a throwaway server, screenshots, flags overflow. |
| `devices.json` | Device list, tiered (4 / 10 / 25). Source of truth. |
| `package.json` | Declares the plugin-local Playwright dependency. |

## Device list maintenance

`devices.json` holds current-generation viewports (CSS width × height + DPR),
tagged by tier. Widths and DPRs are the load-bearing values for breakpoint
testing; Android heights vary by browser chrome and matter less. Refresh when a
device generation turns over.
