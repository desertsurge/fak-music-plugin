// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '../shared/types';
import App, { filterCatalogEntries, isAppState, playMessageForItem, retryCurrentMessage } from './App';
import { loadInitialState, request, subscribeToState } from './api';
import { mobilePlayerSafeArea } from './layout';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('./api', () => ({
  loadInitialState: vi.fn(),
  request: vi.fn(),
  subscribeToState: vi.fn(() => () => undefined),
}));

const catalog = {
  schemaVersion: 1,
  generatedAt: '2026-09-23T00:00:00Z',
  presets: [
    {
      id: 'radio', name: 'Radio', type: 'station' as const, source: 'test',
      items: [{ id: 'station-1', title: 'Jazz FM', streamUrl: 'https://example.com/jazz.mp3', tags: ['jazz'] }],
    },
    {
      id: 'tracks', name: 'Tracks', type: 'tracks' as const, source: 'test',
      items: [{ id: 'track-1', title: 'Blue Hour', artist: 'A. Artist', audioUrl: 'https://example.com/blue.mp3', license: 'CC BY 4.0', sourceUrl: 'https://example.com/blue', tags: ['ambient'] }],
    },
  ],
};

const initialState: AppState = {
  catalog,
  catalogSource: 'cache',
  favorites: [],
  activePresetId: 'radio',
  player: { status: 'playing', currentPresetId: 'radio', currentItemId: 'station-1', currentTitle: 'Jazz FM', position: 0, duration: 0, volume: 0.8 },
};

const cloneState = (): AppState => structuredClone(initialState);

let renderedRoot: Root | undefined;

describe('popup filters and playback actions', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    vi.mocked(loadInitialState).mockResolvedValue(cloneState());
    vi.mocked(request).mockResolvedValue(cloneState());
    vi.mocked(subscribeToState).mockReturnValue(() => undefined);
  });

  afterEach(() => {
    act(() => renderedRoot?.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it('combines type filter, view, and query when selecting catalog entries', () => {
    expect(filterCatalogEntries(initialState, 'recommended', '', 'all').map(({ item }) => item.id)).toEqual(['station-1', 'track-1']);
    expect(filterCatalogEntries(initialState, 'recommended', '', 'stations').map(({ item }) => item.id)).toEqual(['station-1']);
    expect(filterCatalogEntries(initialState, 'recommended', 'blue', 'tracks').map(({ item }) => item.id)).toEqual(['track-1']);
    expect(filterCatalogEntries({ ...initialState, favorites: ['track-1'] }, 'favorites', 'blue', 'all').map(({ item }) => item.id)).toEqual(['track-1']);
  });

  it('uses TOGGLE_PLAY for a current playing/loading card and PLAY_ITEM otherwise', () => {
    const station = initialState.catalog.presets[0]!;
    const track = initialState.catalog.presets[1]!;
    expect(playMessageForItem(initialState, station, station.items[0]!)).toEqual({ type: 'TOGGLE_PLAY' });
    expect(playMessageForItem({ ...initialState, player: { ...initialState.player, status: 'loading' } }, station, station.items[0]!)).toEqual({ type: 'TOGGLE_PLAY' });
    expect(playMessageForItem(initialState, track, track.items[0]!)).toEqual({ type: 'PLAY_ITEM', presetId: 'tracks', itemId: 'track-1' });
  });

  it('retries the current failed item with PLAY_ITEM instead of toggling', () => {
    expect(retryCurrentMessage({ ...initialState.player, status: 'error', currentPresetId: 'radio', currentItemId: 'station-1' })).toEqual({ type: 'PLAY_ITEM', presetId: 'radio', itemId: 'station-1' });
    expect(retryCurrentMessage({ ...initialState.player, status: 'error', currentPresetId: undefined, currentItemId: undefined })).toBeUndefined();
  });

  it('accepts only complete AppState responses before applying them', () => {
    expect(isAppState(initialState)).toBe(true);
    expect(isAppState({ ok: false, error: '网络不可用' })).toBe(false);
    expect(isAppState({ catalog: {}, player: {}, favorites: [], activePresetId: '', catalogSource: 'cache' })).toBe(false);
  });

  it('opens an accessible filter menu and filters cards by type', async () => {
    await renderApp(container);

    const filterButton = container.querySelector<HTMLButtonElement>('button[aria-label="筛选"]');
    expect(filterButton).toBeTruthy();
    await click(filterButton!);
    expect(container.querySelector('[role="menu"]')).toBeTruthy();

    const stationOption = container.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-label="电台"]');
    expect(stationOption?.getAttribute('aria-checked')).toBe('false');
    await click(stationOption!);
    expect(container.querySelectorAll('.preset-card h3')).toHaveLength(1);
    expect(container.querySelector('.preset-card h3')?.textContent).toBe('Jazz FM');
  });

  it('sends card-specific playback messages', async () => {
    await renderApp(container);
    await click(container.querySelector<HTMLButtonElement>('button[aria-label="暂停"]')!);
    expect(request).toHaveBeenCalledWith({ type: 'TOGGLE_PLAY' });

    await click(container.querySelector<HTMLButtonElement>('button[aria-label="播放 Blue Hour"]')!);
    expect(request).toHaveBeenCalledWith({ type: 'PLAY_ITEM', presetId: 'tracks', itemId: 'track-1' });
  });

  it('keeps the old catalog and exposes a retry action after refresh failure', async () => {
    vi.mocked(request).mockImplementation(async (message) => {
      if (message.type === 'REFRESH_CATALOG') return { ok: false, error: '网络不可用' };
      return cloneState();
    });
    await renderApp(container);
    await click(container.querySelector<HTMLButtonElement>('button[aria-label="更新目录"]')!);

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('网络不可用');
    expect(container.querySelector('button[aria-label="重试更新目录"]')).toBeTruthy();
    expect(container.querySelector('.preset-card h3')?.textContent).toBe('Jazz FM');
    expect(container.querySelector('button[aria-label="更新目录"]')?.classList.contains('is-refreshing')).toBe(false);
  });

  it('shows a readable playback error and retries the current source', async () => {
    const failedState = cloneState();
    failedState.player.status = 'error';
    failedState.player.error = '音频源不可用';
    vi.mocked(loadInitialState).mockResolvedValue(failedState);
    vi.mocked(request).mockImplementation(async (message) => {
      if (message.type === 'PLAY_ITEM') return cloneState();
      return failedState;
    });
    await renderApp(container);

    expect(container.querySelector('.player-error')?.textContent).toContain('音频源不可用');
    await click(container.querySelector<HTMLButtonElement>('button[aria-label="重试播放"]')!);
    expect(request).toHaveBeenCalledWith({ type: 'PLAY_ITEM', presetId: 'radio', itemId: 'station-1' });
  });

  it('shows a readable error when initial state loading fails', async () => {
    vi.mocked(loadInitialState).mockRejectedValue(new Error('状态服务不可用'));
    await renderApp(container);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('状态服务不可用');
  });

  it('reserves enough mobile space for the two-row fixed player bar', () => {
    expect(mobilePlayerSafeArea()).toBe(136);
  });
});

async function renderApp(container: HTMLDivElement) {
  renderedRoot = createRoot(container);
  await act(async () => {
    renderedRoot?.render(<App />);
    await Promise.resolve();
  });
}

async function click(element: HTMLElement) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
}
