
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
let customBookmarks = [];
if (typeof window !== 'undefined') {
  window.loadBookmarks = loadBookmarks;
  window.findBookmark = findBookmark;
  window.findBookmarkByUrl = findBookmarkByUrl;
  window.saveBookmarks = saveBookmarks;
  Object.defineProperty(window, 'customBookmarks', {
    get() { return customBookmarks; },
    set(val) { customBookmarks = val; },
    configurable: true
  });
}
const bookmarksContainer = typeof document !== 'undefined' ? document.getElementById('bookmarks-container') : null;
const tabContextMenu = typeof document !== 'undefined' ? document.getElementById('tab-context-menu') : null;
let activeContextMenuTarget = null;
let isContextMenuOpen = false;

// Track tabIds created this session to prevent ensureBookmarkTabs from
// spawning duplicate webviews if window.tabs hasn't updated yet
const _sessionBookmarkTabIds = new Set();
let _loadBookmarksInProgress = false;

function isFolderHoverEnabled() {
  if (typeof window !== 'undefined' && window.currentSettings && typeof window.currentSettings.folderHoverOpen !== 'undefined') {
    return Boolean(window.currentSettings.folderHoverOpen);
  }
  return false;
}

// Deduplicate folders and bookmark links (collapses duplicate folders with the same title or id)
function deduplicateBookmarksTree(tree) {
  if (!Array.isArray(tree)) return [];
  const merged = [];
  const folderMap = new Map(); // id or normalized title -> folder object in merged
  const linkKeys = new Set();

  for (const item of tree) {
    if (!item) continue;
    if (item.type === 'folder' || item.children) {
      const normTitle = (item.title || 'Folder').trim().toLowerCase();
      if (folderMap.has(normTitle)) {
        const existingFolder = folderMap.get(normTitle);
        const combinedChildren = (existingFolder.children || []).concat(item.children || []);
        existingFolder.children = deduplicateBookmarksTree(combinedChildren);
        if (item.isOpen !== undefined && existingFolder.isOpen === undefined) {
          existingFolder.isOpen = Boolean(item.isOpen);
        }
      } else {
        const folderCopy = {
          ...item,
          type: 'folder',
          title: item.title || 'Folder',
          isOpen: item.isOpen !== undefined ? Boolean(item.isOpen) : false,
          children: deduplicateBookmarksTree(item.children || [])
        };
        folderMap.set(normTitle, folderCopy);
        merged.push(folderCopy);
      }
    } else if (item.type === 'link' || item.url) {
      const cleanUrl = (item.url || '').trim().toLowerCase().replace(/\/+$/, '');
      const key = (item.id || item.title || '') + '|' + cleanUrl;
      if (!linkKeys.has(key)) {
        linkKeys.add(key);
        merged.push({
          ...item,
          type: 'link',
          title: item.title || 'Bookmark',
          url: item.url
        });
      }
    }
  }
  return merged;
}

function mergeBookmarksTrees(localTree, remoteTree) {
  const combined = (localTree || []).concat(remoteTree || []);
  return deduplicateBookmarksTree(combined);
}

// Preserve existing tabIds and folder open states from memory to avoid spawning new tabs or closing folders on sync/reload
function preserveBookmarkState(oldList, newList) {
  if (!Array.isArray(oldList) || !Array.isArray(newList)) return;

  // Bolt Optimization: Pre-index oldList into O(1) Hash Maps instead of performing O(N) recursive tree scans
  // for every item in newList. Reduces time complexity from O(N^2) to O(N) during bookmark load and sync operations.
  const oldFoldersById = new Map();
  const oldFoldersByTitle = new Map();
  const oldLinksById = new Map();
  const oldLinksByUrl = new Map();

  function indexOldTree(list) {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      if (!item) continue;
      if (item.type === 'folder' || item.children) {
        if (item.id) {
          oldFoldersById.set(item.id, item);
        }
        if (item.title) {
          const cleanTitle = item.title.trim().toLowerCase();
          if (!oldFoldersByTitle.has(cleanTitle)) {
            oldFoldersByTitle.set(cleanTitle, item);
          }
        }
        if (Array.isArray(item.children)) {
          indexOldTree(item.children);
        }
      } else if (item.type === 'link' || item.url) {
        if (item.id) {
          oldLinksById.set(item.id, item);
        }
        if (item.url) {
          const cleanUrl = item.url.trim().toLowerCase().replace(/\/+$/, '');
          if (!oldLinksByUrl.has(cleanUrl)) {
            oldLinksByUrl.set(cleanUrl, item);
          }
        }
      }
    }
  }

  indexOldTree(oldList);

  function apply(list) {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      if (!item) continue;
      if (item.type === 'folder' || item.children) {
        const old = (item.id ? oldFoldersById.get(item.id) : null) ||
                    (item.title ? oldFoldersByTitle.get(item.title.trim().toLowerCase()) : null);
        if (old) {
          if (old.isOpen !== undefined) {
            item.isOpen = Boolean(old.isOpen);
          }
          if (old._pendingRename) {
            item._pendingRename = old._pendingRename;
          }
        }
        if (Array.isArray(item.children)) {
          apply(item.children);
        }
      } else if (item.type === 'link') {
        const old = (item.id ? oldLinksById.get(item.id) : null) ||
                    (item.url ? oldLinksByUrl.get(item.url.trim().toLowerCase().replace(/\/+$/, '')) : null);
        if (old && old.tabId) {
          item.tabId = old.tabId;
        }
      }
    }
  }

  apply(newList);
}

// Load Bookmarks
function loadBookmarks(options = {}) {
  if (_loadBookmarksInProgress) return;
  _loadBookmarksInProgress = true;
  try {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('napture-bookmarks') : null;
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const deduplicated = deduplicateBookmarksTree(parsed);
        
        // Preserve existing tabIds and folder isOpen states from memory to avoid collapsing folders on sync
        preserveBookmarkState(customBookmarks, deduplicated);

        customBookmarks = deduplicated;
        // Persist deduplicated tree back to localStorage
        if (typeof localStorage !== 'undefined' && !options.skipLocalStorageWrite) {
          const newSavedStr = JSON.stringify(customBookmarks);
          if (newSavedStr !== saved) {
            localStorage.setItem('napture-bookmarks', newSavedStr);
          }
        }
      } catch (e) {
        console.error('Error loading bookmarks', e);
      }
    }
    renderCustomBookmarks();
    if (typeof renderTabs === 'function') renderTabs();
    if (typeof window !== 'undefined' && window.naptureAPI && window.naptureAPI.syncBookmarkTabs && typeof window.getBookmarkTabIds === 'function') {
      window.naptureAPI.syncBookmarkTabs(window.getBookmarkTabIds());
    }
  } finally {
    _loadBookmarksInProgress = false;
  }
}

if (typeof window !== 'undefined') {
  window.getBookmarkTabIds = function() {
    const ids = [];
    function collect(list) {
      if (!Array.isArray(list)) return;
      for (const item of list) {
        if (!item) continue;
        if ((item.type === 'folder' || item.children) && Array.isArray(item.children)) {
          collect(item.children);
        } else if (item.tabId) {
          ids.push(item.tabId);
        }
      }
    }
    collect(customBookmarks);
    return ids;
  };
}

// Save Bookmarks
function saveBookmarks() {
  if (typeof localStorage !== 'undefined') {
    const newSavedStr = JSON.stringify(customBookmarks);
    if (newSavedStr !== localStorage.getItem('napture-bookmarks')) {
      localStorage.setItem('napture-bookmarks', newSavedStr);
    }
  }
  if (typeof window !== 'undefined' && window.naptureAPI && window.naptureAPI.saveBookmarksTree) {
    window.naptureAPI.saveBookmarksTree(customBookmarks);
  }
  if (typeof window !== 'undefined' && window.naptureAPI && window.naptureAPI.syncBookmarkTabs && typeof window.getBookmarkTabIds === 'function') {
    window.naptureAPI.syncBookmarkTabs(window.getBookmarkTabIds());
  }
  // Note: we do NOT dispatch a synthetic storage event here.
  // localStorage's own 'storage' event only fires in OTHER windows/tabs,
  // which is what we want for cross-window sync. Dispatching it ourselves
  // would cause an immediate re-load loop in the same window.
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    // Only respond to real cross-window storage events (e.key will be set)
    if (e.key === 'napture-bookmarks') {
      loadBookmarks({ skipLocalStorageWrite: true });
    }
  });
}

// Helper to check if a bookmark item is an active open tab
function isBookmarkItemOpen(item) {
  if (!item || item.type === 'folder') return false;
  if (!item.tabId) return false;
  const liveTabs = (typeof window !== 'undefined' && Array.isArray(window.tabs)) ? window.tabs : (typeof tabs !== 'undefined' && Array.isArray(tabs) ? tabs : []);
  return liveTabs.some(t => t && t.id === item.tabId);
}

// Helper to check if a bookmark item is the currently active tab
function isBookmarkItemActive(item) {
  if (!item || item.type === 'folder') return false;
  if (!item.tabId) return false;
  const currentActiveTabId = (typeof window !== 'undefined' && typeof window.activeTabId !== 'undefined') ? window.activeTabId : (typeof activeTabId !== 'undefined' ? activeTabId : null);
  return item.tabId === currentActiveTabId;
}

// Helper to check if a folder has any open tab descendant
function hasOpenDescendant(folderItem) {
  if (!folderItem || !Array.isArray(folderItem.children)) return false;
  for (const child of folderItem.children) {
    if (!child) continue;
    if (child.type === 'folder' || child.children) {
      if (hasOpenDescendant(child)) return true;
    } else if (isBookmarkItemOpen(child)) {
      return true;
    }
  }
  return false;
}

// Helper to check if a folder contains the currently active tab
function hasActiveDescendant(folderItem) {
  if (!folderItem || !Array.isArray(folderItem.children)) return false;
  for (const child of folderItem.children) {
    if (!child) continue;
    if (child.type === 'folder' || child.children) {
      if (hasActiveDescendant(child)) return true;
    } else if (isBookmarkItemActive(child)) {
      return true;
    }
  }
  return false;
}

// Global set tracking folder IDs currently in post-rename grace period
const _renameGraceFolderIds = new Set();

function hasRenamingDescendant(folderItem) {
  if (!folderItem || !Array.isArray(folderItem.children)) return false;
  for (const child of folderItem.children) {
    if (!child) continue;
    if (child._pendingRename) return true;
    if ((child.type === 'folder' || child.children) && hasRenamingDescendant(child)) {
      return true;
    }
  }
  return false;
}

function getAncestorFolderIds(tree, targetId, currentAncestors = []) {
  if (!Array.isArray(tree) || !targetId) return [];
  for (const item of tree) {
    if (!item) continue;
    if (item.id === targetId) return currentAncestors;
    if (item.type === 'folder' && Array.isArray(item.children)) {
      const res = getAncestorFolderIds(item.children, targetId, [...currentAncestors, item.id]);
      if (res.length > 0) return res;
    }
  }
  return [];
}

function scheduleFolderRenameGrace(targetId) {
  const currentList = (typeof window !== 'undefined' && Array.isArray(window.customBookmarks)) ? window.customBookmarks : customBookmarks;
  const ancestors = getAncestorFolderIds(currentList, targetId);
  const targetObj = findBookmark(currentList, targetId)?.item;
  const folderIdsToGrace = [...ancestors];
  if (targetObj && targetObj.type === 'folder') {
    folderIdsToGrace.push(targetObj.id);
  }
  if (folderIdsToGrace.length === 0) return;

  folderIdsToGrace.forEach(id => _renameGraceFolderIds.add(id));
  setTimeout(() => {
    folderIdsToGrace.forEach(id => _renameGraceFolderIds.delete(id));
    if (typeof updateActiveBookmark === 'function') {
      updateActiveBookmark();
    }
  }, 450);
}

// Render Bookmarks
function renderCustomBookmarks() {
  if (typeof document === 'undefined') return;
  const container = (typeof bookmarksContainer !== 'undefined' && bookmarksContainer) || document.getElementById('bookmarks-container');
  if (!container) return;
  container.innerHTML = '';
  
  const currentList = (typeof window !== 'undefined' && Array.isArray(window.customBookmarks)) ? window.customBookmarks : customBookmarks;
  const section = container.closest ? container.closest('.bookmarks-section') : null;
  if (section) {
    if ((currentList || []).length === 0) {
      section.classList.add('is-empty');
    } else {
      section.classList.remove('is-empty');
    }
  }
  
  function renderList(list, parentEl, level = 0, isParentMinimizedWithActiveDescendant = false) {
    // Bolt Optimization: Batch DOM insertions using DocumentFragment to prevent browser reflows & layout thrashing during iteration
    const fragment = (typeof document !== 'undefined' && typeof document.createDocumentFragment === 'function')
      ? document.createDocumentFragment()
      : null;
    const targetEl = fragment || parentEl;

    list.forEach(item => {
      const btn = document.createElement('div');
      const activeTab = (typeof window !== 'undefined' && typeof window.activeTabId !== 'undefined') ? window.activeTabId : (typeof activeTabId !== 'undefined' ? activeTabId : null);
      btn.className = `tab bookmark-item ${item.tabId === activeTab ? 'active' : ''}`;
      btn.dataset.id = item.id;
      btn.dataset.type = item.type;
      btn.style.paddingLeft = `${10 + level * 16}px`;
      
      btn.draggable = true;
      btn.addEventListener('dragstart', (e) => {
        btn.classList.add('dragging');
        document.body.classList.add('dragging-bookmark');
        if (typeof window.naptureAPI !== 'undefined' && window.naptureAPI.setDraggingState) {
          window.naptureAPI.setDraggingState(true);
        }
        if (e.dataTransfer) {
          if (typeof emptyDragImage !== 'undefined') {
            e.dataTransfer.setDragImage(emptyDragImage, 0, 0);
          }
        }
        const bookmarkDragData = {
          source: 'bookmark',
          id: item.id,
          type: item.type,
          tabId: item.tabId || null,
          title: item.title,
          url: item.url || '',
          favicon: item.favicon || null
        };
        if (typeof activeDragState !== 'undefined') {
          activeDragState.tab = bookmarkDragData;
          activeDragState.pinned = null;
          activeDragState.targetInfo = null;
        }
        e.dataTransfer.effectAllowed = 'all';
        e.dataTransfer.setData('text/plain', JSON.stringify(bookmarkDragData));
        e.dataTransfer.setData('application/json', JSON.stringify(bookmarkDragData));
        if (typeof createDragGhost === 'function') {
          createDragGhost(bookmarkDragData);
          updateDragGhostPosition(e);
        }
      });
      btn.addEventListener('contextmenu', (e) => {
        if (typeof showTabContextMenu === 'function') {
          showTabContextMenu(e, item.type === 'folder' ? 'bookmark-folder' : 'bookmark-link', item.id, item);
        }
      });
      btn.addEventListener('dragend', (e) => {
        btn.classList.remove('dragging');
        document.body.classList.remove('dragging-bookmark');
        btn.classList.remove('drop-target-top', 'drop-target-bottom');
        const allBookmarks = Array.from(bookmarksContainer.querySelectorAll('.bookmark-item'));
        allBookmarks.forEach(t => t.classList.remove('shift-down', 'shift-up'));
        if (typeof removeDragGhost === 'function') removeDragGhost();
        if (typeof window.naptureAPI !== 'undefined' && window.naptureAPI.setDraggingState) {
          window.naptureAPI.setDraggingState(false);
        }
        if (typeof endDrag === 'function') endDrag();
      });
      
      btn.addEventListener('dragover', (e) => {
        e.preventDefault();
        const rect = btn.getBoundingClientRect();
        const h = rect.height;
        const relY = e.clientY - rect.top;
        const isMergeZone = relY > h * 0.25 && relY < h * 0.75;
        const isAbove = isMergeZone ? (relY <= h * 0.25) : (relY < h * 0.5);
        
        const allBookmarks = Array.from(bookmarksContainer.querySelectorAll('.bookmark-item:not(.dragging)'));
        const hoverIndex = allBookmarks.indexOf(btn);

        allBookmarks.forEach((t, idx) => {
          t.classList.remove('drop-target-top', 'drop-target-bottom', 'drop-target-merge', 'shift-down', 'shift-up');
          if (isMergeZone && t === btn) {
            t.classList.add('drop-target-merge');
          } else if (isAbove) {
            if (idx >= hoverIndex) t.classList.add('shift-down');
            else t.classList.add('shift-up');
          } else {
            if (idx > hoverIndex) t.classList.add('shift-down');
            else t.classList.add('shift-up');
          }
        });

        if (!isMergeZone) {
          if (isAbove) {
            btn.classList.add('drop-target-top');
          } else {
            btn.classList.add('drop-target-bottom');
          }
        }
      });
      
      btn.addEventListener('dragleave', () => {
        btn.classList.remove('drop-target-top', 'drop-target-bottom', 'drop-target-merge');
        const allBookmarks = Array.from(bookmarksContainer.querySelectorAll('.bookmark-item'));
        allBookmarks.forEach(t => t.classList.remove('shift-down', 'shift-up'));
      });

      if (item.type === 'folder') {
        const isDirectlyOpen = Boolean(item.isOpen);
        const hasActive = hasActiveDescendant(item);
        const hasRenaming = Boolean(item._pendingRename || hasRenamingDescendant(item));
        const hasGrace = _renameGraceFolderIds.has(item.id);
        const shouldBeOpenInRender = isDirectlyOpen || hasRenaming || hasGrace;
        const isWrapperCollapsed = !shouldBeOpenInRender && !hasActive;
        const isThisFolderMinimizedWithActive = !shouldBeOpenInRender && hasActive;

        if (isParentMinimizedWithActiveDescendant && !hasActive) {
          btn.classList.add('folder-minimized-hidden');
        }

        if (shouldBeOpenInRender) btn.classList.add('folder-open');
        
        const arrow = document.createElement('div');
        arrow.className = 'bookmark-folder-icon';
        arrow.innerHTML = `<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><path class="folder-open-path" d="M2 12l2 7h16l2-7H2z" stroke="none"></path></svg>`;
        btn.appendChild(arrow);
        
        if (item._pendingRename) {
          // Inline rename input instead of title span
          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'bookmark-inline-rename';
          input.value = item.title;
          input.addEventListener('mousedown', (e) => e.stopPropagation());
          input.addEventListener('click', (e) => e.stopPropagation());
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              input.blur();
            } else if (e.key === 'Escape') {
              delete item._pendingRename;
              scheduleFolderRenameGrace(item.id);
              saveBookmarks();
              renderCustomBookmarks();
            }
          });
          input.addEventListener('blur', () => {
            if (!item._pendingRename) return;
            const newName = input.value.trim();
            if (newName) item.title = newName;
            delete item._pendingRename;
            scheduleFolderRenameGrace(item.id);
            saveBookmarks();
            renderCustomBookmarks();
          });
          btn.appendChild(input);
          
          // Auto-focus and select after render
          setTimeout(() => {
            if (typeof window !== 'undefined' && window.focus) {
              window.focus();
            }
            if (typeof input.focus === 'function') input.focus();
            if (typeof input.select === 'function') input.select();
            if (typeof requestAnimationFrame !== 'undefined') {
              requestAnimationFrame(() => {
                if (typeof input.focus === 'function') input.focus();
                if (typeof input.select === 'function') input.select();
              });
            }
          }, 50);
        } else {
          const title = document.createElement('div');
          title.className = 'tab-title';
          title.style.fontWeight = '500';
          title.textContent = item.title;
          btn.appendChild(title);
        }
        
        const wrapper = document.createElement('div');
        wrapper.className = `bookmark-children-wrapper ${isWrapperCollapsed ? 'collapsed' : ''}${isParentMinimizedWithActiveDescendant && !hasActive ? ' folder-minimized-hidden' : ''}`;
        
        let hoverTimeout = null;

        const handleFolderMouseEnter = () => {
          if (!isFolderHoverEnabled()) return;
          if (document.body.classList.contains('dragging-tab') ||
              document.body.classList.contains('dragging-bookmark') ||
              document.body.classList.contains('dragging-pinned-site') ||
              (typeof draggedTab !== 'undefined' && draggedTab) ||
              (typeof draggedPinnedSite !== 'undefined' && draggedPinnedSite)) {
            return;
          }
          if (hoverTimeout) {
            clearTimeout(hoverTimeout);
            hoverTimeout = null;
          }
          btn.dataset.hovered = 'true';
          wrapper.dataset.hovered = 'true';
          btn.classList.add('folder-open');
          wrapper.classList.remove('collapsed');
          const allChildrenBtns = wrapper.querySelectorAll ? wrapper.querySelectorAll('.bookmark-item') : [];
          allChildrenBtns.forEach(b => b.classList.remove('folder-minimized-hidden'));
        };

        const handleFolderMouseLeave = (e) => {
          const related = e && e.relatedTarget;
          if (related && (folderGroup.contains(related) || btn.contains(related) || wrapper.contains(related))) {
            return;
          }
          if (hoverTimeout) {
            clearTimeout(hoverTimeout);
            hoverTimeout = null;
          }
          hoverTimeout = setTimeout(() => {
            hoverTimeout = null;
            if (isContextMenuOpen) return;
            try {
              if (folderGroup.matches(':hover') || (btn && btn.matches(':hover')) || (wrapper && wrapper.matches(':hover'))) {
                return;
              }
            } catch (err) {}
            delete btn.dataset.hovered;
            delete wrapper.dataset.hovered;
            const liveItem = (item && item.id) ? (findBookmark(currentList, item.id)?.item || item) : item;
            if (!liveItem.isOpen) {
              btn.classList.remove('folder-open');
              const hasActive = hasActiveDescendant(liveItem);
              if (!hasActive) {
                wrapper.classList.add('collapsed');
              }
              updateActiveBookmark();
            }
          }, 450);
        };

        btn.addEventListener('click', (e) => {
          if (e.target.tagName === 'INPUT' || e.target.classList.contains('tab-close')) return;
          if (hoverTimeout) {
            clearTimeout(hoverTimeout);
            hoverTimeout = null;
          }
          const liveItem = (item && item.id) ? (findBookmark(currentList, item.id)?.item || item) : item;
          liveItem.isOpen = !liveItem.isOpen;
          item.isOpen = liveItem.isOpen;
          if (!liveItem.isOpen) {
            delete btn.dataset.hovered;
            delete wrapper.dataset.hovered;
          }
          btn.classList.toggle('folder-open', liveItem.isOpen);
          const hasActive = hasActiveDescendant(liveItem);
          const isWrapperCollapsed = !liveItem.isOpen && !hasActive;
          wrapper.classList.toggle('collapsed', isWrapperCollapsed);
          saveBookmarks();
          updateActiveBookmark();
        });

        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'bookmark-children';
        if (item.children && Array.isArray(item.children) && item.children.length > 0) {
          renderList(item.children, childrenContainer, level + 1, isThisFolderMinimizedWithActive || isParentMinimizedWithActiveDescendant);
        }
        
        wrapper.appendChild(childrenContainer);

        const folderGroup = document.createElement('div');
        folderGroup.className = 'bookmark-folder-group';
        folderGroup.dataset.id = item.id;
        folderGroup.appendChild(btn);
        folderGroup.appendChild(wrapper);
        targetEl.appendChild(folderGroup);

        folderGroup.addEventListener('mouseenter', handleFolderMouseEnter);
        folderGroup.addEventListener('mouseover', handleFolderMouseEnter);
        folderGroup.addEventListener('mousemove', handleFolderMouseEnter);
        folderGroup.addEventListener('pointerenter', handleFolderMouseEnter);
        folderGroup.addEventListener('pointerover', handleFolderMouseEnter);
        folderGroup.addEventListener('pointermove', handleFolderMouseEnter);
        folderGroup.addEventListener('mouseleave', handleFolderMouseLeave);
        btn.addEventListener('mouseenter', handleFolderMouseEnter);
        wrapper.addEventListener('mouseenter', handleFolderMouseEnter);
      } else {
        const isActive = isBookmarkItemActive(item);
        if (isParentMinimizedWithActiveDescendant && !isActive) {
          btn.classList.add('folder-minimized-hidden');
        }
        // Use exact same favicon structure as regular tabs
        const iconEl = document.createElement('div');
        iconEl.className = 'tab-favicon';
        
        // Look up the live tab for its current favicon
        let liveFavicon = item.favicon;
        if (item.tabId && window.tabs) {
          const liveTab = window.tabs.find(t => t.id === item.tabId);
          if (liveTab && liveTab.favicon) liveFavicon = liveTab.favicon;
        }
        
        if (liveFavicon) {
          const img = document.createElement('img');
          img.src = liveFavicon;
          img.onerror = () => {
            iconEl.innerHTML = typeof getDefaultFaviconIcon === 'function' ? getDefaultFaviconIcon(item.url || '') : '';
          };
          iconEl.appendChild(img);
        } else {
          iconEl.innerHTML = typeof getDefaultFaviconIcon === 'function' ? getDefaultFaviconIcon(item.url || '') : '';
        }
        btn.appendChild(iconEl);
        
        if (item._pendingRename) {
          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'bookmark-inline-rename';
          input.value = item.title;
          input.addEventListener('mousedown', (e) => e.stopPropagation());
          input.addEventListener('click', (e) => e.stopPropagation());
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              input.blur();
            } else if (e.key === 'Escape') {
              delete item._pendingRename;
              scheduleFolderRenameGrace(item.id);
              saveBookmarks();
              renderCustomBookmarks();
            }
          });
          input.addEventListener('blur', () => {
            if (!item._pendingRename) return;
            const newName = input.value.trim();
            if (newName) item.title = newName;
            delete item._pendingRename;
            scheduleFolderRenameGrace(item.id);
            saveBookmarks();
            renderCustomBookmarks();
          });
          btn.appendChild(input);

          setTimeout(() => {
            if (typeof window !== 'undefined' && window.focus) {
              window.focus();
            }
            input.focus();
            input.select();
            if (typeof requestAnimationFrame !== 'undefined') {
              requestAnimationFrame(() => {
                input.focus();
                input.select();
              });
            }
          }, 50);
        } else {
          const title = document.createElement('div');
          title.className = 'tab-title';
          title.textContent = item.title;
          btn.appendChild(title);
        }
        
        // Check for URL drift (Revert logic)
        if (item.tabId && window.tabs) {
          const tabObj = window.tabs.find(t => t.id === item.tabId);
          if (tabObj && tabObj.url) {
            const cleanSaved = (item.url || '').trim().toLowerCase().replace(/\/+$/, '');
            const cleanCurrent = (tabObj.url || '').trim().toLowerCase().replace(/\/+$/, '');
            if (cleanSaved !== cleanCurrent) {
              const revertBtn = document.createElement('div');
              revertBtn.className = 'bookmark-revert-btn';
              revertBtn.innerHTML = '—';
              revertBtn.title = 'Revert to bookmarked page';
              revertBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (window.activeTabId !== item.tabId && typeof switchTab === 'function') {
                  switchTab(item.tabId);
                }
                setTimeout(() => {
                  if (window.naptureAPI && window.naptureAPI.navigate) {
                    window.naptureAPI.navigate(item.url);
                  }
                }, 50);
              });
              btn.appendChild(revertBtn);
            }
          }
        }
        
        btn.setAttribute('role', 'button');
        btn.setAttribute('aria-label', item.title || 'Bookmark');
        
        btn.addEventListener('click', (e) => {
          if (e && e.stopPropagation) e.stopPropagation();
          const liveItem = (item && item.id) ? (findBookmark(currentList, item.id)?.item || item) : item;

          // If Hover to Open Folders is off, automatically close parent folder(s) when clicking on a tab inside a folder
          if (!isFolderHoverEnabled()) {
            function closeAncestors(list, targetId) {
              if (!Array.isArray(list) || !targetId) return false;
              for (const node of list) {
                if (!node) continue;
                if (node.id === targetId) return true;
                if ((node.type === 'folder' || node.children) && Array.isArray(node.children)) {
                  if (closeAncestors(node.children, targetId)) {
                    node.isOpen = false;
                    return true;
                  }
                }
              }
              return false;
            }
            if (closeAncestors(currentList, liveItem.id)) {
              saveBookmarks();
            }
          }

          if (liveItem.tabId) {
            const exists = typeof window !== 'undefined' && window.tabs && window.tabs.find(t => t.id === liveItem.tabId);
            if (!exists) {
              // Tab was closed, recreate it with pre-assigned tabId
              const newId = liveItem.tabId || ('tab-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9));
              liveItem.tabId = newId;
              item.tabId = newId;
              saveBookmarks();
              if (typeof createTab === 'function') {
                createTab(liveItem.url, true, newId);
              }
              if (typeof window.updateActiveBookmark === 'function') {
                window.updateActiveBookmark();
              }
            } else if (typeof switchTab === 'function') {
              switchTab(liveItem.tabId);
            }
          } else if (liveItem.url && typeof createTab === 'function') {
            const newId = 'tab-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            liveItem.tabId = newId;
            item.tabId = newId;
            saveBookmarks();
            createTab(liveItem.url, true, newId);
            if (typeof updateActiveBookmark === 'function') {
              updateActiveBookmark();
            } else if (typeof window !== 'undefined' && typeof window.updateActiveBookmark === 'function') {
              window.updateActiveBookmark();
            }
          }

          if (typeof updateActiveBookmark === 'function') {
            updateActiveBookmark();
          } else if (typeof window !== 'undefined' && typeof window.updateActiveBookmark === 'function') {
            window.updateActiveBookmark();
          }
        });

        btn.addEventListener('auxclick', (e) => {
          if (e.button === 1) {
            e.preventDefault();
            if (item.url && typeof createTab === 'function') {
              createTab(item.url, false);
            }
          }
        });

        btn.addEventListener('mousedown', (e) => {
          if (e.button === 1) {
            e.preventDefault();
          }
        });
        
        // Close button removed from bookmarked tabs
        
        targetEl.appendChild(btn);
      }
    });

    if (fragment) {
      parentEl.appendChild(fragment);
    }
  }
  
  renderList(currentList, container);
}

// Recursively find a bookmark and its list
function findBookmark(list, id) {
  if (!Array.isArray(list) || !id) return null;
  for (let i = 0; i < list.length; i++) {
    if (!list[i]) continue;
    if (list[i].id === id) return { item: list[i], list, index: i };
    if (list[i].children && Array.isArray(list[i].children)) {
      const found = findBookmark(list[i].children, id);
      if (found) return found;
    }
  }
  return null;
}

// Recursively find a bookmark by URL (normalized without trailing slashes)
function findBookmarkByUrl(list, targetUrl) {
  if (!Array.isArray(list) || !targetUrl) return null;
  const cleanTarget = String(targetUrl).trim().toLowerCase().replace(/\/+$/, '');
  if (!cleanTarget) return null;

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!item) continue;
    if (item.url) {
      const cleanItemUrl = String(item.url).trim().toLowerCase().replace(/\/+$/, '');
      if (cleanItemUrl === cleanTarget) {
        return { item, list, index: i };
      }
    }
    if (item.children && Array.isArray(item.children)) {
      const found = findBookmarkByUrl(item.children, targetUrl);
      if (found) return found;
    }
  }
  return null;
}

// Check if potentialChildId is a descendant of parentId
function isDescendant(parentId, potentialChildId) {
  if (!parentId || !potentialChildId) return false;
  const foundParent = findBookmark(customBookmarks, parentId);
  if (!foundParent || !foundParent.item || foundParent.item.type !== 'folder') return false;

  function checkChildren(list) {
    if (!Array.isArray(list)) return false;
    for (const item of list) {
      if (!item) continue;
      if (item.id === potentialChildId) return true;
      if (item.type === 'folder' && checkChildren(item.children)) return true;
    }
    return false;
  }

  return checkChildren(foundParent.item.children);
}

// Context Menu Logic
function showTabContextMenu(e, targetType, targetId, tabData = null) {
  if (e && e.preventDefault) e.preventDefault();
  if (e && e.stopPropagation) e.stopPropagation();
  
  if (tabContextMenu && tabContextMenu.classList.contains('hidden') === false) {
    tabContextMenu.classList.add('hidden');
  }

  activeContextMenuTarget = { type: targetType, id: targetId, data: tabData };

  const menuItems = [];
  
  if (targetType === 'bookmark-folder') {
    menuItems.push({ label: 'New Nested Folder...', action: 'new-nested-folder' });
    menuItems.push({ label: 'Copy All Links', action: 'copy-all-links' });
    menuItems.push({ label: 'Rename...', action: 'rename-folder' });
    menuItems.push({ label: 'Duplicate', action: 'duplicate-folder' });
    menuItems.push({ label: 'Delete', action: 'delete-bookmark' });
  } else if (targetType === 'empty-bookmarks') {
    menuItems.push({ label: 'New Folder', action: 'new-root-folder' });
    menuItems.push({ label: 'Import Bookmarks...', action: 'import-bookmarks-file' });
  } else if (targetType === 'empty-tabs') {
    menuItems.push({ label: 'New Tab', action: 'new-tab' });
  } else {
    // Regular tab, pinned tab, or bookmark link
    menuItems.push({ label: 'Copy Link', action: 'copy-link' });
    if (targetType !== 'regular') {
      menuItems.push({ label: 'Rename...', action: 'rename-tab' });
    }
    menuItems.push({ label: 'Toggle Mute', action: 'mute' });
    menuItems.push({ label: 'Duplicate', action: 'duplicate-tab' });
    
    if (targetType === 'regular') {
      menuItems.push({ label: 'Close Tab', action: 'close-tab' });
      menuItems.push({ label: 'Close Other Tabs', action: 'close-other-tabs' });
    }
    if (targetType === 'pinned') {
      menuItems.push({ label: 'Unpin', action: 'unpin' });
    }
    if (targetType === 'bookmark-link') {
      menuItems.push({ label: 'Delete', action: 'delete-bookmark' });
    }

    menuItems.push({ type: 'separator' });
    if (targetType !== 'pinned') {
      menuItems.push({ label: 'Move to Pinned', action: 'move-to-pinned' });
    }
    let alreadyInBookmarksRoot = false;
    if (targetType === 'bookmark-link') {
      const found = findBookmark(customBookmarks, targetId);
      if (found && found.list === customBookmarks) alreadyInBookmarksRoot = true;
    }
    if (!alreadyInBookmarksRoot) {
      menuItems.push({ label: 'Move to Bookmarks', action: 'move-to-bookmarks-root' });
    }
    if (targetType !== 'regular') {
      menuItems.push({ label: 'Move to Tabs', action: 'move-to-tabs' });
    }

    function addFolderMoves(list, prefix = '') {
      list.forEach(item => {
        if (item.type === 'folder') {
          menuItems.push({ label: `Move to: ${prefix}${item.title}`, action: 'move-to-folder', payload: { folderId: item.id } });
          if (item.children) addFolderMoves(item.children, prefix + '  ');
        }
      });
    }
    addFolderMoves(customBookmarks);
  }

  const safeData = tabData ? {
    id: typeof tabData.id === 'string' || typeof tabData.id === 'number' ? tabData.id : null,
    title: typeof tabData.title === 'string' ? tabData.title : '',
    url: typeof tabData.url === 'string' ? tabData.url : '',
    favicon: typeof tabData.favicon === 'string' ? tabData.favicon : null,
    tabId: typeof tabData.tabId === 'string' || typeof tabData.tabId === 'number' ? tabData.tabId : null
  } : null;

  const targetObj = { type: targetType, id: targetId, data: safeData };
  activeContextMenuTarget = targetObj;

  menuItems.forEach(item => {
    if (item.type !== 'separator') {
      const existingPayload = (item.payload && typeof item.payload === 'object') ? item.payload : {};
      const cleanPayload = {};
      for (const k in existingPayload) {
        if (Object.prototype.hasOwnProperty.call(existingPayload, k)) {
          const val = existingPayload[k];
          if (val === null || typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
            cleanPayload[k] = val;
          }
        }
      }
      cleanPayload.target = targetObj;
      item.payload = cleanPayload;
    }
  });

  isContextMenuOpen = true;
  ensurePopupsListener();

  const coords = (e && typeof e.clientX === 'number' && typeof e.clientY === 'number') 
    ? { x: e.clientX, y: e.clientY } 
    : null;

  if (typeof window !== 'undefined' && window.naptureAPI && window.naptureAPI.showTabContextMenu) {
    window.naptureAPI.showTabContextMenu(menuItems, coords);
    return;
  }

  const menuEl = (typeof tabContextMenu !== 'undefined' && tabContextMenu) || (typeof document !== 'undefined' ? document.getElementById('tab-context-menu') : null);
  if (!menuEl) return;
  menuEl.innerHTML = '';
  menuItems.forEach(item => {
    if (item.type === 'separator') {
      const div = document.createElement('div');
      div.className = 'menu-divider';
      menuEl.appendChild(div);
      return;
    }
    const btn = document.createElement('button');
    btn.className = 'menu-item' + (item.enabled === false ? ' context-menu-disabled' : '');
    const span = document.createElement('span');
    span.textContent = item.label;
    btn.appendChild(span);
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (item.enabled !== false) {
        handleContextAction(item.action, item.payload);
        hideContextMenu();
      }
    });
    menuEl.appendChild(btn);
  });
  menuEl.classList.remove('hidden');

  let x = (e && typeof e.clientX === 'number') ? e.clientX : 100;
  let y = (e && typeof e.clientY === 'number') ? e.clientY : 100;

  const rect = menuEl.getBoundingClientRect ? menuEl.getBoundingClientRect() : { width: 190, height: 200 };
  const maxRight = typeof window !== 'undefined' ? window.innerWidth - 10 : 800;
  if (x + rect.width > maxRight) {
    x = Math.max(10, maxRight - rect.width);
  }
  const maxBottom = typeof window !== 'undefined' ? window.innerHeight - 10 : 600;
  if (y + rect.height > maxBottom) {
    y = Math.max(10, maxBottom - rect.height);
  }
  menuEl.style.left = `${x}px`;
  menuEl.style.top = `${y}px`;
}

function showMoveToSubmenu() {
  tabContextMenu.innerHTML = '';
  
  const backBtn = document.createElement('button');
  backBtn.className = 'menu-item';
  backBtn.innerHTML = '<span>← Back</span>';
  backBtn.addEventListener('click', () => {
    // Re-render original menu
    showTabContextMenu(
      { clientX: parseInt(tabContextMenu.style.left, 10), clientY: parseInt(tabContextMenu.style.top, 10), preventDefault:()=>{}, stopPropagation:()=>{} }, 
      activeContextMenuTarget.type, 
      activeContextMenuTarget.id, 
      activeContextMenuTarget.data
    );
  });
  tabContextMenu.appendChild(backBtn);
  
  const divider = document.createElement('div');
  divider.className = 'menu-divider';
  tabContextMenu.appendChild(divider);
  
  const target = activeContextMenuTarget;
  if (!target) return;

  // 1. Pinned (if not already pinned)
  if (target.type !== 'pinned') {
    const pinBtn = document.createElement('button');
    pinBtn.className = 'menu-item';
    pinBtn.innerHTML = '<span>Pinned</span>';
    pinBtn.addEventListener('click', () => {
      const title = target.data.title || 'New Tab';
      const url = target.data.url || 'napture://welcome';
      const favicon = target.data.favicon || null;
      const tabId = (target.type === 'regular') ? target.id : (target.type === 'bookmark-link' ? target.data.tabId : null);
      
      if (typeof addPinnedSite === 'function') {
        addPinnedSite(title, url, favicon, tabId);
      }
      
      if (target.type === 'bookmark-link') {
        if (typeof window.removeBookmarkById === 'function') {
          window.removeBookmarkById(target.id, false);
        }
      }
      hideContextMenu();
    });
    tabContextMenu.appendChild(pinBtn);
  }

  // 2. Bookmarks Root (if not already in bookmarks root)
  let alreadyInBookmarksRoot = false;
  if (target.type === 'bookmark-link') {
    const found = findBookmark(customBookmarks, target.id);
    if (found && found.list === customBookmarks) {
      alreadyInBookmarksRoot = true;
    }
  }
  if (!alreadyInBookmarksRoot) {
    const bkmBtn = document.createElement('button');
    bkmBtn.className = 'menu-item';
    bkmBtn.innerHTML = '<span>Bookmarks</span>';
    bkmBtn.addEventListener('click', () => {
      executeMoveTo(null);
    });
    tabContextMenu.appendChild(bkmBtn);
  }

  // 3. Tabs (if not already in basic tabs area)
  if (target.type !== 'regular') {
    const tabsBtn = document.createElement('button');
    tabsBtn.className = 'menu-item';
    tabsBtn.innerHTML = '<span>Tabs</span>';
    tabsBtn.addEventListener('click', () => {
      if (target.type === 'pinned') {
        if (typeof unpinPinnedSite === 'function') {
          unpinPinnedSite(target.data);
        }
      } else if (target.type === 'bookmark-link') {
        let hasOpenTab = false;
        if (target.data.tabId && window.tabs) {
          hasOpenTab = window.tabs.some(t => t.id === target.data.tabId);
        }
        if (!hasOpenTab) {
          if (typeof createTab === 'function') {
            createTab(target.data.url || 'napture://welcome', true);
          }
        }
        if (typeof window.removeBookmarkById === 'function') {
          window.removeBookmarkById(target.id, false);
        }
      }
      hideContextMenu();
      if (typeof renderTabs === 'function') renderTabs();
      if (typeof renderCustomBookmarks === 'function') renderCustomBookmarks();
    });
    tabContextMenu.appendChild(tabsBtn);
  }

  // Divider before folders
  const folderDivider = document.createElement('div');
  folderDivider.className = 'menu-divider';
  tabContextMenu.appendChild(folderDivider);

  // 4. Recursively add folders from bookmarks
  function addFolders(list, level) {
    list.forEach(item => {
      if (item.type === 'folder') {
        const fBtn = document.createElement('button');
        fBtn.className = 'menu-item';
        fBtn.style.paddingLeft = `${10 + level * 12}px`;
        fBtn.innerHTML = `<span>${escapeHtml(item.title || "Folder")}</span>`;
        fBtn.addEventListener('click', () => executeMoveTo(item.id));
        tabContextMenu.appendChild(fBtn);
        if (item.children) addFolders(item.children, level + 1);
      }
    });
  }
  addFolders(customBookmarks, 0);
}

function executeMoveTo(targetFolderId, explicitTarget = null) {
  const target = explicitTarget || activeContextMenuTarget;
  hideContextMenu();
  if (!target) return;
  
  let itemToMove = null;
  
  if (target.type.startsWith('bookmark')) {
    const found = findBookmark(customBookmarks, target.id);
    if (found) {
      if (target.type === 'bookmark-folder') {
        if (targetFolderId === target.id || isDescendant(target.id, targetFolderId)) return;
      }
      itemToMove = found.item;
      found.list.splice(found.index, 1);
    }
  } else {
    if (target.data && target.data.url) {
      const tabId = (target.type === 'regular') ? target.id : (target.type === 'pinned' ? target.data.tabId : null);
      itemToMove = {
        id: 'b-' + Date.now(),
        type: 'link',
        title: target.data.title,
        url: target.data.url,
        favicon: target.data.favicon,
        tabId: tabId
      };
      
      if (target.type === 'pinned') {
        if (typeof unpinPinnedSite === 'function') {
          unpinPinnedSite(target.data);
        }
      }
    }
  }
  
  if (itemToMove) {
    if (targetFolderId === null) {
      customBookmarks.push(itemToMove);
    } else {
      const tgtFolder = findBookmark(customBookmarks, targetFolderId);
      if (tgtFolder && tgtFolder.item.type === 'folder') {
        if (!tgtFolder.item.children) tgtFolder.item.children = [];
        tgtFolder.item.children.push(itemToMove);
        if (!isFolderHoverEnabled()) {
          tgtFolder.item.isOpen = true;
        }
      } else {
        customBookmarks.push(itemToMove);
      }
    }
    saveBookmarks();
    renderCustomBookmarks();
    if (typeof renderTabs === 'function') renderTabs();
  }
}

function hideContextMenu(skipIpcNotify = false) {
  isContextMenuOpen = false;
  activeContextMenuTarget = null;
  const menuEl = (typeof tabContextMenu !== 'undefined' && tabContextMenu) || (typeof document !== 'undefined' ? document.getElementById('tab-context-menu') : null);
  if (menuEl) {
    menuEl.classList.add('hidden');
  }
  if (!skipIpcNotify && typeof window !== 'undefined' && window.naptureAPI && window.naptureAPI.contextMenuAction) {
    window.naptureAPI.contextMenuAction(-1);
  }
  const container = (typeof bookmarksContainer !== 'undefined' && bookmarksContainer) || (typeof document !== 'undefined' ? document.getElementById('bookmarks-container') : null);
  if (container && container.querySelectorAll) {
    container.querySelectorAll('[data-hovered]').forEach(el => {
      delete el.dataset.hovered;
    });
  }
  if (typeof updateActiveBookmark === 'function') {
    updateActiveBookmark();
  }
}

if (typeof window !== 'undefined') {
  window.hideContextMenu = hideContextMenu;
}

let _boundNaptureAPI = null;
function ensurePopupsListener() {
  if (typeof window !== 'undefined' && window.naptureAPI && _boundNaptureAPI !== window.naptureAPI) {
    _boundNaptureAPI = window.naptureAPI;
    const closeHandler = () => {
      hideContextMenu(true);
      if (typeof updateActiveBookmark === 'function') {
        updateActiveBookmark();
      }
    };
    if (window.naptureAPI.onClosePopups) {
      window.naptureAPI.onClosePopups(closeHandler);
    }
    if (window.naptureAPI.onCloseAllPopups) {
      window.naptureAPI.onCloseAllPopups(closeHandler);
    }
  }
}
ensurePopupsListener();

if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (e) => {
    if (isContextMenuOpen && e.button !== 2) {
      hideContextMenu();
    }
  });

  document.addEventListener('click', (e) => {
    if (isContextMenuOpen && e.button !== 2) {
      hideContextMenu();
    }
  });

  // Event Delegation for Context Menu
  document.addEventListener('contextmenu', (e) => {
    const tabEl = e.target.closest('.tab');
    const pinnedEl = e.target.closest('.shortcut-btn');
    const bookmarkEl = e.target.closest('.bookmark-item');
    const bookmarksArea = e.target.closest('.bookmarks-section');
    const tabsArea = e.target.closest('.tabs-section, #tabs-container');
    
    const tabList = (typeof window !== 'undefined' && window.tabs ? window.tabs : (typeof tabs !== 'undefined' ? tabs : []));
    const pinnedList = (typeof window !== 'undefined' && window.pinnedSites ? window.pinnedSites : (typeof pinnedSites !== 'undefined' ? pinnedSites : []));

    if (tabEl && !bookmarkEl) {
      const tabId = tabEl.dataset.tabId;
      const tabObj = tabList.find(t => t.id === tabId);
      if (tabObj) showTabContextMenu(e, 'regular', tabId, tabObj);
    } else if (pinnedEl) {
      const index = parseInt(pinnedEl.dataset.index, 10);
      const pinnedObj = pinnedList[index];
      if (pinnedObj) showTabContextMenu(e, 'pinned', pinnedObj.tabId || index, pinnedObj);
    } else if (bookmarkEl) {
      const id = bookmarkEl.dataset.id;
      const type = bookmarkEl.dataset.type;
      const found = findBookmark(customBookmarks, id);
      if (found) showTabContextMenu(e, type === 'folder' ? 'bookmark-folder' : 'bookmark-link', id, found.item);
    } else if (bookmarksArea) {
      showTabContextMenu(e, 'empty-bookmarks', null, null);
    } else if (tabsArea) {
      showTabContextMenu(e, 'empty-tabs', null, null);
    }
  });
}

function handleContextAction(action, payload) {
  const target = (payload && payload.target) || activeContextMenuTarget;
  if (!target) return;
  
  if (action === 'copy-link') {
    if (target.data && target.data.url) navigator.clipboard.writeText(target.data.url);
  } else if (action === 'rename-tab' || action === 'rename-folder') {
    if (target.type && target.type.startsWith('bookmark')) {
      const found = findBookmark(customBookmarks, target.id);
      if (found) {
        found.item._pendingRename = true;
        saveBookmarks();
        renderCustomBookmarks();
      }
    } else {
      const newName = prompt('Enter new name:', (target.data && target.data.title) || '');
      if (newName && newName.trim()) {
        if (target.type === 'regular' || target.type === 'pinned') {
          const tabList = (window.tabs || (typeof tabs !== 'undefined' ? tabs : []));
          const t = tabList.find(tab => tab.id === target.id);
          if (t) {
            t.title = newName.trim();
            if (typeof renderTabs === 'function') renderTabs();
            if (typeof renderPinnedSites === 'function') renderPinnedSites();
          }
        }
      }
    }
  } else if (action === 'mute') {
    if (target.data && target.data.tabId && window.naptureAPI && window.naptureAPI.toggleMuteTab) {
      window.naptureAPI.toggleMuteTab(target.data.tabId);
    } else if (target.id && window.naptureAPI && window.naptureAPI.toggleMuteTab) {
      window.naptureAPI.toggleMuteTab(target.id);
    }
  } else if (action === 'duplicate-tab' || action === 'duplicate-folder') {
    if (target.type && target.type.startsWith('bookmark')) {
      const found = findBookmark(customBookmarks, target.id);
      if (found) {
        const dup = JSON.parse(JSON.stringify(found.item));

        function recursivelyRegenerateIds(item) {
          item.id = 'b-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
          if (item.type === 'link') {
            item.tabId = 'tab-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
          }
          if (item.children) {
            item.children.forEach(recursivelyRegenerateIds);
          }
        }
        recursivelyRegenerateIds(dup);

        found.list.splice(found.index + 1, 0, dup);
        saveBookmarks();
        renderCustomBookmarks();
      }
    } else {
      if (target.data && typeof createTab === 'function') {
        createTab(target.data.url || 'napture://welcome', false);
      }
    }
  } else if (action === 'close-tab') {
    const tabToClose = (target.type === 'regular') ? target.id : (target.data && target.data.tabId);
    if (tabToClose && typeof closeTab === 'function') {
      closeTab(tabToClose);
    }
  } else if (action === 'close-other-tabs') {
    if (target.id) {
      const tabList = (window.tabs || (typeof tabs !== 'undefined' ? tabs : []));
      const otherTabs = tabList.filter(t => t.id !== target.id);
      otherTabs.forEach(t => {
        if (typeof closeTab === 'function') closeTab(t.id);
      });
    }
  } else if (action === 'new-tab') {
    if (typeof createTab === 'function') {
      createTab('napture://welcome', true);
    }
  } else if (action === 'unpin') {
    if (typeof unpinPinnedSite === 'function' && target.data) {
      unpinPinnedSite(target.data);
    }
  } else if (action === 'new-nested-folder' || action === 'new-root-folder') {
    const newFolder = { id: 'b-' + Date.now(), type: 'folder', title: 'New Folder', isOpen: true, children: [], _pendingRename: true };
    if (action === 'new-root-folder') {
      customBookmarks.push(newFolder);
    } else {
      const found = findBookmark(customBookmarks, target.id);
      if (found) {
        if (!found.item.children) found.item.children = [];
        found.item.children.push(newFolder);
        found.item.isOpen = true;
      }
    }
    saveBookmarks();
    renderCustomBookmarks();
  } else if (action === 'delete-bookmark') {
    if (typeof window.removeBookmarkById === 'function') {
      window.removeBookmarkById(target.id, true);
    }
  } else if (action === 'copy-all-links') {
    const found = findBookmark(customBookmarks, target.id);
    if (found && found.item.type === 'folder') {
      const urls = [];
      const extractUrls = (list) => {
        list.forEach(item => {
          if (item.type === 'link') urls.push(item.url);
          else if (item.children) extractUrls(item.children);
        });
      };
      if (found.item.children) extractUrls(found.item.children);
      navigator.clipboard.writeText(urls.join('\n'));
    }
  } else if (action === 'import-bookmarks-file') {
    if (window.naptureAPI && window.naptureAPI.importBookmarksFile) {
      window.naptureAPI.importBookmarksFile();
    }
  } else if (action === 'move-to-pinned') {
    if (target.data) {
      const title = target.data.title || 'New Tab';
      const url = target.data.url || 'napture://welcome';
      const favicon = target.data.favicon || null;
      const tabId = (target.type === 'regular') ? target.id : (target.type === 'bookmark-link' ? target.data.tabId : null);
      if (typeof addPinnedSite === 'function') addPinnedSite(title, url, favicon, tabId);
      if (target.type === 'bookmark-link' && typeof window.removeBookmarkById === 'function') {
        window.removeBookmarkById(target.id, false);
      }
    }
  } else if (action === 'move-to-bookmarks-root') {
    executeMoveTo(null, target);
  } else if (action === 'move-to-tabs') {
    if (target.type === 'pinned') {
      if (typeof unpinPinnedSite === 'function') unpinPinnedSite(target.data);
    } else if (target.type === 'bookmark-link') {
      let hasOpenTab = false;
      if (target.data && target.data.tabId && window.tabs) {
        hasOpenTab = window.tabs.some(t => t.id === target.data.tabId);
      }
      if (!hasOpenTab && typeof createTab === 'function') {
        createTab((target.data && target.data.url) || 'napture://welcome', true);
      }
      if (typeof window.removeBookmarkById === 'function') {
        window.removeBookmarkById(target.id, false);
      }
    }
    if (typeof renderTabs === 'function') renderTabs();
    if (typeof renderCustomBookmarks === 'function') renderCustomBookmarks();
  } else if (action === 'move-to-folder') {
    const fId = payload && payload.folderId ? payload.folderId : (typeof payload === 'string' ? payload : null);
    if (fId) executeMoveTo(fId, target);
  }
}

if (typeof window !== 'undefined' && window.naptureAPI && window.naptureAPI.onTabContextMenuAction) {
  window.naptureAPI.onTabContextMenuAction((action, payload) => {
    isContextMenuOpen = false;
    handleContextAction(action, payload);
  });
}

// Drag & Drop into Bookmarks
const targetBookmarksContainer = (typeof bookmarksContainer !== 'undefined' && bookmarksContainer) || (typeof document !== 'undefined' ? document.getElementById('bookmarks-container') : null);
if (targetBookmarksContainer) {
  targetBookmarksContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    bookmarksContainer.classList.add('drag-over');
    if (typeof draggedTab !== 'undefined' && draggedTab) {
      e.dataTransfer.dropEffect = 'copy';
    } else {
      e.dataTransfer.dropEffect = 'move';
    }

    const sidebarEl = bookmarksContainer.closest('.sidebar-top') || document.querySelector('.sidebar-top');
    if (sidebarEl) {
      const sRect = sidebarEl.getBoundingClientRect();
      if (e.clientY < sRect.top + 36) {
        sidebarEl.scrollTop -= 10;
      } else if (e.clientY > sRect.bottom - 36) {
        sidebarEl.scrollTop += 10;
      }
    }
  });

  targetBookmarksContainer.addEventListener('dragleave', (e) => {
    e.preventDefault();
    if (!targetBookmarksContainer.contains(e.relatedTarget)) {
      targetBookmarksContainer.classList.remove('drag-over');
    }
  });

  targetBookmarksContainer.addEventListener('mouseleave', () => {
    if (isContextMenuOpen) return;
    setTimeout(() => {
      if (isContextMenuOpen) return;
      if (typeof updateActiveBookmark === 'function') {
        updateActiveBookmark();
      }
    }, 180);
  });

  targetBookmarksContainer.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent renderer.js executeTabReorder from running
    targetBookmarksContainer.classList.remove('drag-over');
    
    if (typeof activeDragState !== 'undefined') {
      activeDragState.targetInfo = { type: 'bookmark' };
    }
    
    // Check if dragging a tab
    let droppedTab = (typeof draggedTab !== 'undefined' && draggedTab && draggedTab.source !== 'bookmark') ? draggedTab : null;
    if (!droppedTab && e.dataTransfer) {
      try {
        const raw = e.dataTransfer.getData('text/plain');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.tabId && parsed.url && parsed.source !== 'bookmark') droppedTab = parsed;
        }
      } catch(e) {}
    }

    if (droppedTab && droppedTab.url) {
      const newBookmark = {
        id: 'b-' + Date.now(),
        type: 'link',
        title: droppedTab.title,
        url: droppedTab.url,
        favicon: droppedTab.favicon,
        tabId: droppedTab.tabId
      };
      
      const dropTarget = e.target.closest('.bookmark-item');
      const currentList = (typeof window !== 'undefined' && Array.isArray(window.customBookmarks)) ? window.customBookmarks : customBookmarks;
      if (dropTarget) {
        const targetId = dropTarget.dataset.id;
        const targetType = dropTarget.dataset.type;
        const found = findBookmark(currentList, targetId);
        
        const rect = dropTarget.getBoundingClientRect();
        const h = rect.height;
        const relY = e.clientY - rect.top;
        const isFolder = targetType === 'folder';
        const isMergeZone = isFolder && (relY > h * 0.25 && relY < h * 0.75);
        const isAbove = isMergeZone ? (relY <= h * 0.25) : (relY < h * 0.5);
        
        if (found) {
          if (isMergeZone) {
            if (targetType === 'folder') {
              if (!found.item.children) found.item.children = [];
              found.item.children.push(newBookmark);
              if (!isFolderHoverEnabled()) {
                found.item.isOpen = true;
              }
            } else {
              // CREATE FOLDER: wrap existing bookmark + dropped tab into a new folder
              const existingItem = JSON.parse(JSON.stringify(found.item));
              const newFolder = {
                id: 'b-' + Date.now() + '-f',
                type: 'folder',
                title: 'New Folder',
                isOpen: true,
                children: [existingItem, newBookmark],
                _pendingRename: true
              };
              found.list.splice(found.index, 1, newFolder);
            }
          } else {
            if (isAbove) {
              found.list.splice(found.index, 0, newBookmark);
            } else {
              found.list.splice(found.index + 1, 0, newBookmark);
            }
          }
        } else {
          currentList.push(newBookmark);
        }
      } else {
        currentList.push(newBookmark);
      }
      
      // Remove the tab from the regular tabs list so it doesn't linger
      if (droppedTab.tabId && window.tabs) {
        // Tab is now a bookmark tab — renderTabs will filter it out
        // Just need to re-render
      }
      
      dropTarget?.classList.remove('drop-target-top', 'drop-target-bottom');
      const allBookmarks = Array.from(bookmarksContainer.querySelectorAll('.bookmark-item'));
      allBookmarks.forEach(t => t.classList.remove('shift-down', 'shift-up'));
      
      saveBookmarks();
      renderCustomBookmarks();
      if (typeof renderTabs === 'function') renderTabs();
      if (typeof endDrag === 'function') endDrag();
      return;
    }
    
    // Check if dragging a bookmark (reorder/move)
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.source === 'bookmark') {
          const draggedId = parsed.id;
          const dropTarget = e.target.closest('.bookmark-item');
          const currentList = (typeof window !== 'undefined' && Array.isArray(window.customBookmarks)) ? window.customBookmarks : customBookmarks;
          
          if (draggedId) {
            const foundDrag = findBookmark(currentList, draggedId);
            if (foundDrag) {
              const itemToMove = foundDrag.item;
              
              if (dropTarget && dropTarget.dataset.id !== draggedId) {
                const targetId = dropTarget.dataset.id;
                const targetType = dropTarget.dataset.type;
                
                // Prevent dropping folder into its own descendant
                if (itemToMove.type === 'folder' && isDescendant(draggedId, targetId)) {
                  dropTarget?.classList.remove('drop-target-top', 'drop-target-bottom');
                  const allBms = Array.from(bookmarksContainer.querySelectorAll('.bookmark-item'));
                  allBms.forEach(t => t.classList.remove('shift-down', 'shift-up'));
                  return;
                }

                const rect = dropTarget.getBoundingClientRect();
                const h = rect.height;
                const relY = e.clientY - rect.top;
                const isMergeZone = relY > h * 0.25 && relY < h * 0.75;
                const isAbove = isMergeZone ? (relY <= h * 0.25) : (relY < h * 0.5);
                
                const tgtFound = findBookmark(currentList, targetId);
                if (tgtFound) {
                  foundDrag.list.splice(foundDrag.index, 1);
                  
                  // Re-find target because list might have shifted
                  const finalTgt = findBookmark(currentList, targetId);
                  if (finalTgt) {
                    if (isMergeZone) {
                      if (targetType === 'folder') {
                        if (!finalTgt.item.children) finalTgt.item.children = [];
                        finalTgt.item.children.push(itemToMove);
                        if (!isFolderHoverEnabled()) {
                          finalTgt.item.isOpen = true;
                        }
                      } else {
                        const existingItem = JSON.parse(JSON.stringify(finalTgt.item));
                        const newFolder = {
                          id: 'b-' + Date.now() + '-f',
                          type: 'folder',
                          title: 'New Folder',
                          isOpen: true,
                          children: [existingItem, itemToMove],
                          _pendingRename: true
                        };
                        finalTgt.list.splice(finalTgt.index, 1, newFolder);
                      }
                    } else {
                      if (isAbove) {
                        finalTgt.list.splice(finalTgt.index, 0, itemToMove);
                      } else {
                        finalTgt.list.splice(finalTgt.index + 1, 0, itemToMove);
                      }
                    }
                  } else {
                    currentList.push(itemToMove);
                  }
                }
              } else if (!dropTarget) {
                foundDrag.list.splice(foundDrag.index, 1);
                currentList.push(itemToMove);
              }
            }
          }
          
          dropTarget?.classList.remove('drop-target-top', 'drop-target-bottom');
          const allBms = Array.from(bookmarksContainer.querySelectorAll('.bookmark-item'));
          allBms.forEach(t => t.classList.remove('shift-down', 'shift-up'));
          
          saveBookmarks();
          renderCustomBookmarks();
        }
      }
    } catch(e) {}
    
  });
}

if (typeof window !== 'undefined') {
  window.removeBookmarkById = function(id, closeAssociatedTabs = true) {
    const found = findBookmark(customBookmarks, id);
    if (found) {
      const removed = found.list[found.index];

      if (closeAssociatedTabs) {
        // Close associated tab(s) so they don't resurface in regular tabs
        function closeAssociated(item) {
          if (item.type === 'folder' && item.children) {
            item.children.forEach(closeAssociated);
          } else if (item.tabId && typeof closeTab === 'function') {
            closeTab(item.tabId);
          }
        }
        closeAssociated(removed);
      }

      found.list.splice(found.index, 1);
      saveBookmarks();
      renderCustomBookmarks();
      if (typeof renderTabs === 'function') renderTabs();
    }
  };

  window.updateBookmarkFavicon = function(tabId, favicon) {
    let changed = false;
    function traverse(list) {
      for (const item of list) {
        if (item.type === 'folder' && item.children) traverse(item.children);
        else if (item.type === 'link' && item.tabId === tabId) {
          item.favicon = favicon;
          changed = true;
        }
      }
    }
    traverse(customBookmarks);
    if (changed) {
      saveBookmarks();
      renderCustomBookmarks();
    }
  };
}

function updateActiveBookmark() {
  const container = (typeof bookmarksContainer !== 'undefined' && bookmarksContainer) || (typeof document !== 'undefined' ? document.getElementById('bookmarks-container') : null);
  if (!container) return;

  const currentList = (typeof window !== 'undefined' && Array.isArray(window.customBookmarks)) ? window.customBookmarks : customBookmarks;
  const currentActiveTabId = (typeof window !== 'undefined' && typeof window.activeTabId !== 'undefined') ? window.activeTabId : (typeof activeTabId !== 'undefined' ? activeTabId : null);

  // Bolt Optimization: Pre-index bookmark tree and DOM elements into O(1) Hash Maps
  // to avoid O(N^2) recursive findBookmark tree scans and repeated querySelector DOM lookups per item.
  const bookmarkMapById = new Map();
  function indexBookmarkList(list) {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      if (!item) continue;
      if (item.id) bookmarkMapById.set(item.id, item);
      if ((item.type === 'folder' || item.children) && Array.isArray(item.children)) {
        indexBookmarkList(item.children);
      }
    }
  }
  indexBookmarkList(currentList);

  const allBtns = container.querySelectorAll ? container.querySelectorAll('.bookmark-item') : [];
  const btnMapById = new Map();
  if (allBtns && allBtns.forEach) {
    allBtns.forEach(btn => {
      if (btn.dataset && btn.dataset.id) {
        btnMapById.set(btn.dataset.id, btn);
      }
    });
  }

  // 1. Update active tab highlights using O(1) Map lookup
  if (allBtns && allBtns.forEach) {
    allBtns.forEach(btn => {
      if (btn.dataset && btn.dataset.type !== 'folder' && btn.dataset.id) {
        const item = bookmarkMapById.get(btn.dataset.id);
        if (item && item.tabId && item.tabId === currentActiveTabId) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      }
    });
  }

  // Pre-index active context menu target folder ancestry for O(1) menu target checks
  const menuTargetFolderIds = new Set();
  if (isContextMenuOpen && activeContextMenuTarget && activeContextMenuTarget.id) {
    function collectAncestors(list, targetId, ancestors = []) {
      if (!Array.isArray(list) || !targetId) return false;
      for (const item of list) {
        if (!item) continue;
        if (item.id === targetId) {
          menuTargetFolderIds.add(item.id);
          ancestors.forEach(id => menuTargetFolderIds.add(id));
          return true;
        }
        if ((item.type === 'folder' || item.children) && Array.isArray(item.children)) {
          if (collectAncestors(item.children, targetId, [...ancestors, item.id])) {
            return true;
          }
        }
      }
      return false;
    }
    collectAncestors(currentList, activeContextMenuTarget.id);
  }

  // 2. Recursively update folder visibility and collapsed state for minimized folders
  function refreshFolderTreeVisibility(list, isParentMinimizedWithActiveDescendant) {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      if (!item || !item.id) continue;
      const btn = btnMapById.get(item.id) || null;
      if (item.type === 'folder' || item.children) {
        const wrapper = btn ? btn.nextElementSibling : null;
        const hasActive = hasActiveDescendant(item);
        const hasRenaming = Boolean(item._pendingRename || hasRenamingDescendant(item));
        const hasGrace = _renameGraceFolderIds.has(item.id);
        const isDirectlyOpen = Boolean(item.isOpen);
        const isMenuTarget = menuTargetFolderIds.has(item.id);
        const isCurrentlyHovered = isFolderHoverEnabled() && Boolean(btn && btn.dataset && btn.dataset.hovered === 'true');
        const shouldBeOpen = isDirectlyOpen || Boolean(isMenuTarget) || isCurrentlyHovered || hasRenaming || hasGrace;
        const isThisFolderMinimizedWithActive = !shouldBeOpen && hasActive;
        const isWrapperCollapsed = !shouldBeOpen && !hasActive;

        if (btn) {
          btn.classList.toggle('folder-open', shouldBeOpen);
          if (isParentMinimizedWithActiveDescendant && !hasActive) {
            btn.classList.add('folder-minimized-hidden');
          } else {
            btn.classList.remove('folder-minimized-hidden');
          }
        }

        if (wrapper && wrapper.classList && wrapper.classList.contains('bookmark-children-wrapper')) {
          wrapper.classList.toggle('collapsed', isWrapperCollapsed);
          if (isParentMinimizedWithActiveDescendant && !hasActive) {
            wrapper.classList.add('folder-minimized-hidden');
          } else {
            wrapper.classList.remove('folder-minimized-hidden');
          }
        }

        if (item.children && Array.isArray(item.children)) {
          refreshFolderTreeVisibility(item.children, isThisFolderMinimizedWithActive || isParentMinimizedWithActiveDescendant);
        }
      } else {
        // Bookmark link
        if (btn) {
          const isActive = isBookmarkItemActive(item);
          if (isParentMinimizedWithActiveDescendant && !isActive) {
            btn.classList.add('folder-minimized-hidden');
          } else {
            btn.classList.remove('folder-minimized-hidden');
          }
        }
      }
    }
  }

  refreshFolderTreeVisibility(currentList, false);
}

if (typeof window !== 'undefined') {
  window.updateActiveBookmark = updateActiveBookmark;
  window.addEventListener('blur', () => {
    if (typeof updateActiveBookmark === 'function') {
      updateActiveBookmark();
    }
  });
}

// Initial Load
if (typeof window !== 'undefined' && (typeof process === 'undefined' || !process.env || process.env.NODE_ENV !== 'test')) {
  setTimeout(loadBookmarks, 100);

  if (window.naptureAPI && window.naptureAPI.onBrowserDataImported) {
    window.naptureAPI.onBrowserDataImported((data) => {
      if (data && data.importedBookmarks && Array.isArray(data.importedBookmarks)) {
        try {
          const deduplicated = deduplicateBookmarksTree(data.importedBookmarks);
          preserveBookmarkState(customBookmarks, deduplicated);
          customBookmarks = deduplicated;
          if (typeof localStorage !== 'undefined') {
            const newSavedStr = JSON.stringify(customBookmarks);
            if (newSavedStr !== localStorage.getItem('napture-bookmarks')) {
              localStorage.setItem('napture-bookmarks', newSavedStr);
            }
          }
          renderCustomBookmarks();
          if (typeof renderTabs === 'function') renderTabs();
        } catch (e) {
          console.error('Error in onBrowserDataImported handler:', e);
        }
      }
    });
  }

  if (window.naptureAPI && window.naptureAPI.onResetAllCompleted) {
    window.naptureAPI.onResetAllCompleted(() => {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('napture-bookmarks');
        }
        customBookmarks = [];
        if (typeof renderCustomBookmarks === 'function') {
          renderCustomBookmarks();
        }
      } catch (e) {
        console.error('Error in onResetAllCompleted in bookmarks.js:', e);
      }
    });
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    deduplicateBookmarksTree,
    mergeBookmarksTrees,
    preserveBookmarkState,
    findBookmark,
    findBookmarkByUrl,
    saveBookmarks,
    renderCustomBookmarks,
    updateActiveBookmark,
    showTabContextMenu,
    hideContextMenu,
    isBookmarkItemOpen,
    isBookmarkItemActive,
    hasOpenDescendant,
    hasActiveDescendant
  };
}

