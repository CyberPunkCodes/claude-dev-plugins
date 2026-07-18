#!/usr/bin/env node
/**
 * frontend-screenshot-verification — screenshot a tiered set of responsive device
 * viewports against a running web app and flag horizontal-overflow breaks.
 * Framework-agnostic: Astro, Next, SvelteKit, Vite, Remix, static, or any URL.
 *
 * Usage:
 *   node run.cjs <light|medium|full> [page ...] [--base-url <url>]
 *   node run.cjs --check                # bootstrap/verify deps only, no server
 *
 * Examples:
 *   node run.cjs light                  # Light tier (4 viewports), home page '/'
 *   node run.cjs medium / /pricing      # Medium tier (10), two pages
 *   node run.cjs full /blog/hello       # Full tier (25), one route
 *   node run.cjs light / --base-url http://localhost:4321   # reuse a running server
 *
 * Self-contained by design — makes NO assumptions about the host machine:
 *   - Playwright + its Chromium are bootstrapped into THIS plugin's own
 *     node_modules on first run if absent (never touches the host project's
 *     package.json). Idempotent: subsequent runs skip it.
 *   - Pages default to ['/']; the caller passes the routes actually affected.
 *     There is no hardcoded page list.
 *   - By default it launches its OWN throwaway dev server on a dedicated port
 *     (4325 -> 4326 -> 4327, aborting if all three are busy) using the project's
 *     package manager (npm/pnpm/yarn/bun, detected by lockfile), then tears it
 *     down. Pass --base-url to hit an already-running server instead — the
 *     universal escape hatch for any non-standard setup.
 *   - Screenshots + last-run.json land in <project>/.verify-shots/.
 */
const { spawn, spawnSync, execSync } = require('child_process');
const net = require('net');
const http = require('http');
const fs = require('fs');
const path = require('path');

const TIERS = ['light', 'medium', 'full'];
const DEVICES = require(path.join(__dirname, 'devices.json'));
const CANDIDATE_PORTS = [4325, 4326, 4327];
const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();

/** Cumulative tier filter: medium includes light, full includes both. */
function devicesForTier(tier) {
  const idx = TIERS.indexOf(tier);
  if (idx === -1) throw new Error(`Unknown tier "${tier}" — expected one of ${TIERS.join(', ')}`);
  const allowed = new Set(TIERS.slice(0, idx + 1));
  return DEVICES.filter((d) => allowed.has(d.tier));
}

/** Run a command inheriting stdio; throw with a clear message on failure. */
function sh(cmd, args, opts) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`\`${cmd} ${args.join(' ')}\` exited with code ${r.status}`);
}

/** Run `git` with captured output; never throws. Returns {ok, status, stdout}. */
function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { ok: !r.error && r.status === 0, status: r.status, stdout: r.stdout || '' };
}

/**
 * Guarantee `.verify-shots/` is git-ignored, deterministically, so screenshot
 * output never lands in the user's commits. This lives in code (not the skill's
 * agent instructions) so it happens on every run regardless of the model.
 *
 * Silent no-op outside a git work tree. Detection uses `git check-ignore` so it
 * honors nested `.gitignore` files and the user's global excludes — not just a
 * grep of the root file. Only ever edits the repo-root `.gitignore`; never
 * stages, commits, or removes anything.
 */
function ensureGitignore(projectDir) {
  const ENTRY = '.verify-shots/';

  // Gate: only act inside a git work tree. This also guarantees `check-ignore`
  // below can only return 0/1, never git's fatal 128 (git missing / not a repo).
  const inTree = git(['rev-parse', '--is-inside-work-tree'], projectDir);
  if (!inTree.ok || inTree.stdout.trim() !== 'true') return;

  // "Already tracked" guard: if it was committed before being ignored, a
  // .gitignore entry does nothing. Warn (with the fix) but never run it.
  if (git(['ls-files', '--error-unmatch', ENTRY], projectDir).ok) {
    console.log(`⚠ ${ENTRY} is already tracked by git — screenshots will be committed.`);
    console.log(`  Stop tracking it (keeps the files on disk):  git rm -r --cached ${ENTRY}`);
  }

  // Detection: exit 0 = already ignored (root/nested/global) → no-op.
  if (git(['check-ignore', '-q', ENTRY], projectDir).ok) return;

  // Not ignored → append to the repo-root .gitignore, keyed on the path so a
  // reworded comment can never produce a duplicate entry.
  const root = git(['rev-parse', '--show-toplevel'], projectDir);
  if (!root.ok) return;
  const giPath = path.join(root.stdout.trim(), '.gitignore');
  let existing = '';
  try { existing = fs.readFileSync(giPath, 'utf8'); } catch { /* no file yet */ }
  if (existing.split(/\r?\n/).some((l) => l.trim() === ENTRY)) return;

  const prefix = existing.length === 0 ? '' : existing.endsWith('\n') ? '\n' : '\n\n';
  const block =
    prefix +
    '# Added by frontend-screenshot-verification (claude-dev-plugins marketplace)\n' +
    '# https://github.com/CyberPunkCodes/claude-dev-plugins\n' +
    ENTRY + '\n';
  fs.appendFileSync(giPath, block);
  console.log(`[gitignore] added ${ENTRY} to ${giPath}`);
}

/**
 * Ensure Playwright + a Chromium binary are available, installing into THIS
 * plugin's own directory on first use (never the host project). Returns the
 * loaded playwright module. This is what lets the plugin work on a stock
 * machine that has never seen Playwright.
 */
function ensurePlaywright() {
  let pw;
  try {
    pw = require('playwright'); // resolves from the plugin's node_modules once installed
  } catch {
    console.log('[setup] Playwright not installed — installing into the plugin (one-time)…');
    if (!fs.existsSync(path.join(__dirname, 'package.json'))) {
      throw new Error(`plugin package.json missing at ${__dirname}; cannot bootstrap Playwright`);
    }
    sh('npm', ['install', '--no-fund', '--no-audit'], { cwd: __dirname });
    pw = require('playwright');
  }
  const exe = pw.chromium.executablePath();
  if (!exe || !fs.existsSync(exe)) {
    console.log('[setup] Downloading Chromium for Playwright (one-time, ~150 MB, cached machine-wide)…');
    sh('npx', ['--yes', 'playwright', 'install', 'chromium'], { cwd: __dirname });
  }
  return pw;
}

/** Pick the dev-server launcher from the project's lockfile (npm default). */
function detectRunner() {
  if (process.env.VERIFY_DEV_CMD) {
    const parts = process.env.VERIFY_DEV_CMD.trim().split(/\s+/);
    return { pm: parts[0], args: (p) => [...parts.slice(1), '--port', String(p)] };
  }
  const has = (f) => fs.existsSync(path.join(PROJECT_DIR, f));
  if (has('bun.lockb')) return { pm: 'bun', args: (p) => ['run', 'dev', '--port', String(p)] };
  if (has('pnpm-lock.yaml')) return { pm: 'pnpm', args: (p) => ['run', 'dev', '--port', String(p)] };
  if (has('yarn.lock')) return { pm: 'yarn', args: (p) => ['dev', '--port', String(p)] };
  return { pm: 'npm', args: (p) => ['run', 'dev', '--', '--port', String(p)] };
}

/** True only if the project has a `dev` script we can launch. */
function hasDevScript() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, 'package.json'), 'utf8'));
    return !!(pkg.scripts && pkg.scripts.dev);
  } catch {
    return false;
  }
}

/** Resolve true only if nothing is bound to the port on loopback. */
function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '127.0.0.1');
  });
}

async function firstFreePort() {
  for (const p of CANDIDATE_PORTS) {
    if (await portFree(p)) return p;
  }
  return null;
}

/** Poll the server root until it answers (any HTTP status) or we time out. */
function waitForServer(port, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/' }, (res) => {
        res.destroy();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() > deadline) reject(new Error(`dev server never answered on port ${port} within ${timeoutMs}ms`));
        else setTimeout(tick, 400);
      });
    };
    tick();
  });
}

/** Launch the project's dev server on `port`, detached so we can kill the group. */
async function launchDevServer(port) {
  const runner = detectRunner();
  const server = spawn(runner.pm, runner.args(port), { cwd: PROJECT_DIR, stdio: 'ignore', detached: true });
  server.unref();
  await waitForServer(port);
  return server;
}

/** Last-resort port kill (npm's child can reparent out of our process group). */
function forceKillPort(port) {
  for (const cmd of [`fuser -k ${port}/tcp`, `lsof -ti tcp:${port} | xargs -r kill -9`]) {
    try { execSync(cmd, { stdio: 'ignore' }); return; } catch { /* try next */ }
  }
}

/** Tear the dev server down and CONFIRM the port actually freed. */
async function killDevServer(server, port) {
  const sig = (s) => { if (server && !server.killed) { try { process.kill(-server.pid, s); } catch { /* gone */ } } };
  sig('SIGTERM');
  if (port == null) return;
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 200));
    if (await portFree(port)) return;
  }
  sig('SIGKILL');
  await new Promise((r) => setTimeout(r, 200));
  if (!(await portFree(port))) forceKillPort(port);
}

async function main() {
  const argv = process.argv.slice(2);

  // --check: bootstrap/verify deps and exit (no server, no project needed).
  if (argv.includes('--check')) {
    const pw = ensurePlaywright();
    const browser = await pw.chromium.launch();
    await browser.close();
    console.log(`[check] OK — Playwright ${require('playwright/package.json').version} + Chromium ready.`);
    return;
  }

  let baseUrl = null;
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base-url') baseUrl = argv[++i];
    else positional.push(argv[i]);
  }

  const tierGiven = positional.length > 0 && TIERS.includes(positional[0]);
  const tier = tierGiven ? positional[0] : 'light';
  const pageArgs = tierGiven ? positional.slice(1) : positional;
  const targetPages = pageArgs.length ? pageArgs : ['/'];

  const { chromium } = ensurePlaywright();

  const outDir = path.join(PROJECT_DIR, '.verify-shots');
  fs.mkdirSync(outDir, { recursive: true });
  ensureGitignore(PROJECT_DIR);
  const devices = devicesForTier(tier);

  let server = null;
  let launchedPort = null;
  if (!baseUrl) {
    if (!hasDevScript()) {
      console.error(`✗ No \`dev\` script found in ${path.join(PROJECT_DIR, 'package.json')}.`);
      console.error(`  Start your dev server yourself and re-run with:  --base-url http://localhost:<port>`);
      process.exit(2);
    }
    launchedPort = await firstFreePort();
    if (!launchedPort) {
      console.error(`✗ Ports ${CANDIDATE_PORTS.join(', ')} are all in use — free one or pass --base-url. Aborting.`);
      process.exit(2);
    }
    const runner = detectRunner();
    console.log(`[server] ${runner.pm} ${runner.args(launchedPort).join(' ')}  (cwd: ${PROJECT_DIR})`);
    try {
      server = await launchDevServer(launchedPort);
    } catch (e) {
      await killDevServer(server, launchedPort);
      console.error(`✗ Couldn't start the dev server automatically (${e.message}).`);
      console.error(`  Start it yourself and re-run with:  --base-url http://localhost:<port>`);
      process.exit(2);
    }
    baseUrl = `http://localhost:${launchedPort}`;
  }

  console.log(`[${tier}] ${devices.length} device(s) x ${targetPages.length} page(s) = ${devices.length * targetPages.length} screenshots @ ${baseUrl} -> ${outDir}`);

  const browser = await chromium.launch();
  let overflowCount = 0;
  try {
    for (const pagePath of targetPages) {
      for (const d of devices) {
        const ctx = await browser.newContext({
          viewport: { width: d.width, height: d.height },
          deviceScaleFactor: d.dpr,
        });
        const page = await ctx.newPage();
        await page.goto(baseUrl + pagePath, { waitUntil: 'load' });
        await page.waitForTimeout(300); // let late reflow / webfonts settle
        const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const overflow = docWidth > d.width + 1;
        if (overflow) overflowCount++;

        const safeName = d.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
        const pageName = pagePath === '/' ? 'home' : pagePath.replace(/^\//, '').replace(/\//g, '-');
        const file = path.join(outDir, `${pageName}__${safeName}.png`);
        await page.screenshot({ path: file });
        console.log(`${overflow ? '⚠ OVERFLOW' : '  ok'}  ${pagePath} @ ${d.name} (${d.width}x${d.height}@${d.dpr}) -> ${file}`);
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    await killDevServer(server, launchedPort);
  }

  let commit = 'unknown';
  try { commit = execSync('git rev-parse --short HEAD', { cwd: PROJECT_DIR }).toString().trim(); } catch { /* not a repo */ }
  fs.writeFileSync(
    path.join(outDir, 'last-run.json'),
    JSON.stringify({ tier, timestamp: new Date().toISOString(), commit, pages: targetPages }, null, 2)
  );

  console.log(`\nDone. ${overflowCount} overflow warning(s). Wrote ${outDir}/last-run.json (tier=${tier}, commit=${commit}).`);
}

main().catch((err) => { console.error(err); process.exit(1); });
