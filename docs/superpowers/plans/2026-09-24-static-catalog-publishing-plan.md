# Static Catalog Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish Fak Music and an automatically refreshed Radio Browser catalog from one public GitHub repository using GitHub Actions and GitHub Pages.

**Architecture:** A dependency-free Node generator reads versioned category rules, fetches Radio Browser data, filters and maps it into the extension's existing schema v1, and writes a deterministic Pages bundle. A least-privilege GitHub Actions workflow regenerates, validates, builds, and deploys that bundle; the extension consumes the stable Pages URL while retaining fallback/cache behavior.

**Tech Stack:** Node.js ESM, Vitest, TypeScript, React/Vite, GitHub Actions, GitHub Pages, GitHub CLI

---

### Task 1: Catalog mapping and quality rules

**Files:**
- Create: `catalog/rules.json`
- Create: `scripts/catalog-generator.mjs`
- Create: `scripts/catalog-generator.test.mjs`
- Create: `scripts/fixtures/radio-browser-stations.json`

- [ ] **Step 1: Write failing unit tests**

Test exported pure functions with fixtures that include duplicate UUIDs, duplicate stream URLs, failed health checks, missing names, invalid URLs, HTTP streams, HTTPS streams, and unsupported codecs. Assert that only valid stations remain, HTTPS is ranked first, duplicate records collapse deterministically, and a schema-v1 station preset is produced.

```js
import { describe, expect, it } from 'vitest';
import { buildCatalog, buildPreset, deduplicateStations, normalizeStation } from './catalog-generator.mjs';

it('keeps healthy HTTP(S) stations and maps schema-v1 fields', () => {
  expect(normalizeStation({ stationuuid: 'one', name: 'One', url_resolved: 'http://radio.test/one.mp3', lastcheckok: 1, codec: 'MP3' })).toMatchObject({
    id: 'radio-browser-one', streamUrl: 'http://radio.test/one.mp3', codec: 'mp3',
  });
});

it('deduplicates UUID and normalized stream URL', () => {
  expect(deduplicateStations(fixtureStations)).toHaveLength(2);
});

it('builds a schema-v1 catalog in configured order', () => {
  expect(buildCatalog(rules, stationsByPreset, '2026-09-24T00:00:00.000Z')).toMatchObject({ schemaVersion: 1, generatedAt: '2026-09-24T00:00:00.000Z' });
  expect(buildPreset(rules.presets[0], fixtureStations).id).toBe('lofi');
});
```

- [ ] **Step 2: Verify the tests fail**

Run `npm test -- scripts/catalog-generator.test.mjs --run` and confirm failure is caused by the missing generator exports.

- [ ] **Step 3: Implement the minimal pure mapping layer**

Export `isHttpUrl`, `normalizeStation`, `rankStations`, `deduplicateStations`, `buildPreset`, and `buildCatalog`. Preserve HTTP and HTTPS stream URLs, map Radio Browser UUID/name/codec/homepage/country/tags/last-check fields, and reject unhealthy or incomplete records.

```js
export function isHttpUrl(value) {
  try { return typeof value === 'string' && ['http:', 'https:'].includes(new URL(value).protocol); }
  catch { return false; }
}
export function normalizeStation(station) {
  if (Number(station.lastcheckok) !== 1 || !station.stationuuid || !station.name?.trim() || !isHttpUrl(station.url_resolved)) return null;
  return {
    id: `radio-browser-${station.stationuuid}`,
    title: station.name.trim(),
    streamUrl: station.url_resolved,
    codec: station.codec?.trim().toLowerCase() || undefined,
    homepage: isHttpUrl(station.homepage) ? station.homepage : undefined,
    country: station.countrycode?.trim().toUpperCase() || undefined,
    tags: station.tags?.split(',').map((tag) => tag.trim()).filter(Boolean) || undefined,
    lastCheckedAt: station.lastchecktime_iso8601 || undefined,
  };
}
export function rankStations(left, right) {
  return Number(right.url_resolved?.startsWith('https://')) - Number(left.url_resolved?.startsWith('https://'))
    || Number(right.clickcount || 0) - Number(left.clickcount || 0)
    || Number(right.votes || 0) - Number(left.votes || 0)
    || String(left.stationuuid).localeCompare(String(right.stationuuid));
}
export function deduplicateStations(stations) {
  const ids = new Set(); const urls = new Set();
  return [...stations].sort(rankStations).filter((station) => {
    const id = String(station.stationuuid || ''); const url = String(station.url_resolved || '').trim();
    if (!normalizeStation(station) || ids.has(id) || urls.has(url)) return false;
    ids.add(id); urls.add(url); return true;
  });
}
export function buildPreset(rule, stations) {
  const items = deduplicateStations(stations).map(normalizeStation).filter(Boolean).slice(0, rule.limit);
  if (items.length < rule.minimumItems) throw new Error(`Preset ${rule.id} has ${items.length} items; requires ${rule.minimumItems}`);
  return { id: rule.id, name: rule.name, description: rule.description, type: 'station', source: 'radio-browser', items };
}
export function buildCatalog(rules, stationsByPreset, generatedAt) {
  return { schemaVersion: 1, generatedAt, presets: rules.presets.map((rule) => buildPreset(rule, stationsByPreset[rule.id] || [])) };
}
```

- [ ] **Step 4: Verify focused tests pass**

Run `npm test -- scripts/catalog-generator.test.mjs --run` and require zero failures.

- [ ] **Step 5: Commit**

Commit only the rule, fixture, generator, and focused test files with `feat: 添加电台目录生成规则`.

### Task 2: Generator CLI and deterministic Pages bundle

**Files:**
- Modify: `scripts/catalog-generator.mjs`
- Modify: `scripts/catalog-generator.test.mjs`
- Create: `catalog/generated/index.html`
- Create: `catalog/generated/presets.json`
- Create: `catalog/generated/health.json`
- Modify: `package.json`

- [ ] **Step 1: Add failing CLI tests**

Invoke the generator with a fixture input and temporary output directory. Assert it creates all three files, rejects a category with fewer than the configured minimum, and produces byte-identical JSON for the same timestamp and fixture.

```js
const result = spawnSync(process.execPath, ['scripts/catalog-generator.mjs', '--fixture', fixturePath, '--output', outputDir, '--generated-at', fixedTime], { cwd: repositoryRoot });
expect(result.status).toBe(0);
expect(JSON.parse(readFileSync(join(outputDir, 'presets.json'), 'utf8')).schemaVersion).toBe(1);
expect(existsSync(join(outputDir, 'health.json'))).toBe(true);
expect(existsSync(join(outputDir, 'index.html'))).toBe(true);
```

- [ ] **Step 2: Verify CLI tests fail**

Run `npm test -- scripts/catalog-generator.test.mjs --run` and confirm the missing CLI/output behavior is the failure.

- [ ] **Step 3: Implement live and fixture generation**

Add `--fixture`, `--output`, and `--generated-at` arguments. Without a fixture, discover HTTPS Radio Browser API mirrors from `https://all.api.radio-browser.info/json/servers`, query each configured tag, and fail over across mirrors. Write files only after every category meets its minimum and the complete catalog passes structural validation.

```js
const args = parseArgs({ options: { fixture: { type: 'string' }, output: { type: 'string' }, 'generated-at': { type: 'string' } } });
const rules = JSON.parse(await readFile(new URL('../catalog/rules.json', import.meta.url), 'utf8'));
const stationsByPreset = args.values.fixture
  ? await readFixture(args.values.fixture)
  : await fetchRadioBrowserPresets(rules);
const generatedAt = args.values['generated-at'] ?? new Date().toISOString();
await writeBundle(args.values.output ?? 'catalog/generated', buildCatalog(rules, stationsByPreset, generatedAt));
```

- [ ] **Step 4: Add package scripts**

Add `catalog:generate`, `catalog:generate:fixture`, and `catalog:check` commands. `catalog:check` must generate into a temporary directory from the committed fixture and validate the output without changing tracked files.

```json
{
  "catalog:generate": "node scripts/catalog-generator.mjs",
  "catalog:generate:fixture": "node scripts/catalog-generator.mjs --fixture scripts/fixtures/radio-browser-stations.json --output catalog/generated --generated-at 2026-09-24T00:00:00.000Z",
  "catalog:check": "node scripts/check-catalog.mjs"
}
```

- [ ] **Step 5: Generate and verify the committed snapshot**

Run the fixture generator with a fixed timestamp, then run focused tests and `npm run catalog:check`. Require zero failures and inspect the generated JSON.

- [ ] **Step 6: Commit**

Commit the CLI, package scripts, and generated Pages baseline with `feat: 生成静态音乐目录`.

### Task 3: GitHub Pages workflow

**Files:**
- Create: `.github/workflows/publish-catalog.yml`
- Create: `scripts/workflow-contract.test.mjs`
- Modify: `README.md`
- Modify: `docs/music-presets-auto-update-plan.md`

- [ ] **Step 1: Add workflow contract checks**

Add a repository test that reads the workflow as text and asserts schedule plus manual dispatch, Node setup, `npm ci`, full tests, catalog generation, catalog validation, build, Pages artifact upload, deployment, and least-privilege permissions are present.

```js
const workflow = readFileSync('.github/workflows/publish-catalog.yml', 'utf8');
for (const required of ['workflow_dispatch:', '0 */6 * * *', 'npm ci', 'npm run test:run', 'npm run catalog:generate', 'npm run catalog:check', 'npm run build', 'actions/upload-pages-artifact', 'actions/deploy-pages']) {
  expect(workflow).toContain(required);
}
```

- [ ] **Step 2: Verify the workflow check fails**

Run the focused workflow test and confirm it fails because the workflow does not exist.

- [ ] **Step 3: Implement the workflow**

Use `schedule` with `0 */6 * * *`, `workflow_dispatch`, and push-to-main path triggers. The build job runs `npm ci`, `npm run test:run`, `npm run catalog:generate`, `npm run catalog:check`, and `npm run build`, then uploads `catalog/generated` with `actions/upload-pages-artifact`. The deploy job uses `actions/deploy-pages` and the `github-pages` environment.

```yaml
name: publish-catalog
on:
  workflow_dispatch:
  schedule:
    - cron: '0 */6 * * *'
  push:
    branches: [main]
    paths: ['catalog/**', 'scripts/catalog-generator.mjs', 'scripts/check-catalog.mjs', '.github/workflows/publish-catalog.yml']
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run test:run
      - run: npm run catalog:generate
      - run: npm run catalog:check
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with: { path: catalog/generated }
  deploy:
    needs: build
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 4: Document operations**

Document the published endpoints, six-hour cadence, manual dispatch, last-known-good behavior, failure visibility, and how to reproduce generation locally.

- [ ] **Step 5: Verify and commit**

Run focused tests and `git diff --check`, then commit with `ci: 发布自动更新音乐目录`.

### Task 4: Extension remote catalog integration

**Files:**
- Modify: `src/background.ts`
- Modify: `src/shared/catalog-refresh.ts`
- Modify: `src/shared/catalog-refresh.test.ts`
- Modify: `public/manifest.json`
- Modify: `README.md`
- Modify: `docs/extension-usage.md`

- [ ] **Step 1: Add failing URL and default-config tests**

Assert remote catalog validation accepts both HTTP and HTTPS and rejects non-HTTP(S) schemes. Assert an injected/default Pages catalog URL is used without changing fallback behavior.

```ts
expect(normalizeCatalogUrl('http://catalog.test/presets.json')).toBe('http://catalog.test/presets.json');
expect(normalizeCatalogUrl('https://catalog.test/presets.json')).toBe('https://catalog.test/presets.json');
expect(normalizeCatalogUrl('file:///tmp/presets.json')).toBeUndefined();
```

- [ ] **Step 2: Verify focused tests fail**

Run `npm test -- src/shared/catalog-refresh.test.ts --run` and confirm the existing HTTPS-only validator is the failing behavior.

- [ ] **Step 3: Implement protocol and Pages integration**

Allow HTTP(S) catalog URLs, retain hostname validation and request timeout, and configure the final GitHub Pages URL after the authenticated owner is known. Add only the required Pages and HTTP(S) audio host permissions; do not request unrelated browser permissions.

- [ ] **Step 4: Verify and commit**

Run focused tests, full tests, and build. Commit only integration files with `feat: 接入远程静态音乐目录`.

### Task 5: Local release audit

**Files:**
- Create: `docs/verification/2026-09-24-static-catalog-publishing.md`

- [ ] **Step 1: Run complete local gates**

Run `npm run test:run`, `npm run catalog:check`, `npm run build`, `git diff --check`, and inspect `git status --short`.

- [ ] **Step 2: Probe live upstream generation**

Run `npm run catalog:generate`, validate every preset has at least the configured number of playable items, and perform bounded HTTP probes against a sample from each category. Record failures distinctly from schema success.

- [ ] **Step 3: Record evidence and critical review**

Document exact commands, counts, known third-party availability risks, and whether local evidence is sufficient to proceed to remote creation. Fix any identified implementation defect, rerun affected gates, and commit the review with `docs: 记录静态目录发布验证`.

### Task 6: GitHub repository and Pages deployment

**Files:**
- Modify: Git remote configuration and GitHub repository settings

- [ ] **Step 1: Install and authenticate GitHub CLI**

Install GitHub CLI with WinGet if still absent. Run `gh auth status`; if authentication is missing, use the browser/device login flow without printing or persisting tokens in repository files.

- [ ] **Step 2: Create the public repository**

Resolve the owner with `gh api user --jq .login`, create that account's `fak-music-plugin` repository as Public with the current repository as source, add `origin`, and push `main`. Do not force-push or overwrite an existing repository.

- [ ] **Step 3: Enable GitHub Pages Actions deployment**

Set Pages build type to GitHub Actions using the GitHub API if it is not established automatically, then manually dispatch `publish-catalog`.

- [ ] **Step 4: Monitor remote checks**

Wait for the workflow and Pages deployment to reach a terminal state. If they fail, inspect logs, fix the scoped cause locally, rerun local gates, commit, push, and re-monitor.

- [ ] **Step 5: Verify anonymous readback**

Fetch the public Pages `presets.json` and `health.json` without credentials, require HTTP 200, validate schema locally, and compare the deployed generation metadata with the workflow output.

- [ ] **Step 6: Verify repository synchronization**

Confirm `main` and `origin/main` point to the same commit, the worktree is clean, the repository is Public, and Pages reports the expected URL. No UI changed, so no screenshot delivery is required.
