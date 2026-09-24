export type PresetType = 'station' | 'tracks';

export interface StationItem {
  id: string;
  title: string;
  streamUrl: string;
  backupUrls?: string[];
  codec?: string;
  homepage?: string;
  country?: string;
  tags?: string[];
  lastCheckedAt?: string;
}

export interface TrackItem {
  id: string;
  title: string;
  artist: string;
  audioUrl: string;
  backupUrls?: string[];
  album?: string;
  artworkUrl?: string;
  license: string;
  sourceUrl: string;
  attribution?: string;
  tags?: string[];
}

export interface StationPreset {
  id: string;
  name: string;
  description?: string;
  type: 'station';
  source: string;
  items: StationItem[];
}

export interface TrackPreset {
  id: string;
  name: string;
  description?: string;
  type: 'tracks';
  source: string;
  items: TrackItem[];
}

export type Preset = StationPreset | TrackPreset;

export interface Catalog {
  schemaVersion: number;
  generatedAt: string;
  presets: Preset[];
}

export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export interface PlayerState {
  status: PlaybackStatus;
  currentItemId?: string;
  currentPresetId?: string;
  currentTitle?: string;
  currentArtist?: string;
  currentArtworkUrl?: string;
  position: number;
  duration: number;
  volume: number;
  error?: string;
}

export interface AppState {
  catalog: Catalog;
  player: PlayerState;
  favorites: string[];
  activePresetId: string;
  catalogSource: 'fallback' | 'cache' | 'remote';
}
