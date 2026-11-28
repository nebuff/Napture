/**
 * @jest-environment jsdom
 */
const { loadRendererFixture } = require('./helpers/renderer-fixture');

describe('Renderer startup without a preload settings bridge', () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('boots and creates the welcome tab even when getSettings is unavailable', async () => {
    // Plain-browser fallback: the bridge exists, but has no getSettings, so the
    // startup block cannot rely on an await before touching late declarations.
    expect(() => loadRendererFixture({ withGetSettings: false })).not.toThrow();

    await Promise.resolve();
    await Promise.resolve();

    expect(Array.isArray(window.tabs)).toBe(true);
    expect(window.tabs).toHaveLength(1);
    expect(window.tabs[0].url).toBe('napture://welcome');
    expect(window.activeTabId).toBe(window.tabs[0].id);
  });
});
