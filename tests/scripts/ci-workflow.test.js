const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

describe('GitHub Actions test coverage', () => {
  const workflowPath = path.resolve(__dirname, '../../.github/workflows/build.yml');

  function loadWorkflow() {
    expect(fs.existsSync(workflowPath)).toBe(true);
    return YAML.parse(fs.readFileSync(workflowPath, 'utf8'));
  }

  test('runs the full Jest suite on every workflow run', () => {
    const workflow = loadWorkflow();
    const job = workflow.jobs.test;

    expect(job).toBeDefined();

    const commands = (job.steps || []).filter((step) => step.run).map((step) => step.run);
    expect(commands.some((cmd) => /(^|\s)npm (test|run test)(\s|$)/.test(cmd))).toBe(true);

    const uses = (job.steps || []).filter((step) => step.uses).map((step) => step.uses);
    expect(uses).toContain('actions/checkout@v4');
    expect(uses).toContain('actions/setup-node@v4');
  });

  test('installs dependencies from the lockfile before testing', () => {
    const job = loadWorkflow().jobs.test;
    const commands = job.steps.filter((step) => step.run).map((step) => step.run);
    const ciIndex = commands.findIndex((cmd) => /\bnpm ci\b/.test(cmd));
    const testIndex = commands.findIndex((cmd) => /\bnpm (test|run test)\b/.test(cmd));

    expect(ciIndex).toBeGreaterThanOrEqual(0);
    expect(testIndex).toBeGreaterThan(ciIndex);
  });

  test('gates every platform build on the test job', () => {
    const { jobs } = loadWorkflow();

    for (const name of ['build-windows', 'build-linux', 'build-macos']) {
      expect(jobs[name]).toBeDefined();
      expect(jobs[name].needs).toBe('test');
    }
  });

  test('still publishes nothing from CI', () => {
    const jobs = loadWorkflow().jobs;

    for (const name of ['build-windows', 'build-linux', 'build-macos']) {
      const commands = jobs[name].steps.filter((step) => step.run).map((step) => step.run);
      expect(commands.some((cmd) => cmd.includes('dist:'))).toBe(true);
      expect(commands.some((cmd) => /\bgh release\b|\belectron-builder\b.*--publish\s+(always|onTag)/.test(cmd))).toBe(false);
    }
  });
});

describe('GitHub Actions release draft workflow', () => {
  const releasePath = path.resolve(__dirname, '../../.github/workflows/release.yml');
  const publishScriptPath = path.resolve(__dirname, '../../scripts/publish/ci-publish.sh');

  function loadRelease() {
    expect(fs.existsSync(releasePath)).toBe(true);
    return YAML.parse(fs.readFileSync(releasePath, 'utf8'));
  }

  test('only runs when dispatched by hand', () => {
    const workflow = loadRelease();

    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);
    expect(workflow.on.workflow_dispatch.inputs.platforms.options).toEqual([
      'all', 'windows', 'linux', 'macos'
    ]);
  });

  test('can upload into the draft release', () => {
    const workflow = loadRelease();

    expect(workflow.permissions.contents).toBe('write');
    expect(workflow.env.GH_TOKEN).toBe('${{ secrets.GITHUB_TOKEN }}');
  });

  test('tests, creates the draft once, then builds each platform into it', () => {
    const { jobs } = loadRelease();

    expect(jobs.test.steps.some((step) => /\bnpm (test|run test)\b/.test(step.run || ''))).toBe(true);
    expect(jobs.prepare.needs).toBe('test');
    expect(jobs.prepare.steps.some((step) => (step.run || '').includes('ci-publish.sh --ensure-only'))).toBe(true);

    const platforms = {
      'build-windows': ['windows', 'win'],
      'build-linux': ['linux', 'linux'],
      'build-macos': ['macos', 'mac']
    };
    for (const [jobName, [target, distScript]] of Object.entries(platforms)) {
      const job = jobs[jobName];
      expect(job).toBeDefined();
      expect(job.needs).toBe('prepare');
      expect(job.if).toContain(`inputs.platforms == '${target}'`);

      const commands = job.steps.filter((step) => step.run).map((step) => step.run);
      expect(commands.some((cmd) => cmd.includes(`dist:${distScript}`))).toBe(true);
      expect(commands).toContain(`bash scripts/publish/ci-publish.sh ${target}`);
    }
  });

  test('publishes each platform through the shared lib.sh upload helper', () => {
    const script = fs.readFileSync(publishScriptPath, 'utf8');

    expect(script).toContain('source "$(dirname -- "$0")/lib.sh"');
    expect(script).toContain('ensure_draft_release');
    expect(script).toContain('upload_assets "Windows" "napture-$VERSION-*-windows*.exe"');
    expect(script).toContain('upload_assets "Linux" "napture-$VERSION-*-linux.AppImage"');
    expect(script).toContain('upload_assets "macOS" "napture-$VERSION-*-macos.dmg"');
  });

  test('points at the release scripts when the checkout does not match state.json', () => {
    const script = fs.readFileSync(publishScriptPath, 'utf8');

    expect(script).toContain('scripts/publish/state.json');
    expect(script).toMatch(/CURRENT_VERSION" != "\$VERSION"/);
    expect(script).toContain('scripts/publish/version.sh $VERSION');
  });
});
