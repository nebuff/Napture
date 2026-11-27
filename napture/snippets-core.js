// Napture Quick Site Snippets - shared parsing, matching and suggestion logic.
// Loaded as a plain script in the toolbar renderer (window.NaptureSnippets) and
// require()-able from the main process / tests so there is one source of truth.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.NaptureSnippets = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function normalizeKey(raw) {
    return String(raw == null ? '' : raw)
      .trim()
      .replace(/^\.+/, '')
      .replace(/\s+/g, '');
  }

  function normalizeUrl(raw) {
    let url = String(raw == null ? '' : raw).trim();
    if (!url) return '';
    if (/^https?:\/\/$/i.test(url)) return '';
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url)) url = 'https://' + url;
    return url;
  }

  // Accepts the stored JSON string, an already-parsed array or a settings page
  // object literal. Entries without both a key and a usable URL are dropped and
  // duplicate keys keep the first definition.
  function parseList(raw) {
    let value = raw;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return [];
      try {
        value = JSON.parse(trimmed);
      } catch (e) {
        return [];
      }
      // Tolerate settings that were persisted twice (a JSON string of a JSON string).
      if (typeof value === 'string') {
        try {
          value = JSON.parse(value);
        } catch (e) {
          return [];
        }
      }
    }
    if (!Array.isArray(value)) return [];

    const list = [];
    const seen = new Set();
    for (const item of value) {
      if (!item || typeof item !== 'object') continue;
      const key = normalizeKey(item.snippet);
      const url = normalizeUrl(item.url);
      if (!key || !url) continue;
      const lower = key.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      list.push({
        snippet: key,
        description: item.description == null ? '' : String(item.description).trim(),
        url: url
      });
    }
    return list;
  }

  // ".mail", ".MAIL", ".mail - Takes you to gmail" and the autocomplete form
  // ".mail-Takes you to gmail" all yield the candidate keys to try, longest first
  // so keys containing dashes (.my-site) win over a shorter prefix.
  function getCandidates(input) {
    const raw = String(input == null ? '' : input).trim();
    if (!raw) return [];
    const token = raw.split(/\s+/)[0].replace(/^\.+/, '');
    if (!token) return [];
    const candidates = [token];
    let dash = token.indexOf('-');
    while (dash > 0) {
      candidates.push(token.slice(0, dash));
      dash = token.indexOf('-', dash + 1);
    }
    return candidates;
  }

  function resolve(input, list) {
    const snippets = Array.isArray(list) ? list : parseList(list);
    if (snippets.length === 0) return null;
    for (const candidate of getCandidates(input)) {
      const lower = candidate.toLowerCase();
      const match = snippets.find(function (item) {
        return normalizeKey(item.snippet).toLowerCase() === lower;
      });
      if (match) return normalizeUrl(match.url) || null;
    }
    return null;
  }

  function suggestions(query, list) {
    const raw = String(query == null ? '' : query).trim();
    if (raw.charAt(0) !== '.') return [];
    const snippets = Array.isArray(list) ? list : parseList(list);
    const prefix = raw.toLowerCase();
    const out = [];
    for (const item of snippets) {
      const key = '.' + normalizeKey(item.snippet);
      if (key.toLowerCase().indexOf(prefix) !== 0) continue;
      const desc = item.description ? ' - ' + String(item.description).trim() : '';
      out.push(key + desc);
    }
    return out;
  }

  return {
    normalizeKey: normalizeKey,
    normalizeUrl: normalizeUrl,
    parseList: parseList,
    resolve: resolve,
    suggestions: suggestions
  };
}));
