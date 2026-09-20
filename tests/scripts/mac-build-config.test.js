const fs = require('fs');
const path = require('path');

describe('macOS Build Configuration & Entitlements', () => {
    const rootDir = path.resolve(__dirname, '../..');
    const packageJsonPath = path.join(rootDir, 'package.json');
    const entitlementsPath = path.join(rootDir, 'napture/build/entitlements.mac.plist');
    const entitlementsInheritPath = path.join(rootDir, 'napture/build/entitlements.mac.inherit.plist');
    const workflowPath = fs.existsSync(path.join(rootDir, '.github/workflows/build.yml'))
        ? path.join(rootDir, '.github/workflows/build.yml')
        : path.join(rootDir, '../.github/workflows/build.yml');

    test('package.json specifies ad-hoc signing and entitlements for macOS', () => {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        expect(pkg.build).toBeDefined();
        expect(pkg.build.mac).toBeDefined();
        expect(pkg.build.mac.identity).toBe('-');
        expect(pkg.build.mac.hardenedRuntime).toBe(false);
        expect(pkg.build.mac.gatekeeperAssess).toBe(false);
        expect(pkg.build.mac.entitlements).toBe('napture/build/entitlements.mac.plist');
        expect(pkg.build.mac.entitlementsInherit).toBe('napture/build/entitlements.mac.inherit.plist');
        expect(pkg.build.mac.target).toContain('dmg');
        expect(pkg.build.mac.target).toContain('zip');
    });

    test('macOS entitlements plist files exist and contain required security flags', () => {
        expect(fs.existsSync(entitlementsPath)).toBe(true);
        expect(fs.existsSync(entitlementsInheritPath)).toBe(true);

        const entitlementsContent = fs.readFileSync(entitlementsPath, 'utf8');
        expect(entitlementsContent).toContain('com.apple.security.cs.allow-jit');
        expect(entitlementsContent).toContain('com.apple.security.cs.allow-unsigned-executable-memory');

        const inheritContent = fs.readFileSync(entitlementsInheritPath, 'utf8');
        expect(inheritContent).toContain('com.apple.security.inherit');
    });

    test('GitHub Actions build.yml includes macOS artifacts and manifest uploads', () => {
        expect(fs.existsSync(workflowPath)).toBe(true);
        const workflow = fs.readFileSync(workflowPath, 'utf8');
        expect(workflow).toContain('build-macos:');
        expect(workflow).toContain('runs-on: macos-latest');
        expect(workflow).toContain('dist/*.dmg');
        expect(workflow).toContain('dist/*.zip');
        expect(workflow).toContain('dist/*.yml');
    });
});
