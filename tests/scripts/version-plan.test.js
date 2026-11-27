const path = require('path');

const {
  planVersion,
  compareCore,
  latestStableCore,
  toLinuxPackageVersion,
  VersionPlanError
} = require(path.resolve(__dirname, '../../scripts/publish/version-plan.js'));

const { compareVersions } = require(path.resolve(__dirname, '../../napture/updater-core.js'));

const TAGS = ['0.21.4', '0.21.5', 'v0.22.1', 'v0.22.2', 'v0.22.2-beta'];

describe('release version planning', () => {
  test('a production release keeps its plain number and tag', () => {
    const plan = planVersion({ version: '0.23.0', tags: TAGS });

    expect(plan).toMatchObject({
      version: '0.23.0',
      core: '0.23.0',
      prerelease: null,
      channel: 'stable',
      tag: 'v0.23.0',
      linuxVersion: '0.23.0'
    });
  });

  test('a beta keeps the suffix in the package version, the tag and the artifacts', () => {
    const plan = planVersion({ version: '0.23.0-beta.1', beta: true, tags: TAGS });

    expect(plan.version).toBe('0.23.0-beta.1');
    expect(plan.channel).toBe('beta');
    expect(plan.tag).toBe('v0.23.0-beta.1');
    expect(plan.prerelease).toBe('beta.1');
  });

  test('the beta suffix is inferred, so --beta is optional', () => {
    expect(planVersion({ version: '0.23.0-beta.1', tags: TAGS }).channel).toBe('beta');
    expect(planVersion({ version: 'v0.23.0-beta.1', tags: TAGS }).tag).toBe('v0.23.0-beta.1');
  });

  test('a beta cannot reuse the number of a tagged stable release', () => {
    for (const version of ['0.22.2-beta.1', '0.22.2-beta.2']) {
      expect(() => planVersion({ version, beta: true, tags: TAGS })).toThrow(
        /not be newer than the stable 0\.22\.2/
      );
      expect(() => planVersion({ version, beta: true, tags: TAGS })).toThrow(VersionPlanError);
    }
    // The one that actually shipped as v0.22.2-beta hits the duplicate-tag guard.
    expect(() => planVersion({ version: '0.22.2-beta', beta: true, tags: TAGS })).toThrow(
      /already exists/
    );
  });

  test('a beta below the newest stable is rejected', () => {
    expect(() => planVersion({ version: '0.22.0-beta.1', tags: TAGS })).toThrow(/stable 0\.22\.2/);
  });

  test('a beta with no suffix is rejected instead of shipping the stable number', () => {
    expect(() => planVersion({ version: '0.23.0', beta: true, tags: TAGS })).toThrow(
      /Use 0\.23\.1-beta\.1/
    );
  });

  test('--stable refuses a pre-release version', () => {
    expect(() => planVersion({ version: '0.23.0-beta.1', stable: true, tags: TAGS })).toThrow(
      /Drop --stable/
    );
  });

  test('--beta and --stable cannot be combined', () => {
    expect(() => planVersion({ version: '0.23.0', beta: true, stable: true, tags: TAGS })).toThrow(
      /cannot be combined/
    );
  });

  test('rejects malformed versions and non-beta labels', () => {
    expect(() => planVersion({ version: '0.23', tags: TAGS })).toThrow(/must look like/);
    expect(() => planVersion({ version: 'banana', tags: TAGS })).toThrow(/must look like/);
    expect(() => planVersion({ version: '0.23.0-rc.1', tags: TAGS })).toThrow(/'beta' or 'beta\.<n>'/);
  });

  test('refuses to reuse an existing tag', () => {
    expect(() => planVersion({ version: '0.22.2', tags: TAGS })).toThrow(/tag v0\.22\.2 already exists/);
    expect(() => planVersion({ version: '0.23.0-beta.1', tags: ['v0.23.0-beta.1'] })).toThrow(
      /already exists/
    );
  });

  test('handles an empty or tagless repository', () => {
    expect(latestStableCore([])).toBeNull();
    expect(planVersion({ version: '0.1.0', tags: [] }).channel).toBe('stable');
    expect(planVersion({ version: '0.1.0-beta.1', tags: [] }).version).toBe('0.1.0-beta.1');
  });
});

describe('package managers see the two channels as different builds', () => {
  test('deb/rpm metadata turns the suffix into a version that sorts below the stable', () => {
    const beta = planVersion({ version: '0.23.0-beta.1', tags: TAGS });
    const stable = planVersion({ version: '0.23.0', tags: TAGS });

    expect(toLinuxPackageVersion(beta.version)).toBe('0.23.0~beta.1');
    expect(beta.linuxVersion).toBe('0.23.0~beta.1');
    // A plain version would have been identical to the stable one - the bug
    // 0.22.2-beta / 0.22.2 shipped with.
    expect(beta.linuxVersion).not.toBe(toLinuxPackageVersion(stable.version));
  });

  test('the in-app updater orders the beta below its stable but above the previous stable', () => {
    const { version: beta } = planVersion({ version: '0.23.0-beta.1', tags: TAGS });

    expect(compareVersions(beta, '0.23.0')).toBe(-1);
    expect(compareVersions(beta, '0.22.2')).toBe(1);
  });

  test('artifact file names differ because the version is part of them', () => {
    const beta = planVersion({ version: '0.23.0-beta.1', tags: TAGS }).version;
    const stable = planVersion({ version: '0.23.0', tags: TAGS }).version;

    expect(`napture-${beta}-x64-linux.deb`).not.toBe(`napture-${stable}-x64-linux.deb`);
  });
});

describe('version core comparison', () => {
  test('compares numerically, not lexically', () => {
    expect(compareCore('0.23.0', '0.9.0')).toBe(1);
    expect(compareCore('0.9.0', '0.23.0')).toBe(-1);
    expect(compareCore('1.0.0', '1.0.0')).toBe(0);
  });

  test('picks the newest stable tag and ignores pre-releases', () => {
    expect(latestStableCore(TAGS)).toBe('0.22.2');
    expect(latestStableCore(['v0.22.2-beta', 'v0.22.10'])).toBe('0.22.10');
  });
});
