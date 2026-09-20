describe('Tab Preload Script & Pointer Event Interception', () => {
  it('ignores right-click pointerdown events (e.button === 2) to prevent closing context menus', () => {
    let pageClickedSent = false;
    const mockIpcRenderer = {
      send: (channel) => {
        if (channel === 'page-clicked') {
          pageClickedSent = true;
        }
      }
    };

    let lastClickDismissTime = 0;
    const handlePointerDown = (e) => {
      if (e && e.button === 2) return;
      const now = Date.now();
      if (now - lastClickDismissTime > 200) {
        lastClickDismissTime = now;
        mockIpcRenderer.send('page-clicked');
      }
    };

    handlePointerDown({ button: 2 });
    expect(pageClickedSent).toBe(false);

    handlePointerDown({ button: 0 });
    expect(pageClickedSent).toBe(true);
  });

  it('throttles left-click page-clicked IPC dispatches (200ms grace period)', () => {
    let sendCount = 0;
    const mockIpcRenderer = {
      send: (channel) => {
        if (channel === 'page-clicked') sendCount++;
      }
    };

    let lastClickDismissTime = 0;
    const handlePointerDown = (e) => {
      if (e && e.button === 2) return;
      const now = Date.now();
      if (now - lastClickDismissTime > 200) {
        lastClickDismissTime = now;
        mockIpcRenderer.send('page-clicked');
      }
    };

    const t0 = 10000;
    jest.spyOn(Date, 'now').mockReturnValue(t0);

    handlePointerDown({ button: 0 });
    expect(sendCount).toBe(1);

    jest.spyOn(Date, 'now').mockReturnValue(t0 + 50);
    handlePointerDown({ button: 0 });
    expect(sendCount).toBe(1);

    jest.spyOn(Date, 'now').mockReturnValue(t0 + 250);
    handlePointerDown({ button: 0 });
    expect(sendCount).toBe(2);

    Date.now.mockRestore();
  });
});
