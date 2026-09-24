import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import type { AppState, Preset, StationItem, TrackItem } from '../shared/types';
import type { RuntimeMessage } from '../shared/messages';
import { flattenPresetItems } from '../shared/catalog';
import { loadInitialState, request, subscribeToState } from './api';
import { refreshErrorMessage } from './refresh';
import { PlayerBar } from './components/PlayerBar';
import { PresetCard } from './components/PresetCard';
import { Sidebar, type ViewId } from './components/Sidebar';

export type ItemFilter = 'all' | 'stations' | 'tracks';

export function filterCatalogEntries(state: AppState, view: ViewId, query: string, typeFilter: ItemFilter) {
  const normalizedQuery = query.trim().toLowerCase();
  return flattenPresetItems(state.catalog).filter(({ preset, item }) => {
    if (typeFilter === 'stations' && preset.type !== 'station') return false;
    if (typeFilter === 'tracks' && preset.type !== 'tracks') return false;
    if (view === 'stations' && preset.type !== 'station') return false;
    if (view === 'tracks' && preset.type !== 'tracks') return false;
    if (view === 'favorites' && !state.favorites.includes(item.id)) return false;
    if (!normalizedQuery) return true;
    const text = `${preset.name} ${item.title} ${'artist' in item ? item.artist : ''} ${item.tags?.join(' ') ?? ''}`.toLowerCase();
    return text.includes(normalizedQuery);
  });
}

export function playMessageForItem(state: AppState, preset: Preset, item: StationItem | TrackItem): RuntimeMessage {
  const isCurrent = state.player.currentItemId === item.id && (state.player.status === 'playing' || state.player.status === 'loading');
  return isCurrent ? { type: 'TOGGLE_PLAY' } : { type: 'PLAY_ITEM', presetId: preset.id, itemId: item.id };
}

export function retryCurrentMessage(player: AppState['player']): RuntimeMessage | undefined {
  if (!player.currentPresetId || !player.currentItemId) return undefined;
  return { type: 'PLAY_ITEM', presetId: player.currentPresetId, itemId: player.currentItemId };
}

export function isAppState(value: unknown): value is AppState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AppState>;
  const catalog = candidate.catalog;
  const player = candidate.player;
  return Boolean(
    catalog && typeof catalog === 'object' && Array.isArray(catalog.presets) &&
    player && typeof player === 'object' && typeof player.status === 'string' &&
    Array.isArray(candidate.favorites) && typeof candidate.activePresetId === 'string' &&
    (candidate.catalogSource === 'fallback' || candidate.catalogSource === 'cache' || candidate.catalogSource === 'remote'),
  );
}

const FILTER_OPTIONS: Array<{ value: ItemFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'stations', label: '电台' },
  { value: 'tracks', label: '单曲' },
];

function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [view, setView] = useState<ViewId>('recommended');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<ItemFilter>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | undefined>();

  useEffect(() => {
    void loadInitialState()
      .then((next) => {
        if (isAppState(next)) setState(next);
        else setRefreshError('无法读取音乐状态');
      })
      .catch((error) => setRefreshError(error instanceof Error ? error.message : '无法读取音乐状态'));
    return subscribeToState(setState);
  }, []);

  const entries = useMemo(() => {
    if (!state) return [];
    return filterCatalogEntries(state, view, query, typeFilter);
  }, [state, view, query, typeFilter]);

  if (!state) return <div className="loading-screen"><div className="loading-mark">♪</div>{refreshError ? <p role="alert">{refreshError}</p> : <p>正在准备你的音乐空间</p>}</div>;

  const applyResponse = (response: unknown, fallback: string) => {
    if (isAppState(response)) {
      setState(response);
      setRefreshError(undefined);
      return true;
    }
    const failure = response && typeof response === 'object' ? response as { ok?: unknown; error?: unknown } : undefined;
    if (failure?.ok === false && typeof failure.error === 'string') {
      setRefreshError(failure.error);
      return false;
    }
    setRefreshError(fallback);
    return false;
  };
  const requestAndApply = async (message: RuntimeMessage, fallback: string) => {
    try {
      applyResponse(await request(message), fallback);
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : fallback);
    }
  };
  const playItem = (preset: Preset, item: StationItem | TrackItem) => {
    const message = playMessageForItem(state, preset, item);
    void requestAndApply(message, '播放操作失败');
  };
  const toggleFavorite = (itemId: string) => void requestAndApply({ type: 'TOGGLE_FAVORITE', itemId }, '收藏操作失败');
  const retryCurrent = () => {
    const message = retryCurrentMessage(state.player);
    if (message) void requestAndApply(message, '重试播放失败');
  };
  const refresh = async () => {
    setRefreshing(true);
    setRefreshError(undefined);
    try {
      const result = await request({ type: 'REFRESH_CATALOG' });
      const error = refreshErrorMessage(result);
      setRefreshError(error);
      if (error) return;
      const next = await request({ type: 'GET_STATE' });
      applyResponse(next, '目录状态读取失败');
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : '目录更新失败');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="app-shell">
      <Sidebar view={view} onChange={setView} />
      <main className="main-content">
        <header className="topbar">
          <div><span className="kicker">YOUR DAILY SOUNDTRACK</span><h1>{view === 'recommended' ? '为你准备好了' : view === 'stations' ? '网络电台' : view === 'tracks' ? '开放授权单曲' : '你的收藏'}</h1></div>
          <button className={`refresh-button ${refreshing ? 'is-refreshing' : ''}`} type="button" onClick={() => void refresh()} aria-label="更新目录" title="更新目录" disabled={refreshing}><RefreshCw size={15} /><span>{state.catalogSource === 'remote' ? '已同步' : '本地目录'}</span></button>
          {refreshError && <div className="refresh-feedback" role="alert"><span>{refreshError}</span><button type="button" aria-label="重试更新目录" onClick={() => void refresh()}>重试</button></div>}
        </header>
        <section className="search-row"><div className="search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索电台、单曲或风格" aria-label="搜索音乐" /></div><div className="filter-control"><button className="filter-button" type="button" aria-label="筛选" title="筛选" aria-haspopup="menu" aria-expanded={filterOpen} aria-controls="catalog-filter-menu" onClick={() => setFilterOpen((open) => !open)}><SlidersHorizontal size={15} /></button>{filterOpen && <div id="catalog-filter-menu" className="filter-menu" role="menu" aria-label="内容筛选" onKeyDown={(event) => { if (event.key === 'Escape') setFilterOpen(false); }}>{FILTER_OPTIONS.map(({ value, label }) => <button key={value} type="button" role="menuitemradio" aria-label={label} aria-checked={typeFilter === value} onClick={() => { setTypeFilter(value); setFilterOpen(false); }}>{label}</button>)}</div>}</div></section>
        {view === 'recommended' && <section className="welcome-panel"><div><span className="panel-kicker">READY WHEN YOU ARE</span><h2>今天想听点什么？</h2><p>从持续播放的电台，到可以随时切换的开放音乐。</p></div><div className="sound-wave" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div></section>}
        <div className="list-heading"><div><span className="section-kicker">{view === 'favorites' ? 'SAVED FOR LATER' : 'CURATED FOR YOU'}</span><h2>{view === 'recommended' ? '快速开始' : `${entries.length} 个结果`}</h2></div><span className="source-note">{state.catalogSource === 'remote' ? '目录已自动更新' : '使用内置快照'}</span></div>
        {entries.length ? <div className="preset-grid">{entries.map(({ preset, item }) => <PresetCard key={`${preset.id}-${item.id}`} preset={preset} item={item} isPlaying={state.player.currentItemId === item.id && (state.player.status === 'playing' || state.player.status === 'loading')} isFavorite={state.favorites.includes(item.id)} onPlay={() => playItem(preset, item)} onFavorite={() => toggleFavorite(item.id)} />)}</div> : <div className="empty-state"><span>♪</span><h3>还没有匹配内容</h3><p>试试其他关键词，或稍后刷新目录。</p></div>}
      </main>
      <PlayerBar player={state.player} onToggle={() => void requestAndApply({ type: 'TOGGLE_PLAY' }, '播放操作失败')} onRetry={retryCurrent} onNext={() => void requestAndApply({ type: 'NEXT' }, '切换下一项失败')} onPrevious={() => void requestAndApply({ type: 'PREVIOUS' }, '切换上一项失败')} onVolume={(volume) => void requestAndApply({ type: 'SET_VOLUME', volume }, '音量调整失败')} />
    </div>
  );
}

export default App;
