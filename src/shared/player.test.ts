import { describe, expect, it } from 'vitest';
import {
  buildPlaybackCandidates,
  clampVolume,
  isCurrentPlaybackId,
  nextPlayableIndex,
  nextQueueIndex,
  nextUnfailedQueueIndex,
  playbackToggleAction,
  playbackErrorAction,
  shouldAcceptPlaybackLoad,
  shouldResetPlaybackFailures,
  playbackLoadTimedOut,
} from './player';

describe('player helpers', () => {
  it('deduplicates the primary and backup playback URLs', () => {
    expect(buildPlaybackCandidates({ streamUrl: 'https://a.test/live', backupUrls: ['https://a.test/live', 'https://b.test/live'] })).toEqual([
      'https://a.test/live', 'https://b.test/live',
    ]);
  });

  it('wraps queue navigation in both directions', () => {
    expect(nextQueueIndex(0, 1, 3)).toBe(1);
    expect(nextQueueIndex(2, 1, 3)).toBe(0);
    expect(nextQueueIndex(0, -1, 3)).toBe(2);
  });

  it('skips to the next queue item when all playback candidates are exhausted', () => {
    expect(nextPlayableIndex(0, 2, 1, 3)).toBe(1);
    expect(nextPlayableIndex(2, 1, 1, 3)).toBe(0);
    expect(nextPlayableIndex(0, 0, 1, 0)).toBe(-1);
    expect(nextPlayableIndex(0, 2, 1, 1)).toBe(-1);
  });

  it('clamps volume to the browser-safe range', () => {
    expect(clampVolume(-1)).toBe(0);
    expect(clampVolume(0.55)).toBe(0.55);
    expect(clampVolume(4)).toBe(1);
  });

  it('selects the next item that has not failed in the current recovery round', () => {
    expect(nextUnfailedQueueIndex(0, new Set([0]), 1, 3)).toBe(1);
    expect(nextUnfailedQueueIndex(1, new Set([0, 1, 2]), 1, 3)).toBe(-1);
  });

  it('requires a non-empty matching playback token', () => {
    expect(isCurrentPlaybackId('session-a:2', 'session-a:2')).toBe(true);
    expect(isCurrentPlaybackId('session-a:1', 'session-a:2')).toBe(false);
    expect(isCurrentPlaybackId(undefined, 'session-a:2')).toBe(false);
  });

  it('accepts a newer worker session but rejects an older late LOAD', () => {
    expect(shouldAcceptPlaybackLoad('200-session:1', '100-session:4')).toBe(true);
    expect(shouldAcceptPlaybackLoad('100-session:5', '200-session:1')).toBe(true);
    expect(shouldAcceptPlaybackLoad('200-session:2', '200-session:1')).toBe(true);
    expect(shouldAcceptPlaybackLoad('200-session:1', '200-session:2')).toBe(false);
  });

  it('pauses an item while it is loading or playing', () => {
    expect(playbackToggleAction('loading', true)).toBe('PAUSE');
    expect(playbackToggleAction('playing', true)).toBe('PAUSE');
    expect(playbackToggleAction('paused', true)).toBe('PLAY');
    expect(playbackToggleAction('idle', false)).toBe('NEXT');
  });

  it('does not advance the queue for autoplay rejection', () => {
    expect(playbackErrorAction('source')).toBe('ADVANCE');
    expect(playbackErrorAction('autoplay')).toBe('ERROR');
  });

  it('preserves failed items when a candidate starts playing', () => {
    expect(shouldResetPlaybackFailures('playing')).toBe(false);
    expect(shouldResetPlaybackFailures('PLAY_ITEM')).toBe(true);
    expect(shouldResetPlaybackFailures('NEXT')).toBe(true);
    expect(shouldResetPlaybackFailures('PREVIOUS')).toBe(true);
    expect(shouldResetPlaybackFailures('NEW_PLAYBACK')).toBe(true);
  });

  it('detects a stalled playback load at the timeout boundary', () => {
    expect(playbackLoadTimedOut(1000, 8999, 8000)).toBe(false);
    expect(playbackLoadTimedOut(1000, 9000, 8000)).toBe(true);
  });
});
