import { flattenPresetItems, parseCatalog } from './catalog';
import type { AppState, Catalog, Preset, StationItem, TrackItem } from './types';

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
export type CatalogQueue = Array<{ preset: Preset; item: StationItem | TrackItem }>;
export type CatalogRefreshResult = { ok: true; source?: 'local' } | { ok: false; error: string };

export function reconcileQueueIndex(queue: CatalogQueue, currentItemId?: string): number {
  if (!currentItemId) return -1;
  return queue.findIndex(({ item }) => item.id === currentItemId);
}

export function normalizeCatalogUrl(input: unknown): string | undefined {
  const value = typeof input === 'string' ? input.trim() : '';
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) return undefined;
  } catch {
    return undefined;
  }
  return value;
}

export function resolveCatalogUrl(configuredUrl: unknown, defaultUrl: string): string {
  return normalizeCatalogUrl(configuredUrl) ?? defaultUrl;
}

export function shouldRefreshCatalog(input: unknown): boolean {
  return normalizeCatalogUrl(input) !== undefined;
}

export async function fetchRemoteCatalog(url: string, fetcher: Fetcher = fetch, timeoutMs = 8000): Promise<{ catalog: Catalog; fetchedAt: string }> {
  const normalizedUrl = normalizeCatalogUrl(url);
  if (!normalizedUrl) throw new Error('Catalog URL must use HTTP or HTTPS');
  const controller = new AbortController();
  const request = fetcher(normalizedUrl, { signal: controller.signal, cache: 'no-store' });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => {
    controller.abort();
    reject(new Error('Catalog request timed out'));
  }, timeoutMs); });
  try {
    const response = await Promise.race([request, timeout]);
    if (!response.ok) throw new Error(`Catalog request failed: HTTP ${response.status}`);
    const catalog = parseCatalog(await response.json());
    return { catalog, fetchedAt: new Date().toISOString() };
  } catch (error) {
    if (controller.signal.aborted && !(error instanceof Error && error.message === 'Catalog request timed out')) throw new Error('Catalog request timed out');
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function refreshCatalogState(
  state: Pick<AppState, 'catalog' | 'catalogSource'>,
  queue: CatalogQueue,
  url: string,
  fetcher: Fetcher = fetch,
  timeoutMs = 8000,
): Promise<CatalogRefreshResult> {
  if (typeof url !== 'string' || url.trim().length === 0) return { ok: true, source: 'local' };
  if (!shouldRefreshCatalog(url)) return { ok: false, error: 'Catalog URL must use HTTP or HTTPS' };
  try {
    const { catalog } = await fetchRemoteCatalog(url, fetcher, timeoutMs);
    const nextQueue = flattenPresetItems(catalog);
    state.catalog = catalog;
    state.catalogSource = 'remote';
    queue.splice(0, queue.length, ...nextQueue);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '目录更新失败' };
  }
}
