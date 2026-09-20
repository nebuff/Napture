const dgram = require('dgram');
const http = require('http');

jest.mock('electron', () => ({
  app: { getPath: jest.fn(() => '') }
}));

describe('Neweb (ne://) DNS Resolver & Failover Switcher', () => {
  let neResolver;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.useRealTimers();
    delete process.env.DISABLE_NE_PROTOCOL;
    process.env.ENABLE_NE_PROTOCOL = 'true';
    jest.resetModules();
    jest.clearAllMocks();
    neResolver = require('../../napture/ne-resolver');
    neResolver.flushDnsCache();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalEnv.DISABLE_NE_PROTOCOL !== undefined) {
      process.env.DISABLE_NE_PROTOCOL = originalEnv.DISABLE_NE_PROTOCOL;
    } else {
      delete process.env.DISABLE_NE_PROTOCOL;
    }
    if (originalEnv.ENABLE_NE_PROTOCOL !== undefined) {
      process.env.ENABLE_NE_PROTOCOL = originalEnv.ENABLE_NE_PROTOCOL;
    } else {
      delete process.env.ENABLE_NE_PROTOCOL;
    }
  });

  it('should return default resolvers list when no custom settings are configured', () => {
    const resolvers = neResolver.getConfiguredResolvers();
    expect(Array.isArray(resolvers)).toBe(true);
    expect(resolvers.length).toBeGreaterThanOrEqual(2);
    expect(resolvers[0].host).toBe('147.185.221.231');
    expect(resolvers[0].port).toBe(65246);
    expect(resolvers[1].port).toBe(21811);
  });

  it('should successfully clear in-memory DNS cache via flushDnsCache', () => {
    const res = neResolver.flushDnsCache();
    expect(res).toBe(true);
    const status = neResolver.getResolverStatus();
    expect(status.cacheSize).toBe(0);
  });

  it('should resolve from memory cache on consecutive calls without querying socket', async () => {
    const mockDnsQuery = jest.spyOn(dgram, 'createSocket').mockImplementation(() => {
      const emitter = new (require('events').EventEmitter)();
      emitter.send = jest.fn((buf, port, host, cb) => {
        const resBuf = Buffer.alloc(128);
        resBuf.writeUInt16BE(1234, 0);
        resBuf.writeUInt16BE(0x8180, 2);
        resBuf.writeUInt16BE(1, 4);
        resBuf.writeUInt16BE(2, 6);
        let offset = 12;
        resBuf.writeUInt8(7, offset++);
        resBuf.write('neflare', offset);
        offset += 7;
        resBuf.writeUInt8(2, offset++);
        resBuf.write('ne', offset);
        offset += 2;
        resBuf.writeUInt8(0, offset++);
        resBuf.writeUInt16BE(1, offset);
        offset += 2;
        resBuf.writeUInt16BE(1, offset);
        offset += 2;

        resBuf.writeUInt16BE(0xc00c, offset); offset += 2;
        resBuf.writeUInt16BE(1, offset); offset += 2;
        resBuf.writeUInt16BE(1, offset); offset += 2;
        resBuf.writeUInt32BE(60, offset); offset += 4;
        resBuf.writeUInt16BE(4, offset); offset += 2;
        resBuf.writeUInt8(100, offset);
        resBuf.writeUInt8(105, offset + 1);
        resBuf.writeUInt8(182, offset + 2);
        resBuf.writeUInt8(20, offset + 3);
        offset += 4;

        resBuf.writeUInt16BE(0xc00c, offset); offset += 2;
        resBuf.writeUInt16BE(33, offset); offset += 2;
        resBuf.writeUInt16BE(1, offset); offset += 2;
        resBuf.writeUInt32BE(60, offset); offset += 4;
        resBuf.writeUInt16BE(6, offset); offset += 2;
        resBuf.writeUInt16BE(10, offset); offset += 2;
        resBuf.writeUInt16BE(10, offset); offset += 2;
        resBuf.writeUInt16BE(5000, offset); offset += 2;

        setImmediate(() => emitter.emit('message', resBuf));
        if (cb) cb(null);
      });
      emitter.close = jest.fn();
      return emitter;
    });

    const res1 = await neResolver.resolveNeDomain('neflare.ne');
    expect(res1.target).toBe('100.105.182.20');
    expect(res1.port).toBe(5000);

    const status1 = neResolver.getResolverStatus();
    expect(status1.cacheSize).toBe(1);

    mockDnsQuery.mockClear();
    const res2 = await neResolver.resolveNeDomain('neflare.ne');
    expect(res2.target).toBe('100.105.182.20');
    expect(res2.port).toBe(5000);
    expect(mockDnsQuery).not.toHaveBeenCalled();

    mockDnsQuery.mockRestore();
  });

  it('should return empty resolvers list and reject resolution when ne protocol is disabled', async () => {
    const envBefore = process.env.DISABLE_NE_PROTOCOL;
    process.env.DISABLE_NE_PROTOCOL = 'true';
    try {
      const resolvers = neResolver.getConfiguredResolvers();
      expect(resolvers).toEqual([]);

      const flushResult = neResolver.flushDnsCache();
      expect(flushResult).toBe(false);

      await expect(neResolver.resolveNeDomain('neflare.ne')).rejects.toThrow(
        'ne:// protocol and DNS resolution are disabled in this build.'
      );
    } finally {
      if (envBefore !== undefined) {
        process.env.DISABLE_NE_PROTOCOL = envBefore;
      } else {
        delete process.env.DISABLE_NE_PROTOCOL;
      }
    }
  });
});
