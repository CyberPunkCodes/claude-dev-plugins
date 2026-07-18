---
name: verify-frontend
description: >-
  Screenshot-based responsive verification for any web project. After a frontend
  change that could shift layout — an edit to a page/route, layout, component,
  global CSS, or framework config — render the affected route(s) across a tiered
  set of real device viewports (Playwright/Chromium) and check for
  horizontal-overflow breaks. Works with Astro, Next, SvelteKit, Vite, Remix,
  static sites, or any URL. Use as the routine post-edit check on UI work;
  default to the Light tier.
---

# Verifying responsive layout with screenshots

Web UIs have no unit-test coverage for how a page *looks*. This skill renders the
real page across current device viewports and flags layout breaks. It is
framework-agnostic and makes no assumptions about the host machine — it
bootstraps its own browser tooling and hardcodes no routes.

## When to run it (your judgment — it does not self-trigger)

You are the trigger. After you edit **frontend** — a page/route, layout,
component, global CSS, or framework config (`astro.config`, `next.config`,
`tailwind`, `vite.config`, …) — run the check on the route(s) you touched. Match
the tier to the blast radius:

| Tier | Devices | When |
|---|---|---|
| **Skip** | 0 | Purely cosmetic with zero layout risk (a color value, a copy tweak with no wrap risk, a comment). Trust the diff. |
| **Light** | 4 | Default. Any change that could plausibly shift layout or break responsiveness. The routine check. |
| **Medium** | 10 (cumulative) | Substantial change — new component, layout restructure, something spanning breakpoints. |
| **Full** | 25 (cumulative) | Only on explicit request ("full matrix", "final check", "pre-ship audit"). Never unprompted. |

**Which pages?** The one(s) you changed. For a page edit, that page. For a
shared change (layout / global CSS / a widely-used component), pick a couple of
representative routes (from the framework's pages/routes dir — e.g. `src/pages/`,
`app/`, `src/routes/`). There is no baked-in page list — you pass the routes.

## Running it

```bash
node "${CLAUDE_PLUGIN_ROOT}/run.cjs" <light|medium|full> [page ...]
```

- **First run bootstraps its own dependencies.** If Playwright / Chromium aren't
  present it installs them into the plugin's own directory (never the host
  project's `package.json`). Chromium is a one-time ~150 MB download cached
  machine-wide. Tell the user this is happening on the first run in a fresh
  environment; later runs skip it. Pre-warm without screenshotting via
  `node "${CLAUDE_PLUGIN_ROOT}/run.cjs" --check`.
- **Self-launching + isolated:** by default it starts its *own* throwaway dev
  server on a dedicated port (**4325 → 4326 → 4327**, aborts if all three are
  busy) using the project's package manager (npm/pnpm/yarn/bun, detected by
  lockfile) and its `dev` script, then kills it — so it never collides with a
  server you already have running (e.g. on 3000/4321/5173).
- **Universal fallback:** for any setup the auto-launch doesn't fit (unusual dev
  command, no `dev` script, a server already up, or a live/remote URL), pass
  `--base-url http://localhost:<port>` (or any URL) and it skips launch/teardown
  entirely. Override the launch command with `VERIFY_DEV_CMD` if needed.
- Pages default to `/`. Pass route paths as trailing args:
  `… run.cjs light / /pricing /contact`.
- Output → `<project>/.verify-shots/` (PNGs + `last-run.json`). The runner
  auto-manages the `.verify-shots/` entry in the project's `.gitignore` — no
  need to edit it yourself.

## Reading the result

- The runner prints `⚠ OVERFLOW` for any screenshot where
  `document.documentElement.scrollWidth` exceeds the viewport width — a
  horizontal-scroll break. Read those lines first.
- **Then actually look at the PNGs** (Read tool) for what overflow can't catch:
  spacing, alignment, color, wrapping, clipped/overlapping elements. The
  overflow flag only catches horizontal breaks, not "looks wrong".
- If the project uses Tailwind, its Preflight reset (`img { max-width: 100% }`)
  makes fixed-width `<img>` utilities shrink to fit rather than overflow — which
  is why the explicit overflow check matters more than assuming clipping.

## After a substantial change

When you've run Light but the change is big enough that 4 sizes isn't enough to
be confident, offer Medium/Full rather than running them unprompted:

> Verified on Light (4 sizes) — clean. Given the scope, want me to run Medium
> (10 sizes) before we call it done?

Full is the pre-ship audit — always wait to be asked.
