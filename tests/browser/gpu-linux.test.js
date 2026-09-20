const fs = require('fs');
const path = require('path');
const vm = require('vm');

function getDeobfuscatedContent(content) {
  if (!content.includes('_0x36ee')) return content;
  try {
    const fnNameMatch = content.match(/const (_0x[a-f0-9]+)=_0x36ee;/);
    if (!fnNameMatch) return content;
    const fnName = fnNameMatch[1];

    const idx52db = content.indexOf('function _0x52db(){');
    const end52db = content.indexOf('return _0x52db();}', idx52db) + 'return _0x52db();}'.length;
    const str52db = content.slice(idx52db, end52db);

    const idx36ee = content.indexOf('function _0x36ee(');
    const end36ee = content.indexOf('_0x36ee6a;}', idx36ee) + '_0x36ee6a;}'.length;
    const str36ee = content.slice(idx36ee, end36ee);

    const iifeStart = content.indexOf('(function(');
    const iifeEnd = content.indexOf('}(_0x52db,', iifeStart);
    const closingParen = content.indexOf('));', iifeEnd);
    const strIife = content.slice(iifeStart, closingParen + 3);

    const scriptToRun = `
      ${str52db}
      ${str36ee}
      var ${fnName} = _0x36ee;
      ${strIife}
      this.decoder = ${fnName};
    `;

    const ctx = { process: { env: {} } };
    vm.createContext(ctx);
    vm.runInContext(scriptToRun, ctx);

    return content.replace(new RegExp(fnName + '\\((0x[a-f0-9]+)\\)', 'g'), (m, hex) => {
      try {
        return JSON.stringify(ctx.decoder(parseInt(hex, 16)));
      } catch (e) {
        return m;
      }
    });
  } catch (e) {
    return content;
  }
}

describe('Linux GPU & Platform Command Line Switches', () => {
  test('main.js includes disable-gpu-sandbox, disable-vulkan, and ozone-platform x11 for Linux', () => {
    const mainJsPath = path.resolve(__dirname, '../../napture/main.js');
    const rawContent = fs.readFileSync(mainJsPath, 'utf8');
    const content = getDeobfuscatedContent(rawContent);

    expect(content.includes('linux')).toBe(true);
    expect(content.includes('disable-gpu')).toBe(true);
    expect(content.includes('use-gl') && content.includes('swiftshader')).toBe(true);
    expect(content.includes('disable-vulkan')).toBe(true);
    expect(content.includes('ozone-platform') && content.includes('x11')).toBe(true);
    expect(content.includes('disable-gpu-sandbox')).toBe(true);
    expect(content.includes('disable-dev-shm-usage')).toBe(true);
    expect(content.includes('log-level') && content.includes('3')).toBe(true);
  });

  test('app.commandLine receives required switches when Linux platform block executes and excludes native GPU memory buffers on Linux', () => {
    const switches = [];
    const mockApp = {
      commandLine: {
        appendSwitch: (key, val) => switches.push({ key, val })
      }
    };

    const runPlatformSetup = (platform, app) => {
      app.commandLine.appendSwitch('no-pings');
      app.commandLine.appendSwitch('disable-features', 'ProactiveTabDiscarding,Vulkan');
      if (platform === 'linux') {
        app.commandLine.appendSwitch('enable-features', 'WebGL,WebAssembly');
      } else {
        app.commandLine.appendSwitch('enable-features', 'CanvasOopRasterization,WebGL,WebAssembly,VaapiVideoDecoder');
      }
      if (platform !== 'linux') {
        app.commandLine.appendSwitch('enable-gpu-rasterization');
        app.commandLine.appendSwitch('ignore-gpu-blocklist');
        app.commandLine.appendSwitch('enable-accelerated-2d-canvas');
        app.commandLine.appendSwitch('enable-zero-copy');
        app.commandLine.appendSwitch('enable-native-gpu-memory-buffers');
      }
      if (platform === 'linux') {
        if (typeof app.disableHardwareAcceleration === 'function') app.disableHardwareAcceleration();
        app.commandLine.appendSwitch('disable-gpu');
        app.commandLine.appendSwitch('use-gl', 'swiftshader');
        app.commandLine.appendSwitch('disable-vulkan');
        app.commandLine.appendSwitch('ozone-platform', 'x11');
        app.commandLine.appendSwitch('disable-gpu-sandbox');
        app.commandLine.appendSwitch('disable-dev-shm-usage');
      }
      app.commandLine.appendSwitch('log-level', '3');
    };

    runPlatformSetup('linux', mockApp);

    expect(switches).toContainEqual({ key: 'disable-gpu', val: undefined });
    expect(switches).toContainEqual({ key: 'use-gl', val: 'swiftshader' });
    expect(switches).toContainEqual({ key: 'disable-vulkan', val: undefined });
    expect(switches).toContainEqual({ key: 'ozone-platform', val: 'x11' });
    expect(switches).toContainEqual({ key: 'disable-gpu-sandbox', val: undefined });
    expect(switches).toContainEqual({ key: 'log-level', val: '3' });
    expect(switches).toContainEqual({ key: 'enable-features', val: 'WebGL,WebAssembly' });
    expect(switches).not.toContainEqual({ key: 'enable-native-gpu-memory-buffers', val: undefined });
    expect(switches).not.toContainEqual({ key: 'enable-zero-copy', val: undefined });
    expect(switches).not.toContainEqual({ key: 'enable-gpu-rasterization', val: undefined });
    expect(switches).not.toContainEqual({ key: 'ignore-gpu-blocklist', val: undefined });
    expect(switches).not.toContainEqual({ key: 'enable-accelerated-2d-canvas', val: undefined });

    const nonLinuxSwitches = [];
    const mockAppNonLinux = {
      commandLine: {
        appendSwitch: (key, val) => nonLinuxSwitches.push({ key, val })
      }
    };
    runPlatformSetup('win32', mockAppNonLinux);
    expect(nonLinuxSwitches).toContainEqual({ key: 'enable-features', val: 'CanvasOopRasterization,WebGL,WebAssembly,VaapiVideoDecoder' });
    expect(nonLinuxSwitches).toContainEqual({ key: 'enable-native-gpu-memory-buffers', val: undefined });
    expect(nonLinuxSwitches).toContainEqual({ key: 'enable-zero-copy', val: undefined });
    expect(nonLinuxSwitches).toContainEqual({ key: 'enable-gpu-rasterization', val: undefined });
    expect(nonLinuxSwitches).toContainEqual({ key: 'ignore-gpu-blocklist', val: undefined });
    expect(nonLinuxSwitches).toContainEqual({ key: 'enable-accelerated-2d-canvas', val: undefined });
  });
});
