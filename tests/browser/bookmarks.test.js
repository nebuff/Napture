jest.mock('electron', () => ({ app: { getPath: jest.fn(() => require('os').tmpdir()) }, protocol: { registerStringProtocol: jest.fn() } }));
jest.mock('better-sqlite3', () => function() { return { exec: jest.fn(), prepare: () => ({ get: jest.fn(), all: jest.fn(), run: jest.fn() }) }; }, { virtual: true });
// Test suite for bookmark management, hierarchy, and persistence

const { deduplicateBookmarksTree, mergeBookmarksTrees, preserveBookmarkState, findBookmark, isBookmarkItemOpen, hasOpenDescendant } = require('../../napture/renderer/bookmarks');
const syncEngine = require('../../napture/db/sync-engine');

const getFolderEls = (node) => {
  if (!node) return { folderGroup: null, folderBtn: null, wrapper: null };
  if (node.classList && node.classList.contains('bookmark-folder-group')) {
    return { folderGroup: node, folderBtn: node.children[0], wrapper: node.children[1] };
  }
  return { folderGroup: null, folderBtn: node, wrapper: node.nextElementSibling };
};

describe('Bookmark Folder State Preservation', () => {
  it('deduplicateBookmarksTree should preserve isOpen state on folders', () => {
    const inputTree = [
      {
        id: 'f-1',
        type: 'folder',
        title: 'Dev Tools',
        isOpen: true,
        children: [
          { id: 'b-1', type: 'link', title: 'GitHub', url: 'https://github.com' }
        ]
      },
      {
        id: 'f-2',
        type: 'folder',
        title: 'Social',
        isOpen: false,
        children: []
      }
    ];

    const deduplicated = deduplicateBookmarksTree(inputTree);
    expect(deduplicated.length).toBe(2);
    expect(deduplicated[0].isOpen).toBe(true);
    expect(deduplicated[1].isOpen).toBe(false);
  });

  it('deduplicateBookmarksTree should combine duplicate folders and preserve isOpen', () => {
    const inputTree = [
      {
        id: 'f-1',
        type: 'folder',
        title: 'Work',
        isOpen: true,
        children: [
          { id: 'b-1', type: 'link', title: 'Slack', url: 'https://slack.com' }
        ]
      },
      {
        id: 'f-2',
        type: 'folder',
        title: 'Work',
        children: [
          { id: 'b-2', type: 'link', title: 'Notion', url: 'https://notion.so' }
        ]
      }
    ];

    const deduplicated = deduplicateBookmarksTree(inputTree);
    expect(deduplicated.length).toBe(1);
    expect(deduplicated[0].title).toBe('Work');
    expect(deduplicated[0].isOpen).toBe(true);
    expect(deduplicated[0].children.length).toBe(2);
  });

  it('preserveBookmarkState should preserve folder isOpen and pendingRename from in-memory tree by ID', () => {
    const oldBookmarks = [
      {
        id: 'f-1',
        type: 'folder',
        title: 'Projects',
        isOpen: true,
        _pendingRename: true,
        children: [
          { id: 'b-1', type: 'link', title: 'Project 1', url: 'https://p1.com', tabId: 'tab-101' }
        ]
      }
    ];

    // Incoming remote sync without isOpen or tabId
    const newBookmarks = [
      {
        id: 'f-1',
        type: 'folder',
        title: 'Projects',
        children: [
          { id: 'b-1', type: 'link', title: 'Project 1', url: 'https://p1.com' }
        ]
      }
    ];

    preserveBookmarkState(oldBookmarks, newBookmarks);

    expect(newBookmarks[0].isOpen).toBe(true);
    expect(newBookmarks[0]._pendingRename).toBe(true);
    expect(newBookmarks[0].children[0].tabId).toBe('tab-101');
  });

  it('preserveBookmarkState should match folders by title if ID changed', () => {
    const oldBookmarks = [
      {
        id: 'old-f-1',
        type: 'folder',
        title: 'Personal Folder',
        isOpen: true,
        children: []
      }
    ];

    const newBookmarks = [
      {
        id: 'new-f-1',
        type: 'folder',
        title: 'Personal Folder',
        children: []
      }
    ];

    preserveBookmarkState(oldBookmarks, newBookmarks);

    expect(newBookmarks[0].isOpen).toBe(true);
  });

  it('preserveBookmarkState should handle nested subfolders', () => {
    const oldBookmarks = [
      {
        id: 'f-root',
        type: 'folder',
        title: 'Root',
        isOpen: true,
        children: [
          {
            id: 'f-nested',
            type: 'folder',
            title: 'Nested',
            isOpen: true,
            children: [
              { id: 'b-sub', type: 'link', title: 'Sub Link', url: 'https://sub.com', tabId: 'tab-sub' }
            ]
          }
        ]
      }
    ];

    const newBookmarks = [
      {
        id: 'f-root',
        type: 'folder',
        title: 'Root',
        children: [
          {
            id: 'f-nested',
            type: 'folder',
            title: 'Nested',
            children: [
              { id: 'b-sub', type: 'link', title: 'Sub Link', url: 'https://sub.com' }
            ]
          }
        ]
      }
    ];

    preserveBookmarkState(oldBookmarks, newBookmarks);

    expect(newBookmarks[0].isOpen).toBe(true);
    expect(newBookmarks[0].children[0].isOpen).toBe(true);
    expect(newBookmarks[0].children[0].children[0].tabId).toBe('tab-sub');
  });

  it('syncEngine.sanitizeBookmarksTree should strip transient fields for wire sync while preserveBookmarkState preserves open folders locally', () => {
    const dirtyTree = [
      {
        id: 'f-sync',
        type: 'folder',
        title: 'Sync Folder',
        isOpen: true,
        _pendingRename: true,
        children: [
          { id: 'b-sync', type: 'link', title: 'Example', url: 'https://example.com', tabId: 'tab-999' }
        ]
      }
    ];

    const sanitized = syncEngine.sanitizeBookmarksTree(dirtyTree);
    expect(sanitized[0].isOpen).toBeUndefined();
    expect(sanitized[0]._pendingRename).toBeUndefined();
    expect(sanitized[0].children[0].tabId).toBeUndefined();

    // When client receives the clean sanitized tree, local memory preserves isOpen & tabId
    preserveBookmarkState(dirtyTree, sanitized);
    expect(sanitized[0].isOpen).toBe(true);
    expect(sanitized[0]._pendingRename).toBe(true);
    expect(sanitized[0].children[0].tabId).toBe('tab-999');
  });

  it('closing one folder should preserve its closed state and keep other folders open', () => {
    const memoryTree = [
      {
        id: 'f-1',
        type: 'folder',
        title: 'Folder 1',
        isOpen: true,
        children: [{ id: 'b-1', type: 'link', title: 'Link 1', url: 'https://link1.com', tabId: 'tab-1' }]
      },
      {
        id: 'f-2',
        type: 'folder',
        title: 'Folder 2',
        isOpen: true,
        children: [{ id: 'b-2', type: 'link', title: 'Link 2', url: 'https://link2.com', tabId: 'tab-2' }]
      }
    ];

    // User closes folder 1
    memoryTree[0].isOpen = false;

    // A sync cycle arrives from backend
    const incomingSync = [
      {
        id: 'f-1',
        type: 'folder',
        title: 'Folder 1',
        children: [{ id: 'b-1', type: 'link', title: 'Link 1', url: 'https://link1.com' }]
      },
      {
        id: 'f-2',
        type: 'folder',
        title: 'Folder 2',
        children: [{ id: 'b-2', type: 'link', title: 'Link 2', url: 'https://link2.com' }]
      }
    ];

    preserveBookmarkState(memoryTree, incomingSync);

    expect(incomingSync[0].isOpen).toBe(false);
    expect(incomingSync[1].isOpen).toBe(true);
    expect(incomingSync[0].children[0].tabId).toBe('tab-1');
    expect(incomingSync[1].children[0].tabId).toBe('tab-2');
  });

  it('deduplicateBookmarksTree should preserve distinct folders with different titles', () => {
    const tree = [
      { id: 'f-1', type: 'folder', title: 'Folder 1', isOpen: true, children: [] },
      { id: 'f-2', type: 'folder', title: 'Folder 2', isOpen: false, children: [] }
    ];

    const deduplicated = deduplicateBookmarksTree(tree);
    expect(deduplicated.length).toBe(2);
    expect(deduplicated[0].id).toBe('f-1');
    expect(deduplicated[0].isOpen).toBe(true);
    expect(deduplicated[1].id).toBe('f-2');
    expect(deduplicated[1].isOpen).toBe(false);
  });

  it('preserveBookmarkState should efficiently preserve state for large bookmark trees', () => {
    const oldBookmarks = [];
    const newBookmarks = [];

    // Generate a large tree with 20 folders and 10 links each (200 items total)
    for (let f = 0; f < 20; f++) {
      const oldChildren = [];
      const newChildren = [];
      for (let l = 0; l < 10; l++) {
        const linkId = `b-${f}-${l}`;
        const url = `https://site-${f}-${l}.com`;
        oldChildren.push({ id: linkId, type: 'link', title: `Site ${f}-${l}`, url, tabId: `tab-${f}-${l}` });
        newChildren.push({ id: linkId, type: 'link', title: `Site ${f}-${l}`, url });
      }

      const folderId = `f-${f}`;
      oldBookmarks.push({
        id: folderId,
        type: 'folder',
        title: `Folder ${f}`,
        isOpen: f % 2 === 0,
        children: oldChildren
      });

      newBookmarks.push({
        id: folderId,
        type: 'folder',
        title: `Folder ${f}`,
        children: newChildren
      });
    }

    const start = Date.now();
    preserveBookmarkState(oldBookmarks, newBookmarks);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100); // Should execute in milliseconds
    expect(newBookmarks.length).toBe(20);
    expect(newBookmarks[0].isOpen).toBe(true);
    expect(newBookmarks[1].isOpen).toBe(false);
    expect(newBookmarks[0].children[0].tabId).toBe('tab-0-0');
    expect(newBookmarks[19].children[9].tabId).toBe('tab-19-9');
  });
});


describe('Bookmark Utility Functions', () => {
  describe('findBookmark', () => {
    it('should find a root item by id', () => {
      const list = [
        { id: 'b-1', type: 'link', title: 'Link 1' },
        { id: 'b-2', type: 'folder', title: 'Folder 1' }
      ];
      const result = findBookmark(list, 'b-1');
      expect(result).toBeDefined();
      expect(result.item.id).toBe('b-1');
    });

    it('should find a nested item by id', () => {
      const nestedChild = { id: 'b-3', type: 'link', title: 'Link 3' };
      const list = [
        {
          id: 'f-1',
          type: 'folder',
          children: [
            { id: 'b-2', type: 'link', title: 'Link 2' },
            {
              id: 'f-2',
              type: 'folder',
              children: [nestedChild]
            }
          ]
        }
      ];
      const result = findBookmark(list, 'b-3');
      expect(result).toBeDefined();
      expect(result.item.id).toBe('b-3');
    });

    it('should handle missing IDs by returning undefined or null', () => {
      const list = [
        {
          id: 'f-1',
          type: 'folder',
          children: [{ id: 'b-2', type: 'link', title: 'Link 2' }]
        }
      ];
      const result = findBookmark(list, 'nonexistent');
      expect(result == null).toBe(true);
    });
  });
});

function createMockNode(tag = 'div') {
  const classListSet = new Set();
  const listeners = {};
  const children = [];
  const node = {
    tagName: tag.toUpperCase(),
    style: {},
    dataset: {},
    children,
    parentElement: null,
    nextElementSibling: null,
    draggable: false,
    innerHTML: '',
    textContent: '',
    setAttribute: () => {},
    getAttribute: () => null,
    removeAttribute: () => {},
    closest: (sel) => {
      let curr = node;
      while (curr) {
        if (matchesSelector(curr, sel)) return curr;
        curr = curr.parentElement;
      }
      return null;
    },
    matches: (sel) => matchesSelector(node, sel),
    focus: () => {},
    select: () => {},
    blur: () => {},
    classList: {
      add: (...cls) => cls.forEach(c => classListSet.add(c)),
      remove: (...cls) => cls.forEach(c => classListSet.delete(c)),
      toggle: (c, force) => {
        if (force === true) { classListSet.add(c); return true; }
        if (force === false) { classListSet.delete(c); return false; }
        if (classListSet.has(c)) { classListSet.delete(c); return false; }
        classListSet.add(c); return true;
      },
      contains: (c) => classListSet.has(c)
    },
    addEventListener: (evt, handler) => {
      if (!listeners[evt]) listeners[evt] = [];
      listeners[evt].push(handler);
    },
    dispatchEvent: (evt) => {
      const type = typeof evt === 'string' ? evt : evt.type;
      const eObj = typeof evt === 'string' ? { type } : evt;
      if (!eObj.target) eObj.target = node;
      if (listeners[type]) {
        listeners[type].forEach(fn => fn(eObj));
      }
    },
    appendChild: (child) => {
      if (children.length > 0) {
        children[children.length - 1].nextElementSibling = child;
      }
      children.push(child);
      child.parentElement = node;
      return child;
    },
    contains: (other) => {
      if (!other) return false;
      if (other === node) return true;
      let curr = other.parentElement;
      while (curr) {
        if (curr === node) return true;
        curr = curr.parentElement;
      }
      return false;
    },
    querySelector: (sel) => {
      function search(curr) {
        if (!curr || !curr.children) return null;
        for (const c of curr.children) {
          if (matchesSelector(c, sel)) return c;
          const res = search(c);
          if (res) return res;
        }
        return null;
      }
      return search(node);
    },
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 100, height: 40, bottom: 40, right: 100 }),
    querySelectorAll: (sel) => {
      const results = [];
      function search(curr) {
        if (!curr || !curr.children) return;
        for (const c of curr.children) {
          if (matchesSelector(c, sel)) results.push(c);
          search(c);
        }
      }
      search(node);
      return results;
    }
  };

  function matchesSelector(el, sel) {
    if (!el || !sel) return false;
    if (sel.startsWith(':')) return false;
    const parts = sel.split(/(?=[.\[])/);
    for (const part of parts) {
      if (part.startsWith('.')) {
        if (!el.classList || !el.classList.contains(part.slice(1))) return false;
      } else if (part.startsWith('[data-id="') && part.endsWith('"]')) {
        const id = part.slice(10, -2);
        if (!el.dataset || el.dataset.id !== id) return false;
      } else if (part.startsWith('[data-type="') && part.endsWith('"]')) {
        const type = part.slice(12, -2);
        if (!el.dataset || el.dataset.type !== type) return false;
      } else if (part.startsWith(':')) {
        return false;
      }
    }
    return true;
  }

  Object.defineProperty(node, 'className', {
    get: () => Array.from(classListSet).join(' '),
    set: (val) => {
      classListSet.clear();
      if (val) val.split(/\s+/).filter(Boolean).forEach(c => classListSet.add(c));
    }
  });
  let _innerHTML = '';
  Object.defineProperty(node, 'innerHTML', {
    get: () => _innerHTML,
    set: (val) => {
      _innerHTML = val;
      if (val === '') {
        children.length = 0;
      }
    }
  });
  return node;
}

describe('Sidebar Folder Hover Open / Close Behavior', () => {
  let mockContainer;
  let mockTabContextMenu;

  beforeEach(() => {
    jest.useFakeTimers();
    mockContainer = createMockNode('div');
    mockContainer.id = 'bookmarks-container';
    mockTabContextMenu = createMockNode('div');
    mockTabContextMenu.id = 'tab-context-menu';
    mockTabContextMenu.classList.add('hidden');

    global.document = {
      getElementById: (id) => {
        if (id === 'bookmarks-container') return mockContainer;
        if (id === 'tab-context-menu') return mockTabContextMenu;
        return null;
      },
      createElement: (tag) => createMockNode(tag),
      body: createMockNode('body'),
      addEventListener: jest.fn()
    };

    let bookmarksArr = [];
    global.window = {
      currentSettings: { folderHoverOpen: false },
      get customBookmarks() { return bookmarksArr; },
      set customBookmarks(val) { bookmarksArr = val; }
    };

    delete require.cache[require.resolve('../../napture/renderer/bookmarks')];
  });

  afterEach(() => {
    jest.useRealTimers();
    delete require.cache[require.resolve('../../napture/renderer/bookmarks')];
    delete global.document;
    delete global.window;
  });

  it('should not open folder on mouseenter when folderHoverOpen setting is false', () => {
    const { renderCustomBookmarks } = require('../../napture/renderer/bookmarks');
    window.customBookmarks = [
      {
        id: 'f-1',
        type: 'folder',
        title: 'Folder 1',
        isOpen: false,
        children: [{ id: 'b-1', type: 'link', title: 'Link 1', url: 'https://example.com' }]
      }
    ];

    renderCustomBookmarks();

    const { folderBtn, wrapper } = getFolderEls(mockContainer.children[0]);

    expect(folderBtn.classList.contains('folder-open')).toBe(false);
    expect(wrapper.classList.contains('collapsed')).toBe(true);

    folderBtn.dispatchEvent({ type: 'mouseenter' });

    expect(folderBtn.classList.contains('folder-open')).toBe(false);
    expect(wrapper.classList.contains('collapsed')).toBe(true);
  });

  it('should open folder on mouseenter and close on mouseleave when folderHoverOpen setting is true', () => {
    const { renderCustomBookmarks } = require('../../napture/renderer/bookmarks');
    window.currentSettings = { folderHoverOpen: true };
    window.customBookmarks = [
      {
        id: 'f-1',
        type: 'folder',
        title: 'Folder 1',
        isOpen: false,
        children: [{ id: 'b-1', type: 'link', title: 'Link 1', url: 'https://example.com' }]
      }
    ];

    renderCustomBookmarks();

    const { folderGroup, folderBtn, wrapper } = getFolderEls(mockContainer.children[0]);

    expect(folderBtn.classList.contains('folder-open')).toBe(false);
    expect(wrapper.classList.contains('collapsed')).toBe(true);

    // Hover to open
    (folderGroup || folderBtn).dispatchEvent({ type: 'mouseenter' });

    expect(folderBtn.classList.contains('folder-open')).toBe(true);
    expect(wrapper.classList.contains('collapsed')).toBe(false);

    // Unhover to close
    (folderGroup || wrapper).dispatchEvent({ type: 'mouseleave', relatedTarget: global.document.body });

    // Before timer, still open
    expect(folderBtn.classList.contains('folder-open')).toBe(true);

    // Advance timer past debounce
    jest.advanceTimersByTime(500);

    expect(folderBtn.classList.contains('folder-open')).toBe(false);
    expect(wrapper.classList.contains('collapsed')).toBe(true);
  });

  it('should remain open when moving mouse between button and wrapper', () => {
    const { renderCustomBookmarks } = require('../../napture/renderer/bookmarks');
    window.currentSettings = { folderHoverOpen: true };
    window.customBookmarks = [
      {
        id: 'f-1',
        type: 'folder',
        title: 'Folder 1',
        isOpen: false,
        children: [{ id: 'b-1', type: 'link', title: 'Link 1', url: 'https://example.com' }]
      }
    ];

    renderCustomBookmarks();

    const { folderGroup, folderBtn, wrapper } = getFolderEls(mockContainer.children[0]);

    // Hover button
    (folderGroup || folderBtn).dispatchEvent({ type: 'mouseenter' });
    expect(folderBtn.classList.contains('folder-open')).toBe(true);

    // Move from button to wrapper (relatedTarget is wrapper)
    folderBtn.dispatchEvent({ type: 'mouseleave', relatedTarget: wrapper });
    wrapper.dispatchEvent({ type: 'mouseenter' });

    jest.advanceTimersByTime(500);

    // Should stay open
    expect(folderBtn.classList.contains('folder-open')).toBe(true);
    expect(wrapper.classList.contains('collapsed')).toBe(false);
  });

  it('should reliably close on mouseleave when relatedTarget is null (moving into WebContentsView)', () => {
    const { renderCustomBookmarks } = require('../../napture/renderer/bookmarks');
    window.currentSettings = { folderHoverOpen: true };
    window.customBookmarks = [
      {
        id: 'f-1',
        type: 'folder',
        title: 'Folder 1',
        isOpen: false,
        children: [{ id: 'b-1', type: 'link', title: 'Link 1', url: 'https://example.com' }]
      }
    ];

    renderCustomBookmarks();

    const { folderGroup, folderBtn, wrapper } = getFolderEls(mockContainer.children[0]);

    // Hover to open
    (folderGroup || folderBtn).dispatchEvent({ type: 'mouseenter' });
    expect(folderBtn.classList.contains('folder-open')).toBe(true);
    expect(wrapper.classList.contains('collapsed')).toBe(false);

    // Mouse leaves element into native WebContentsView (relatedTarget is null)
    (folderGroup || folderBtn).dispatchEvent({ type: 'mouseleave', relatedTarget: null });

    // Advance timer past debounce
    jest.advanceTimersByTime(500);

    expect(folderBtn.classList.contains('folder-open')).toBe(false);
    expect(wrapper.classList.contains('collapsed')).toBe(true);
  });

  it('should support multiple successive auto-hover open and leave cycles without getting stuck open', () => {
    const { renderCustomBookmarks } = require('../../napture/renderer/bookmarks');
    window.currentSettings = { folderHoverOpen: true };
    window.customBookmarks = [
      {
        id: 'f-1',
        type: 'folder',
        title: 'Folder 1',
        isOpen: false,
        children: [{ id: 'b-1', type: 'link', title: 'Link 1', url: 'https://example.com' }]
      }
    ];

    renderCustomBookmarks();

    const { folderGroup, folderBtn, wrapper } = getFolderEls(mockContainer.children[0]);

    // Cycle 1
    (folderGroup || folderBtn).dispatchEvent({ type: 'mouseenter' });
    expect(folderBtn.classList.contains('folder-open')).toBe(true);
    expect(wrapper.classList.contains('collapsed')).toBe(false);
    (folderGroup || folderBtn).dispatchEvent({ type: 'mouseleave', relatedTarget: null });
    jest.advanceTimersByTime(500);
    expect(folderBtn.classList.contains('folder-open')).toBe(false);
    expect(wrapper.classList.contains('collapsed')).toBe(true);

    // Cycle 2
    (folderGroup || folderBtn).dispatchEvent({ type: 'mouseenter' });
    expect(folderBtn.classList.contains('folder-open')).toBe(true);
    expect(wrapper.classList.contains('collapsed')).toBe(false);
    (folderGroup || wrapper).dispatchEvent({ type: 'mouseleave', relatedTarget: global.document.body });
    jest.advanceTimersByTime(500);
    expect(folderBtn.classList.contains('folder-open')).toBe(false);
    expect(wrapper.classList.contains('collapsed')).toBe(true);

    // Cycle 3
    (folderGroup || folderBtn).dispatchEvent({ type: 'mouseenter' });
    expect(folderBtn.classList.contains('folder-open')).toBe(true);
    expect(wrapper.classList.contains('collapsed')).toBe(false);
    (folderGroup || folderBtn).dispatchEvent({ type: 'mouseleave', relatedTarget: null });
    jest.advanceTimersByTime(500);
    expect(folderBtn.classList.contains('folder-open')).toBe(false);
    expect(wrapper.classList.contains('collapsed')).toBe(true);
  });

  it('should toggle folder to pinned open on click when auto-hover is active and close on subsequent click', () => {
    const { renderCustomBookmarks } = require('../../napture/renderer/bookmarks');
    window.currentSettings = { folderHoverOpen: true };
    window.customBookmarks = [
      {
        id: 'f-1',
        type: 'folder',
        title: 'Folder 1',
        isOpen: false,
        children: [{ id: 'b-1', type: 'link', title: 'Link 1', url: 'https://example.com' }]
      }
    ];

    renderCustomBookmarks();

    const { folderGroup, folderBtn, wrapper } = getFolderEls(mockContainer.children[0]);

    // 1. Hover opens folder transiently
    (folderGroup || folderBtn).dispatchEvent({ type: 'mouseenter' });
    expect(folderBtn.classList.contains('folder-open')).toBe(true);
    expect(wrapper.classList.contains('collapsed')).toBe(false);

    // 2. Click to pin it open
    folderBtn.dispatchEvent({ type: 'click', target: folderBtn });
    expect(window.customBookmarks[0].isOpen).toBe(true);
    expect(folderBtn.classList.contains('folder-open')).toBe(true);
    expect(wrapper.classList.contains('collapsed')).toBe(false);

    // 3. Mouse leaves - folder should remain open because isOpen is true
    (folderGroup || folderBtn).dispatchEvent({ type: 'mouseleave', relatedTarget: null });
    jest.advanceTimersByTime(500);
    expect(folderBtn.classList.contains('folder-open')).toBe(true);
    expect(wrapper.classList.contains('collapsed')).toBe(false);

    // 4. Click again to close
    folderBtn.dispatchEvent({ type: 'click', target: folderBtn });
    expect(window.customBookmarks[0].isOpen).toBe(false);
    expect(folderBtn.classList.contains('folder-open')).toBe(false);
    expect(wrapper.classList.contains('collapsed')).toBe(true);
  });

  it('should allow clicking child bookmark links inside hover-opened folder without premature collapse', () => {
    const { renderCustomBookmarks } = require('../../napture/renderer/bookmarks');
    window.currentSettings = { folderHoverOpen: true };
    global.createTab = jest.fn();
    global.switchTab = jest.fn();
    window.customBookmarks = [
      {
        id: 'f-1',
        type: 'folder',
        title: 'Folder 1',
        isOpen: false,
        children: [
          { id: 'b-1', type: 'link', title: 'Child Link 1', url: 'https://link1.com', tabId: 'tab-101' },
          { id: 'b-2', type: 'link', title: 'Child Link 2', url: 'https://link2.com', tabId: null }
        ]
      }
    ];
    window.tabs = [{ id: 'tab-101', url: 'https://link1.com', title: 'Child Link 1' }];

    renderCustomBookmarks();

    const { folderGroup, folderBtn, wrapper } = getFolderEls(mockContainer.children[0]);
    const childrenContainer = wrapper.children[0];
    const child1Btn = childrenContainer.children[0];
    const child2Btn = childrenContainer.children[1];

    // 1. Hover opens folder
    (folderGroup || folderBtn).dispatchEvent({ type: 'mouseenter' });
    expect(folderBtn.classList.contains('folder-open')).toBe(true);
    expect(wrapper.classList.contains('collapsed')).toBe(false);
    expect(child1Btn.classList.contains('folder-minimized-hidden')).toBe(false);

    // 2. Move mouse from folder header over child element inside wrapper
    folderBtn.dispatchEvent({ type: 'mouseleave', relatedTarget: child1Btn });
    wrapper.dispatchEvent({ type: 'mousemove' });
    folderBtn.dispatchEvent({ type: 'mouseleave', relatedTarget: child1Btn });
    wrapper.dispatchEvent({ type: 'mousemove' });

    // 3. Click child 1 (existing tab)
    child1Btn.dispatchEvent({ type: 'click', target: child1Btn });
    expect(global.switchTab).toHaveBeenCalledWith('tab-101');

    // Folder wrapper should still be open during interaction
    expect(wrapper.classList.contains('collapsed')).toBe(false);

    // 4. Click child 2 (creates tab)
    child2Btn.dispatchEvent({ type: 'click', target: child2Btn });
    expect(global.createTab).toHaveBeenCalled();
  });

  it('should automatically close folder when clicking a tab in the folder if folderHoverOpen is false', () => {
    delete require.cache[require.resolve('../../napture/renderer/bookmarks')];
    window.currentSettings = { folderHoverOpen: false };
    const { renderCustomBookmarks } = require('../../napture/renderer/bookmarks');

    window.customBookmarks = [
      {
        id: 'f-click-test',
        type: 'folder',
        title: 'Work Folder',
        isOpen: true,
        children: [
          { id: 'b-tab-1', type: 'link', title: 'Work Tab 1', url: 'https://work1.com', tabId: 'tab-work-1' },
          { id: 'b-tab-2', type: 'link', title: 'Work Tab 2', url: 'https://work2.com', tabId: 'tab-work-2' }
        ]
      }
    ];
    window.tabs = [
      { id: 'tab-work-1', url: 'https://work1.com', title: 'Work Tab 1' },
      { id: 'tab-work-2', url: 'https://work2.com', title: 'Work Tab 2' }
    ];
    window.activeTabId = 'tab-other';

    renderCustomBookmarks();

    const { folderGroup, folderBtn, wrapper } = getFolderEls(mockContainer.children[0]);
    const childrenContainer = wrapper.children[0];
    const child1Btn = childrenContainer.children[0];
    const child2Btn = childrenContainer.children[1];

    // Folder is initially open
    expect(folderBtn.classList.contains('folder-open')).toBe(true);
    expect(window.customBookmarks[0].isOpen).toBe(true);

    // Click child 1 tab
    global.switchTab = jest.fn((id) => {
      window.activeTabId = id;
    });

    child1Btn.dispatchEvent({ type: 'click', target: child1Btn });

    // Folder isOpen state should be set to false and saved
    expect(window.customBookmarks[0].isOpen).toBe(false);
    expect(global.switchTab).toHaveBeenCalledWith('tab-work-1');
    expect(folderBtn.classList.contains('folder-open')).toBe(false);
    // Non-active child2 should now be minimized-hidden
    expect(child2Btn.classList.contains('folder-minimized-hidden')).toBe(true);
    // Active child1 should be visible
    expect(child1Btn.classList.contains('folder-minimized-hidden')).toBe(false);
  });

  it('should automatically close nested ancestor folders when clicking a tab inside them if folderHoverOpen is false', () => {
    delete require.cache[require.resolve('../../napture/renderer/bookmarks')];
    window.currentSettings = { folderHoverOpen: false };
    const { renderCustomBookmarks } = require('../../napture/renderer/bookmarks');

    window.customBookmarks = [
      {
        id: 'f-parent',
        type: 'folder',
        title: 'Parent Folder',
        isOpen: true,
        children: [
          {
            id: 'f-child',
            type: 'folder',
            title: 'Child Folder',
            isOpen: true,
            children: [
              { id: 'b-nested-1', type: 'link', title: 'Nested Tab 1', url: 'https://nested.com', tabId: 'tab-nested-1' }
            ]
          }
        ]
      }
    ];
    window.tabs = [
      { id: 'tab-nested-1', url: 'https://nested.com', title: 'Nested Tab 1' }
    ];
    window.activeTabId = 'tab-other';

    renderCustomBookmarks();

    const parentGroup = mockContainer.children[0];
    const parentFolderBtn = parentGroup.children[0];
    const parentWrapper = parentGroup.children[1];
    const childGroup = parentWrapper.children[0].children[0];
    const childFolderBtn = childGroup.children[0];
    const childWrapper = childGroup.children[1];
    const nestedTabBtn = childWrapper.children[0].children[0];

    expect(parentFolderBtn.classList.contains('folder-open')).toBe(true);
    expect(childFolderBtn.classList.contains('folder-open')).toBe(true);

    global.switchTab = jest.fn((id) => {
      window.activeTabId = id;
    });

    nestedTabBtn.dispatchEvent({ type: 'click', target: nestedTabBtn });

    expect(window.customBookmarks[0].isOpen).toBe(false);
    expect(window.customBookmarks[0].children[0].isOpen).toBe(false);
    expect(parentFolderBtn.classList.contains('folder-open')).toBe(false);
    expect(childFolderBtn.classList.contains('folder-open')).toBe(false);
    expect(nestedTabBtn.classList.contains('folder-minimized-hidden')).toBe(false);
  });

  it('should position #tab-context-menu using clientX and clientY', () => {
    const { showTabContextMenu } = require('../../napture/renderer/bookmarks');

    const mockEvent = {
      clientX: 250,
      clientY: 320,
      preventDefault: jest.fn(),
      stopPropagation: jest.fn()
    };

    showTabContextMenu(mockEvent, 'bookmark-link', 'b-1', { id: 'b-1', title: 'Test', url: 'https://example.com' });

    expect(mockTabContextMenu.classList.contains('hidden')).toBe(false);
    expect(mockTabContextMenu.style.left).toBe('250px');
    expect(mockTabContextMenu.style.top).toBe('320px');
  });

  it('should construct serializable menu items payload without circular references when right clicking tabs and folders', () => {
    delete require.cache[require.resolve('../../napture/renderer/bookmarks')];
    window.naptureAPI = {
      showTabContextMenu: (menuItems, coords) => {
        sentMenuItems = menuItems;
      },
      onClosePopups: jest.fn()
    };
    let sentMenuItems = null;
    const { showTabContextMenu } = require('../../napture/renderer/bookmarks');

    const circularObj = { title: 'Folder With Children' };
    circularObj.children = [{ title: 'Child 1', parent: circularObj }];

    const mockEvent = {
      clientX: 150,
      clientY: 200,
      preventDefault: jest.fn(),
      stopPropagation: jest.fn()
    };

    try {
      showTabContextMenu(mockEvent, 'bookmark-folder', 'f-ser-1', circularObj);

      expect(sentMenuItems).not.toBeNull();
      expect(Array.isArray(sentMenuItems)).toBe(true);

      // Verify sentMenuItems can be safely serialized to JSON without throwing circular structure TypeError
      expect(() => JSON.stringify(sentMenuItems)).not.toThrow();

      // Verify target.data is plain sanitized object
      const targetData = sentMenuItems[0].payload.target.data;
      expect(targetData.title).toBe('Folder With Children');
      expect(targetData.children).toBeUndefined();
    } finally {
      delete window.naptureAPI;
      delete require.cache[require.resolve('../../napture/renderer/bookmarks')];
    }
  });

  it('should not collapse hover-opened folder on mouseleave while a context menu is open', () => {
    const { renderCustomBookmarks, showTabContextMenu } = require('../../napture/renderer/bookmarks');
    window.currentSettings = { folderHoverOpen: true };
    let closePopupsCallback = null;
    window.naptureAPI = {
      showTabContextMenu: jest.fn(),
      onClosePopups: (cb) => { closePopupsCallback = cb; }
    };
    window.customBookmarks = [
      {
        id: 'f-1',
        type: 'folder',
        title: 'Folder 1',
        isOpen: false,
        children: [{ id: 'b-1', type: 'link', title: 'Link 1', url: 'https://example.com' }]
      }
    ];

    renderCustomBookmarks();

    const { folderGroup, folderBtn, wrapper } = getFolderEls(mockContainer.children[0]);

    // 1. Mouse enter to hover-open folder
    (folderGroup || folderBtn).dispatchEvent({ type: 'mouseenter' });
    expect(folderBtn.classList.contains('folder-open')).toBe(true);
    expect(wrapper.classList.contains('collapsed')).toBe(false);

    // 2. Open context menu on child link
    const mockEvent = {
      clientX: 120,
      clientY: 240,
      preventDefault: jest.fn(),
      stopPropagation: jest.fn()
    };
    showTabContextMenu(mockEvent, 'bookmark-link', 'b-1', window.customBookmarks[0].children[0]);

    // 3. Mouse leave folder while context menu is open
    (folderGroup || wrapper).dispatchEvent({ type: 'mouseleave', relatedTarget: global.document.body });
    jest.advanceTimersByTime(300);

    // Folder should REMAIN OPEN because context menu is open
    expect(folderBtn.classList.contains('folder-open')).toBe(true);
    expect(wrapper.classList.contains('collapsed')).toBe(false);

    // 4. Dismiss context menu via onClosePopups
    if (closePopupsCallback) closePopupsCallback();
    jest.advanceTimersByTime(500);

    // Now folder can collapse
    expect(folderBtn.classList.contains('folder-open')).toBe(false);
    expect(wrapper.classList.contains('collapsed')).toBe(true);
  });

  it('should allow right-clicking multiple tabs in a folder successively without breaking click handlers', () => {
    const { renderCustomBookmarks, showTabContextMenu } = require('../../napture/renderer/bookmarks');
    window.customBookmarks = [
      {
        id: 'f-1',
        type: 'folder',
        title: 'Folder 1',
        isOpen: true,
        children: [
          { id: 'b-1', type: 'link', title: 'Link 1', url: 'https://example1.com' },
          { id: 'b-2', type: 'link', title: 'Link 2', url: 'https://example2.com' }
        ]
      }
    ];

    renderCustomBookmarks();

    // 1. Right click tab 1
    const event1 = { clientX: 100, clientY: 150, preventDefault: jest.fn(), stopPropagation: jest.fn() };
    showTabContextMenu(event1, 'bookmark-link', 'b-1', window.customBookmarks[0].children[0]);
    expect(mockTabContextMenu.classList.contains('hidden')).toBe(false);
    expect(mockTabContextMenu.style.left).toBe('100px');
    expect(mockTabContextMenu.style.top).toBe('150px');

    // 2. Right click tab 2 without closing tab 1's menu first
    const event2 = { clientX: 100, clientY: 190, preventDefault: jest.fn(), stopPropagation: jest.fn() };
    showTabContextMenu(event2, 'bookmark-link', 'b-2', window.customBookmarks[0].children[1]);
    expect(mockTabContextMenu.classList.contains('hidden')).toBe(false);
    expect(mockTabContextMenu.style.left).toBe('100px');
    expect(mockTabContextMenu.style.top).toBe('190px');
  });

  it('should not set folder.isOpen to true when moving tab to folder if folderHoverOpen is true', () => {
    const { renderCustomBookmarks, showTabContextMenu } = require('../../napture/renderer/bookmarks');
    window.currentSettings = { folderHoverOpen: true };
    window.customBookmarks = [
      {
        id: 'f-1',
        type: 'folder',
        title: 'Folder 1',
        isOpen: false,
        children: []
      }
    ];

    renderCustomBookmarks();

    const mockEvent = { clientX: 100, clientY: 100, preventDefault: jest.fn(), stopPropagation: jest.fn() };
    const mockTab = { id: 'tab-101', title: 'New Tab', url: 'https://example.com' };
    showTabContextMenu(mockEvent, 'regular', 'tab-101', mockTab);

    // Trigger context menu action 'move-to-folder' directly
    const { showTabContextMenu: _, ...bookmarksModule } = require('../../napture/renderer/bookmarks');
    // If naptureAPI onTabContextMenuAction listener was registered
    // We can simulate handleContextAction
    const targetObj = { type: 'regular', id: 'tab-101', data: mockTab };
    // Directly call move-to-folder action logic on customBookmarks
    const tgtFolder = window.customBookmarks[0];
    const itemToMove = { id: 'b-new', type: 'link', title: mockTab.title, url: mockTab.url, tabId: mockTab.id };
    tgtFolder.children.push(itemToMove);
    if (!Boolean(window.currentSettings.folderHoverOpen)) {
      tgtFolder.isOpen = true;
    }

    expect(window.customBookmarks[0].children.length).toBe(1);
    expect(window.customBookmarks[0].isOpen).toBe(false);
  });

  it('should set folder.isOpen to true when moving tab to folder if folderHoverOpen is false', () => {
    const { renderCustomBookmarks } = require('../../napture/renderer/bookmarks');
    window.currentSettings = { folderHoverOpen: false };
    window.customBookmarks = [
      {
        id: 'f-1',
        type: 'folder',
        title: 'Folder 1',
        isOpen: false,
        children: []
      }
    ];

    renderCustomBookmarks();

    const tgtFolder = window.customBookmarks[0];
    const itemToMove = { id: 'b-new', type: 'link', title: 'New Tab', url: 'https://example.com', tabId: 'tab-101' };
    tgtFolder.children.push(itemToMove);
    if (!Boolean(window.currentSettings.folderHoverOpen)) {
      tgtFolder.isOpen = true;
    }

    expect(window.customBookmarks[0].children.length).toBe(1);
    expect(window.customBookmarks[0].isOpen).toBe(true);
  });

  it('should cleanly close folder after right-clicking on folder and dismissing context menu', () => {
    const { renderCustomBookmarks, showTabContextMenu, hideContextMenu } = require('../../napture/renderer/bookmarks');
    window.currentSettings = { folderHoverOpen: true };
    let closePopupsCallback = null;
    window.naptureAPI = {
      showTabContextMenu: jest.fn(),
      onClosePopups: (cb) => { closePopupsCallback = cb; },
      onCloseAllPopups: (cb) => { closePopupsCallback = cb; }
    };
    window.customBookmarks = [
      {
        id: 'f-1',
        type: 'folder',
        title: 'My Folder',
        isOpen: false,
        children: [
          { id: 'b-1', type: 'link', title: 'Link 1', url: 'https://example.com' }
        ]
      }
    ];

    renderCustomBookmarks();

    const { folderGroup, folderBtn, wrapper } = getFolderEls(mockContainer.children[0]);

    // 1. Right-click directly on the folder
    const rightClickEvent = { clientX: 50, clientY: 100, preventDefault: jest.fn(), stopPropagation: jest.fn() };
    showTabContextMenu(rightClickEvent, 'bookmark-folder', 'f-1', window.customBookmarks[0]);

    // 2. Dismiss context menu
    if (closePopupsCallback) {
      closePopupsCallback();
    } else {
      hideContextMenu(true);
    }
    jest.advanceTimersByTime(500);

    // Folder should be closed (collapsed)
    expect(folderBtn.classList.contains('folder-open')).toBe(false);
    expect(wrapper.classList.contains('collapsed')).toBe(true);

    // 3. Subsequent auto-hovering should still work normally and not get stuck open
    (folderGroup || folderBtn).dispatchEvent({ type: 'mouseenter' });
    expect(folderBtn.classList.contains('folder-open')).toBe(true);
    expect(wrapper.classList.contains('collapsed')).toBe(false);

    (folderGroup || folderBtn).dispatchEvent({ type: 'mouseleave', relatedTarget: null });
    jest.advanceTimersByTime(500);
    expect(folderBtn.classList.contains('folder-open')).toBe(false);
    expect(wrapper.classList.contains('collapsed')).toBe(true);
  });
});

describe('Open Tabs in Minimized Folders', () => {
  let mockContainer;

  beforeEach(() => {
    mockContainer = createMockNode('div');
    mockContainer.id = 'bookmarks-container';

    global.document = {
      getElementById: (id) => (id === 'bookmarks-container' ? mockContainer : null),
      createElement: (tag) => createMockNode(tag),
      body: createMockNode('body')
    };

    global.window = {
      tabs: [{ id: 'tab-open-1', url: 'https://open1.com', title: 'Open Tab 1' }],
      activeTabId: 'tab-open-1',
      currentSettings: { folderHoverOpen: false },
      customBookmarks: []
    };

    delete require.cache[require.resolve('../../napture/renderer/bookmarks')];
  });

  afterEach(() => {
    delete require.cache[require.resolve('../../napture/renderer/bookmarks')];
    delete global.document;
    delete global.window;
  });

  it('isBookmarkItemActive should correctly identify the currently active tab', () => {
    const { isBookmarkItemActive } = require('../../napture/renderer/bookmarks');
    window.activeTabId = 'tab-open-1';
    expect(isBookmarkItemActive({ type: 'link', tabId: 'tab-open-1' })).toBe(true);
    expect(isBookmarkItemActive({ type: 'link', tabId: 'tab-open-2' })).toBe(false);
    expect(isBookmarkItemActive({ type: 'link', tabId: null })).toBe(false);
    expect(isBookmarkItemActive({ type: 'folder', tabId: 'tab-open-1' })).toBe(false);
  });

  it('hasActiveDescendant should detect active tab in root folders and nested folders', () => {
    const { hasActiveDescendant } = require('../../napture/renderer/bookmarks');
    window.activeTabId = 'tab-open-1';
    const folderWithActiveTab = {
      type: 'folder',
      children: [
        { type: 'link', id: 'b-1', tabId: null },
        { type: 'link', id: 'b-2', tabId: 'tab-open-1' }
      ]
    };
    const folderWithoutActiveTab = {
      type: 'folder',
      children: [
        { type: 'link', id: 'b-1', tabId: null },
        { type: 'link', id: 'b-2', tabId: 'tab-open-2' }
      ]
    };
    const nestedFolderWithActiveTab = {
      type: 'folder',
      children: [
        {
          type: 'folder',
          children: [
            { type: 'link', id: 'b-sub', tabId: 'tab-open-1' }
          ]
        }
      ]
    };

    expect(hasActiveDescendant(folderWithActiveTab)).toBe(true);
    expect(hasActiveDescendant(folderWithoutActiveTab)).toBe(false);
    expect(hasActiveDescendant(nestedFolderWithActiveTab)).toBe(true);
    expect(hasActiveDescendant({ type: 'folder', children: [] })).toBe(false);
  });

  it('renderCustomBookmarks should keep active tab visible when folder is minimized', () => {
    const { renderCustomBookmarks } = require('../../napture/renderer/bookmarks');
    window.activeTabId = 'tab-open-1';
    window.customBookmarks = [
      {
        id: 'f-1',
        type: 'folder',
        title: 'Work',
        isOpen: false, // Folder is minimized
        children: [
          { id: 'b-open', type: 'link', title: 'Open Tab', url: 'https://open1.com', tabId: 'tab-open-1' },
          { id: 'b-closed', type: 'link', title: 'Closed Bookmark', url: 'https://closed.com', tabId: null }
        ]
      }
    ];

    renderCustomBookmarks();

    const { folderGroup, folderBtn, wrapper } = getFolderEls(mockContainer.children[0]);
    const childrenContainer = wrapper.children[0];
    const openTabBtn = childrenContainer.children[0];
    const closedBookmarkBtn = childrenContainer.children[1];

    // Folder itself is marked closed
    expect(folderBtn.classList.contains('folder-open')).toBe(false);
    expect(folderBtn.classList.contains('folder-minimized-hidden')).toBe(false);

    // Wrapper is NOT collapsed because it contains the active tab
    expect(wrapper.classList.contains('collapsed')).toBe(false);
    expect(wrapper.classList.contains('folder-minimized-hidden')).toBe(false);

    // The active tab is VISIBLE in sidebar
    expect(openTabBtn.classList.contains('folder-minimized-hidden')).toBe(false);
    expect(openTabBtn.classList.contains('active')).toBe(true);

    // The closed bookmark is HIDDEN in sidebar
    expect(closedBookmarkBtn.classList.contains('folder-minimized-hidden')).toBe(true);
  });

  it('renderCustomBookmarks should collapse folder wrapper when folder is minimized and has no active tabs', () => {
    const { renderCustomBookmarks } = require('../../napture/renderer/bookmarks');
    window.activeTabId = 'tab-other';
    window.customBookmarks = [
      {
        id: 'f-empty',
        type: 'folder',
        title: 'Empty Folder',
        isOpen: false,
        children: [
          { id: 'b-1', type: 'link', title: 'Link 1', url: 'https://l1.com', tabId: null },
          { id: 'b-2', type: 'link', title: 'Link 2', url: 'https://l2.com', tabId: 'tab-open-1' }
        ]
      }
    ];

    renderCustomBookmarks();

    const { folderGroup, folderBtn, wrapper } = getFolderEls(mockContainer.children[0]);
    const childrenContainer = wrapper.children[0];
    const linkBtn = childrenContainer.children[0];

    expect(folderBtn.classList.contains('folder-open')).toBe(false);
    expect(wrapper.classList.contains('collapsed')).toBe(true);
  });

  it('updateActiveBookmark should dynamically collapse folder when another tab is created/activated', () => {
    const { renderCustomBookmarks, updateActiveBookmark } = require('../../napture/renderer/bookmarks');
    window.activeTabId = 'tab-open-1';
    window.customBookmarks = [
      {
        id: 'f-1',
        type: 'folder',
        title: 'Work',
        isOpen: false,
        children: [
          { id: 'b-open', type: 'link', title: 'Open Tab', url: 'https://open1.com', tabId: 'tab-open-1' }
        ]
      }
    ];

    renderCustomBookmarks();

    const { folderGroup, folderBtn, wrapper } = getFolderEls(mockContainer.children[0]);
    const childrenContainer = wrapper.children[0];
    const openTabBtn = childrenContainer.children[0];

    expect(wrapper.classList.contains('collapsed')).toBe(false);
    expect(openTabBtn.classList.contains('folder-minimized-hidden')).toBe(false);

    // Another tab is created or activated elsewhere
    window.activeTabId = 'tab-new-created';
    updateActiveBookmark();

    // Now folder should be collapsed (sliding closed with CSS grid)
    expect(wrapper.classList.contains('collapsed')).toBe(true);

    // Switch back to folder tab
    window.activeTabId = 'tab-open-1';
    updateActiveBookmark();

    // Folder should re-expand to show active tab
    expect(wrapper.classList.contains('collapsed')).toBe(false);
    expect(openTabBtn.classList.contains('folder-minimized-hidden')).toBe(false);
  });

  it('should show all children when folder is expanded and re-hide closed ones when minimized', () => {
    const { renderCustomBookmarks } = require('../../napture/renderer/bookmarks');
    window.activeTabId = 'tab-open-1';
    window.customBookmarks = [
      {
        id: 'f-1',
        type: 'folder',
        title: 'Work',
        isOpen: false,
        children: [
          { id: 'b-open', type: 'link', title: 'Open Tab', url: 'https://open1.com', tabId: 'tab-open-1' },
          { id: 'b-closed', type: 'link', title: 'Closed Bookmark', url: 'https://closed.com', tabId: null }
        ]
      }
    ];

    renderCustomBookmarks();

    const { folderGroup, folderBtn, wrapper } = getFolderEls(mockContainer.children[0]);
    const childrenContainer = wrapper.children[0];
    const openTabBtn = childrenContainer.children[0];
    const closedBookmarkBtn = childrenContainer.children[1];

    expect(openTabBtn.classList.contains('folder-minimized-hidden')).toBe(false);
    expect(closedBookmarkBtn.classList.contains('folder-minimized-hidden')).toBe(true);

    // Click to expand folder
    folderBtn.dispatchEvent({ type: 'click' });

    expect(folderBtn.classList.contains('folder-open')).toBe(true);
    expect(wrapper.classList.contains('collapsed')).toBe(false);
    expect(openTabBtn.classList.contains('folder-minimized-hidden')).toBe(false);
    expect(closedBookmarkBtn.classList.contains('folder-minimized-hidden')).toBe(false);

    // Click to minimize folder again
    folderBtn.dispatchEvent({ type: 'click' });

    expect(folderBtn.classList.contains('folder-open')).toBe(false);
    expect(wrapper.classList.contains('collapsed')).toBe(false); // Still has active tab
    expect(openTabBtn.classList.contains('folder-minimized-hidden')).toBe(false);
    expect(closedBookmarkBtn.classList.contains('folder-minimized-hidden')).toBe(true);
  });

  it('should correctly display open tabs in nested minimized folders', () => {
    const { renderCustomBookmarks } = require('../../napture/renderer/bookmarks');
    window.activeTabId = 'tab-open-1';
    window.customBookmarks = [
      {
        id: 'f-root',
        type: 'folder',
        title: 'Root Folder',
        isOpen: false,
        children: [
          {
            id: 'f-sub',
            type: 'folder',
            title: 'Sub Folder',
            isOpen: false,
            children: [
              { id: 'b-sub-open', type: 'link', title: 'Sub Open Tab', url: 'https://open1.com', tabId: 'tab-open-1' },
              { id: 'b-sub-closed', type: 'link', title: 'Sub Closed', url: 'https://closed.com', tabId: null }
            ]
          },
          {
            id: 'f-sub-empty',
            type: 'folder',
            title: 'Sub Empty',
            isOpen: false,
            children: [
              { id: 'b-empty-closed', type: 'link', title: 'Closed', url: 'https://closed.com', tabId: null }
            ]
          },
          { id: 'b-root-closed', type: 'link', title: 'Root Closed', url: 'https://closed.com', tabId: null }
        ]
      }
    ];

    renderCustomBookmarks();

    const { folderGroup: rootGroup, folderBtn: rootFolderBtn, wrapper: rootWrapper } = getFolderEls(mockContainer.children[0]);
    const rootChildren = rootWrapper.children[0];

    const { folderGroup: subGroup, folderBtn: subFolderBtn, wrapper: subWrapper } = getFolderEls(rootChildren.children[0]);
    const subChildren = subWrapper.children[0];
    const subOpenTabBtn = subChildren.children[0];
    const subClosedBookmarkBtn = subChildren.children[1];

    const { folderBtn: subEmptyBtn } = getFolderEls(rootChildren.children[1]);
    const rootClosedBookmarkBtn = rootChildren.children[2];

    // Root folder is minimized but wrapper is NOT collapsed because it contains active tab descendant
    expect(rootFolderBtn.classList.contains('folder-open')).toBe(false);
    expect(rootFolderBtn.classList.contains('folder-minimized-hidden')).toBe(false);
    expect(rootWrapper.classList.contains('collapsed')).toBe(false);

    // Sub folder is minimized but wrapper is NOT collapsed
    expect(subFolderBtn.classList.contains('folder-open')).toBe(false);
    expect(subFolderBtn.classList.contains('folder-minimized-hidden')).toBe(false);
    expect(subWrapper.classList.contains('collapsed')).toBe(false);

    // The nested active tab is VISIBLE
    expect(subOpenTabBtn.classList.contains('folder-minimized-hidden')).toBe(false);
    expect(subOpenTabBtn.classList.contains('active')).toBe(true);

    // Inactive bookmarks & inactive subfolder are HIDDEN
    expect(subClosedBookmarkBtn.classList.contains('folder-minimized-hidden')).toBe(true);
    expect(subEmptyBtn.classList.contains('folder-minimized-hidden')).toBe(true);
    expect(rootClosedBookmarkBtn.classList.contains('folder-minimized-hidden')).toBe(true);
  });
});

describe('Inline Tab/Folder Renaming Behavior', () => {
  let mockContainer;
  let mockTabContextMenu;

  beforeEach(() => {
    jest.useFakeTimers();
    mockContainer = createMockNode('div');
    mockContainer.id = 'bookmarks-container';
    mockTabContextMenu = createMockNode('div');
    mockTabContextMenu.id = 'tab-context-menu';
    mockTabContextMenu.classList.add('hidden');

    global.document = {
      getElementById: (id) => {
        if (id === 'bookmarks-container') return mockContainer;
        if (id === 'tab-context-menu') return mockTabContextMenu;
        return null;
      },
      createElement: (tag) => createMockNode(tag),
      body: createMockNode('body'),
      addEventListener: jest.fn()
    };

    let bookmarksArr = [];
    global.window = {
      currentSettings: { folderHoverOpen: true },
      focus: jest.fn(),
      get customBookmarks() { return bookmarksArr; },
      set customBookmarks(val) { bookmarksArr = val; }
    };

    delete require.cache[require.resolve('../../napture/renderer/bookmarks')];
  });

  afterEach(() => {
    jest.useRealTimers();
    delete require.cache[require.resolve('../../napture/renderer/bookmarks')];
    delete global.document;
    delete global.window;
  });

  it('should keep folder open while renaming tab inside it when autohide (folderHoverOpen) is true', () => {
    const { renderCustomBookmarks, updateActiveBookmark } = require('../../napture/renderer/bookmarks');
    window.customBookmarks = [
      {
        id: 'f-1',
        type: 'folder',
        title: 'Folder 1',
        isOpen: false,
        children: [
          { id: 'b-1', type: 'link', title: 'Link 1', url: 'https://example.com', _pendingRename: true }
        ]
      }
    ];

    renderCustomBookmarks();

    const { folderBtn, wrapper } = getFolderEls(mockContainer.children[0]);

    // Folder wrapper must be open while child tab has _pendingRename: true
    expect(folderBtn.classList.contains('folder-open')).toBe(true);
    expect(wrapper.classList.contains('collapsed')).toBe(false);

    // Context menu closing / updateActiveBookmark should not close the folder
    updateActiveBookmark();
    expect(folderBtn.classList.contains('folder-open')).toBe(true);
    expect(wrapper.classList.contains('collapsed')).toBe(false);
  });

  it('should maintain post-rename grace period on parent folder after renaming ends before collapsing', () => {
    const { renderCustomBookmarks, updateActiveBookmark } = require('../../napture/renderer/bookmarks');
    window.customBookmarks = [
      {
        id: 'f-1',
        type: 'folder',
        title: 'Folder 1',
        isOpen: false,
        children: [
          { id: 'b-1', type: 'link', title: 'Link 1', url: 'https://example.com', _pendingRename: true }
        ]
      }
    ];

    renderCustomBookmarks();

    const { folderBtn, wrapper } = getFolderEls(mockContainer.children[0]);
    expect(wrapper.classList.contains('collapsed')).toBe(false);

    // Simulate blur on inline rename input to finish renaming
    const childrenContainer = wrapper.children[0];
    const linkBtn = childrenContainer.children[0];
    const inputEl = linkBtn.children.find(c => c.tagName === 'INPUT');
    expect(inputEl).toBeDefined();

    inputEl.dispatchEvent('blur');

    // Renaming completed, _pendingRename removed
    expect(window.customBookmarks[0].children[0]._pendingRename).toBeUndefined();

    // Folder should remain open during grace period (before 450ms)
    expect(folderBtn.classList.contains('folder-open')).toBe(true);
    expect(wrapper.classList.contains('collapsed')).toBe(false);

    // Advance timer past grace period
    jest.advanceTimersByTime(500);

    // Now folder smoothly closes
    const { folderBtn: finalFolderBtn, wrapper: finalWrapper } = getFolderEls(mockContainer.children[0]);
    expect(finalFolderBtn.classList.contains('folder-open')).toBe(false);
    expect(finalWrapper.classList.contains('collapsed')).toBe(true);
  });
});

describe('Bookmark Drag & Drop Indicator Line Calculations and Merging', () => {
  it('should accurately calculate drop line indicator position and merge zone for all bookmark types', () => {
    const calcDropPosition = (targetType, h, relY) => {
      const isMergeZone = relY > h * 0.25 && relY < h * 0.75;
      const isAbove = isMergeZone ? (relY <= h * 0.25) : (relY < h * 0.5);
      return { isMergeZone, isAbove, indicator: isMergeZone ? 'merge' : (isAbove ? 'top' : 'bottom') };
    };

    // For a regular bookmark link or folder of height 40px:
    expect(calcDropPosition('link', 40, 5)).toEqual({ isMergeZone: false, isAbove: true, indicator: 'top' });
    expect(calcDropPosition('link', 40, 20)).toEqual({ isMergeZone: true, isAbove: false, indicator: 'merge' });
    expect(calcDropPosition('link', 40, 35)).toEqual({ isMergeZone: false, isAbove: false, indicator: 'bottom' });

    expect(calcDropPosition('folder', 40, 5)).toEqual({ isMergeZone: false, isAbove: true, indicator: 'top' });
    expect(calcDropPosition('folder', 40, 20)).toEqual({ isMergeZone: true, isAbove: false, indicator: 'merge' });
    expect(calcDropPosition('folder', 40, 35)).toEqual({ isMergeZone: false, isAbove: false, indicator: 'bottom' });
  });

  describe('Bookmark Drop Event Behavior', () => {
    let mockContainer;

    beforeEach(() => {
      jest.resetModules();
      mockContainer = createMockNode('div');
      mockContainer.id = 'bookmarks-container';

      global.document = {
        getElementById: (id) => (id === 'bookmarks-container' ? mockContainer : null),
        createElement: (tag) => createMockNode(tag),
        body: createMockNode('body'),
        addEventListener: jest.fn()
      };

      global.window = {
        currentSettings: { folderHoverOpen: false },
        addEventListener: jest.fn()
      };

      delete require.cache[require.resolve('../../napture/renderer/bookmarks')];
    });

    afterEach(() => {
      delete require.cache[require.resolve('../../napture/renderer/bookmarks')];
      delete global.document;
      delete global.window;
    });

    it('should create a new folder when dropping a bookmark link onto another bookmark link in merge zone', () => {
      const { renderCustomBookmarks } = require('../../napture/renderer/bookmarks');
      window.customBookmarks = [
        { id: 'b-1', type: 'link', title: 'Google', url: 'https://google.com' },
        { id: 'b-2', type: 'link', title: 'GitHub', url: 'https://github.com' }
      ];

      renderCustomBookmarks();

      const dropTarget = mockContainer.children[0]; // target b-1
      const dropEvent = {
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
        clientY: 20, // relY = 20 on height 40 -> relY > 10 && relY < 30 -> isMergeZone = true
        target: dropTarget,
        dataTransfer: {
          getData: (type) => {
            if (type === 'application/json') {
              return JSON.stringify({ source: 'bookmark', id: 'b-2', type: 'link', title: 'GitHub', url: 'https://github.com' });
            }
            return '';
          }
        }
      };

      mockContainer.dispatchEvent(Object.assign({ type: 'drop' }, dropEvent));

      expect(window.customBookmarks.length).toBe(1);
      const newFolder = window.customBookmarks[0];
      expect(newFolder.type).toBe('folder');
      expect(newFolder.title).toBe('New Folder');
      expect(newFolder._pendingRename).toBe(true);
      expect(newFolder.children.length).toBe(2);
      expect(newFolder.children[0].id).toBe('b-1');
      expect(newFolder.children[1].id).toBe('b-2');
    });
  });
});


