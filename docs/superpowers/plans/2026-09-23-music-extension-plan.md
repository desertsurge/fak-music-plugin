# Music Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** Build a Manifest V3 Chrome/Edge extension that plays bundled radio stations and open-license tracks, refreshes catalogs in the background, and remains usable offline.

**Architecture:** Vite builds a React/TypeScript popup. A Manifest V3 service worker owns storage, catalog refresh, and message routing. An offscreen document owns the long-lived `HTMLAudioElement`. The popup renders catalog and player state from the worker.

**Tech Stack:** TypeScript, React, Vite, Vitest, CSS variables, Chrome Extension Manifest V3 APIs.

---

### Task 1: Project foundation and data contracts

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`
- Create: `src/shared/types.ts`, `src/shared/catalog.ts`, `src/shared/catalog.test.ts`
- Create: `public/manifest.json`, `public/presets-fallback.json`

- [ ] Define catalog/player/message types and schema validation.
- [ ] Add tests for invalid entries, missing licenses, and valid station/track entries.
- [ ] Verify tests fail before implementation, then implement minimal validators.
- [ ] Run `npm test -- --run` and `npm run build`.

### Task 2: Playback runtime

**Files:**
- Create: `src/background.ts`, `src/offscreen.html`, `src/offscreen.ts`
- Create: `src/shared/storage.ts`, `src/shared/player.ts`, `src/shared/player.test.ts`
- Modify: `public/manifest.json`

- [ ] Implement storage keys for catalog, queue, favorites, and player state.
- [ ] Implement message routing and offscreen document creation.
- [ ] Implement primary/backup URL retry and next-item fallback.
- [ ] Add tests for retry order, failure skip, and volume bounds.
- [ ] Build and inspect generated extension files.

### Task 3: Popup UI

**Files:**
- Create: `src/popup/main.tsx`, `src/popup/App.tsx`, `src/popup/styles.css`
- Create: `src/popup/components/PlayerBar.tsx`, `src/popup/components/PresetCard.tsx`, `src/popup/components/Sidebar.tsx`
- Create: `src/popup/app.test.tsx`
- Modify: `index.html`, `vite.config.ts`

- [ ] Implement responsive dark UI with recommended, stations, tracks, and favorites views.
- [ ] Implement search, type filter, play actions, favorite actions, and error state.
- [ ] Add keyboard/focus states and reduced-motion support.
- [ ] Add UI tests for view switching, filtering, and play button messages.
- [ ] Run unit tests and production build.

### Task 4: Catalog refresh and resilience

**Files:**
- Create: `src/shared/catalog-refresh.ts`, `src/shared/catalog-refresh.test.ts`
- Modify: `src/background.ts`, `public/manifest.json`, `public/presets-fallback.json`

- [ ] Add configurable remote catalog URL with an empty-safe default.
- [ ] Add alarm-based refresh with eight-second timeout and cache fallback.
- [ ] Reject malformed remote catalogs without overwriting the last good catalog.
- [ ] Add tests for timeout, malformed data, and successful replacement.
- [ ] Re-run all tests and build.

### Task 5: Browser verification and documentation

**Files:**
- Modify: `README.md`
- Create: `docs/extension-usage.md`

- [ ] Load the unpacked `dist` directory in Chromium/Edge.
- [ ] Verify initial render, navigation, filtering, keyboard interaction, and player state.
- [ ] Verify narrow popup layout and no horizontal overflow.
- [ ] Capture a desktop screenshot and record known limitations.
- [ ] Run the final verification command set and report evidence.
