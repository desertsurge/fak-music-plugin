import { describe, expect, it } from 'vitest';
import { normalizeCatalogSource } from './storage';

describe('normalizeCatalogSource', () => {
  it('keeps only supported catalog source values', () => {
    expect(normalizeCatalogSource('remote')).toBe('remote');
    expect(normalizeCatalogSource('cache')).toBe('cache');
    expect(normalizeCatalogSource('fallback')).toBe('fallback');
    expect(normalizeCatalogSource('corrupted')).toBe('fallback');
    expect(normalizeCatalogSource(undefined)).toBe('fallback');
  });
});
