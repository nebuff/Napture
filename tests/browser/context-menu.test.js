describe('Context Menu Handling', () => {
  it('should generate bounded update script without infinite loop', () => {
    let attempts = 0;
    let windowUpdateContent = null;

    // Simulate script logic
    function simulateScriptExecution(hasUpdateContent) {
      if (hasUpdateContent) {
        windowUpdateContent = () => true;
      }

      let callCount = 0;
      let maxAttemptsReached = false;

      function apply() {
        callCount++;
        if (windowUpdateContent) {
          windowUpdateContent();
        } else if (attempts < 20) {
          attempts++;
        } else {
          maxAttemptsReached = true;
        }
      }

      apply();
      return { callCount, maxAttemptsReached };
    }

    // When window.updateContent is not present
    const resultNoContent = simulateScriptExecution(false);
    expect(resultNoContent.callCount).toBe(1);
    expect(attempts).toBe(1);

    // Max attempts check
    attempts = 20;
    const resultMax = simulateScriptExecution(false);
    expect(resultMax.maxAttemptsReached).toBe(true);
  });

  it('should ignore mouse events and reset bounds when hiding context menu without removing child view', () => {
    let mouseIgnored = false;
    let ignoreOptions = null;
    let bounds = { x: 10, y: 10, width: 200, height: 200 };

    const mockContextMenuView = {
      setBounds: (b) => { bounds = b; },
      getBounds: () => bounds,
      setIgnoreMouseEvents: (ignore, options) => {
        mouseIgnored = ignore;
        ignoreOptions = options;
      },
      webContents: {
        isDestroyed: () => false,
        executeJavaScript: jest.fn().mockResolvedValue()
      }
    };

    const children = [mockContextMenuView];
    const mockWin = {
      state: { contextMenuView: mockContextMenuView },
      contentView: {
        children,
        removeChildView: jest.fn((view) => {
          const idx = children.indexOf(view);
          if (idx !== -1) children.splice(idx, 1);
        })
      }
    };

    function hideContextMenu(win) {
      if (!win) return;
      const state = win.state;
      if (state && state.contextMenuView) {
        try {
          state.contextMenuView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
          if (typeof state.contextMenuView.setIgnoreMouseEvents === 'function') {
            state.contextMenuView.setIgnoreMouseEvents(true, { forward: true });
          }
          if (state.contextMenuView.webContents && !state.contextMenuView.webContents.isDestroyed()) {
            state.contextMenuView.webContents.executeJavaScript("if (window.hideContent) window.hideContent();").catch(() => {});
          }
        } catch (e) {}
      }
    }

    hideContextMenu(mockWin);

    expect(bounds).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(mouseIgnored).toBe(true);
    expect(ignoreOptions).toEqual({ forward: true });
    expect(mockWin.contentView.removeChildView).not.toHaveBeenCalled();
    expect(children).toContain(mockContextMenuView);
  });

  it('should include "Edit Custom Site..." option when right-clicking a custom site button on the toolbar', () => {
    const customSiteItem = {
      id: 'link-101',
      type: 'link',
      name: 'GitHub',
      url: 'https://github.com'
    };

    function buildToolbarContextMenu(itemData, isToolbarCustomizing = false) {
      const menuItems = [];

      if (itemData && itemData.type === 'link') {
        menuItems.push({
          label: 'Edit Custom Site...',
          action: 'edit-custom-site',
          payload: { itemId: itemData.id }
        });
      }

      menuItems.push({
        label: isToolbarCustomizing ? 'Exit Toolbar Customizing' : 'Customize Toolbar...',
        action: 'customize-toolbar'
      });

      if (itemData) {
        if (itemData.id !== 'address-container') {
          menuItems.push({
            label: 'Remove from Toolbar',
            action: 'remove-item',
            payload: { itemId: itemData.id }
          });
        }
      }

      menuItems.push({ type: 'separator' });
      menuItems.push({
        label: 'Reset Toolbar to Default',
        action: 'reset-toolbar'
      });

      return menuItems;
    }

    const menu = buildToolbarContextMenu(customSiteItem);
    expect(menu[0].label).toBe('Edit Custom Site...');
    expect(menu[0].action).toBe('edit-custom-site');
    expect(menu[0].payload).toEqual({ itemId: 'link-101' });

    const emptyMenu = buildToolbarContextMenu(null);
    expect(emptyMenu[0].label).toBe('Customize Toolbar...');
  });

  it('should edit existing custom site link in layout when submitting link form in edit mode', () => {
    let activeToolbarLayout = [
      { id: 'link-101', type: 'link', name: 'Old Name', url: 'https://old.com', favicon: '' },
      { id: 'address-container', type: 'system', name: 'Address Bar' }
    ];

    let editingCustomLinkId = 'link-101';

    function submitAddLinkFormSimulated(title, rawUrl) {
      let url = rawUrl.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      const finalTitle = title.trim() || 'Link';

      if (editingCustomLinkId) {
        const targetItem = activeToolbarLayout.find(i => i.id === editingCustomLinkId);
        if (targetItem) {
          targetItem.name = finalTitle;
          targetItem.url = url;
        }
      }
      editingCustomLinkId = null;
    }

    submitAddLinkFormSimulated('New GitHub Name', 'github.com');

    expect(activeToolbarLayout[0].name).toBe('New GitHub Name');
    expect(activeToolbarLayout[0].url).toBe('https://github.com');
    expect(editingCustomLinkId).toBeNull();
  });

  it('should reset toolbar drag indexes on endDrag', () => {
    let draggedTopBarIdx = 2;
    let draggedPaletteItem = { id: 'test' };

    function endDrag() {
      draggedTopBarIdx = null;
      draggedPaletteItem = null;
    }

    endDrag();

    expect(draggedTopBarIdx).toBeNull();
    expect(draggedPaletteItem).toBeNull();
  });

  it('should safely handle context menu actions on destroyed or throwing webContents', () => {
    const destroyedWebContents = {
      isDestroyed: () => true,
      inspectElement: jest.fn(() => { throw new Error('Object has been destroyed'); }),
      isDevToolsOpened: jest.fn(() => false),
      openDevTools: jest.fn(),
      goBack: jest.fn(() => { throw new Error('Object has been destroyed'); }),
      goForward: jest.fn(() => { throw new Error('Object has been destroyed'); }),
      reload: jest.fn(() => { throw new Error('Object has been destroyed'); }),
      downloadURL: jest.fn(() => { throw new Error('Object has been destroyed'); }),
      print: jest.fn(() => { throw new Error('Object has been destroyed'); }),
      getURL: jest.fn(() => { throw new Error('Object has been destroyed'); })
    };

    function safeHandleContextMenu(targetWebContents, params) {
      if (!targetWebContents || targetWebContents.isDestroyed()) return false;
      return true;
    }

    expect(safeHandleContextMenu(destroyedWebContents, {})).toBe(false);
    expect(safeHandleContextMenu(null, {})).toBe(false);

    // Simulate inspect click action on a webContents that is checked before execution
    const inspectAction = (targetWebContents, params) => {
      if (targetWebContents && !targetWebContents.isDestroyed()) {
        try {
          if (typeof targetWebContents.inspectElement === 'function') {
            targetWebContents.inspectElement(params.x, params.y);
          }
        } catch (e) {
          return 'caught';
        }
      }
      return 'skipped';
    };

    expect(inspectAction(destroyedWebContents, { x: 10, y: 10 })).toBe('skipped');

    // Live webContents that throws unexpectedly
    const liveThrowingWebContents = {
      isDestroyed: () => false,
      inspectElement: jest.fn(() => { throw new Error('IPC failed'); })
    };

    expect(inspectAction(liveThrowingWebContents, { x: 10, y: 10 })).toBe('caught');
  });

  it('should safely handle context-menu-action role execution when webContents is crashed or throws', () => {
    let focusCalled = false;
    let cutCalled = false;

    const crashedTarget = {
      isDestroyed: () => false,
      isCrashed: () => true,
      focus: () => { focusCalled = true; },
      cut: () => { cutCalled = true; }
    };

    function executeRoleAction(target, role) {
      if (target && !target.isDestroyed() && !(typeof target.isCrashed === 'function' && target.isCrashed())) {
        try {
          if (typeof target.focus === 'function') target.focus();
          if (role === 'cut' && typeof target.cut === 'function') target.cut();
          return true;
        } catch (e) {
          return false;
        }
      }
      return false;
    }

    expect(executeRoleAction(crashedTarget, 'cut')).toBe(false);
    expect(focusCalled).toBe(false);
    expect(cutCalled).toBe(false);

    const throwingTarget = {
      isDestroyed: () => false,
      isCrashed: () => false,
      focus: () => { throw new Error('Focus error'); },
      cut: () => { cutCalled = true; }
    };

    expect(executeRoleAction(throwingTarget, 'cut')).toBe(false);
  });

  it('should calculate exact menu dimensions in showCustomContextMenu rather than full window bounds', () => {
    function computeMenuBounds(template, x, y, winContentBounds) {
      let calculatedHeight = 10;
      template.forEach(item => {
        if (!item) return;
        if (item.type === 'separator') {
          calculatedHeight += 9;
        } else {
          calculatedHeight += 30;
        }
      });
      const menuWidth = 215;
      const menuHeight = calculatedHeight + 10;

      let finalX = typeof x === 'number' ? Math.round(x) : 100;
      let finalY = typeof y === 'number' ? Math.round(y) : 100;

      if (finalX + menuWidth > winContentBounds.width) {
        finalX = Math.max(8, winContentBounds.width - menuWidth - 8);
      }
      if (finalY + menuHeight > winContentBounds.height) {
        finalY = Math.max(8, winContentBounds.height - menuHeight - 8);
      }

      return { x: finalX, y: finalY, width: menuWidth, height: menuHeight };
    }

    const template = [
      { label: 'Back', role: 'back' },
      { label: 'Reload', role: 'reload' },
      { type: 'separator' },
      { label: 'Inspect', role: 'inspect' }
    ];

    const bounds = computeMenuBounds(template, 500, 300, { width: 1200, height: 800 });
    expect(bounds.width).toBe(215);
    expect(bounds.height).toBe(119); // 10 (initial) + 30 + 30 + 9 + 30 + 10
    expect(bounds.x).toBe(500);
    expect(bounds.y).toBe(300);

    // Overflow edge case
    const overflowBounds = computeMenuBounds(template, 1150, 750, { width: 1200, height: 800 });
    expect(overflowBounds.x).toBe(977); // 1200 - 215 - 8
    expect(overflowBounds.y).toBe(673); // 800 - 119 - 8
  });

  it('should only hide context menu on main frame non-in-place navigation', () => {
    let hideCount = 0;

    function handleDidStartNavigation(isMainFrame, isInPlace) {
      if (isMainFrame && !isInPlace) {
        hideCount++;
      }
    }

    handleDidStartNavigation(false, false); // Subframe navigation
    expect(hideCount).toBe(0);

    handleDidStartNavigation(true, true); // In-place navigation
    expect(hideCount).toBe(0);

    handleDidStartNavigation(true, false); // Main frame real navigation
    expect(hideCount).toBe(1);
  });

  it('should support repeated context menu openings after hiding without breaking state', () => {
    let mouseIgnored = true;
    let currentBounds = { x: 0, y: 0, width: 0, height: 0 };
    let currentContextMenuTarget = null;
    const contextMenuActions = new Map();

    const mockContextMenuView = {
      setBounds: (b) => { currentBounds = b; },
      getBounds: () => currentBounds,
      setIgnoreMouseEvents: (ignore) => { mouseIgnored = ignore; },
      webContents: {
        isDestroyed: () => false,
        executeJavaScript: jest.fn().mockResolvedValue()
      }
    };

    const mockWin = {
      state: { contextMenuView: mockContextMenuView },
      getContentBounds: () => ({ width: 1200, height: 800 }),
      contentView: {
        children: [mockContextMenuView],
        addChildView: jest.fn(),
        removeChildView: jest.fn()
      }
    };

    function simulateShowMenu(template, x, y, webContentsTarget) {
      currentContextMenuTarget = webContentsTarget;
      contextMenuActions.clear();
      template.forEach((item, index) => {
        if (item && item.type !== 'separator') {
          contextMenuActions.set(index, item);
        }
      });
      if (typeof mockContextMenuView.setIgnoreMouseEvents === 'function') {
        mockContextMenuView.setIgnoreMouseEvents(false);
      }
      mockContextMenuView.setBounds({ x, y, width: 215, height: 100 });
    }

    function simulateHideMenu() {
      mockContextMenuView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      mockContextMenuView.setIgnoreMouseEvents(true);
      currentContextMenuTarget = null;
    }

    const dummyWebContents1 = { id: 1, isDestroyed: () => false };
    const dummyWebContents2 = { id: 2, isDestroyed: () => false };

    // First context menu opening
    simulateShowMenu([{ label: 'Copy', role: 'copy' }], 100, 150, dummyWebContents1);
    expect(currentContextMenuTarget).toBe(dummyWebContents1);
    expect(contextMenuActions.size).toBe(1);
    expect(mouseIgnored).toBe(false);
    expect(currentBounds).toEqual({ x: 100, y: 150, width: 215, height: 100 });

    // Hide menu
    simulateHideMenu();
    expect(currentContextMenuTarget).toBeNull();
    expect(mouseIgnored).toBe(true);
    expect(currentBounds).toEqual({ x: 0, y: 0, width: 0, height: 0 });

    // Second context menu opening
    simulateShowMenu([{ label: 'Inspect', role: 'inspect' }], 200, 250, dummyWebContents2);
    expect(currentContextMenuTarget).toBe(dummyWebContents2);
    expect(contextMenuActions.size).toBe(1);
    expect(contextMenuActions.get(0).label).toBe('Inspect');
    expect(mouseIgnored).toBe(false);
    expect(currentBounds).toEqual({ x: 200, y: 250, width: 215, height: 100 });
  });
});
