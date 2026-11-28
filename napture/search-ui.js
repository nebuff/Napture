// Napture Search - web results plus a local index of history, bookmarks and
// open tabs. Rendered by the napture:// protocol handler; the web lookup runs
// in the main process, so the page itself makes no network requests.

let searchIndex, searchHistory, getSetting;
if (typeof require !== 'undefined') {
  const hist = require('./db/history');
  searchIndex = hist.searchIndex;
  searchHistory = hist.searchHistory;
  getSetting = hist.getSetting;
}

const WEB_ENGINES = {
  google: 'https://google.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
  bing: 'https://www.bing.com/search?q=',
  brave: 'https://search.brave.com/search?q=',
  ecosia: 'https://www.ecosia.org/search?q='
};

const ENGINE_LABELS = {
  google: 'Google',
  duckduckgo: 'DuckDuckGo',
  bing: 'Bing',
  brave: 'Brave',
  ecosia: 'Ecosia'
};

const KIND_LABELS = {
  tab: 'Open tab',
  bookmark: 'Bookmark',
  history: 'History'
};

// Page titles and URLs are attacker-controlled, so only these schemes are
// allowed to become clickable links inside the privileged napture:// page.
const SAFE_PROTOCOLS = ['http:', 'https:', 'file:', 'napture:', 'ne:'];

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isSafeUrl(rawUrl) {
  try {
    return SAFE_PROTOCOLS.includes(new URL(rawUrl).protocol);
  } catch (e) {
    return false;
  }
}

function getDomain(rawUrl) {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch (e) {
    return '';
  }
}

function getPathLabel(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const path = parsed.pathname === '/' ? '' : parsed.pathname;
    return (path + (parsed.search || '')).slice(0, 90);
  } catch (e) {
    return '';
  }
}

// The local index wraps matched terms in \u0001/\u0002 so they can be
// highlighted after escaping, without letting markup from page titles through.
function highlight(raw) {
  return escapeHtml(raw || '')
    .split('\u0001').join('<mark>')
    .split('\u0002').join('</mark>');
}

const FAVICON_FALLBACK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line>' +
  '<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>';

function renderResult(item, index) {
  const safeUrl = isSafeUrl(item.url) ? escapeHtml(item.url) : '';
  const title = escapeHtml(item.title || item.url || 'Untitled');
  const domain = escapeHtml(getDomain(item.url));
  const pathLabel = escapeHtml(getPathLabel(item.url));
  const snippet = highlight(item.snippet);
  const badges = (Array.isArray(item.badges) ? item.badges : [])
    .map(badge => '<span class="badge">' + escapeHtml(badge) + '</span>')
    .join('');
  const icon = item.favicon_url && isSafeUrl(item.favicon_url)
    ? '<img src="' + escapeHtml(item.favicon_url) + '" alt="" onerror="this.style.display=\'none\'">'
    : FAVICON_FALLBACK;
  const tag = safeUrl ? 'a' : 'div';
  const href = safeUrl ? ' href="' + safeUrl + '"' : '';

  return [
    '<' + tag + ' class="result" data-index="' + index + '"' + href + '>',
    '  <div class="result-icon">' + icon + '</div>',
    '  <div class="result-body">',
    '    <div class="result-head">',
    '      <span class="result-title">' + title + '</span>',
    badges,
    '    </div>',
    '    <div class="result-url">' + domain + (pathLabel ? '<span class="result-path">' + pathLabel + '</span>' : '') + '</div>',
    snippet ? '    <div class="result-snippet">' + snippet + '</div>' : '',
    '  </div>',
    '</' + tag + '>'
  ].join('');
}

function providerSummary(providers) {
  const list = Array.isArray(providers) ? providers : [];
  const ok = list.filter(provider => provider && provider.ok && provider.count > 0);
  if (ok.length > 0) return 'Web: ' + ok.map(provider => provider.label).join(', ');
  return list.length > 0 ? 'Web results unavailable' : '';
}

function buildSearchPage(options = {}) {
  const query = String(options.query || '').trim();
  const webResults = Array.isArray(options.webResults) ? options.webResults : [];
  const webProviders = Array.isArray(options.webProviders) ? options.webProviders : [];

  let engine = 'duckduckgo';
  try {
    engine = (typeof getSetting === 'function' ? getSetting('searchEngine', 'duckduckgo') : 'duckduckgo') || 'duckduckgo';
  } catch (e) {}

  // "Napture Search" resolves locally, so the full-results link falls back to
  // DuckDuckGo rather than pointing at this page again.
  const webEngine = WEB_ENGINES[engine] ? engine : 'duckduckgo';
  const webLabel = ENGINE_LABELS[webEngine];
  const webUrl = WEB_ENGINES[webEngine] + encodeURIComponent(query);

  let localResults = [];
  if (query && typeof searchIndex === 'function') {
    try {
      localResults = searchIndex(query, 10) || [];
    } catch (e) {
      console.error('Napture Search local index failed:', e);
    }
  }

  let recent = [];
  if (!query && typeof searchHistory === 'function') {
    try {
      recent = searchHistory('', 8) || [];
    } catch (e) {}
  }

  const webHtml = webResults.map((item, index) => renderResult({
    url: item.url,
    title: item.title,
    snippet: item.snippet,
    favicon_url: null,
    badges: [item.sourceLabel || 'Web']
  }, index)).join('\n');

  const localOffset = webResults.length;
  const localHtml = (query ? localResults : recent.map(item => ({
    kind: 'history',
    url: item.url,
    title: item.title,
    favicon_url: item.favicon_url,
    snippet: ''
  }))).map((item, index) => renderResult({
    url: item.url,
    title: item.title,
    snippet: item.snippet,
    favicon_url: item.favicon_url,
    badges: (item.kinds && item.kinds.length ? item.kinds : [item.kind])
      .map(kind => KIND_LABELS[kind] || kind)
  }, localOffset + index)).join('\n');

  const total = webResults.length + (query ? localResults.length : recent.length);
  const summaryText = query
    ? (total === 1 ? '1 result' : total + ' results')
    : 'Recent history';
  const sourceText = query ? providerSummary(webProviders) : '';

  const sections = [];
  if (webHtml) {
    sections.push('<div class="section-label">Web results</div><div class="results">' + webHtml + '</div>');
  }
  if (localHtml) {
    sections.push('<div class="section-label">' + (query ? 'From this device' : 'Recent') + '</div><div class="results">' + localHtml + '</div>');
  }
  if (sections.length === 0) {
    sections.push('<div class="empty"><div class="empty-title">' + (query ? 'No results' : 'Nothing here yet') + '</div>' +
      (query ? 'Nothing on the web or in your history matched this query.' : 'Pages you visit will show up here.') + '</div>');
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' ne: file:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: http: https: ne: file:; connect-src 'self';">
  <title>${query ? escapeHtml(query) + ' - Napture Search' : 'Napture Search'}</title>
  <style>
    :root {
      --bg-app: transparent;
      --bg-card: rgba(18, 19, 26, 0.6);
      --bg-input: #12131a;
      --bg-hover: #20212a;
      --border-color: rgba(255, 255, 255, 0.08);
      --border-focus: #7f8cff;
      --text-primary: #ffffff;
      --text-secondary: #a9b1d6;
      --text-muted: #565f89;
      --accent: #7f8cff;
      --font-main: 'Inter', 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background-color: var(--bg-app);
      color: var(--text-primary);
      font-family: var(--font-main);
      font-size: 13px;
      line-height: 1.5;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
    }

    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: var(--bg-app); }
    ::-webkit-scrollbar-thumb { background: #2E2F3E; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--accent); }

    .wrap {
      max-width: 720px;
      margin: 0 auto;
      padding: 56px 24px 80px;
    }

    .brand-title {
      font-size: 17px;
      font-weight: 600;
      letter-spacing: -0.2px;
      margin-bottom: 4px;
    }

    .beta-badge {
      display: inline-block;
      vertical-align: middle;
      margin-left: 8px;
      padding: 1px 6px;
      border-radius: 5px;
      border: 1px solid rgba(255, 193, 94, 0.35);
      background-color: rgba(255, 193, 94, 0.1);
      color: #e8b567;
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .tagline {
      color: var(--text-muted);
      font-size: 12px;
      margin-bottom: 22px;
    }

    .search-form { position: relative; }

    .search-form svg {
      position: absolute;
      left: 14px;
      top: 50%;
      transform: translateY(-50%);
      width: 16px;
      height: 16px;
      color: var(--text-secondary);
      pointer-events: none;
    }

    .search-input {
      width: 100%;
      background-color: var(--bg-input);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      color: var(--text-primary);
      padding: 12px 14px 12px 40px;
      font-family: inherit;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }

    .search-input::placeholder { color: var(--text-muted); }

    .search-input:focus {
      border-color: var(--border-focus);
      box-shadow: 0 0 0 2px rgba(127, 140, 255, 0.15);
    }

    .summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin: 22px 2px 6px;
      color: var(--text-muted);
      font-size: 11.5px;
      letter-spacing: 0.02em;
    }

    .section-label {
      margin: 18px 2px 6px;
      font-size: 10.5px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-muted);
    }

    .results { display: flex; flex-direction: column; gap: 2px; }

    .result {
      display: flex;
      gap: 12px;
      padding: 12px;
      border-radius: 10px;
      border: 1px solid transparent;
      text-decoration: none;
      color: inherit;
      transition: background-color 0.15s ease, border-color 0.15s ease;
    }

    a.result:hover, .result.selected {
      background-color: var(--bg-hover);
      border-color: var(--border-color);
    }

    .result-icon {
      width: 26px;
      height: 26px;
      border-radius: 7px;
      background-color: var(--bg-card);
      border: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      overflow: hidden;
      color: var(--text-secondary);
    }

    .result-icon img { width: 16px; height: 16px; object-fit: contain; }
    .result-icon svg { width: 14px; height: 14px; }

    .result-body { min-width: 0; flex: 1; }

    .result-head {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .result-title {
      font-size: 13.5px;
      font-weight: 500;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .badge {
      flex-shrink: 0;
      font-size: 10px;
      font-weight: 500;
      color: var(--text-muted);
      border: 1px solid var(--border-color);
      border-radius: 5px;
      padding: 1px 5px;
      line-height: 1.4;
    }

    .result-url {
      font-size: 11.5px;
      color: #73daca;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 1px;
    }

    .result-path { color: var(--text-muted); }

    .result-snippet {
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 4px;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .result-snippet mark {
      background: transparent;
      color: var(--text-primary);
      font-weight: 600;
    }

    .web-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 22px;
      padding: 12px;
      border-radius: 10px;
      border: 1px solid var(--border-color);
      background-color: var(--bg-card);
      color: var(--text-secondary);
      text-decoration: none;
      font-size: 13px;
      transition: border-color 0.15s ease, color 0.15s ease;
    }

    .web-row:hover { border-color: var(--border-focus); color: var(--text-primary); }
    .web-row svg { width: 15px; height: 15px; flex-shrink: 0; }
    .web-row strong { color: var(--text-primary); font-weight: 600; }

    .empty {
      padding: 40px 12px;
      text-align: center;
      color: var(--text-muted);
    }

    .empty-title {
      color: var(--text-secondary);
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 4px;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="brand-title">Napture Search<span class="beta-badge">beta</span></div>
    <div class="tagline">Web results, plus your own history, bookmarks and open tabs.</div>

    <form class="search-form" id="search-form" autocomplete="off">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
      <input class="search-input" id="search-input" type="text" name="q" value="${escapeHtml(query)}"
             placeholder="Search the web, your history, bookmarks and open tabs" spellcheck="false">
    </form>

    <div class="summary">
      <span>${escapeHtml(summaryText)}</span>
      ${sourceText ? '<span>' + escapeHtml(sourceText) + '</span>' : ''}
    </div>

    ${sections.join('\n')}

    ${query ? `<a class="web-row" href="${escapeHtml(webUrl)}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
      </svg>
      <span>See all results for <strong>${escapeHtml(query)}</strong> on ${escapeHtml(webLabel)}</span>
    </a>` : ''}
  </div>

  <script>
    (function () {
      var input = document.getElementById('search-input');
      var form = document.getElementById('search-form');
      var results = Array.prototype.slice.call(document.querySelectorAll('.result[href]'));
      var selected = -1;

      function paint() {
        results.forEach(function (el, i) {
          el.classList.toggle('selected', i === selected);
        });
        if (selected >= 0 && results[selected]) {
          results[selected].scrollIntoView({ block: 'nearest' });
        }
      }

      if (form) {
        form.addEventListener('submit', function (event) {
          event.preventDefault();
          var value = input ? input.value.trim() : '';
          if (!value) return;
          window.location.href = 'napture://search?q=' + encodeURIComponent(value);
        });
      }

      document.addEventListener('keydown', function (event) {
        if (!results.length) return;
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          selected = (selected + 1) % results.length;
          paint();
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          selected = selected <= 0 ? results.length - 1 : selected - 1;
          paint();
        } else if (event.key === 'Enter' && selected >= 0) {
          event.preventDefault();
          window.location.href = results[selected].getAttribute('href');
        }
      });

      if (input) {
        input.focus();
        try { input.setSelectionRange(input.value.length, input.value.length); } catch (e) {}
      }
    })();
  </script>
</body>
</html>`;
}

module.exports = {
  buildSearchPage
};
