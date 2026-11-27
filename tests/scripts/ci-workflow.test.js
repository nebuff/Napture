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
