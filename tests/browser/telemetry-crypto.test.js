const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

let mockUserDataPath = path.join(os.tmpdir(), 'napture-telemetry-test-' + process.pid);

jest.mock('electron', () => ({
  app: { getPath: jest.fn((name) => (name === 'userData' ? mockUserDataPath : '')) }
}));

function makeKeyPair() {
  return crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
}

describe('Telemetry crypto & offline queue', () => {
  let telemetry;
  let configPath;

  beforeEach(() => {
    mockUserDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'napture-telemetry-'));
    jest.resetModules();
    telemetry = require('../../napture/src/telemetry/telemetryCrypto');
    configPath = path.join(mockUserDataPath, 'telemetry.json');
  });

  afterEach(() => {
    fs.rmSync(mockUserDataPath, { recursive: true, force: true });
  });

  describe('client identity', () => {
    it('creates, persists and reuses a 32-byte client secret', () => {
      const first = telemetry.getClientSecret();

      expect(first).toMatch(/^[0-9a-f]{64}$/);
      expect(telemetry.getClientSecret()).toBe(first);
      expect(JSON.parse(fs.readFileSync(configPath, 'utf8')).clientSecret).toBe(first);
    });

    it('reuses a secret that already exists on disk', () => {
      telemetry.writeTelemetryConfig({ clientSecret: 'ab'.repeat(32) });

      expect(telemetry.getClientSecret()).toBe('ab'.repeat(32));
    });

    it('derives a stable per-day HMAC token', () => {
      const secret = telemetry.getClientSecret();
      const token = telemetry.getDailyToken('2026-11-28');
      const expected = crypto
        .createHmac('sha256', Buffer.from(secret, 'hex'))
        .update('2026-11-28')
        .digest('hex');

      expect(token).toBe(expected);
      expect(telemetry.getDailyToken('2026-11-28')).toBe(token);
      expect(telemetry.getDailyToken('2026-11-29')).not.toBe(token);
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('payload encryption', () => {
    it('round-trips a JSON payload through the RSA/AES-GCM envelope', () => {
      const { publicKey, privateKey } = makeKeyPair();
      const payload = { event: 'daily_active_user', version: 1, platform: 'linux' };

      const result = telemetry.encryptPayload(payload, publicKey);

      expect(result.envelope).not.toContain('daily_active_user');
      expect(result.dailyToken).toMatch(/^[0-9a-f]{64}$/);
      expect(result.tokenHash).toBe(crypto.createHash('sha256').update(result.dailyToken).digest('hex'));

      const envelope = JSON.parse(Buffer.from(result.envelope, 'base64').toString('utf8'));
      expect(Object.keys(envelope).sort()).toEqual(['authTag', 'ciphertext', 'encryptedKey', 'iv']);
      expect(telemetry.decryptEnvelope(result.envelope, privateKey)).toEqual(payload);
    });

    it('fails to decrypt when the private key does not match', () => {
      const first = makeKeyPair();
      const second = makeKeyPair();
      const result = telemetry.encryptPayload({ secret: 'value' }, first.publicKey);

      expect(() => telemetry.decryptEnvelope(result.envelope, second.privateKey)).toThrow();
    });

    it('rejects an envelope whose ciphertext was tampered with', () => {
      const { publicKey, privateKey } = makeKeyPair();
      const result = telemetry.encryptPayload({ secret: 'value' }, publicKey);
      const envelope = JSON.parse(Buffer.from(result.envelope, 'base64').toString('utf8'));
      const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
      ciphertext[0] ^= 0xff;
      envelope.ciphertext = ciphertext.toString('base64');
      const tampered = Buffer.from(JSON.stringify(envelope)).toString('base64');

      expect(() => telemetry.decryptEnvelope(tampered, privateKey)).toThrow();
    });

    it('ships the production RSA public key', () => {
      expect(telemetry.PUBLIC_KEY_PEM).toContain('BEGIN PUBLIC KEY');
      expect(telemetry.PUBLIC_KEY_PEM).toContain('END PUBLIC KEY');
    });
  });

  describe('offline queue', () => {
    it('queues a report and persists it to disk', () => {
      const queue = telemetry.enqueueOfflineReport({ event: 'crash', message: 'boom' });

      expect(queue).toHaveLength(1);
      expect(queue[0].id).toMatch(/^[0-9a-f]{16}$/);
      expect(queue[0].payload).toEqual({ event: 'crash', message: 'boom' });
      expect(JSON.parse(fs.readFileSync(configPath, 'utf8')).offlineQueue).toHaveLength(1);
    });

    it('starts empty and tolerates a malformed stored queue', () => {
      expect(telemetry.getOfflineQueue()).toEqual([]);

      telemetry.writeTelemetryConfig({ offlineQueue: 'not-an-array' });
      expect(telemetry.getOfflineQueue()).toEqual([]);
    });

    it('caps the queue at ten reports and drops the oldest entries', () => {
      for (let i = 0; i < 12; i++) {
        telemetry.enqueueOfflineReport({ seq: i });
      }

      const queue = telemetry.getOfflineQueue();

      expect(queue).toHaveLength(telemetry.MAX_OFFLINE_QUEUE);
      expect(queue.map((item) => item.payload.seq)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    });

    it('removes a queued report by id', () => {
      const first = telemetry.enqueueOfflineReport({ seq: 1 });
      telemetry.enqueueOfflineReport({ seq: 2 });

      const remaining = telemetry.removeOfflineReport(first[0].id);

      expect(remaining.map((item) => item.payload.seq)).toEqual([2]);
      expect(telemetry.getOfflineQueue().map((item) => item.payload.seq)).toEqual([2]);
      expect(JSON.parse(fs.readFileSync(configPath, 'utf8')).offlineQueue.map((item) => item.id))
        .toEqual(remaining.map((item) => item.id));
    });

    it('prunes reports older than the 48 hour TTL', () => {
      const now = Date.now();
      telemetry.writeTelemetryConfig({
        offlineQueue: [
          { id: 'stale', payload: { seq: 0 }, createdAt: now - telemetry.OFFLINE_TTL_MS - 1000 },
          { id: 'fresh', payload: { seq: 1 }, createdAt: now - 1000 }
        ]
      });

      expect(telemetry.getOfflineQueue().map((item) => item.id)).toEqual(['fresh']);
      expect(telemetry.readTelemetryConfig().offlineQueue.map((item) => item.id)).toEqual(['fresh']);
    });

    it('exposes the limits used by the telemetry client', () => {
      expect(telemetry.MAX_OFFLINE_QUEUE).toBe(10);
      expect(telemetry.OFFLINE_TTL_MS).toBe(48 * 60 * 60 * 1000);
    });
  });
});
