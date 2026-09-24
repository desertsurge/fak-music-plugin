import { describe, expect, it, vi } from 'vitest';
import { fetchRemoteCatalog, normalizeCatalogUrl, reconcileQueueIndex, refreshCatalogState, resolveCatalogUrl, shouldRefreshCatalog, type Fetcher } from './catalog-refresh';

const validPayload = {
  schemaVersion: 1,
  generatedAt: '2026-09-23T00:00:00Z',
  presets: [{ id: 'radio', name: 'Radio', type: 'station', source: 'test', items: [{ id: 'one', title: 'One', streamUrl: 'https://example.com/one.mp3' }] }],
};

const cachedState = () => ({
  catalog: {
    schemaVersion: 1,
    generatedAt: '2026-09-22T00:00:00Z',
    presets: [{ id: 'cached', name: 'Cached', type: 'station' as const, source: 'cache', items: [{ id: 'old', title: 'Old', streamUrl: 'https://example.com/old.mp3' }] }],
  },
  catalogSource: 'cache' as const,
});

const cachedQueue = (state: ReturnType<typeof cachedState>) => [{
  preset: state.catalog.presets[0]!,
  item: state.catalog.presets[0]!.items[0]!,
}];

describe('catalog URL configuration', () => {
  it('normalizes HTTP(S) URLs and rejects empty, malformed, or unsupported values', () => {
    expect(normalizeCatalogUrl('  https://catalog.test/presets.json  ')).toBe('https://catalog.test/presets.json');
    expect(normalizeCatalogUrl('http://catalog.test/presets.json')).toBe('http://catalog.test/presets.json');
    expect(normalizeCatalogUrl('')).toBeUndefined();
    expect(normalizeCatalogUrl('file:///tmp/presets.json')).toBeUndefined();
    expect(normalizeCatalogUrl('ftp://catalog.test/presets.json')).toBeUndefined();
    expect(normalizeCatalogUrl('not a URL')).toBeUndefined();
    expect(shouldRefreshCatalog('https://catalog.test/presets.json')).toBe(true);
    expect(shouldRefreshCatalog('http://catalog.test/presets.json')).toBe(true);
    expect(shouldRefreshCatalog('')).toBe(false);
  });

  it('uses an injected catalog URL before the Pages default', () => {
    expect(resolveCatalogUrl('https://override.test/presets.json', 'https://owner.github.io/fak-music-plugin/presets.json')).toBe('https://override.test/presets.json');
    expect(resolveCatalogUrl(undefined, 'https://owner.github.io/fak-music-plugin/presets.json')).toBe('https://owner.github.io/fak-music-plugin/presets.json');
  });
});

describe('fetchRemoteCatalog', () => {
  it('returns a validated catalog on a successful response', async () => {
    const result = await fetchRemoteCatalog('https://catalog.test/presets.json', async () => new Response(JSON.stringify(validPayload), { status: 200 }));
    expect(result.catalog.presets[0]?.id).toBe('radio');
  });

  it('does not accept malformed responses', async () => {
    await expect(fetchRemoteCatalog('https://catalog.test/presets.json', async () => new Response('{"schemaVersion":2}', { status: 200 }))).rejects.toThrow('Unsupported catalog schema');
  });

  it('times out slow sources', async () => {
    await expect(fetchRemoteCatalog('https://catalog.test/presets.json', () => new Promise<Response>(() => undefined), 5)).rejects.toThrow('Catalog request timed out');
  });
});

describe('refreshCatalogState', () => {
  it('reconciles the current queue index by item id after catalog reorder', () => {
    const state = cachedState();
    const queue = cachedQueue(state);
    queue.unshift({ preset: state.catalog.presets[0]!, item: { id: 'new', title: 'New', streamUrl: 'https://example.com/new.mp3' } });

    expect(reconcileQueueIndex(queue, 'old')).toBe(1);
    expect(reconcileQueueIndex(queue, 'removed')).toBe(-1);
  });

  it('skips the remote request and reports local state when no URL is configured', async () => {
    const state = cachedState();
    const queue = cachedQueue(state);
    const fetcher = vi.fn<Fetcher>();

    const result = await refreshCatalogState(state, queue, '', fetcher);

    expect(result).toEqual({ ok: true, source: 'local' });
    expect(fetcher).not.toHaveBeenCalled();
    expect(state.catalogSource).toBe('cache');
    expect(queue.map(({ item }) => item.id)).toEqual(['old']);
  });

  it('loads a configured HTTP catalog', async () => {
    const state = cachedState();
    const queue = cachedQueue(state);
    const fetcher = vi.fn<Fetcher>(async () => new Response(JSON.stringify(validPayload), { status: 200 }));

    const result = await refreshCatalogState(state, queue, 'http://catalog.test/presets.json', fetcher);

    expect(result).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledWith('http://catalog.test/presets.json', expect.objectContaining({ cache: 'no-store' }));
    expect(state.catalogSource).toBe('remote');
  });

  it('replaces catalog, source, and queue only after a successful injected fetch', async () => {
    const state = cachedState();
    const queue = cachedQueue(state);
    const result = await refreshCatalogState(state, queue, 'https://catalog.test/injected.json', async (url) => {
      expect(url).toBe('https://catalog.test/injected.json');
      return new Response(JSON.stringify(validPayload), { status: 200 });
    });

    expect(result).toEqual({ ok: true });
    expect(state.catalog.presets[0]?.id).toBe('radio');
    expect(state.catalogSource).toBe('remote');
    expect(queue.map(({ item }) => item.id)).toEqual(['one']);
  });

  it('keeps the previous catalog, source, and queue when the remote request times out', async () => {
    const state = cachedState();
    const queue = cachedQueue(state);
    const result = await refreshCatalogState(state, queue, 'https://catalog.test/slow.json', () => new Promise<Response>(() => undefined), 5);

    expect(result).toEqual({ ok: false, error: 'Catalog request timed out' });
    expect(state.catalog.presets[0]?.id).toBe('cached');
    expect(state.catalogSource).toBe('cache');
    expect(queue.map(({ item }) => item.id)).toEqual(['old']);
  });

  it('keeps the previous catalog, source, and queue when the remote format is invalid', async () => {
    const state = cachedState();
    const queue = cachedQueue(state);
    const result = await refreshCatalogState(state, queue, 'https://catalog.test/invalid.json', async () => new Response('{"schemaVersion":2}', { status: 200 }));

    expect(result).toEqual({ ok: false, error: 'Unsupported catalog schema' });
    expect(state.catalog.presets[0]?.id).toBe('cached');
    expect(state.catalogSource).toBe('cache');
    expect(queue.map(({ item }) => item.id)).toEqual(['old']);
  });

  it('keeps the previous catalog, source, and queue when the remote request fails', async () => {
    const state = cachedState();
    const queue = cachedQueue(state);
    const result = await refreshCatalogState(state, queue, 'https://catalog.test/failing.json', async () => {
      throw new Error('network unavailable');
    });

    expect(result).toEqual({ ok: false, error: 'network unavailable' });
    expect(state.catalog.presets[0]?.id).toBe('cached');
    expect(state.catalogSource).toBe('cache');
    expect(queue.map(({ item }) => item.id)).toEqual(['old']);
  });
});
