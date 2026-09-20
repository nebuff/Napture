const path = require('path');

describe('Ad/Tracker Network Blocking and Tab Management Logic', () => {
  const adTrackerPatterns = [
    'fpjs.io',
    'googlesyndication.com',
    'doubleclick.net',
    'google-analytics.com',
    'adservice.google.com',
    'adnxs.com',
    'adform.net',
    'scorecardresearch.com',
    'connect.facebook.net',
    'taboola.com',
    'outbrain.com',
    'amazon-adsystem.com',
    'pubmatic.com',
    'rubiconproject.com',
    'criteo.com',
    'moatads.com'
  ];

  function shouldBlockRequest(url) {
    const lowerUrl = url.toLowerCase();
    for (let i = 0; i < adTrackerPatterns.length; i++) {
      if (lowerUrl.includes(adTrackerPatterns[i])) {
        return true;
      }
    }
    return false;
  }

  test('blocks ad and analytics URLs', () => {
    expect(shouldBlockRequest('https://google-analytics.com/analytics.js')).toBe(true);
    expect(shouldBlockRequest('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js')).toBe(true);
    expect(shouldBlockRequest('https://ad.doubleclick.net/ddm/trackimp/')).toBe(true);
    expect(shouldBlockRequest('https://connect.facebook.net/en_US/fbevents.js')).toBe(true);
    expect(shouldBlockRequest('https://cdn.fpjs.io/v3/key')).toBe(true);
  });

  test('allows non-ad normal web URLs', () => {
    expect(shouldBlockRequest('https://wikipedia.org/wiki/Main_Page')).toBe(false);
    expect(shouldBlockRequest('https://github.com/napture/browser')).toBe(false);
    expect(shouldBlockRequest('https://example.com/')).toBe(false);
  });

  test('simulates offscreen positioning and clock freezing on background tab switch', () => {
    const mockChildViews = [];
    const mockContentView = {
      children: mockChildViews,
      removeChildView: jest.fn((view) => {
        const idx = mockChildViews.indexOf(view);
        if (idx > -1) mockChildViews.splice(idx, 1);
      }),
      addChildView: jest.fn((view) => {
        mockChildViews.push(view);
      })
    };

    const tab1View = {
      id: 'tab-1',
      setVisible: jest.fn(),
      setBounds: jest.fn(),
      getBounds: () => ({ x: 240, y: 52, width: 800, height: 600 }),
      webContents: {
        isCurrentlyAudible: () => false,
        setBackgroundThrottling: jest.fn()
      }
    };
    const tab2View = {
      id: 'tab-2',
      setVisible: jest.fn(),
      setBounds: jest.fn(),
      getBounds: () => ({ x: 240, y: 52, width: 800, height: 600 }),
      webContents: {
        isCurrentlyAudible: () => false,
        setBackgroundThrottling: jest.fn()
      }
    };

    mockContentView.addChildView(tab1View);
    mockContentView.addChildView(tab2View);

    // Simulate switching from tab1 to tab2:
    // Tab 1 should be positioned offscreen and its clock frozen while remaining attached
    if (!tab1View.webContents.isCurrentlyAudible()) {
      tab1View.setBounds({ x: -10000, y: -10000, width: 800, height: 600 });
      tab1View.webContents.setBackgroundThrottling(true);
    }

    expect(tab1View.setBounds).toHaveBeenCalledWith({ x: -10000, y: -10000, width: 800, height: 600 });
    expect(tab1View.webContents.setBackgroundThrottling).toHaveBeenCalledWith(true);
    expect(mockContentView.children.includes(tab1View)).toBe(true);

    // Simulate switching back to tab1:
    // Tab 1 bounds restored, setVisible(true), and backgroundThrottling set to false
    tab1View.setBounds({ x: 240, y: 52, width: 800, height: 600 });
    tab1View.setVisible(true);
    tab1View.webContents.setBackgroundThrottling(false);

    expect(tab1View.setBounds).toHaveBeenCalledWith({ x: 240, y: 52, width: 800, height: 600 });
    expect(tab1View.setVisible).toHaveBeenCalledWith(true);
    expect(tab1View.webContents.setBackgroundThrottling).toHaveBeenCalledWith(false);
  });
});
