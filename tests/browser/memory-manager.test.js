const {
  DEFAULT_MEMORY_TARGET_MB,
  MIN_MEMORY_TARGET_MB,
  MB,
  classifyMemoryPressure,
  getMemoryTargetBytes,
  rankTabsForDiscard,
  isTabDiscardable
} = require('../../napture/memory-manager');

const NOW = 1_700_000_000_000;
const MINUTE = 60 * 1000;

function tab(id, idleMinutes, extra = {}) {
  return {
    tabId: id,
    lastActiveAt: NOW - idleMinutes * MINUTE,
    memoryBytes: 50 * MB,
    ...extra
  };
}

describe('memory-manager', () => {
  describe('getMemoryTargetBytes', () => {
    it('uses the configured target and enforces a usable floor', () => {
      expect(getMemoryTargetBytes(DEFAULT_MEMORY_TARGET_MB)).toBe(DEFAULT_MEMORY_TARGET_MB * MB);
      expect(getMemoryTargetBytes(100)).toBe(MIN_MEMORY_TARGET_MB * MB);
      expect(getMemoryTargetBytes(null)).toBe(DEFAULT_MEMORY_TARGET_MB * MB);
    });
  });

  describe('classifyMemoryPressure', () => {
    it('stays normal well below the target and system limit', () => {
      expect(classifyMemoryPressure({
        appBytes: 800 * MB,
        targetBytes: 1500 * MB,
        systemBytes: 16_000 * MB
      })).toBe('normal');
    });

    it('escalates as the configured target is crossed', () => {
      const systemBytes = 32_000 * MB;
      expect(classifyMemoryPressure({ appBytes: 1500 * MB, targetBytes: 1500 * MB, systemBytes })).toBe('high');
      expect(classifyMemoryPressure({ appBytes: 2100 * MB, targetBytes: 1500 * MB, systemBytes })).toBe('critical');
    });

    it('escalates on system-wide memory pressure even with a high target', () => {
      expect(classifyMemoryPressure({
        appBytes: 7_600 * MB,
        targetBytes: 32_000 * MB,
        systemBytes: 8_000 * MB
      })).toBe('critical');
    });
  });

  describe('rankTabsForDiscard', () => {
    it('only sleeps heavily idle tabs during normal maintenance', () => {
      expect(rankTabsForDiscard([tab('recent', 10)], { now: NOW, pressure: 'normal' })).toEqual([]);
      expect(rankTabsForDiscard([tab('stale', 90)], { now: NOW, pressure: 'normal' })).toEqual(['stale']);
    });

    it('never discards active, pinned, audible, loading, streaming, or freshly used tabs', () => {
      const protectedTabs = [
        tab('active', 90, { isActive: true }),
        tab('pinned', 90, { isPinned: true }),
        tab('audible', 90, { isAudible: true }),
        tab('loading', 90, { isLoading: true }),
        tab('streaming', 90, { isStreaming: true }),
        tab('fresh', 0.5)
      ];

      expect(rankTabsForDiscard(protectedTabs, { now: NOW, pressure: 'critical' })).toEqual([]);
      expect(protectedTabs.every(t => !isTabDiscardable(t, { now: NOW, pressure: 'critical' }))).toBe(true);
    });

    it('picks the least recently used tab first under pressure', () => {
      const tabs = [
        tab('two', 7),
        tab('one', 40),
        tab('three', 6)
      ];

      expect(rankTabsForDiscard(tabs, {
        now: NOW,
        pressure: 'high',
        bytesToFree: 1000 * MB
      })).toEqual(['one', 'two', 'three']);
    });

    it('reclaims enough memory for the deficit and stops', () => {
      const tabs = [tab('one', 90), tab('two', 80), tab('three', 70)];

      expect(rankTabsForDiscard(tabs, {
        now: NOW,
        pressure: 'critical',
        bytesToFree: 90 * MB,
        maxDiscards: 3
      })).toEqual(['one', 'two']);
    });

    it('respects the per-pass discard cap', () => {
      const tabs = [tab('one', 90), tab('two', 80), tab('three', 70)];

      expect(rankTabsForDiscard(tabs, {
        now: NOW,
        pressure: 'critical',
        bytesToFree: 1000 * MB,
        maxDiscards: 2
      })).toEqual(['one', 'two']);
    });

    it('falls back to recently idle tabs when memory is genuinely under pressure', () => {
      expect(rankTabsForDiscard([tab('busy', 2)], {
        now: NOW,
        pressure: 'high',
        bytesToFree: 400 * MB
      })).toEqual(['busy']);
    });
  });
});
