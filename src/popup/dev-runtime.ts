import { flattenPresetItems } from '../shared/catalog';
import type { RuntimeMessage, RuntimeResponse } from '../shared/messages';
import { buildPlaybackCandidates, clampVolume, nextQueueIndex } from '../shared/player';
import type { AppState, PlayerState, StationItem, TrackItem } from '../shared/types';

type PlayableEntry = { preset: AppState['catalog']['presets'][number]; item: StationItem | TrackItem };

export interface LocalRuntime {
  request(message: RuntimeMessage): RuntimeResponse;
  subscribe(callback: (state: AppState) => void): () => void;
}

export function createLocalRuntime(initialState: AppState, audio: HTMLAudioElement): LocalRuntime {
  const listeners = new Set<(state: AppState) => void>();
  let state = initialState;
  let queue: PlayableEntry[] = flattenPresetItems(state.catalog);
  let queueIndex = -1;

  const notify = () => listeners.forEach((listener) => listener(state));
  const updatePlayer = (next: Partial<PlayerState>) => {
    state = { ...state, player: { ...state.player, ...next } };
    notify();
  };
  const playEntry = (index: number): void => {
    const entry = queue[index];
    if (!entry) return;
    queueIndex = index;
    const url = buildPlaybackCandidates(entry.item)[0];
    if (!url) {
      updatePlayer({ status: 'error', error: '没有可播放的音频' });
      return;
    }
    audio.pause();
    audio.src = url;
    audio.volume = state.player.volume;
    updatePlayer({
      status: 'playing',
      currentItemId: entry.item.id,
      currentPresetId: entry.preset.id,
      currentTitle: entry.item.title,
      currentArtist: 'artist' in entry.item ? entry.item.artist : entry.preset.name,
      currentArtworkUrl: 'artworkUrl' in entry.item ? entry.item.artworkUrl : undefined,
      position: 0,
      duration: 0,
      error: undefined,
    });
    Promise.resolve(audio.play()).catch(() => updatePlayer({ status: 'error', error: '音频源无法播放' }));
  };

  audio.addEventListener?.('timeupdate', () => updatePlayer({ position: audio.currentTime, duration: Number.isFinite(audio.duration) ? audio.duration : 0 }));
  audio.addEventListener?.('ended', () => {
    if (queue.length > 0) playEntry(nextQueueIndex(queueIndex, 1, queue.length));
  });
  audio.addEventListener?.('error', () => updatePlayer({ status: 'error', error: '音频源无法播放' }));

  return {
    request(message) {
      switch (message.type) {
        case 'GET_STATE': return state;
        case 'PLAY_ITEM': {
          const index = queue.findIndex(({ preset, item }) => preset.id === message.presetId && item.id === message.itemId);
          if (index >= 0) playEntry(index);
          return state;
        }
        case 'TOGGLE_PLAY':
          if (state.player.status === 'playing') {
            audio.pause();
            updatePlayer({ status: 'paused' });
          } else if (state.player.currentItemId) {
            Promise.resolve(audio.play()).catch(() => updatePlayer({ status: 'error', error: '音频源无法播放' }));
            updatePlayer({ status: 'playing', error: undefined });
          } else if (queue.length > 0) {
            playEntry(0);
          }
          return state;
        case 'NEXT':
          if (queue.length > 0) playEntry(nextQueueIndex(queueIndex, 1, queue.length));
          return state;
        case 'PREVIOUS':
          if (queue.length > 0) playEntry(nextQueueIndex(queueIndex, -1, queue.length));
          return state;
        case 'SET_VOLUME':
          state = { ...state, player: { ...state.player, volume: clampVolume(message.volume) } };
          audio.volume = state.player.volume;
          notify();
          return state;
        case 'TOGGLE_FAVORITE':
          state = { ...state, favorites: state.favorites.includes(message.itemId) ? state.favorites.filter((id) => id !== message.itemId) : [...state.favorites, message.itemId] };
          notify();
          return state;
        case 'REFRESH_CATALOG':
          return { ok: true, source: 'local' };
      }
    },
    subscribe(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
  };
}
