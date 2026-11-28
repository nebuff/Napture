'use strict';

// Shared heuristics for Napture's memory saver / tab sleeping.
// Kept dependency-free so it can be unit tested without launching Electron.

const MB = 1024 * 1024;

const DEFAULT_MEMORY_TARGET_MB = 1500;
const MIN_MEMORY_TARGET_MB = 500;

// A tab becomes eligible for idle sleeping after this long without being active.
const DEFAULT_IDLE_SLEEP_MS = 15 * 60 * 1000;
// Even when the app is below its memory target, tabs idle this long are slept
// one per pass so long-lived windows slowly give memory back.
const HARD_IDLE_SLEEP_MS = 60 * 60 * 1000;
// Never sleep a tab that was active less than a minute ago.
const MIN_TAB_AGE_MS = 60 * 1000;
const MAX_DISCARDS_PER_PASS = 3;

const CRITICAL_SYSTEM_RATIO = 0.9;
const HIGH_SYSTEM_RATIO = 0.75;
const MODERATE_SYSTEM_RATIO = 0.6;

function toFiniteNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function getMemoryTargetBytes(configuredTargetMB) {
  const configured = toFiniteNumber(configuredTargetMB, 0);
  const targetMB = configured > 0 ? configured : DEFAULT_MEMORY_TARGET_MB;
  return Math.max(targetMB, MIN_MEMORY_TARGET_MB) * MB;
}

/**
 * Classify how urgently memory needs to be reclaimed.
 * appBytes is the working set of all Electron processes (main, GPU, renderers).
 */
function classifyMemoryPressure({ appBytes = 0, targetBytes = 0, systemBytes = 0 } = {}) {
  const app = Math.max(0, toFiniteNumber(appBytes, 0));
  const target = Math.max(1, toFiniteNumber(targetBytes, 0));
  const system = Math.max(0, toFiniteNumber(systemBytes, 0));

  const targetRatio = app / target;
  const systemRatio = system > 0 ? app / system : 0;

  if (targetRatio >= 1.35 || systemRatio >= CRITICAL_SYSTEM_RATIO) return 'critical';
  if (targetRatio >= 1 || systemRatio >= HIGH_SYSTEM_RATIO) return 'high';
  if (systemRatio >= MODERATE_SYSTEM_RATIO) return 'moderate';
  return 'normal';
}

function getIdleThresholdMs(pressure, {
  idleMs = DEFAULT_IDLE_SLEEP_MS,
  hardIdleMs = HARD_IDLE_SLEEP_MS,
  minAgeMs = MIN_TAB_AGE_MS
} = {}) {
  switch (pressure) {
    case 'critical':
      return Math.max(0, minAgeMs);
    case 'high':
      return Math.max(minAgeMs, Math.min(idleMs, 5 * 60 * 1000));
    case 'moderate':
      return Math.max(minAgeMs, idleMs);
    default:
      return Math.max(minAgeMs, hardIdleMs);
  }
}

function isTabDiscardable(tab, {
  now = Date.now(),
  pressure = 'normal',
  idleMs = DEFAULT_IDLE_SLEEP_MS,
  hardIdleMs = HARD_IDLE_SLEEP_MS,
  minAgeMs = MIN_TAB_AGE_MS
} = {}) {
  if (!tab || !tab.tabId) return false;
  if (tab.protected) return false;
  if (tab.isActive || tab.isPinned || tab.isAudible || tab.isLoading || tab.isStreaming || tab.isArchiving) {
    return false;
  }

  const lastActiveAt = toFiniteNumber(tab.lastActiveAt || tab.createdAt, 0);
  if (lastActiveAt <= 0) return false;

  const ageMs = now - lastActiveAt;
  if (ageMs < Math.max(0, minAgeMs)) return false;

  return ageMs >= getIdleThresholdMs(pressure, { idleMs, hardIdleMs, minAgeMs });
}

/**
 * Pick the least-recently-used tabs to sleep.
 * Returns tab ids in discard order (oldest first), capped by maxDiscards and
 * by bytesToFree when reclaiming a specific deficit.
 */
function rankTabsForDiscard(tabs, options = {}) {
  const {
    now = Date.now(),
    pressure = 'normal',
    bytesToFree = 0,
    maxDiscards = MAX_DISCARDS_PER_PASS,
    idleMs = DEFAULT_IDLE_SLEEP_MS,
    hardIdleMs = HARD_IDLE_SLEEP_MS,
    minAgeMs = MIN_TAB_AGE_MS
  } = options;

  const collect = (candidatePressure) => (Array.isArray(tabs) ? tabs : [])
    .filter(tab => isTabDiscardable(tab, {
      now,
      pressure: candidatePressure,
      idleMs,
      hardIdleMs,
      minAgeMs
    }))
    .sort((a, b) => {
      const aLast = toFiniteNumber(a.lastActiveAt || a.createdAt, 0);
      const bLast = toFiniteNumber(b.lastActiveAt || b.createdAt, 0);
      if (aLast !== bLast) return aLast - bLast; // least recently used first
      return Math.max(0, toFiniteNumber(b.memoryBytes, 0)) - Math.max(0, toFiniteNumber(a.memoryBytes, 0));
    });

  let candidates = collect(pressure);

  // Under real pressure, do not leave the app stuck just because every tab was
  // touched in the last few minutes. Fall back to the one-minute floor.
  if (candidates.length === 0 && (pressure === 'high' || pressure === 'critical')) {
    candidates = collect('critical');
  }

  if (candidates.length === 0) return [];

  const cap = Math.max(1, Math.floor(toFiniteNumber(maxDiscards, MAX_DISCARDS_PER_PASS)));
  const deficit = Math.max(0, toFiniteNumber(bytesToFree, 0));
  const picks = [];
  let freed = 0;

  for (const tab of candidates) {
    if (picks.length >= cap) break;
    picks.push(tab.tabId);
    freed += Math.max(0, toFiniteNumber(tab.memoryBytes, 0));

    if (deficit > 0) {
      if (freed >= deficit) break;
    } else {
      // Below target: maintenance sleeping only, one tab per pass.
      break;
    }
  }

  return picks;
}

module.exports = {
  MB,
  DEFAULT_MEMORY_TARGET_MB,
  MIN_MEMORY_TARGET_MB,
  DEFAULT_IDLE_SLEEP_MS,
  HARD_IDLE_SLEEP_MS,
  MIN_TAB_AGE_MS,
  MAX_DISCARDS_PER_PASS,
  getMemoryTargetBytes,
  classifyMemoryPressure,
  getIdleThresholdMs,
  isTabDiscardable,
  rankTabsForDiscard
};
