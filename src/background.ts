import { parseCatalog, flattenPresetItems } from './shared/catalog';
import { reconcileQueueIndex, refreshCatalogState } from './shared/catalog-refresh';
import { buildPlaybackCandidates, clampVolume, isCurrentPlaybackId, nextQueueIndex, nextUnfailedQueueIndex, playbackErrorAction, playbackToggleAction, shouldResetPlaybackFailures } from './shared/player';
import type { PlaybackFailureResetTrigger } from './shared/player';
import type { OffscreenEvent, OffscreenMessage, RuntimeMessage, RuntimeResponse } from './shared/messages';
import type { AppState, Catalog, PlayerState, Preset, StationItem, TrackItem } from './shared/types';
import { DEFAULT_PLAYER, persistState, readPersistedState } from './shared/storage';

// Remote sync is enabled only when the production build provides a maintained HTTPS catalog.
const REMOTE_CATALOG_URL = import.meta.env.VITE_CATALOG_URL ?? '';
const REFRESH_ALARM = 'catalog-refresh';
const PLAYBACK_SESSION = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

let state: AppState | null = null;
let queue: Array<{ preset: Preset; item: StationItem | TrackItem }> = [];
let queueIndex = -1;
let candidateIndex = 0;
let activePlaybackId = '';
let playbackSequence = 0;
const failedQueueIndices = new Set<number>();
let initialized: Promise<void> | null = null;

async function loadFallbackCatalog(): Promise<Catalog> {
  const response = await fetch(chrome.runtime.getURL('presets-fallback.json'));
  if (!response.ok) throw new Error(`Fallback catalog failed: ${response.status}`);
  return parseCatalog(await response.json());
}

async function ensureState(): Promise<AppState> {
  if (state) return state;
  if (!initialized) {
    initialized = loadFallbackCatalog().then(async (fallback) => {
      state = await readPersistedState(fallback);
      queue = flattenPresetItems(state.catalog);
      chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: 60 * 6 });
      void refreshCatalog().catch(() => undefined);
    });
  }
  await initialized;
  if (!state) throw new Error('播放器状态初始化失败');
  return state;
}

async function ensureOffscreen(): Promise<void> {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (contexts.length === 0) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: '持续播放电台和开放授权音乐',
    });
  }
}

function updatePlayer(next: Partial<PlayerState>): void {
  if (!state) return;
  state.player = { ...state.player, ...next };
  void persistState(state);
  chrome.runtime.sendMessage({ type: 'STATE_UPDATED', state }).catch(() => undefined);
}

async function sendToOffscreen(message: OffscreenMessage): Promise<void> {
  await ensureOffscreen();
  await chrome.runtime.sendMessage(message);
}

function resetPlaybackFailures(trigger: PlaybackFailureResetTrigger): void {
  if (shouldResetPlaybackFailures(trigger)) failedQueueIndices.clear();
}

async function playCurrent(): Promise<void> {
  if (!state || queueIndex < 0 || !queue[queueIndex]) return;
  const entry = queue[queueIndex];
  const item = entry.item;
  const candidates = buildPlaybackCandidates(item);
  const url = candidates[candidateIndex];
  if (!url) {
    failedQueueIndices.add(queueIndex);
    queueIndex = nextUnfailedQueueIndex(queueIndex, failedQueueIndices, 1, queue.length);
    candidateIndex = 0;
    if (queueIndex < 0) updatePlayer({ status: 'error', error: '没有可播放的音频' });
    else await playCurrent();
    return;
  }
  const playbackId = `${PLAYBACK_SESSION}:${++playbackSequence}`;
  activePlaybackId = playbackId;
  updatePlayer({
    status: 'loading',
    currentItemId: item.id,
    currentPresetId: entry.preset.id,
    currentTitle: item.title,
    currentArtist: 'artist' in item ? item.artist : entry.preset.name,
    currentArtworkUrl: 'artworkUrl' in item ? item.artworkUrl : undefined,
    error: undefined,
    position: 0,
    duration: 0,
  });
  await sendToOffscreen({ type: 'LOAD', url, volume: state.player.volume, playbackId });
}

async function goToNext(direction: 1 | -1, resetTrigger?: PlaybackFailureResetTrigger): Promise<void> {
  if (!state || queue.length === 0) return;
  if (resetTrigger) resetPlaybackFailures(resetTrigger);
  queueIndex = nextQueueIndex(queueIndex < 0 ? -1 : queueIndex, direction, queue.length);
  candidateIndex = 0;
  await playCurrent();
}

async function playItem(presetId: string, itemId: string): Promise<void> {
  if (!state) return;
  const index = queue.findIndex(({ preset, item }) => preset.id === presetId && item.id === itemId);
  if (index < 0) return;
  resetPlaybackFailures('PLAY_ITEM');
  queueIndex = index;
  candidateIndex = 0;
  await playCurrent();
}

async function refreshCatalog(): Promise<{ ok: true } | { ok: false; error: string }> {
  const current = await ensureState();
  const currentItemId = current.player.currentItemId;
  const result = await refreshCatalogState(current, queue, REMOTE_CATALOG_URL);
  if (!result.ok) return result;
  queueIndex = reconcileQueueIndex(queue, currentItemId);
  candidateIndex = 0;
  failedQueueIndices.clear();
  await persistState(current);
  chrome.runtime.sendMessage({ type: 'CATALOG_UPDATED', state: current }).catch(() => undefined);
  return result;
}

async function handleMessage(message: RuntimeMessage | OffscreenEvent): Promise<RuntimeResponse | void> {
  const current = await ensureState();
  if (message.type === 'OFFSCREEN_EVENT') {
    if (!isCurrentPlaybackId(message.playbackId, activePlaybackId)) return;
    if (message.event === 'error') {
      if (playbackErrorAction(message.reason) === 'ERROR') {
        updatePlayer({ status: 'error', error: message.message });
        return;
      }
      candidateIndex += 1;
      const item = queue[queueIndex]?.item;
      if (item && candidateIndex < buildPlaybackCandidates(item).length) {
        await playCurrent();
      } else {
        failedQueueIndices.add(queueIndex);
        queueIndex = nextUnfailedQueueIndex(queueIndex, failedQueueIndices, 1, queue.length);
        candidateIndex = 0;
        if (queueIndex < 0) updatePlayer({ status: 'error', error: message.message });
        else await playCurrent();
      }
    } else if (message.event === 'ended') {
      await goToNext(1);
    } else {
      updatePlayer({
        status: message.event,
        duration: message.duration ?? current.player.duration,
        position: message.position ?? current.player.position,
      });
    }
    return;
  }
  switch (message.type) {
    case 'GET_STATE':
      return current;
    case 'PLAY_ITEM':
      await playItem(message.presetId, message.itemId);
      return current;
    case 'TOGGLE_PLAY':
      if (playbackToggleAction(current.player.status, Boolean(current.player.currentItemId)) === 'PAUSE') {
        await sendToOffscreen({ type: 'PAUSE' });
      } else if (playbackToggleAction(current.player.status, Boolean(current.player.currentItemId)) === 'PLAY') {
        await sendToOffscreen({ type: 'PLAY' });
      } else {
        await goToNext(1, 'NEW_PLAYBACK');
      }
      return current;
    case 'NEXT':
      await goToNext(1, 'NEXT');
      return current;
    case 'PREVIOUS':
      await goToNext(-1, 'PREVIOUS');
      return current;
    case 'SET_VOLUME':
      current.player.volume = clampVolume(message.volume);
      await sendToOffscreen({ type: 'SET_VOLUME', volume: current.player.volume });
      await persistState(current);
      return current;
    case 'TOGGLE_FAVORITE':
      current.favorites = current.favorites.includes(message.itemId)
        ? current.favorites.filter((id) => id !== message.itemId)
        : [...current.favorites, message.itemId];
      await persistState(current);
      return current;
    case 'REFRESH_CATALOG':
      return refreshCatalog();
  }
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage | OffscreenEvent, _sender: unknown, sendResponse: (response: RuntimeResponse) => void) => {
  void handleMessage(message).then((response) => {
    if (response) sendResponse(response);
  }).catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : '操作失败' }));
  return true;
});

chrome.alarms.onAlarm.addListener((alarm: { name: string }) => {
  if (alarm.name === REFRESH_ALARM) void refreshCatalog();
});

void ensureState().catch(() => {
  state = {
    catalog: { schemaVersion: 1, generatedAt: new Date().toISOString(), presets: [] },
    catalogSource: 'fallback',
    favorites: [],
    player: DEFAULT_PLAYER,
    activePresetId: '',
  };
});
