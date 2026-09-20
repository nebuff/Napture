describe('Pinned Sites & Quick Launcher Persistence', () => {
  it('strips runtime tabId when serializing pinned sites to storage', () => {
    const dirtyPinnedSites = [
      { id: 'pin-1', title: 'GitHub', url: 'https://github.com', favicon: 'icon1.ico', tabId: 'tab-101' },
      { id: 'pin-2', title: 'Reddit', url: 'https://reddit.com', favicon: 'icon2.ico', tabId: 'tab-102' }
    ];

    const serializePinnedSites = (sites) => {
      return sites.map(({ tabId, ...rest }) => rest);
    };

    const cleanStorageSites = serializePinnedSites(dirtyPinnedSites);

    expect(cleanStorageSites[0]).toEqual({
      id: 'pin-1',
      title: 'GitHub',
      url: 'https://github.com',
      favicon: 'icon1.ico'
    });
    expect(cleanStorageSites[0].tabId).toBeUndefined();
    expect(cleanStorageSites[1].tabId).toBeUndefined();
  });

  it('resets pinned site tabId to null when its associated tab is closed', () => {
    const pinnedSites = [
      { id: 'pin-1', title: 'GitHub', url: 'https://github.com', tabId: 'tab-101' },
      { id: 'pin-2', title: 'Reddit', url: 'https://reddit.com', tabId: 'tab-102' }
    ];

    const onTabClosed = (closedTabId) => {
      pinnedSites.forEach(p => {
        if (p.tabId === closedTabId) {
          p.tabId = null;
        }
      });
    };

    onTabClosed('tab-101');

    expect(pinnedSites[0].tabId).toBeNull();
    expect(pinnedSites[1].tabId).toBe('tab-102');
  });

  it('switches to existing tab if pinnedSite.tabId matches an open tab, or creates new tab if missing', () => {
    const tabs = [
      { id: 'tab-101', url: 'https://github.com', title: 'GitHub' }
    ];
    let activeTabId = null;
    let newTabCreatedWithUrl = null;

    const handlePinnedSiteClick = (pinnedSite) => {
      if (pinnedSite.tabId && tabs.some(t => t.id === pinnedSite.tabId)) {
        activeTabId = pinnedSite.tabId;
      } else {
        newTabCreatedWithUrl = pinnedSite.url;
      }
    };

    handlePinnedSiteClick({ id: 'pin-1', url: 'https://github.com', tabId: 'tab-101' });
    expect(activeTabId).toBe('tab-101');
    expect(newTabCreatedWithUrl).toBeNull();

    handlePinnedSiteClick({ id: 'pin-2', url: 'https://reddit.com', tabId: null });
    expect(newTabCreatedWithUrl).toBe('https://reddit.com');
  });
});
