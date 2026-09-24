import { describe, expect, it } from 'vitest';
import { normalizeCatalogSource, shouldUsePersistedCatalog } from './storage';

describe('normalizeCatalogSource', () => {
  it('keeps only supported catalog source values', () => {
    expect(normalizeCatalogSource('remote')).toBe('remote');
    expect(normalizeCatalogSource('cache')).toBe('cache');
    expect(normalizeCatalogSource('fallback')).toBe('fallback');
    expect(normalizeCatalogSource('corrupted')).toBe('fallback');
    expect(normalizeCatalogSource(undefined)).toBe('fallback');
  });

  it('replaces packaged fallback data after an extension update but keeps remote caches', () => {
    expect(shouldUsePersistedCatalog('fallback')).toBe(false);
    expect(shouldUsePersistedCatalog('cache')).toBe(true);
    expect(shouldUsePersistedCatalog('remote')).toBe(true);
  });
});
