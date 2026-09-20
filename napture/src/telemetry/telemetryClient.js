// telemetryClient.js – client telemetry dispatcher for Napture browser

const http = require('http');
const https = require('https');
const os = require('os');
const {
  encryptPayload,
  readTelemetryConfig,
  writeTelemetryConfig,
  getOfflineQueue,
  enqueueOfflineReport,
  removeOfflineReport,
} = require('./telemetryCrypto');

const DEFAULT_TELEMETRY_ENDPOINT = 'https://telemetry.nebuff.xyz/v1/report';

function getTelemetryEndpoint() {
  return process.env.TELEMETRY_ENDPOINT || DEFAULT_TELEMETRY_ENDPOINT;
}

function getAppVersion() {
  try {
    const { app } = require('electron');
    if (app && typeof app.getVersion === 'function') {
      const v = app.getVersion();
      if (v) return v;
    }
  } catch (e) {}
  const candidatePaths = [
    '../../../package.json',
    '../../package.json',
    '../package.json',
    './package.json'
  ];
  for (const relPath of candidatePaths) {
    try {
      const pkg = require(relPath);
      if (pkg && pkg.version) return pkg.version;
    } catch (e) {}
  }
  return '0.21.2';
}

function getReleaseChannel() {
  return process.env.NAPTURE_CHANNEL || process.env.RELEASE_CHANNEL || 'stable';
}

function getCommitHash() {
  return process.env.GIT_COMMIT_HASH || process.env.COMMIT_HASH || process.env.GIT_REV || '';
}

/**
 * 1. Client-Side Path Normalization & PII Stripping
 * Strips OS usernames, local user directories, email addresses, and auth tokens.
 */
function sanitizePii(input) {
  if (input === null || input === undefined) return '';
  let str = typeof input === 'string' ? input : String(input);

  try {
    // Current user homedir replacement
    const homedir = os.homedir();
    if (homedir && homedir.length > 2) {
      // Escape for regex
      const escapedHome = homedir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      str = str.replace(new RegExp(escapedHome, 'gi'), '~[user]');
    }

    // Current username replacement
    let username = '';
    try {
      const info = os.userInfo();
      if (info && info.username) username = info.username;
    } catch (e) {}
    if (!username) {
      username = process.env.USER || process.env.USERNAME || process.env.LOGNAME || '';
    }
    if (username && username.length > 1 && username !== 'root') {
      const escapedUser = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      str = str.replace(new RegExp(escapedUser, 'g'), '[user]');
    }
  } catch (e) {}

  // Generic Windows user paths: C:\Users\Username\... -> ~[user]\...
  str = str.replace(/[a-zA-Z]:\\Users\\[a-zA-Z0-9._-]+/gi, '~[user]');
  str = str.replace(/[a-zA-Z]:\/Users\/[a-zA-Z0-9._-]+/gi, '~[user]');

  // Generic Linux/macOS user paths: /home/username/... or /Users/username/... -> ~[user]/...
  str = str.replace(/(?:\/home|\/Users)\/[a-zA-Z0-9._-]+/g, '~[user]');

  // Redact potential email addresses
  str = str.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[redacted-email]');

  // Redact authorization tokens and secret parameters
  str = str.replace(/(?:password|token|secret|key|authorization|bearer)=[^&\s]+/gi, '$1=[redacted-secret]');

  return str;
}

/**
 * 3. Circuit Breaker / Flood Control on Client
 * Limits client crash reports to maximum 3 per hour from a single client session.
 */
const MAX_CRASHES_PER_HOUR = 3;
const CIRCUIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
let crashTimestamps = [];

function checkCircuitBreaker(options = {}) {
  if (options.bypassCircuitBreaker) return { allowed: true };
  const now = Date.now();
  const maxAllowed = options.maxCrashesPerHour || MAX_CRASHES_PER_HOUR;
  const windowMs = options.circuitWindowMs || CIRCUIT_WINDOW_MS;

  // Prune timestamps outside window
  crashTimestamps = crashTimestamps.filter(ts => (now - ts) < windowMs);

  if (crashTimestamps.length >= maxAllowed) {
    return {
      allowed: false,
      error: `Circuit breaker active: maximum ${maxAllowed} crashes per hour reached. Flood control active.`,
    };
  }

  crashTimestamps.push(now);
  return { allowed: true };
}

function resetCircuitBreaker() {
  crashTimestamps = [];
}

/**
 * Send encrypted report to telemetry server via HTTP/HTTPS POST
 * Supports offline queueing on transient connection failures.
 */
function sendTelemetryReport(payloadObj, endpointUrl = getTelemetryEndpoint(), options = {}) {
  return new Promise((resolve) => {
    try {
      const encrypted = encryptPayload(payloadObj);
      const postData = JSON.stringify({
        envelope: encrypted.envelope,
        tokenHash: encrypted.tokenHash,
        dailyToken: encrypted.dailyToken,
      });

      const url = new URL(endpointUrl);
      const transport = url.protocol === 'https:' ? https : http;

      const req = transport.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': `Napture/${getAppVersion()} (${os.platform()}; ${os.arch()})`,
        },
        timeout: options.timeout || 5000,
      }, (res) => {
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            // Flush offline queue opportunistically on success
            if (!options.isFlush) {
              flushOfflineQueue(endpointUrl).catch(() => {});
            }
            resolve({ ok: true, statusCode: res.statusCode, data: rawData });
          } else {
            // If server returned 5xx server error, queue for later retry
            if (res.statusCode >= 500 && !options.isFlush && options.queueOnFailure !== false) {
              enqueueOfflineReport(payloadObj);
            }
            resolve({ ok: false, statusCode: res.statusCode, error: rawData });
          }
        });
      });

      req.on('error', (err) => {
        // Queue report in local offline buffer on network drop
        if (!options.isFlush && options.queueOnFailure !== false) {
          enqueueOfflineReport(payloadObj);
        }
        resolve({ ok: false, error: err.message, queuedOffline: !options.isFlush && options.queueOnFailure !== false });
      });

      req.on('timeout', () => {
        req.destroy();
        if (!options.isFlush && options.queueOnFailure !== false) {
          enqueueOfflineReport(payloadObj);
        }
        resolve({ ok: false, error: 'Request timeout', queuedOffline: !options.isFlush && options.queueOnFailure !== false });
      });

      req.write(postData);
      req.end();
    } catch (err) {
      if (!options.isFlush && options.queueOnFailure !== false) {
        enqueueOfflineReport(payloadObj);
      }
      resolve({ ok: false, error: err.message });
    }
  });
}

/**
 * 4. Flush pending offline queue
 */
async function flushOfflineQueue(endpointUrl = getTelemetryEndpoint()) {
  const queue = getOfflineQueue();
  if (!queue || queue.length === 0) return { flushed: 0, remaining: 0 };

  let flushedCount = 0;
  for (const item of queue) {
    try {
      const res = await sendTelemetryReport(item.payload, endpointUrl, { isFlush: true, queueOnFailure: false });
      if (res.ok) {
        removeOfflineReport(item.id);
        flushedCount++;
      } else if (res.statusCode && res.statusCode >= 400 && res.statusCode < 500) {
        // Bad request / invalid client data: drop so it doesn't block queue
        removeOfflineReport(item.id);
      } else {
        // Still unreachable, stop flush loop
        break;
      }
    } catch (e) {
      break;
    }
  }

  return { flushed: flushedCount, remaining: getOfflineQueue().length };
}

const HOURLY_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
let pingIntervalTimer = null;

/**
 * Send analytics & usage ping to main telemetry server (hourly rate)
 */
async function sendAnalyticsPing(options = {}) {
  const force = options.force || false;
  const endpoint = options.endpoint || getTelemetryEndpoint();
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const cfg = readTelemetryConfig();
  const intervalMs = typeof options.intervalMs === 'number' ? options.intervalMs : HOURLY_INTERVAL_MS;
  const currentVer = getAppVersion();
  const versionChanged = !!(cfg.lastReportedVersion && cfg.lastReportedVersion !== currentVer);

  if (!force && !versionChanged && cfg.lastAnalyticsPing && (now - cfg.lastAnalyticsPing) < intervalMs) {
    return { ok: true, skipped: true, lastPing: cfg.lastAnalyticsPing, nextPingInMs: intervalMs - (now - cfg.lastAnalyticsPing) };
  }

  const payload = {
    type: 'daily_ping',
    appVersion: currentVer,
    channel: getReleaseChannel(),
    commitHash: getCommitHash(),
    platform: os.platform(),
    arch: os.arch(),
    timestamp: now,
  };

  const res = await sendTelemetryReport(payload, endpoint, options);
  if (res.ok) {
    cfg.lastAnalyticsPing = now;
    cfg.lastDailyPing = today;
    cfg.lastReportedVersion = currentVer;
    writeTelemetryConfig(cfg);
  }
  return res;
}

const sendHourlyPing = sendAnalyticsPing;
const sendDailyPing = sendAnalyticsPing;

/**
 * Send Crash / Error Report
 * Applies PII stripping, channel/commit tagging, and client circuit breaker.
 */
async function sendCrashReport(details = {}, options = {}) {
  const endpoint = options.endpoint || getTelemetryEndpoint();

  // 3. Circuit breaker check
  const circuit = checkCircuitBreaker(options);
  if (!circuit.allowed) {
    return { ok: false, error: circuit.error, throttledByCircuitBreaker: true };
  }

  // 1. Path Normalization & PII Sanitization
  const rawStackTrace = details.stackTrace || details.message || '';
  const sanitizedStack = sanitizePii(rawStackTrace);
  const sanitizedComponent = sanitizePii(details.component || 'unknown');

  // 6. Release Channel & Build Tagging
  const payload = {
    type: 'crash_report',
    component: sanitizedComponent,
    exitCode: typeof details.exitCode === 'number' ? details.exitCode : 1,
    stackTrace: sanitizedStack,
    appVersion: details.appVersion || getAppVersion(),
    channel: details.channel || getReleaseChannel(),
    commitHash: details.commitHash || getCommitHash(),
    platform: details.platform || os.platform(),
    arch: details.arch || os.arch(),
    timestamp: Date.now(),
  };

  return sendTelemetryReport(payload, endpoint, options);
}

let initialized = false;

/**
 * Initialize automatic telemetry tracking, offline queue flush, and crash interceptors
 */
function initTelemetry(options = {}) {
  if (initialized && !options.force) return;
  initialized = true;

  const intervalMs = typeof options.intervalMs === 'number' ? options.intervalMs : HOURLY_INTERVAL_MS;

  // 1. Dispatch immediate analytics ping and attempt flushing pending offline queue on startup
  sendAnalyticsPing(options).catch(() => {});
  flushOfflineQueue(options.endpoint || getTelemetryEndpoint()).catch(() => {});

  // 2. Schedule recurring hourly analytics updates and queue flushes
  if (pingIntervalTimer) clearInterval(pingIntervalTimer);
  pingIntervalTimer = setInterval(() => {
    sendAnalyticsPing(options).catch(() => {});
    flushOfflineQueue(options.endpoint || getTelemetryEndpoint()).catch(() => {});
  }, intervalMs);
  if (typeof pingIntervalTimer.unref === 'function') {
    pingIntervalTimer.unref();
  }

  // 3. Global process uncaught exception interceptors
  process.on('uncaughtException', (error) => {
    try {
      sendCrashReport({
        component: 'main-process',
        exitCode: 1,
        stackTrace: error && error.stack ? error.stack : String(error),
      }, options);
    } catch (e) {}
  });

  process.on('unhandledRejection', (reason) => {
    try {
      sendCrashReport({
        component: 'unhandled-promise',
        exitCode: 1,
        stackTrace: reason && reason.stack ? reason.stack : String(reason),
      }, options);
    } catch (e) {}
  });

  // 4. Electron lifecycle & renderer crash hooks
  try {
    const { app } = require('electron');
    if (app && typeof app.on === 'function') {
      app.on('render-process-gone', (event, webContents, details) => {
        try {
          sendCrashReport({
            component: 'renderer',
            exitCode: details.exitCode || 1,
            stackTrace: `Reason: ${details.reason || 'unknown'}\nExitCode: ${details.exitCode || 0}`,
          }, options);
        } catch (e) {}
      });

      app.on('child-process-gone', (event, details) => {
        try {
          sendCrashReport({
            component: details.type || 'child-process',
            exitCode: details.exitCode || 1,
            stackTrace: `Reason: ${details.reason || 'unknown'}\nName: ${details.name || details.serviceName || 'unknown'}`,
          }, options);
        } catch (e) {}
      });
    }
  } catch (e) {}
}

module.exports = {
  DEFAULT_TELEMETRY_ENDPOINT,
  HOURLY_INTERVAL_MS,
  getTelemetryEndpoint,
  getAppVersion,
  getReleaseChannel,
  getCommitHash,
  sanitizePii,
  checkCircuitBreaker,
  resetCircuitBreaker,
  sendTelemetryReport,
  flushOfflineQueue,
  sendAnalyticsPing,
  sendHourlyPing,
  sendDailyPing,
  sendCrashReport,
  initTelemetry,
};
