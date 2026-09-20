const dgram = require('dgram');
const http = require('http');
const { isNeProtocolSupported } = require('./shared-utils');

const DEFAULT_RESOLVERS = [
  { host: '147.185.221.231', port: 65246, name: 'Lucnas' },
  { host: '147.185.221.231', port: 21811, name: 'Sanas' }
];

let activeResolverIndex = 0;
const dnsCache = new Map(); // domain -> { target, port, expiresAt }

function getConfiguredResolvers() {
  if (!isNeProtocolSupported()) return [];
  try {
    const { getSetting } = require('./db/history');
    const raw = getSetting('neResolvers');
    if (raw) {
      if (Array.isArray(raw) && raw.length > 0) return raw;
      if (typeof raw === 'string') {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    }
  } catch (e) {}
  return DEFAULT_RESOLVERS;
}

/**
 * Parses DNS binary response buffer to extract A, AAAA, and SRV records
 */
function parseDnsAnswer(buffer) {
  try {
    if (buffer.length < 12) return null;
    const ancount = buffer.readUInt16BE(6);
    if (ancount === 0) return null;

    let offset = 12;

    // Skip question section
    while (offset < buffer.length && buffer[offset] !== 0) {
      offset += buffer[offset] + 1;
    }
    offset += 5; // null byte + type (2) + class (2)

    let targetIp = null;
    let targetPort = null;

    for (let i = 0; i < ancount && offset < buffer.length; i++) {
      if ((buffer[offset] & 0xc0) === 0xc0) {
        offset += 2;
      } else {
        while (offset < buffer.length && buffer[offset] !== 0) {
          offset += buffer[offset] + 1;
        }
        offset += 1;
      }

      const type = buffer.readUInt16BE(offset);
      offset += 2;
      const rclass = buffer.readUInt16BE(offset);
      offset += 2;
      const ttl = buffer.readUInt32BE(offset);
      offset += 4;
      const rdlength = buffer.readUInt16BE(offset);
      offset += 2;

      if (type === 1 && rdlength === 4) {
        // Type A (IPv4)
        targetIp = `${buffer[offset]}.${buffer[offset + 1]}.${buffer[offset + 2]}.${buffer[offset + 3]}`;
      } else if (type === 33 && rdlength >= 6) {
        // Type SRV (Priority: 2, Weight: 2, Port: 2, Target: rest)
        targetPort = buffer.readUInt16BE(offset + 4);
      }

      offset += rdlength;
    }

    if (targetIp) {
      return { target: targetIp, port: targetPort || 80, ttl: 60 };
    }
  } catch (err) {
    console.error('[ne-resolver] DNS packet parsing error:', err);
  }
  return null;
}

/**
 * Builds a standard DNS query buffer for a given domain
 */
function buildDnsQuery(domain) {
  const parts = domain.split('.');
  let qnameLen = 1;
  parts.forEach(p => qnameLen += p.length + 1);

  const buffer = Buffer.alloc(12 + qnameLen + 4);
  const id = Math.floor(Math.random() * 65535);

  buffer.writeUInt16BE(id, 0);
  buffer.writeUInt16BE(0x0100, 2); // Standard query with recursion desired
  buffer.writeUInt16BE(1, 4);      // QDCOUNT = 1
  buffer.writeUInt16BE(0, 6);      // ANCOUNT = 0
  buffer.writeUInt16BE(0, 8);      // NSCOUNT = 0
  buffer.writeUInt16BE(0, 10);     // ARCOUNT = 0

  let offset = 12;
  for (const part of parts) {
    buffer.writeUInt8(part.length, offset++);
    buffer.write(part, offset);
    offset += part.length;
  }
  buffer.writeUInt8(0, offset++);

  buffer.writeUInt16BE(1, offset); // Type A = 1
  offset += 2;
  buffer.writeUInt16BE(1, offset); // Class IN = 1

  return buffer;
}

/**
 * Query a specific DNS resolver node via UDP
 */
function queryNodeUdp(resolver, domain, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    const query = buildDnsQuery(domain);
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { socket.close(); } catch (e) {}
        reject(new Error(`Timeout querying ${resolver.name || resolver.host} (${resolver.host}:${resolver.port})`));
      }
    }, timeoutMs);

    socket.on('message', (msg) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        try { socket.close(); } catch (e) {}
        const result = parseDnsAnswer(msg);
        if (result) {
          resolve(result);
        } else {
          reject(new Error(`NXDOMAIN or no records for ${domain}`));
        }
      }
    });

    socket.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        try { socket.close(); } catch (e) {}
        reject(err);
      }
    });

    socket.send(query, resolver.port, resolver.host, (err) => {
      if (err && !resolved) {
        resolved = true;
        clearTimeout(timer);
        try { socket.close(); } catch (e) {}
        reject(err);
      }
    });
  });
}

/**
 * Query DoH JSON fallback endpoint
 */
function queryDoH(host, port, domain) {
  return new Promise((resolve, reject) => {
    const dohPort = port === 53 ? 5000 : 5000;
    const req = http.get(`http://${host}:${dohPort}/api/resolve/${encodeURIComponent(domain)}`, { timeout: 1500 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.status === 'NOERROR' && json.records && json.records.length > 0) {
            const aRecord = json.records.find(r => r.type === 'A') || json.records[0];
            const srvRecord = json.records.find(r => r.type === 'SRV');
            resolve({
              target: aRecord.target,
              port: (srvRecord && srvRecord.port) ? srvRecord.port : (aRecord.port || 80),
              ttl: 60
            });
          } else {
            reject(new Error('NXDOMAIN'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => { req.destroy(); reject(new Error('DoH Timeout')); });
  });
}

/**
 * Resolve a Neweb domain with automatic failover across all configured resolver nodes
 * @param {string} domain - e.g. "neflare.ne"
 * @returns {Promise<{ target: string, port: number }>}
 */
async function resolveNeDomain(domain) {
  if (!isNeProtocolSupported()) {
    throw new Error('ne:// protocol and DNS resolution are disabled in this build.');
  }

  const clean = domain.trim().toLowerCase();

  // Check in-memory cache
  const cached = dnsCache.get(clean);
  if (cached && cached.expiresAt > Date.now()) {
    return { target: cached.target, port: cached.port };
  }

  const resolvers = getConfiguredResolvers();
  const errors = [];

  // Try the active resolver first, then cycle through the rest
  const order = [];
  for (let i = 0; i < resolvers.length; i++) {
    const idx = (activeResolverIndex + i) % resolvers.length;
    order.push({ index: idx, resolver: resolvers[idx] });
  }

  for (const item of order) {
    const { index, resolver } = item;
    try {
      // 1. Try UDP DNS Query
      const res = await queryNodeUdp(resolver, clean, 1500);
      if (res && res.port && res.port !== 80) {
        activeResolverIndex = index;
        dnsCache.set(clean, { target: res.target, port: res.port, expiresAt: Date.now() + (res.ttl * 1000) });
        return res;
      }

      // If UDP returned port 80 or didn't provide SRV, check DoH for non-standard port mappings
      try {
        const dohRes = await queryDoH(resolver.host, resolver.port, clean);
        if (dohRes && dohRes.port) {
          activeResolverIndex = index;
          dnsCache.set(clean, { target: dohRes.target, port: dohRes.port, expiresAt: Date.now() + (dohRes.ttl * 1000) });
          return dohRes;
        }
      } catch (dohErr) {}

      activeResolverIndex = index;
      dnsCache.set(clean, { target: res.target, port: res.port, expiresAt: Date.now() + (res.ttl * 1000) });
      return res;
    } catch (udpErr) {
      errors.push(`${resolver.name || resolver.host}: UDP failed (${udpErr.message})`);

      // 2. Try HTTP DoH fallback if UDP was filtered
      try {
        const dohRes = await queryDoH(resolver.host, resolver.port, clean);
        activeResolverIndex = index;
        dnsCache.set(clean, { target: dohRes.target, port: dohRes.port, expiresAt: Date.now() + (dohRes.ttl * 1000) });
        return dohRes;
      } catch (dohErr) {
        errors.push(`${resolver.name || resolver.host}: DoH failed (${dohErr.message})`);
      }
    }
  }

  throw new Error(`Unable to resolve ne://${clean}. All configured DNS resolvers failed:\n- ${errors.join('\n- ')}`);
}

function flushDnsCache() {
  if (!isNeProtocolSupported()) return false;
  dnsCache.clear();
  return true;
}

function getResolverStatus() {
  const resolvers = getConfiguredResolvers();
  return {
    resolvers,
    activeResolver: resolvers[activeResolverIndex % resolvers.length] || resolvers[0],
    cacheSize: dnsCache.size
  };
}

module.exports = {
  resolveNeDomain,
  flushDnsCache,
  getResolverStatus,
  getConfiguredResolvers,
  DEFAULT_RESOLVERS
};
