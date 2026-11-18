// Prepare a clean, already-unpacked Electron distribution for electron-builder.
//
// On this machine Windows real-time scanning + the Search indexer hold a
// persistent lock on freshly written `default_app.asar`, which breaks
// electron-builder's own extract+atomic-rename and its post-copy cleanup.
// Workaround: extract the cached zip ourselves, then copy it (read-only on the
// source) into `.electron-clean` while EXCLUDING default_app.asar (the Electron
// demo app, which our app.asar replaces). electron-builder then uses
// `-c.electronDist=.electron-clean` and only copies, never renames/deletes it.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const sevenZip = path.join(process.env.LOCALAPPDATA, 'electron-builder/Cache/7zip@1.0.0/7zip-win-x64-1nrf7/bin/7za.exe');
const cacheRoot = path.join(process.env.LOCALAPPDATA, 'electron/Cache');
const version = require('../node_modules/electron/package.json').version;
const zipName = `electron-v${version}-win32-x64.zip`;

function findZip() {
  for (const entry of fs.readdirSync(cacheRoot)) {
    const candidate = path.join(cacheRoot, entry, zipName);
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`cached ${zipName} not found under ${cacheRoot}; run a normal build once to populate the cache`);
}

const extracting = path.resolve('.electron-dist.extracting');
const clean = path.resolve('.electron-clean');
const zip = findZip();
console.log('extracting', zip);
fs.rmSync(extracting, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
fs.mkdirSync(extracting, { recursive: true });
execFileSync(sevenZip, ['x', '-bd', zip, `-o${extracting}`, '-y'], { stdio: 'inherit' });
fs.rmSync(clean, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
fs.cpSync(extracting, clean, { recursive: true, filter: s => path.basename(s) !== 'default_app.asar' });
if (!fs.existsSync(path.join(clean, 'electron.exe'))) throw new Error('electron.exe missing in clean dist');
console.log('ELECTRON_DIST=' + clean);
console.log('Build with: npx electron-builder --win nsis --x64 -c.electronDist=.electron-clean -c.directories.output=release-final');
