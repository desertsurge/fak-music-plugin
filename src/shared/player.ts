import type { PlaybackStatus, StationItem, TrackItem } from './types';

export type PlayableItem = StationItem | TrackItem;
export type PlaybackSource = { streamUrl?: string; audioUrl?: string; backupUrls?: string[] };

export function buildPlaybackCandidates(item: PlaybackSource): string[] {
  const primary = item.streamUrl ?? item.audioUrl;
  if (!primary) return [];
  return [primary, ...(item.backupUrls ?? [])].filter((url, index, urls) => Boolean(url) && urls.indexOf(url) === index);
}

export function nextQueueIndex(currentIndex: number, direction: 1 | -1, length: number): number {
  if (length <= 0) return -1;
  return (currentIndex + direction + length) % length;
}

export function nextPlayableIndex(currentIndex: number, candidateCount: number, direction: 1 | -1, length: number): number {
  if (length <= 1 || candidateCount <= 0) return -1;
  return nextQueueIndex(currentIndex, direction, length);
}

export function nextUnfailedQueueIndex(currentIndex: number, failedIndices: ReadonlySet<number>, direction: 1 | -1, length: number): number {
  if (length <= 0) return -1;
  for (let step = 1; step <= length; step += 1) {
    const index = nextQueueIndex(currentIndex, direction, length);
    currentIndex = index;
    if (!failedIndices.has(index)) return index;
  }
  return -1;
}

export function isCurrentPlaybackId(eventId: string | undefined, activeId: string): boolean {
  return typeof eventId === 'string' && eventId.length > 0 && eventId === activeId;
}

export function shouldAcceptPlaybackLoad(nextId: string, activeId: string | undefined): boolean {
  if (!activeId) return true;
  const [nextSession, nextSequence] = nextId.split(':');
  const [activeSession, activeSequence] = activeId.split(':');
  if (nextSession === activeSession) return Number(nextSequence) > Number(activeSequence);
  return true;
}

export function playbackErrorAction(reason: 'source' | 'autoplay'): 'ADVANCE' | 'ERROR' {
  return reason === 'autoplay' ? 'ERROR' : 'ADVANCE';
}

export type PlaybackFailureResetTrigger = 'playing' | 'PLAY_ITEM' | 'NEXT' | 'PREVIOUS' | 'NEW_PLAYBACK';

export function shouldResetPlaybackFailures(trigger: PlaybackFailureResetTrigger): boolean {
  return trigger !== 'playing';
}

export function playbackLoadTimedOut(startedAt: number, now: number, timeoutMs: number): boolean {
  return now - startedAt >= timeoutMs;
}

export type PlaybackToggleAction = 'PAUSE' | 'PLAY' | 'NEXT';

export function playbackToggleAction(status: PlaybackStatus, hasCurrentItem: boolean): PlaybackToggleAction {
  if (status === 'playing' || status === 'loading') return 'PAUSE';
  return hasCurrentItem ? 'PLAY' : 'NEXT';
}

export function clampVolume(volume: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 1));
}
