const i18n = require('../../napture/i18n');

describe('i18n Localization Engine', () => {
  it('provides the 3 required interface languages', () => {
    const langs = i18n.getLanguages();
    expect(langs.map(l => l.code)).toEqual(['en-US', 'en-CA', 'cute']);
  });

  it('translates tokens in en-US correctly', () => {
    expect(i18n.t('nav_appearance', 'en-US')).toBe('Appearance & Features');
    expect(i18n.t('theme_label', 'en-US')).toBe('Theme Accent Color');
    expect(i18n.t('sec_languages', 'en-US')).toBe('Languages');
    expect(i18n.t('folder_hover_label', 'en-US')).toBe('Hover to Open Folders');
  });

  it('translates tokens in en-CA with authentic Canadian English', () => {
    expect(i18n.t('nav_appearance', 'en-CA')).toBe('Appearance & Features');
    expect(i18n.t('theme_label', 'en-CA')).toBe('Theme Accent Colour');
    expect(i18n.t('nav_about', 'en-CA')).toBe('About Napture, eh?');
    expect(i18n.t('nav_downloads', 'en-CA')).toBe('Downloads (sorry!)');
    expect(i18n.t('folder_hover_label', 'en-CA')).toBe('Hover to Open Folders');
  });

  it('translates tokens in Cute Engwish correctly according to specs', () => {
    expect(i18n.t('sec_languages', 'cute')).toBe('Wanguage');
    expect(i18n.t('nav_appearance', 'cute')).toBe('Appeawance & Featwwes');
    expect(i18n.t('settings_title', 'cute')).toBe('Settingws');
    expect(i18n.t('nav_downloads', 'cute')).toBe('D-Downwoads');
    expect(i18n.t('new_tab', 'cute')).toBe('Nyew Tab');
    expect(i18n.t('lang_completeness', 'cute')).toBe('Compwetenewss');
    expect(i18n.t('folder_hover_label', 'cute')).toBe('Huvvew to Open Fowdews');
  });

  it('normalizes language aliases properly', () => {
    expect(i18n.normalizeLang('en-UWU')).toBe('cute');
    expect(i18n.normalizeLang('cute-en')).toBe('cute');
    expect(i18n.normalizeLang('en-CA')).toBe('en-CA');
    expect(i18n.normalizeLang('unknown')).toBe('en-US');
  });
});
