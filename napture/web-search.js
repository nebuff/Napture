// Mini metasearch behind Napture Search.
//
// Queries run in the main process (no CORS, no page-side tracking) and only
// structured endpoints are used: Bing's RSS feed and the Wikipedia search API.
// HTML scrapers are deliberately avoided because their markup breaks without
// notice and the upstreams usually answer with a bot-check page.

const { unwrapRedirectUrl } = require('./shared-utils');

const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36';
const REQUEST_TIMEOUT_MS = 2500;
const FAILURE_TTL_MS = 60 * 1000;
const SUCCESS_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 40;

const cache = new Map();

function decodeEntities(value) {
  return String(value == null ? '' : value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

// CDATA must be unwrapped first: its body can contain '>' but the naive tag
// stripper would otherwise swallow the whole block, snippet included. Entities
// are decoded before stripping too, because feeds escape their HTML markup
// (&lt;b&gt;), which would otherwise leak into the rendered snippet.
function stripTags(value) {
  const text = String(value == null ? '' : value).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  return decodeEntities(decodeEntities(text).replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function readTag(block, name) {
  const match = String(block).match(new RegExp('<' + name + '[^>]*>([\\s\\S]*?)<\\/' + name + '>', 'i'));
  return match ? match[1] : '';
}

function parseBingRss(xml) {
  const items = [];
  const itemPattern = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemPattern.exec(String(xml == null ? '' : xml))) !== null) {
    const block = match[1];
    const title = stripTags(readTag(block, 'title'));
    const link = stripTags(readTag(block, 'link'));
    if (!title || !link) continue;
    items.push({
      title,
      url: link,
      snippet: stripTags(readTag(block, 'description')),
      source: 'bing',
      sourceLabel: 'Bing'
    });
  }
  return items;
}

function parseWikipedia(json, lang = 'en') {
  const list = json && json.query && Array.isArray(json.query.search) ? json.query.search : [];
  return list.map(item => ({
    title: String(item.title || ''),
    url: 'https://' + lang + '.wikipedia.org/wiki/' + encodeURIComponent(String(item.title || '').replace(/ /g, '_')),
    snippet: stripTags(item.snippet),
    source: 'wikipedia',
    sourceLabel: 'Wikipedia'
  })).filter(item => item.title && item.url);
}

function normalizeResultUrl(rawUrl) {
  try {
    const unwrapped = unwrapRedirectUrl(String(rawUrl || ''));
    const parsed = new URL(unwrapped);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    parsed.hash = '';
    return parsed.toString();
  } catch (e) {
    return null;
  }
}

// Round-robin so one provider cannot fill the whole page, deduplicating by URL.
function mergeResults(buckets, limit = 20) {
  const seen = new Set();
  const merged = [];
  const lists = (Array.isArray(buckets) ? buckets : []).filter(Array.isArray);
  const longest = lists.reduce((max, list) => Math.max(max, list.length), 0);

  for (let index = 0; index < longest && merged.length < limit; index++) {
    for (const list of lists) {
      const item = list[index];
      if (!item) continue;
      const url = normalizeResultUrl(item.url);
      if (!url) continue;
      const key = url.toLowerCase().replace(/\/+$/, '');
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(Object.assign({}, item, { url }));
      if (merged.length >= limit) break;
    }
  }

  return merged;
}

const PROVIDERS = [
  {
    id: 'bing',
    label: 'Bing',
    accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
    buildUrl: query => 'https://www.bing.com/search?format=rss&count=20&q=' + encodeURIComponent(query),
    parse: body => parseBingRss(body),
    limit: 12
  },
  {
    id: 'wikipedia',
    label: 'Wikipedia',
    accept: 'application/json',
    buildUrl: query => 'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=' +
      encodeURIComponent(query) + '&srlimit=5&srprop=snippet&format=json',
    parse: body => parseWikipedia(JSON.parse(body)),
    limit: 5
  }
];

async function fetchBody(url, accept) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': accept,
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function searchWeb(query, options = {}) {
  const trimmed = String(query || '').trim();
  if (!trimmed) return { results: [], providers: [] };

  const key = trimmed.toLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < cached.ttl) return cached.value;

  const settled = await Promise.allSettled(PROVIDERS.map(async provider => {
    const body = await fetchBody(provider.buildUrl(trimmed), provider.accept);
    return provider.parse(body).slice(0, provider.limit);
  }));

  const providers = [];
  const buckets = [];

  settled.forEach((outcome, index) => {
    const provider = PROVIDERS[index];
    if (outcome.status === 'fulfilled') {
      providers.push({ id: provider.id, label: provider.label, ok: true, count: outcome.value.length });
      buckets.push(outcome.value);
    } else {
      providers.push({ id: provider.id, label: provider.label, ok: false, count: 0 });
    }
  });

  const value = { results: mergeResults(buckets, options.limit || 15), providers };
  const anySuccess = providers.some(provider => provider.ok);
  cache.set(key, { at: Date.now(), value, ttl: anySuccess ? SUCCESS_TTL_MS : FAILURE_TTL_MS });

  if (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = Array.from(cache.entries()).sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }

  return value;
}

function resetWebSearchCache() {
  cache.clear();
}

module.exports = {
  searchWeb,
  resetWebSearchCache,
  parseBingRss,
  parseWikipedia,
  mergeResults,
  normalizeResultUrl,
  decodeEntities,
  stripTags
};
