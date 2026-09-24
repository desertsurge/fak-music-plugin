import { describe, expect, it } from 'vitest';
import { refreshErrorMessage } from './refresh';

describe('refresh feedback', () => {
  it('exposes a failed refresh response and clears successful feedback', () => {
    expect(refreshErrorMessage({ ok: false, error: '网络不可用' })).toBe('网络不可用');
    expect(refreshErrorMessage({ ok: true })).toBeUndefined();
  });
});
