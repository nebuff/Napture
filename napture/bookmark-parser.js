/**
 * Netscape Bookmark HTML and JSON Parser for Napture
 */

function decodeHTMLEntities(text) {
  if (!text) return '';
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

function generateId() {
  return 'bm-imp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
}

/**
 * Parses Netscape Bookmark HTML file format (Chrome, Firefox, Safari, Edge, Brave, Opera, Vivaldi, Arc).
 * @param {string} htmlContent - Raw HTML string of exported bookmarks.
 * @returns {Array} List of bookmark nodes (links & folders).
 */
function parseBookmarkHtml(htmlContent) {
  if (!htmlContent || typeof htmlContent !== 'string') {
    return [];
  }

  // Remove DOCTYPE, META tags, comment blocks to simplify regex processing
  const cleanHtml = htmlContent
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<meta[\s\S]*?>/gi, '');

  const rootNodes = [];
  const stack = [{ children: rootNodes }];

  // Tokenize DT / H3 / A / DL tags while preserving hierarchy
  // RegEx matches: <H3...>, <A...>, </DL>
  const tagRegex = /<(H3|A|DL|\/DL)([^>]*)>([^<]*)(?:<\/H3>|<\/A>)?/gi;
  let match;

  while ((match = tagRegex.exec(cleanHtml)) !== null) {
    const tagName = match[1].toUpperCase();
    const attrsRaw = match[2] || '';
    const innerText = match[3] || '';

    const currentParent = stack[stack.length - 1];

    if (tagName === 'H3') {
      // Folder start header
      const folderTitle = decodeHTMLEntities(innerText.trim()) || 'Imported Folder';
      const folderNode = {
        id: generateId(),
        type: 'folder',
        title: folderTitle,
        isOpen: false,
        children: []
      };
      if (currentParent && currentParent.children) {
        currentParent.children.push(folderNode);
      }
      // Push folderNode to stack to accumulate upcoming children inside <DL>
      stack.push(folderNode);
    } else if (tagName === 'A') {
      // Bookmark link
      const hrefMatch = attrsRaw.match(/HREF=["']([^"']+)["']/i);
      const iconMatch = attrsRaw.match(/ICON=["']([^"']+)["']/i);
      const dateMatch = attrsRaw.match(/ADD_DATE=["']([^"']+)["']/i);

      const url = hrefMatch ? decodeHTMLEntities(hrefMatch[1].trim()) : '';
      const title = decodeHTMLEntities(innerText.trim()) || url || 'Bookmark';
      const favicon = iconMatch ? iconMatch[1] : null;

      if (url && !url.startsWith('chrome://') && !url.startsWith('edge://') && !url.startsWith('about:')) {
        const linkNode = {
          id: generateId(),
          type: 'link',
          title: title,
          url: url,
          favicon: favicon
        };
        if (dateMatch) {
          const ts = parseInt(dateMatch[1], 10);
          if (!isNaN(ts) && ts > 0) {
            linkNode.dateAdded = ts > 1e11 ? ts : ts * 1000;
          }
        }
        if (currentParent && currentParent.children) {
          currentParent.children.push(linkNode);
        }
      }
    } else if (tagName === '/DL') {
      // End of DL block, pop container from stack if stack > 1
      if (stack.length > 1) {
        stack.pop();
      }
    }
  }

  // Clean up any empty top-level folders or unnest root folders if appropriate
  return filterAndCleanNodes(rootNodes);
}

/**
 * Parses JSON format exported bookmarks (Chrome, Firefox JSON backups, Napture format).
 * @param {string|object} jsonInput - JSON string or parsed JSON object.
 * @returns {Array} List of standardized bookmark nodes.
 */
function parseBookmarkJson(jsonInput) {
  let data = jsonInput;
  if (typeof jsonInput === 'string') {
    try {
      data = JSON.parse(jsonInput);
    } catch (e) {
      return [];
    }
  }

  if (!data || typeof data !== 'object') return [];

  const result = [];

  // Helper to normalize any node format
  const processNode = (node) => {
    if (!node || typeof node !== 'object') return null;

    // Check Chrome / Firefox / Standard formats
    const type = node.type || (node.url ? 'link' : (node.children ? 'folder' : null));
    const title = node.title || node.name || node.text || 'Bookmark';
    const url = node.url || node.uri || '';

    if (url && (type === 'link' || type === 'url' || node.typeCode === 1)) {
      if (url.startsWith('chrome://') || url.startsWith('edge://') || url.startsWith('about:')) {
        return null;
      }
      return {
        id: generateId(),
        type: 'link',
        title: title,
        url: url,
        favicon: node.favicon || node.icon || null
      };
    }

    if (type === 'folder' || node.children || node.typeCode === 2) {
      const childrenNodes = [];
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          const res = processNode(child);
          if (res) childrenNodes.push(res);
        }
      }
      if (childrenNodes.length > 0) {
        return {
          id: generateId(),
          type: 'folder',
          title: title || 'Imported Folder',
          isOpen: false,
          children: childrenNodes
        };
      }
    }

    return null;
  };

  // Check if Chrome root structure (roots: { bookmark_bar, other, synced })
  if (data.roots && typeof data.roots === 'object') {
    for (const key of Object.keys(data.roots)) {
      const root = data.roots[key];
      if (root && root.children && Array.isArray(root.children)) {
        for (const child of root.children) {
          const node = processNode(child);
          if (node) result.push(node);
        }
      }
    }
  } else if (Array.isArray(data)) {
    for (const item of data) {
      const node = processNode(item);
      if (node) result.push(node);
    }
  } else if (data.children && Array.isArray(data.children)) {
    for (const child of data.children) {
      const node = processNode(child);
      if (node) result.push(node);
    }
  } else {
    const single = processNode(data);
    if (single) result.push(single);
  }

  return filterAndCleanNodes(result);
}

/**
 * Auto-detects HTML vs JSON content and parses.
 * @param {string} fileContent - Raw content of imported bookmark file.
 * @returns {Array} List of parsed bookmark nodes.
 */
function parseBookmarkFile(fileContent) {
  if (!fileContent || typeof fileContent !== 'string') return [];
  const trimmed = fileContent.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parseBookmarkJson(trimmed);
  }
  return parseBookmarkHtml(fileContent);
}

/**
 * Recursively cleans bookmark nodes by removing empty folders.
 */
function filterAndCleanNodes(nodes) {
  if (!Array.isArray(nodes)) return [];
  return nodes.filter(node => {
    if (node.type === 'link') {
      return Boolean(node.url && node.url.trim());
    } else if (node.type === 'folder') {
      if (Array.isArray(node.children)) {
        node.children = filterAndCleanNodes(node.children);
        return node.children.length > 0;
      }
      return false;
    }
    return false;
  });
}

/**
 * Parses Firefox places.sqlite database to extract bookmarks and history cleanly.
 * @param {object} db - better-sqlite3 Database instance connected to places.sqlite
 * @returns {object} { bookmarkNodes: Array, historyRows: Array }
 */
function parseFirefoxPlacesTree(db) {
  if (!db) return { bookmarkNodes: [], historyRows: [] };

  // 1. Extract History
  const historyRows = [];
  try {
    const rawHist = db.prepare(`
      SELECT url, title, visit_count, last_visit_date
      FROM moz_places
      WHERE url IS NOT NULL
        AND (url LIKE 'http://%' OR url LIKE 'https://%')
        AND (visit_count > 0 OR last_visit_date > 0)
      ORDER BY last_visit_date DESC
      LIMIT 2000
    `).all();

    for (const r of rawHist) {
      if (r.url && !r.url.startsWith('place:')) {
        historyRows.push({
          url: r.url,
          title: (r.title && r.title.trim()) || r.url,
          visitCount: r.visit_count || 1,
          lastVisitTime: r.last_visit_date ? Math.floor(r.last_visit_date / 1000) : Date.now()
        });
      }
    }
  } catch (e) {
    console.error('Error extracting Firefox history:', e);
  }

  // 2. Extract Bookmarks Tree
  let bookmarkNodes = [];
  try {
    // Find tag folders to strictly exclude all tags and keyword mappings
    const tagFolders = db.prepare(`
      SELECT id FROM moz_bookmarks WHERE guid = 'tags________' OR parent = (SELECT id FROM moz_bookmarks WHERE guid = 'tags________')
    `).all().map(row => row.id);
    const tagIdSet = new Set(tagFolders);

    // Fetch all bookmarks and folders
    const allRows = db.prepare(`
      SELECT b.id, b.type, b.title, b.parent, b.position, b.guid, p.url
      FROM moz_bookmarks b
      LEFT JOIN moz_places p ON b.fk = p.id
      ORDER BY b.parent, b.position ASC
    `).all();

    // Group items by parent ID
    const byParent = new Map();
    for (const row of allRows) {
      if (tagIdSet.has(row.parent) || tagIdSet.has(row.id)) continue;

      if (!byParent.has(row.parent)) {
        byParent.set(row.parent, []);
      }
      byParent.get(row.parent).push(row);
    }

    // Recursive helper to build node hierarchy
    const buildHierarchy = (parentId) => {
      const children = byParent.get(parentId) || [];
      const nodes = [];

      for (const item of children) {
        if (item.type === 2) {
          // Folder (type 2)
          const folderTitle = (item.title && item.title.trim()) || 'Bookmarks Folder';
          const subChildren = buildHierarchy(item.id);
          if (subChildren.length > 0) {
            nodes.push({
              id: generateId(),
              type: 'folder',
              title: folderTitle,
              isOpen: false,
              children: subChildren
            });
          }
        } else if (item.type === 1 && item.url) {
          // Link (type 1)
          const url = item.url.trim();
          if (
            url.startsWith('http://') ||
            url.startsWith('https://') ||
            url.startsWith('file://')
          ) {
            nodes.push({
              id: generateId(),
              type: 'link',
              title: (item.title && item.title.trim()) || url,
              url: url,
              favicon: null
            });
          }
        }
      }
      return nodes;
    };

    // Standard Firefox root containers
    const standardRootRows = db.prepare(`
      SELECT id, guid, title FROM moz_bookmarks WHERE guid IN ('toolbar_____', 'menu________', 'unfiled_____', 'mobile______') OR id IN (2, 3, 5, 6)
    `).all();

    const rootIds = Array.from(new Set(standardRootRows.map(r => r.id)));
    if (rootIds.length === 0) rootIds.push(2, 3, 5, 6);

    for (const rId of rootIds) {
      const topNodes = buildHierarchy(rId);
      bookmarkNodes.push(...topNodes);
    }

    bookmarkNodes = filterAndCleanNodes(bookmarkNodes);
  } catch (e) {
    console.error('Error extracting Firefox bookmarks tree:', e);
  }

  return { bookmarkNodes, historyRows };
}

module.exports = {
  parseBookmarkHtml,
  parseBookmarkJson,
  parseBookmarkFile,
  parseFirefoxPlacesTree,
  decodeHTMLEntities,
  filterAndCleanNodes
};
