const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');
const https = require('https');

console.log('--- Napture Native Engine Builder ---');

const nativeDir = path.resolve(__dirname, '..', 'napture', 'src', 'native');
const buildDir = path.resolve(__dirname, '..', 'napture', 'build', 'native');
const depsDir = path.resolve(__dirname, '..', '.deps');

if (!fs.existsSync(depsDir)) {
  fs.mkdirSync(depsDir, { recursive: true });
}
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

function getPlatformKey() {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'win32') {
    return arch === 'arm64' ? 'windowsarm64' : (arch === 'ia32' ? 'windows32' : 'windows64');
  } else if (platform === 'darwin') {
    return arch === 'arm64' ? 'macosarm64' : 'macosx64';
  } else {
    return arch === 'arm64' ? 'linuxarm64' : (arch === 'ia32' ? 'linux32' : 'linux64');
  }
}

async function fetchCefIndex() {
  return new Promise((resolve) => {
    const req = https.get('https://cef-builds.spotifycdn.com/index.json', { timeout: 10000, headers: { 'User-Agent': 'Napture-Native-Engine/1.0' } }, (res) => {
      if (res.statusCode !== 200) {
        return resolve(null);
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

async function resolvePlatformCef() {
  const platformKey = getPlatformKey();
  
  try {
    const index = await fetchCefIndex();
    if (index && index[platformKey] && Array.isArray(index[platformKey].versions)) {
      // Sort versions descending by Chromium version
      const compareChromiumVersions = (a, b) => {
        const vA = (a.chromium_version || '0').split('.').map(n => parseInt(n, 10) || 0);
        const vB = (b.chromium_version || '0').split('.').map(n => parseInt(n, 10) || 0);
        for (let i = 0; i < Math.max(vA.length, vB.length); i++) {
          const numA = vA[i] || 0;
          const numB = vB[i] || 0;
          if (numA !== numB) return numB - numA;
        }
        return 0;
      };

      const sortedVersions = [...index[platformKey].versions].sort(compareChromiumVersions);
      // Prefer highest version available
      const targetVersionObj = sortedVersions.find(v => v.channel === 'stable' || v.channel === 'beta') || sortedVersions[0];
      
      if (targetVersionObj && Array.isArray(targetVersionObj.files)) {
        const minimalFile = targetVersionObj.files.find(f => f.type === 'minimal' || (f.name && f.name.includes('minimal.tar.bz2')));
        if (minimalFile && minimalFile.name) {
          const cefVersion = minimalFile.name.replace(/\.tar\.bz2$/, '');
          console.log(`[Auto-Detect] Discovered latest upstream CEF release: ${targetVersionObj.cef_version} (Chromium ${targetVersionObj.chromium_version}) for ${platformKey}`);
          return {
            cefVersion,
            chromiumVersion: targetVersionObj.chromium_version,
            archiveName: minimalFile.name,
            url: `https://cef-builds.spotifycdn.com/${minimalFile.name}`
          };
        }
      }
    }
  } catch (err) {
    console.warn('[!] Notice: Could not fetch latest CEF index from Spotify CDN, using latest stable fallback:', err.message);
  }

  // Fallback to latest stable release
  const baseFallback = 'cef_binary_151.3.18+gbeff58d+chromium-151.0.7922.138';
  let fallbackName = `${baseFallback}_windows64_minimal`;
  if (platformKey === 'windowsarm64') fallbackName = `${baseFallback}_windowsarm64_minimal`;
  else if (platformKey === 'windows32') fallbackName = `${baseFallback}_windows32_minimal`;
  else if (platformKey === 'macosarm64') fallbackName = `${baseFallback}_macosarm64_minimal`;
  else if (platformKey === 'macosx64') fallbackName = `${baseFallback}_macosx64_minimal`;
  else if (platformKey === 'linuxarm64') fallbackName = `${baseFallback}_linuxarm64_minimal`;
  else if (platformKey === 'linux32') fallbackName = `${baseFallback}_linux32_minimal`;
  else if (platformKey === 'linux64') fallbackName = `${baseFallback}_linux64_minimal`;

  console.log(`[Fallback] Using latest stable CEF release: ${fallbackName}`);
  return {
    cefVersion: fallbackName,
    chromiumVersion: '151.0.7922.138',
    archiveName: `${fallbackName}.tar.bz2`,
    url: `https://cef-builds.spotifycdn.com/${fallbackName}.tar.bz2`
  };
}

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download '${url}' (HTTP ${response.statusCode})`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

function extractArchive(archiveFile, targetDirectory) {
  console.log(`Extracting CEF (${path.basename(archiveFile)})...`);

  const strategies = [
    {
      name: 'tar',
      fn: () => execSync(`tar -xf "${archiveFile}" -C "${targetDirectory}"`, { stdio: 'pipe' })
    },
    {
      name: 'python',
      fn: () => execSync(`python -c "import tarfile, sys; t = tarfile.open(sys.argv[1], 'r:bz2'); t.extractall(sys.argv[2])" "${archiveFile}" "${targetDirectory}"`, { stdio: 'pipe' })
    },
    {
      name: 'python3',
      fn: () => execSync(`python3 -c "import tarfile, sys; t = tarfile.open(sys.argv[1], 'r:bz2'); t.extractall(sys.argv[2])" "${archiveFile}" "${targetDirectory}"`, { stdio: 'pipe' })
    },
    {
      name: '7z',
      fn: () => {
        execSync(`7z x -y "${archiveFile}" -o"${targetDirectory}"`, { stdio: 'pipe' });
        const intermediateTar = path.join(targetDirectory, path.basename(archiveFile, '.bz2'));
        if (fs.existsSync(intermediateTar)) {
          execSync(`7z x -y "${intermediateTar}" -o"${targetDirectory}"`, { stdio: 'pipe' });
          try { fs.unlinkSync(intermediateTar); } catch (e) {}
        }
      }
    }
  ];

  let lastError = null;
  for (const strategy of strategies) {
    try {
      strategy.fn();
      console.log(`[OK] Successfully extracted CEF archive using ${strategy.name}.`);
      return;
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(`Failed to extract CEF archive (${path.basename(archiveFile)}). Please ensure Python 3 or bzip2 is installed.\nDetail: ${lastError?.message || lastError}`);
}

async function main() {
  const cefInfo = await resolvePlatformCef();
  const cefVersion = cefInfo.cefVersion;
  const cefUrl = cefInfo.url;
  const cefExtractDir = path.join(depsDir, cefVersion);
  const archivePath = path.join(depsDir, cefInfo.archiveName);

  if (!fs.existsSync(cefExtractDir)) {
    console.log(`Downloading CEF for platform (${process.platform}-${process.arch}): ${cefVersion}...`);
    if (!fs.existsSync(archivePath)) {
      await downloadFile(cefUrl, archivePath);
    }
    extractArchive(archivePath, depsDir);
  } else {
    console.log(`CEF already downloaded and extracted (${cefVersion}).`);
  }

  console.log('Configuring CMakeLists.txt...');

  const cmakeContent = `cmake_minimum_required(VERSION 3.15)
project(NaptureNative)

set(CMAKE_CXX_STANDARD 17)

# Set CEF Root
set(CEF_ROOT "\${CMAKE_CURRENT_SOURCE_DIR}/../../../.deps/${cefVersion}")
set(CMAKE_MODULE_PATH \${CMAKE_MODULE_PATH} "\${CEF_ROOT}/cmake")

# Find CEF
find_package(CEF REQUIRED)

if(NOT WIN32)
    string(REPLACE ";" " " CEF_COMPILER_FLAGS_SPACE "\${CEF_COMPILER_FLAGS}")
    set(CMAKE_C_FLAGS "")
    set(CMAKE_CXX_FLAGS "")
endif()

add_subdirectory(\${CEF_ROOT}/libcef_dll libcef_dll_wrapper)

# CEF binary targets
if(WIN32)
    add_library(libcef SHARED IMPORTED)
    set_target_properties(libcef PROPERTIES IMPORTED_LOCATION "\${CEF_ROOT}/Release/libcef.dll")
    set_target_properties(libcef PROPERTIES IMPORTED_IMPLIB "\${CEF_ROOT}/Release/libcef.lib")
elseif(APPLE)
    add_library(libcef SHARED IMPORTED)
    set_target_properties(libcef PROPERTIES IMPORTED_LOCATION "\${CEF_ROOT}/Release/Chromium Embedded Framework.framework/Chromium Embedded Framework")
else()
    add_library(libcef SHARED IMPORTED)
    set_target_properties(libcef PROPERTIES IMPORTED_LOCATION "\${CEF_ROOT}/Release/libcef.so")
endif()

# Source files
set(NAPTURE_SOURCES
    main.cpp
    browser_window.cpp
    scheme_handler.cpp
)

# Add executable
if(WIN32)
    add_executable(napture-native WIN32 \${NAPTURE_SOURCES})
else()
    add_executable(napture-native \${NAPTURE_SOURCES})
endif()

# Link CEF
target_link_libraries(napture-native PRIVATE libcef_dll_wrapper libcef \${CEF_STANDARD_LIBS})

# Add CEF target properties
set_target_properties(napture-native PROPERTIES
    COMPILE_DEFINITIONS "\${CEF_COMPILER_DEFINES}"
    INCLUDE_DIRECTORIES "\${CEF_INCLUDE_PATH}"
)

# Apply CEF compiler flags
if(NOT MSVC)
    separate_arguments(CEF_COMPILER_FLAGS_LIST UNIX_COMMAND "\${CEF_COMPILER_FLAGS_SPACE}")
    target_compile_options(napture-native PRIVATE \${CEF_COMPILER_FLAGS_LIST})
endif()

# Copy CEF Release binaries and Resources to the build output directory
if(WIN32)
    add_custom_command(
        TARGET napture-native POST_BUILD
        COMMAND \${CMAKE_COMMAND} -E copy_directory
        "\${CEF_ROOT}/Release/" "$<TARGET_FILE_DIR:napture-native>"
        COMMAND \${CMAKE_COMMAND} -E copy_directory
        "\${CEF_ROOT}/Resources/" "$<TARGET_FILE_DIR:napture-native>"
    )
elseif(UNIX AND NOT APPLE)
    add_custom_command(
        TARGET napture-native POST_BUILD
        COMMAND \${CMAKE_COMMAND} -E copy_directory
        "\${CEF_ROOT}/Release/" "$<TARGET_FILE_DIR:napture-native>"
        COMMAND \${CMAKE_COMMAND} -E copy_directory
        "\${CEF_ROOT}/Resources/" "$<TARGET_FILE_DIR:napture-native>"
    )
endif()
`;

  fs.writeFileSync(path.join(nativeDir, 'CMakeLists.txt'), cmakeContent);
  console.log('Done configuring Native Engine build setup.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
